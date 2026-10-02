import {
  LISTING_DEFAULT_RADIUS_KM,
  LISTING_RADIUS_OPTIONS,
  isValidPoint,
  type GeoCoordinates,
  type ListingRadiusKm,
} from '@dagestan/shared';
import { create } from 'zustand';

import { StorageKey, plainStorage } from '../api/storage';

/**
 * Где искать объявления (ADR-0010).
 *
 * Поиск идёт от точки с радиусом: «Манаскент, 25 км» находит и сам
 * Манаскент, и соседние сёла, и край Каспийска — по расстоянию, а не по
 * границам городов и районов. «Весь Дагестан» — без радиуса, остальные
 * фильтры работают как обычно.
 *
 * Точка — либо выбранное человеком место (село из поиска, точка на карте,
 * «моё местоположение» по кнопке), либо, пока он ничего не выбирал, центр
 * города, выбранного в приложении. Выбор запоминается между запусками
 * вместе с недавними местами: человек из Манаскента не должен каждый раз
 * заново искать своё село.
 *
 * Разрешение на геолокацию здесь не спрашивается вовсе — только на экране
 * выбора места и только по кнопке «Моё местоположение».
 */

/** Выбранное место поиска: подпись и точка. */
export interface SearchPlace extends GeoCoordinates {
  /** «Манаскент», «Махачкала, Советский район», «Моё местоположение» */
  label: string;
}

interface ListingAreaState {
  /** null — центр города, выбранного в приложении */
  place: SearchPlace | null;
  /** null — «Весь Дагестан» */
  radiusKm: ListingRadiusKm | null;
  /** Недавние места, свежие первыми */
  recent: SearchPlace[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  /** Применить место и радиус разом — экран выбора места делает это по «Показать» */
  apply: (place: SearchPlace | null, radiusKm: ListingRadiusKm | null) => void;
  setRadius: (radiusKm: ListingRadiusKm | null) => void;
  clearRecent: () => void;
}

const MAX_RECENT = 6;

interface Persisted {
  place: SearchPlace | null;
  radiusKm: ListingRadiusKm | null;
}

function isRadius(value: unknown): value is ListingRadiusKm {
  return (LISTING_RADIUS_OPTIONS as readonly unknown[]).includes(value);
}

function isPlace(value: unknown): value is SearchPlace {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SearchPlace).label === 'string' &&
    isValidPoint(value)
  );
}

/** Одно и то же место — если точки ближе ~100 м друг к другу. */
function samePlace(a: GeoCoordinates, b: GeoCoordinates): boolean {
  return Math.abs(a.latitude - b.latitude) < 0.001 && Math.abs(a.longitude - b.longitude) < 0.001;
}

function persist(state: Persisted, recent: SearchPlace[]) {
  void plainStorage
    .set(StorageKey.LISTING_SEARCH_AREA, JSON.stringify(state))
    .catch(() => undefined);
  void plainStorage
    .set(StorageKey.LISTING_RECENT_PLACES, JSON.stringify(recent))
    .catch(() => undefined);
}

export const useListingAreaStore = create<ListingAreaState>((set, get) => ({
  place: null,
  radiusKm: LISTING_DEFAULT_RADIUS_KM,
  recent: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const [rawArea, rawRecent] = await Promise.all([
        plainStorage.get(StorageKey.LISTING_SEARCH_AREA),
        plainStorage.get(StorageKey.LISTING_RECENT_PLACES),
      ]);
      const area = rawArea ? (JSON.parse(rawArea) as Partial<Persisted>) : null;
      const recent = rawRecent ? (JSON.parse(rawRecent) as unknown[]) : [];
      set({
        // Испорченная запись (NaN, чужой формат) не должна ломать выдачу —
        // тогда просто остаётся город по умолчанию
        place: isPlace(area?.place) ? area.place : null,
        radiusKm:
          area && (area.radiusKm === null || isRadius(area.radiusKm))
            ? area.radiusKm
            : LISTING_DEFAULT_RADIUS_KM,
        recent: Array.isArray(recent) ? recent.filter(isPlace).slice(0, MAX_RECENT) : [],
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },

  apply: (place, radiusKm) => {
    const recent = place
      ? [place, ...get().recent.filter((item) => !samePlace(item, place))].slice(0, MAX_RECENT)
      : get().recent;
    set({ place, radiusKm, recent });
    persist({ place, radiusKm }, recent);
  },

  setRadius: (radiusKm) => {
    set({ radiusKm });
    persist({ place: get().place, radiusKm }, get().recent);
  },

  clearRecent: () => {
    set({ recent: [] });
    persist({ place: get().place, radiusKm: get().radiusKm }, []);
  },
}));

/** «25 км», «Весь Дагестан». */
export function radiusLabel(radiusKm: ListingRadiusKm | null): string {
  return radiusKm === null ? 'Весь Дагестан' : `${radiusKm} км`;
}
