import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  describeWeatherCode,
  ErrorCode,
  type HourlyForecastDto,
  type WeatherDto,
} from '@dagestan/shared';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { AppException } from '../../common/errors/app.exception.js';
import { isoInTimezone } from '../../common/utils/timezone.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { CitiesService } from '../cities/cities.service.js';

/**
 * Погода для выбранного города (Этап 3 ТЗ).
 *
 * Источник данных — Open-Meteo (см. docs/ADR/0003-погода-open-meteo.md):
 * в разработке — публичный api.open-meteo.com, в production — обязательно
 * self-hosted инстанс на выделенном сервере (OPEN_METEO_BASE_URL). Формат
 * запроса и ответа у self-hosted и публичного сервиса одинаковый, поэтому
 * переход — это смена одной переменной окружения, а не кода.
 *
 * Координаты берутся только из базы (через CitiesService), а не от клиента —
 * иначе кто угодно мог бы запросить погоду для произвольной точки на карте
 * в обход выбора города.
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  private static readonly CURRENT_FIELDS = [
    'temperature_2m',
    'apparent_temperature',
    'weather_code',
    'precipitation',
    'relative_humidity_2m',
    'pressure_msl',
    'cloud_cover',
    'wind_speed_10m',
    'wind_gusts_10m',
    // День/ночь по факту — не по времени на телефоне, а по восходу/закату
    // в самом городе. Используется, чтобы оформление виджета погоды на
    // главной менялось на ночное после заката (пункт из ТЗ пользователя).
    'is_day',
  ].join(',');

  // Тот же набор показателей, что и в current, — по каждому часу тоже можно
  // посмотреть УФ-индекс, влажность и остальное, а не только температуру.
  private static readonly HOURLY_FIELDS = [
    'temperature_2m',
    'apparent_temperature',
    'weather_code',
    'precipitation_probability',
    'precipitation',
    'relative_humidity_2m',
    'pressure_msl',
    'cloud_cover',
    'wind_speed_10m',
    'wind_gusts_10m',
    'uv_index',
  ].join(',');

  /** Те же показатели, но с шагом 15 минут — для ползунка времени на экране */
  private static readonly MINUTELY_15_FIELDS = WeatherService.HOURLY_FIELDS;

  private static readonly DAILY_FIELDS = [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'apparent_temperature_max',
    'apparent_temperature_min',
    'precipitation_probability_max',
    'precipitation_sum',
    'wind_speed_10m_max',
    'wind_gusts_10m_max',
    'uv_index_max',
    'sunrise',
    'sunset',
  ].join(',');

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly redis: RedisService,
    private readonly cities: CitiesService,
  ) {}

  async getForecast(cityId: string, refresh = false): Promise<WeatherDto> {
    const city = await this.cities.findById(cityId);
    if (!city.isActive) {
      throw AppException.badRequest('Город временно недоступен', ErrorCode.CITY_INACTIVE);
    }

    const cacheKey = `weather:${cityId}`;

    if (!refresh) {
      const cached = await this.redis.getJson<WeatherDto>(cacheKey);
      if (cached) return cached;
    }

    const forecast = await this.fetchFromOpenMeteo(
      city.latitude,
      city.longitude,
      city.timezone,
      cityId,
    );

    await this.redis.setJson(cacheKey, forecast, this.config.WEATHER_CACHE_TTL_SECONDS);
    return forecast;
  }

  private async fetchFromOpenMeteo(
    latitude: number,
    longitude: number,
    timezone: string,
    cityId: string,
  ): Promise<WeatherDto> {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      timezone,
      forecast_days: '7',
      current: WeatherService.CURRENT_FIELDS,
      hourly: WeatherService.HOURLY_FIELDS,
      daily: WeatherService.DAILY_FIELDS,
      minutely_15: WeatherService.MINUTELY_15_FIELDS,
      // Два дня по 15 минут: ползунку на экране хватает суток вперёд от
      // текущего момента, а запрашивать всю неделю таким шагом — это
      // впустую гонять почти семьсот точек на каждый запрос.
      forecast_minutely_15: '192',
    });

    const url = `${this.config.OPEN_METEO_BASE_URL}/v1/forecast?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let raw: OpenMeteoResponse;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Open-Meteo ответил ${response.status}`);
      }
      raw = (await response.json()) as OpenMeteoResponse;
    } catch (err) {
      this.logger.error({ err, url }, 'Сбой обращения к источнику погоды');
      throw new AppException(
        ErrorCode.WEATHER_UNAVAILABLE,
        'Сервис погоды временно недоступен',
        502,
      );
    } finally {
      clearTimeout(timeout);
    }

    return mapOpenMeteoResponse(raw, cityId, timezone);
  }
}

