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
  photonToPlace,
  type PhotonFeature,
} from '../geo-normalize.js';

interface PhotonResponse {
  features?: PhotonFeature[];
}

/** Теги OpenStreetMap, которые считаются населёнными пунктами. */
const SETTLEMENT_TAGS = ['place:city', 'place:town', 'place:village', 'place:hamlet'];

/**
 * Photon — геокодер по данным OpenStreetMap, сделанный для подсказок при
 * наборе: ищет по началу слова («Манас» → Манас, Манаскент, Манасаул) и
 * поднимает результаты рядом с заданной точкой.
 */
export class PhotonProvider implements GeocodingProvider {
  readonly name = 'photon';

  constructor(
    private readonly baseUrl: string,
    private readonly http: GeocoderHttpOptions,
  ) {}

  async suggest(request: SuggestRequest): Promise<GeoPlaceDto[]> {
    const params = new URLSearchParams({
      q: request.q,
      // С запасом: часть уйдёт на повторы отрезков улиц и «оболочки»
      limit: String(Math.min(request.limit * 3, 20)),
      bbox: [
        DAGESTAN_BOUNDS.west,
        DAGESTAN_BOUNDS.south,
        DAGESTAN_BOUNDS.east,
        DAGESTAN_BOUNDS.north,
      ].join(','),
    });
    if (request.near) {
      params.set('lat', String(request.near.latitude));
      params.set('lon', String(request.near.longitude));
    }
    if (request.kind === 'settlement') {
      for (const tag of SETTLEMENT_TAGS) params.append('osm_tag', tag);
    }

    const body = await fetchGeocoderJson<PhotonResponse>(
      this.name,
      `${this.baseUrl.replace(/\/$/, '')}/api/?${params.toString()}`,
      this.http,
    );

    const places = (body.features ?? [])
      .map(photonToPlace)
      .filter((place): place is GeoPlaceDto => place !== null)
      .filter((place) => request.kind !== 'settlement' || place.kind === 'settlement');

    return dagestanFirst(dedupePlaces(places)).slice(0, request.limit);
  }

  async reverse(point: GeoCoordinates): Promise<GeoPlaceDto | null> {
    const params = new URLSearchParams({
      lat: String(point.latitude),
      lon: String(point.longitude),
      limit: '1',
    });
    const body = await fetchGeocoderJson<PhotonResponse>(
      this.name,
      `${this.baseUrl.replace(/\/$/, '')}/reverse?${params.toString()}`,
      this.http,
    );
    const feature = body.features?.[0];
    const place = feature ? photonToPlace(feature) : null;
    // Адрес по точке — это адрес ТОЙ точки, что поставил человек, а не
    // ближайшего дома в двадцати метрах
    return place ? { ...place, latitude: point.latitude, longitude: point.longitude } : null;
  }
}
