import {
  listingCategoryNeedsConfirmation,
  LISTING_RADIUS_OPTIONS,
  smartListingFilters,
  understoodNotes,
  understoodSummary,
  type ListingRadiusKm,
  type SmartSearchPart,
} from '@dagestan/shared';

import { useListingAreaStore } from '../store/listing-area-store';
import { useListingFilterStore, type ExtraListingFilters } from '../store/listing-filter-store';
import { useSmartSearchStore } from '../store/smart-search-store';

/** Куда открыть выдачу объявлений после умного поиска. */
export type SmartListingTarget = {
  slug?: string;
  q?: string;
};

/**
 * Понятый запрос объявлений → обычные фильтры приложения.
 *
 * Результат умного поиска не живёт отдельно: условия раскладываются в те же
 * фильтры категории и место поиска, что выбирает человек руками. Поэтому
 * выдачу даёт существующая лента с подгрузкой страниц, а каждое условие видно
 * чипсом и снимается одним нажатием, как любой другой фильтр.
 */
export function applySmartListing(
  part: SmartSearchPart,
  text: string,
  requestId: string,
  /** Категория, открытая на экране, где спросили (null — главная раздела) */
  openCategory: string | null = null,
): SmartListingTarget {
  if (!part.query) return {};
  const filters = smartListingFilters(part.query);
  const scope = filters.category ?? '';

  const extra: ExtraListingFilters = {
    ...(filters.priceFrom !== undefined ? { priceFrom: filters.priceFrom } : {}),
    ...(filters.priceTo !== undefined ? { priceTo: filters.priceTo } : {}),
    ...(filters.transactionType ? { transactionType: filters.transactionType } : {}),
    ...(filters.rentPeriod ? { rentPeriod: filters.rentPeriod } : {}),
    ...(filters.onlyWithPhoto ? { onlyWithPhoto: true } : {}),
    ...(filters.attributes ? { attributes: filters.attributes } : {}),
    ...(filters.sort ? { sort: filters.sort } : {}),
  };
  useListingFilterStore.getState().set(scope, extra);

  const area = useListingAreaStore.getState();
  if (filters.area.kind === 'city') {
    area.apply(
      {
        label: filters.area.label,
        latitude: filters.area.latitude,
        longitude: filters.area.longitude,
      },
      toRadius(filters.area.radiusKm),
    );
  } else if (filters.area.kind === 'region') {
    area.setRadius(null);
  }

  useSmartSearchStore.getState().setListing({
    text,
    summary: understoodSummary(part.query),
    notes: understoodNotes(part.query),
    requestId,
    scope,
    filtersKey: listingFiltersKey(extra),
    needsConfirmation: listingCategoryNeedsConfirmation(part.query, openCategory),
    confirmed: false,
    elsewhere: part.query.elsewhere ?? null,
  });

  return {
    ...(filters.category ? { slug: filters.category } : {}),
    ...(filters.search ? { q: filters.search } : {}),
  };
}

/** Снимок фильтров для сравнения «это всё ещё понятый запрос?». */
export function listingFiltersKey(filters: ExtraListingFilters): string {
  const clean = Object.entries(filters)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(clean);
}

/** Радиус сервера → ближайший из предлагаемых приложением; null — весь Дагестан. */
function toRadius(radiusKm: number | null): ListingRadiusKm | null {
  if (radiusKm === null) return null;
  return LISTING_RADIUS_OPTIONS.find((option) => option >= radiusKm) ?? null;
}

/** Следующий шаг радиуса для «Увеличить радиус»; null — весь Дагестан. */
export function widerRadius(radiusKm: ListingRadiusKm | null): ListingRadiusKm | null {
  if (radiusKm === null) return null;
  return LISTING_RADIUS_OPTIONS.find((option) => option > radiusKm) ?? null;
}

/** Диагностика одного запроса: номер, время, раздел, исход. Без текста фразы. */
export interface SmartSearchDiagnostics {
  requestId?: string;
  durationMs: number;
  domain?: string | null;
  status: string;
  fallback: boolean;
  clarification: boolean;
}

const DIAGNOSTICS_LIMIT = 20;

/**
 * Последние запросы — для разбора «почему было долго» в отладчике. Только в
 * памяти и без фразы человека: на устройство и на сервер не уходит (сервер
 * пишет свой журнал по номеру запроса).
 */
export const recentSmartSearches: SmartSearchDiagnostics[] = [];

export function logSmartSearch(details: SmartSearchDiagnostics): void {
  recentSmartSearches.unshift(details);
  recentSmartSearches.length = Math.min(recentSmartSearches.length, DIAGNOSTICS_LIMIT);
}
