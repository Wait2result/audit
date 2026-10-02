import { DAGESTAN_BOUNDS, type GeoCoordinates, type GeoPlaceDto } from '@dagestan/shared';

import {
  fetchGeocoderJson,
  type GeocoderHttpOptions,
  type GeocodingProvider,
  type SuggestRequest,
} from '../geocoding.provider.js';
import {
  dagestanFirst,
  dedupePlaces,
  nominatimToPlace,
  type NominatimResult,
} from '../geo-normalize.js';

/**
 * Не чаще раза в секунду: это требование публичного Nominatim, и его
 * нарушение заканчивается блокировкой всего сервера, а не одного запроса.
 */
const MIN_INTERVAL_MS = 1100;

/**
 * Nominatim — геокодер OpenStreetMap. По точке определяет адрес точнее
 * Photon: знает район города («Советский район») и дом. Подсказки при
 * наборе на публичном сервере запрещены его правилами — для них Photon.
 */
export class NominatimProvider implements GeocodingProvider {
  readonly name = 'nominatim';

  /** Очередь запросов: следующий уходит не раньше, чем через секунду */
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly http: GeocoderHttpOptions,
  ) {}

  private throttled<T>(task: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastRequestAt = Date.now();
      return task();
    };
    const next = this.queue.then(run, run);
    // Ошибка одного запроса не должна останавливать очередь
    this.queue = next.catch(() => undefined);
    return next;
  }

  private url(path: string, params: URLSearchParams): string {
    params.set('format', 'jsonv2');
    params.set('addressdetails', '1');
    params.set('accept-language', 'ru');
    return `${this.baseUrl.replace(/\/$/, '')}/${path}?${params.toString()}`;
  }

  async suggest(request: SuggestRequest): Promise<GeoPlaceDto[]> {
    const params = new URLSearchParams({
      q: request.q,
      limit: String(Math.min(request.limit * 2, 20)),
      countrycodes: 'ru',
      viewbox: [
        DAGESTAN_BOUNDS.west,
        DAGESTAN_BOUNDS.north,
        DAGESTAN_BOUNDS.east,
        DAGESTAN_BOUNDS.south,
      ].join(','),
      bounded: '1',
    });
    if (request.kind === 'settlement') params.set('featureType', 'settlement');

    const results = await this.throttled(() =>
      fetchGeocoderJson<NominatimResult[]>(this.name, this.url('search', params), this.http),
    );

    const places = (Array.isArray(results) ? results : [])
      .map(nominatimToPlace)
      .filter((place): place is GeoPlaceDto => place !== null)
      .filter((place) => request.kind !== 'settlement' || place.kind === 'settlement');

    return dagestanFirst(dedupePlaces(places)).slice(0, request.limit);
  }

  async reverse(point: GeoCoordinates): Promise<GeoPlaceDto | null> {
    const params = new URLSearchParams({
      lat: String(point.latitude),
      lon: String(point.longitude),
      zoom: '18',
    });
    const result = await this.throttled(() =>
      fetchGeocoderJson<NominatimResult & { error?: string }>(
        this.name,
        this.url('reverse', params),
        this.http,
      ),
    );
    // «Unable to geocode» — точка в море или в горах без адресов: не сбой,
    // а честное «не знаю»
    if (!result || result.error) return null;
    const place = nominatimToPlace(result);
    return place ? { ...place, latitude: point.latitude, longitude: point.longitude } : null;
  }
}