/**
 * Ряд с шагом 15 минут: сутки вперёд от текущего момента.
 *
 * Нужен ползунку времени на экране погоды. Начинается не с полуночи, а с
 * ближайшей к «сейчас» четверти часа — иначе половина ползунка вела бы в
 * уже прошедшее время.
 */
function mapQuarterHourly(raw: OpenMeteoResponse, currentTime: string): HourlyForecastDto[] {
  const series = raw.minutely_15;
  if (!series) return [];

  // Время приходит по возрастанию, поэтому достаточно найти первую точку,
  // которая не раньше текущего момента
  const start = series.time.findIndex((time) => time >= currentTime);
  if (start < 0) return [];

  return series.time.slice(start, start + 96).map((time, offset) => {
    const i = start + offset;
    const code = series.weather_code[i] ?? 0;

    return {
      time,
      temperature: series.temperature_2m[i] ?? 0,
      feelsLike: series.apparent_temperature[i] ?? 0,
      conditionCode: code,
      conditionText: describeWeatherCode(code).text,
      precipitationProbability: series.precipitation_probability[i] ?? 0,
      precipitationMm: series.precipitation[i] ?? 0,
      windSpeedKmh: series.wind_speed_10m[i] ?? 0,
      windGustsKmh: series.wind_gusts_10m[i] ?? 0,
      humidity: series.relative_humidity_2m[i] ?? 0,
      pressureHpa: series.pressure_msl[i] ?? 0,
      cloudCoverPercent: series.cloud_cover[i] ?? 0,
      uvIndex: series.uv_index[i] ?? 0,
    };
  });
}

/**
 * Время обновления — в поясе города, как и все остальные времена в прогнозе
 * Open-Meteo: приложение читает часы прямо из строки. Останься оно в UTC, оно
 * выглядело бы отставшим ровно на разницу поясов.
 */
function nowInTimezone(timeZone: string): string {
  return isoInTimezone(new Date(), timeZone);
}

// ── Формат ответа Open-Meteo (используемое подмножество) ────────────────────

interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    precipitation: number;
    relative_humidity_2m: number;
    pressure_msl: number;
    cloud_cover: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    is_day: number;
  };
  minutely_15?: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    weather_code: number[];
    precipitation_probability: number[];
    precipitation: number[];
    relative_humidity_2m: number[];
    pressure_msl: number[];
    cloud_cover: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    uv_index: number[];
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    weather_code: number[];
    precipitation_probability: number[];
    precipitation: number[];
    relative_humidity_2m: number[];
    pressure_msl: number[];
    cloud_cover: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    uv_index: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    apparent_temperature_max: number[];
    apparent_temperature_min: number[];
    precipitation_probability_max: number[];
    precipitation_sum: number[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max: number[];
    uv_index_max: number[];
    sunrise: string[];
    sunset: string[];
  };
}

