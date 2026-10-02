import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  type GeoCoordinates,
  type GeoPlaceDto,
  type GeoSuggestQuery,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { GeocodingEngine, type GeoCache } from './geocoding.engine.js';
import { GeocoderUnavailableError, type GeocodingProvider } from './geocoding.provider.js';
import { NominatimProvider } from './providers/nominatim.provider.js';
import { PhotonProvider } from './providers/photon.provider.js';

/**
 * Поставщики по настройкам: основной первым, второй — запасным. Общая
 * функция для сервера и скриптов, чтобы выбор поставщика жил в одном месте.
 */
export function createGeocodingEngine(
  config: Pick<
    AppConfig,
    | 'GEOCODER_SUGGEST_PROVIDER'
    | 'GEOCODER_REVERSE_PROVIDER'
    | 'PHOTON_BASE_URL'
    | 'NOMINATIM_BASE_URL'
    | 'GEOCODER_USER_AGENT'
    | 'GEOCODER_TIMEOUT_MS'
    | 'GEOCODER_CACHE_TTL_SECONDS'
  >,
  cache: GeoCache,
  logger: { warn(message: string): void },
): GeocodingEngine {
  const http = { userAgent: config.GEOCODER_USER_AGENT, timeoutMs: config.GEOCODER_TIMEOUT_MS };
  const providers: Record<string, GeocodingProvider> = {
    photon: new PhotonProvider(config.PHOTON_BASE_URL, http),
    nominatim: new NominatimProvider(config.NOMINATIM_BASE_URL, http),
  };
  const chain = (primary: string): GeocodingProvider[] => {
    const first = providers[primary];
    const rest = Object.values(providers).filter((provider) => provider !== first);
    return first ? [first, ...rest] : rest;
  };

  return new GeocodingEngine(
    // Подсказки — только основной поставщик: запасной Nominatim на публичном
    // сервере для подсказок при наборе запрещён правилами
    chain(config.GEOCODER_SUGGEST_PROVIDER).slice(0, 1),
    chain(config.GEOCODER_REVERSE_PROVIDER),
    cache,
    config.GEOCODER_CACHE_TTL_SECONDS,
    logger,
  );
}

/**
 * Геокодирование для приложения: подсказки адреса и адрес по точке.
 *
 * Прослойка между поставщиками и остальным кодом (ADR-0010). Кто именно
 * отвечает — Photon, Nominatim или будущий платный поставщик, — решают
 * настройки; всё остальное видит только `GeoPlaceDto`.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly engine: GeocodingEngine;

  constructor(@Inject(APP_CONFIG) config: AppConfig, redis: RedisService) {
    const cache: GeoCache = {
      get: (key) => redis.getJson(key),
      set: (key, value, ttl) => redis.setJson(key, value, ttl),
    };
    this.engine = createGeocodingEngine(config, cache, {
      warn: (message) => this.logger.warn(message),
    });
  }

  async suggest(query: GeoSuggestQuery): Promise<GeoPlaceDto[]> {
    const near =
      query.latitude !== undefined && query.longitude !== undefined
        ? { latitude: query.latitude, longitude: query.longitude }
        : undefined;
    return this.unavailableAs503(() =>
      this.engine.suggest({ q: query.q, kind: query.kind, limit: query.limit, near }),
    );
  }

  async reverse(point: GeoCoordinates): Promise<GeoPlaceDto | null> {
    return this.unavailableAs503(() => this.engine.reverse(point));
  }

  /** Адрес по точке «по возможности»: при сбое — null, без ошибки. */
  reverseQuietly(point: GeoCoordinates): Promise<GeoPlaceDto | null> {
    return this.engine.reverseQuietly(point);
  }

  private async unavailableAs503<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (err) {
      if (err instanceof GeocoderUnavailableError) {
        throw new AppException(
          ErrorCode.GEOCODER_UNAVAILABLE,
          'Поиск адреса временно недоступен. Поставьте точку на карте вручную.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw err;
    }
  }
}
