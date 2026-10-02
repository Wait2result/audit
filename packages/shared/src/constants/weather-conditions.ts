/**
 * Коды состояния погоды WMO (0–99) — открытый стандарт, которым пользуется
 * Open-Meteo и большинство метеослужб. Таблица общая для сервера (переводит
 * код в текст для ответа API) и приложения (переводит тот же код в иконку) —
 * если источник погоды когда-нибудь поменяется, достаточно один раз привести
 * его коды к этому справочнику.
 */

export type WeatherIconName = 'sun' | 'weather' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';

interface WeatherCondition {
  text: string;
  icon: WeatherIconName;
}

const WEATHER_CONDITIONS: Record<number, WeatherCondition> = {
  0: { text: 'Ясно', icon: 'sun' },
  1: { text: 'Малооблачно', icon: 'sun' },
  2: { text: 'Переменная облачность', icon: 'weather' },
  3: { text: 'Пасмурно', icon: 'cloud' },
  45: { text: 'Туман', icon: 'fog' },
  48: { text: 'Изморозь', icon: 'fog' },
  51: { text: 'Лёгкая морось', icon: 'rain' },
  53: { text: 'Морось', icon: 'rain' },
  55: { text: 'Сильная морось', icon: 'rain' },
  56: { text: 'Ледяная морось', icon: 'rain' },
  57: { text: 'Сильная ледяная морось', icon: 'rain' },
  61: { text: 'Небольшой дождь', icon: 'rain' },
  63: { text: 'Дождь', icon: 'rain' },
  65: { text: 'Сильный дождь', icon: 'rain' },
  66: { text: 'Ледяной дождь', icon: 'rain' },
  67: { text: 'Сильный ледяной дождь', icon: 'rain' },
  71: { text: 'Небольшой снег', icon: 'snow' },
  73: { text: 'Снег', icon: 'snow' },
  75: { text: 'Сильный снегопад', icon: 'snow' },
  77: { text: 'Снежная крупа', icon: 'snow' },
  80: { text: 'Небольшой ливень', icon: 'rain' },
  81: { text: 'Ливень', icon: 'rain' },
  82: { text: 'Сильный ливень', icon: 'rain' },
  85: { text: 'Снегопад', icon: 'snow' },
  86: { text: 'Сильный снегопад', icon: 'snow' },
  95: { text: 'Гроза', icon: 'storm' },
  96: { text: 'Гроза с градом', icon: 'storm' },
  99: { text: 'Сильная гроза с градом', icon: 'storm' },
};

const DEFAULT_CONDITION: WeatherCondition = { text: 'Нет данных', icon: 'cloud' };

export function describeWeatherCode(code: number): WeatherCondition {
  return WEATHER_CONDITIONS[code] ?? DEFAULT_CONDITION;
}