function mapOpenMeteoResponse(
  raw: OpenMeteoResponse,
  cityId: string,
  timezone: string,
): WeatherDto {
  // «Текущий» час в почасовом прогнозе — источник вероятности осадков и UV,
  // которых в блоке current у Open-Meteo нет (только в hourly). current.time
  // даётся с точностью до 15 минут («…T11:45»), а hourly — ровно по часам
  // («…T11:00»), поэтому точное совпадение строк не сработает — округляем
  // текущее время вниз до часа перед поиском.
  const currentHour = `${raw.current.time.slice(0, 13)}:00`;
  const currentHourIndex = raw.hourly.time.indexOf(currentHour);
  const atCurrentHour = currentHourIndex >= 0 ? currentHourIndex : 0;

  const todaySunrise = raw.daily.sunrise[0] ?? raw.current.time;
  const todaySunset = raw.daily.sunset[0] ?? raw.current.time;

  return {
    cityId,
    current: {
      temperature: raw.current.temperature_2m,
      feelsLike: raw.current.apparent_temperature,
      conditionCode: raw.current.weather_code,
      conditionText: describeWeatherCode(raw.current.weather_code).text,
      precipitationProbability: raw.hourly.precipitation_probability[atCurrentHour] ?? 0,
      precipitationMm: raw.current.precipitation,
      windSpeedKmh: raw.current.wind_speed_10m,
      windGustsKmh: raw.current.wind_gusts_10m,
      humidity: raw.current.relative_humidity_2m,
      pressureHpa: raw.current.pressure_msl,
      cloudCoverPercent: raw.current.cloud_cover,
      uvIndex: raw.hourly.uv_index[atCurrentHour] ?? 0,
      isDay: raw.current.is_day === 1,
      sunrise: todaySunrise,
      sunset: todaySunset,
    },
    // Ближайшие ~48 часов вперёд от текущего момента, а не с начала суток.
    hourly: raw.hourly.time.slice(atCurrentHour, atCurrentHour + 48).map((time, i) => {
      const index = atCurrentHour + i;
      const code = raw.hourly.weather_code[index] ?? 0;
      return {
        time,
        temperature: raw.hourly.temperature_2m[index] ?? 0,
        feelsLike: raw.hourly.apparent_temperature[index] ?? 0,
        conditionCode: code,
        conditionText: describeWeatherCode(code).text,
        precipitationProbability: raw.hourly.precipitation_probability[index] ?? 0,
        precipitationMm: raw.hourly.precipitation[index] ?? 0,
        windSpeedKmh: raw.hourly.wind_speed_10m[index] ?? 0,
        windGustsKmh: raw.hourly.wind_gusts_10m[index] ?? 0,
        humidity: raw.hourly.relative_humidity_2m[index] ?? 0,
        pressureHpa: raw.hourly.pressure_msl[index] ?? 0,
        cloudCoverPercent: raw.hourly.cloud_cover[index] ?? 0,
        uvIndex: raw.hourly.uv_index[index] ?? 0,
      };
    }),
    quarterHourly: mapQuarterHourly(raw, raw.current.time),
    daily: raw.daily.time.map((date, i) => {
      const code = raw.daily.weather_code[i] ?? 0;
      return {
        date,
        tempMin: raw.daily.temperature_2m_min[i] ?? 0,
        tempMax: raw.daily.temperature_2m_max[i] ?? 0,
        feelsLikeMin: raw.daily.apparent_temperature_min[i] ?? 0,
        feelsLikeMax: raw.daily.apparent_temperature_max[i] ?? 0,
        conditionCode: code,
        conditionText: describeWeatherCode(code).text,
        precipitationProbability: raw.daily.precipitation_probability_max[i] ?? 0,
        precipitationMm: raw.daily.precipitation_sum[i] ?? 0,
        windSpeedMaxKmh: raw.daily.wind_speed_10m_max[i] ?? 0,
        windGustsMaxKmh: raw.daily.wind_gusts_10m_max[i] ?? 0,
        uvIndexMax: raw.daily.uv_index_max[i] ?? 0,
        sunrise: raw.daily.sunrise[i] ?? date,
        sunset: raw.daily.sunset[i] ?? date,
      };
    }),
    updatedAt: nowInTimezone(timezone),
    attribution: 'Данные о погоде предоставлены Open-Meteo.com',
  };
}
