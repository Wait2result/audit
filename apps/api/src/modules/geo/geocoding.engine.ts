import type { GeoCoordinates, GeoPlaceDto } from '@dagestan/shared';

import {
  GeocoderUnavailableError,
  type GeocodingProvider,
  type SuggestRequest,
} from './geocoding.provider.js';

/** Кеш ответов. В сервере — Redis, в скриптах — память. */
export interface GeoCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export class MemoryGeoCache implements GeoCache {
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();

  get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt < Date.now()) return Promise.resolve(null);
    return Promise.resolve(entry.value as T);
  }

  set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }
}

export interface GeoLogger {
  warn(message: string): void;
}

/** «Ничего не нашлось» живёт в кеше меньше: адреса в OSM дописывают. */
const EMPTY_TTL_SECONDS = 3600;

/**
 * Ядро геокодирования: цепочка поставщиков, кеш и склейка одинаковых
 * запросов. Без Nest — тем же ядром пользуется скрипт миграции адресов.
 */
export class GeocodingEngine {
  /** Одинаковые запросы, пришедшие одновременно, ждут один ответ */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly suggestChain: readonly GeocodingProvider[],
    private readonly reverseChain: readonly GeocodingProvider[],
    private readonly cache: GeoCache,
    private readonly ttlSeconds: number,
    private readonly logger: GeoLogger,
  ) {}

  async suggest(request: SuggestRequest): Promise<GeoPlaceDto[]> {
    const q = request.q.trim().replace(/\s+/g, ' ');
    const near = request.near
      ? `${request.near.latitude.toFixed(2)},${request.near.longitude.toFixed(2)}`
      : '-';
    const key = `geo:suggest:${request.kind}:${request.limit}:${near}:${q.toLowerCase()}`;

    return this.cached(key, () =>
      this.firstAnswer(this.suggestChain, (p) => p.suggest({ ...request, q })),
    );
  }

  /** Адрес по точке. null — точка там, где адресов нет (море, горы). */
  async reverse(point: GeoCoordinates): Promise<GeoPlaceDto | null> {
    // Пять знаков — метр: адрес не меняется, а повторный сдвиг булавки
    // на то же место берётся из кеша
    const key = `geo:reverse:${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
    const wrapped = await this.cached(key, async () => ({
      place: await this.firstAnswer(this.reverseChain, (p) => p.reverse(point)),
    }));
    return wrapped.place;
  }

  /** То же, но без ошибок: для обогащения адреса «по возможности». */
  async reverseQuietly(point: GeoCoordinates): Promise<GeoPlaceDto | null> {
    try {
      return await this.reverse(point);
    } catch {
      return null;
    }
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = await this.cache.get<T>(key).catch(() => null);
    if (hit !== null) return hit;

    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const promise = (async () => {
      const value = await load();
      const empty =
        (Array.isArray(value) && value.length === 0) ||
        (value !== null && typeof value === 'object' && 'place' in value && !value.place);
      await this.cache
        .set(key, value, empty ? Math.min(EMPTY_TTL_SECONDS, this.ttlSeconds) : this.ttlSeconds)
        .catch(() => undefined);
      return value;
    })();

    this.inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
    }
  }

  /**
   * Первый поставщик цепочки, который ответил. «Ничего не нашёл» — это
   * ответ, и дальше по цепочке не идём; идём, только если поставщик
   * недоступен.
   */
  private async firstAnswer<T>(
    chain: readonly GeocodingProvider[],
    call: (provider: GeocodingProvider) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown = null;
    for (const provider of chain) {
      try {
        return await call(provider);
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `Геокодер ${provider.name} недоступен: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    throw lastError instanceof GeocoderUnavailableError
      ? lastError
      : new GeocoderUnavailableError('geocoder', 'нет доступных поставщиков');
  }
}
