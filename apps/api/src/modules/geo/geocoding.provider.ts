import type { GeoCoordinates, GeoPlaceDto } from '@dagestan/shared';

/**
 * Поставщик геокодирования — всё, что о нём знает остальное приложение.
 *
 * Бизнес-логика (форма объявления, миграция, поиск) работает только с этим
 * интерфейсом и с `GeoPlaceDto`. Сменить OpenStreetMap на 2ГИС, Яндекс или
 * DaData — значит написать ещё одну реализацию и поменять строку в .env,
 * не трогая ничего вокруг.
 */
export interface GeocodingProvider {
  /** Имя для настроек и журнала: «photon», «nominatim» */
  readonly name: string;

  /** Подсказки по строке: населённые пункты, улицы, дома, заметные места. */
  suggest(request: SuggestRequest): Promise<GeoPlaceDto[]>;

  /** Адрес по точке. null — поставщик ответил, но по точке ничего не знает. */
  reverse(point: GeoCoordinates): Promise<GeoPlaceDto | null>;
}

export interface SuggestRequest {
  q: string;
  /** settlement — только населённые пункты (выбор места поиска) */
  kind: 'any' | 'settlement';
  /** Искать рядом с этой точкой в первую очередь */
  near?: GeoCoordinates;
  limit: number;
}

/**
 * Поставщик не смог ответить: сеть, таймаут, 429, 5xx, не тот формат.
 * Отличается от «ответил, но ничего не нашёл» — тогда пустой список.
 */
export class GeocoderUnavailableError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
  ) {
    super(`${provider}: ${message}`);
    this.name = 'GeocoderUnavailableError';
  }
}

/** Общие настройки HTTP-запросов к поставщикам. */
export interface GeocoderHttpOptions {
  userAgent: string;
  timeoutMs: number;
}

/**
 * GET с таймаутом и представлением. Всё, что не «200 и JSON», — ошибка
 * поставщика: вызывающий решает, пробовать ли запасного.
 */
export async function fetchGeocoderJson<T>(
  provider: string,
  url: string,
  options: GeocoderHttpOptions,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': options.userAgent,
        'Accept-Language': 'ru',
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new GeocoderUnavailableError(provider, `ответил ${response.status}`, response.status);
    }
    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof GeocoderUnavailableError) throw err;
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `не ответил за ${options.timeoutMs} мс`
        : err instanceof Error
          ? err.message
          : 'неизвестная ошибка';
    throw new GeocoderUnavailableError(provider, reason);
  } finally {
    clearTimeout(timeout);
  }
}
