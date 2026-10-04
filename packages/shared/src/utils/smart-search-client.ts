import { ListingSort } from '../constants/listings.js';
import {
  LISTING_RENT_PERIODS,
  LISTING_TRANSACTION_TYPES,
  type ListingRentPeriod,
  type ListingTransactionType,
} from '../constants/transactions.js';
import type {
  SmartSearchCondition,
  SmartSearchNormalizedQuery,
  SmartSearchPart,
  SmartSearchResponse,
} from '../types/smart-search.js';

/**
 * Как приложение читает ответ умного поиска.
 *
 * Здесь нет ничего от модели: только перевод уже проверенного сервером
 * ответа в то, что умеют экраны, — в фильтры ленты объявлений и в короткую
 * строку «Понял запрос». Общий пакет, а не приложение: так перевод
 * проверяется теми же тестами, что и сервер, на настоящих ответах конвейера.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Что показать
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Итог для экрана:
 *   parts    — есть что показать (найдено, ничего не нашлось, уточнение, «не умею»);
 *   fallback — умный поиск не сработал: экран берёт обычный поиск по той же фразе.
 */
export type SmartSearchOutcome =
  | { kind: 'parts'; parts: SmartSearchPart[]; message: string }
  | { kind: 'fallback'; text: string; message: string; code: string };

export function smartSearchOutcome(response: SmartSearchResponse): SmartSearchOutcome {
  if (response.status === 'error' || response.parts.length === 0) {
    return {
      kind: 'fallback',
      text: response.fallback?.text ?? '',
      message: response.error?.message ?? response.message,
      code: response.error?.code ?? 'UNKNOWN',
    };
  }
  return { kind: 'parts', parts: response.parts, message: response.message };
}

/** Часть про объявления, которую можно открыть лентой: найдено или пусто, но понято. */
export function listingPartOf(response: SmartSearchResponse): SmartSearchPart | null {
  return (
    response.parts.find(
      (part) =>
        part.domain === 'listings' &&
        (part.status === 'results' || part.status === 'no_results') &&
        part.query !== null,
    ) ?? null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Объявления: ответ → фильтры ленты
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Где искать по итогам разбора:
 *   keep   — место не названо: остаётся выбранное в приложении;
 *   city   — назван город: искать от него (radiusKm null — по всему Дагестану, ближе к нему);
 *   region — «по всему Дагестану».
 */
export type SmartListingArea =
  | { kind: 'keep' }
  | { kind: 'city'; label: string; latitude: number; longitude: number; radiusKm: number | null }
  | { kind: 'region' };

/** Фильтры ленты объявлений в форме экранов приложения: цена — в рублях. */
export interface SmartListingFilters {
  category?: string;
  search?: string;
  priceFrom?: number;
  priceTo?: number;
  transactionType?: ListingTransactionType;
  rentPeriod?: ListingRentPeriod;
  onlyWithPhoto?: boolean;
  sort?: ListingSort;
  attributes?: Record<string, unknown>;
  area: SmartListingArea;
}

const SORTS = Object.values(ListingSort) as string[];

/**
 * Параметры ленты из ответа сервера (`query.params` — ровно то, что принял
 * `GET /listings`) → фильтры экрана. Ничего не добавляется и не угадывается:
 * чего нет в параметрах, того нет и в фильтрах.
 */
export function smartListingFilters(query: SmartSearchNormalizedQuery): SmartListingFilters {
  const params = query.params;
  const filters: SmartListingFilters = { area: listingArea(query) };

  if (typeof params.category === 'string') filters.category = params.category;
  if (typeof params.search === 'string' && params.search.trim())
    filters.search = params.search.trim();

  const priceFrom = kopecksToRubles(params.priceFrom);
  const priceTo = kopecksToRubles(params.priceTo);
  if (priceFrom !== undefined) filters.priceFrom = priceFrom;
  if (priceTo !== undefined) filters.priceTo = priceTo;

  if (
    typeof params.transactionType === 'string' &&
    (LISTING_TRANSACTION_TYPES as string[]).includes(params.transactionType)
  ) {
    filters.transactionType = params.transactionType as ListingTransactionType;
  }
  if (
    typeof params.rentPeriod === 'string' &&
    (LISTING_RENT_PERIODS as string[]).includes(params.rentPeriod)
  ) {
    filters.rentPeriod = params.rentPeriod as ListingRentPeriod;
  }
  if (params.onlyWithPhoto === true || params.onlyWithPhoto === 'true')
    filters.onlyWithPhoto = true;
  if (typeof params.sort === 'string' && SORTS.includes(params.sort))
    filters.sort = params.sort as ListingSort;

  const attributes = parseAttributes(params.attributes);
  if (attributes) filters.attributes = attributes;

  return filters;
}

function listingArea(query: SmartSearchNormalizedQuery): SmartListingArea {
  const params = query.params;
  const location = query.location;
  const regionWide = params.regionWide === true || params.regionWide === 'true';
  if (!location || location.mode === 'context' || location.mode === 'near_me') {
    // Место не называли: экран остаётся при своём выборе
    return { kind: 'keep' };
  }
  if (location.cityId === null) return { kind: 'region' };
  if (typeof params.latitude !== 'number' || typeof params.longitude !== 'number')
    return { kind: 'keep' };
  return {
    kind: 'city',
    label: location.cityName ?? 'Город',
    latitude: params.latitude,
    longitude: params.longitude,
    radiusKm: regionWide ? null : typeof params.radiusKm === 'number' ? params.radiusKm : null,
  };
}

function kopecksToRubles(value: unknown): number | undefined {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number >= 0
    ? Math.round(number / 100)
    : undefined;
}

function parseAttributes(value: unknown): Record<string, unknown> | undefined {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const entries = Object.entries(parsed as Record<string, unknown>);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
//  «Понял запрос»
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/**
 * Короткие части строки «Понял запрос»: «Toyota Succeed», «до 1,2 млн ₽»,
 * «автомат». Берутся из применённых сервером условий (то, что реально
 * сузило выдачу), а не из слов модели.
 */
export function understoodParts(query: SmartSearchNormalizedQuery): string[] {
  const parts: string[] = [];
  const conditions = query.conditions;
  const byField = (field: string) => conditions.find((item) => item.field === field);
  const brand = byField('brand');
  const model = byField('model');

  if (brand || model) {
    const brandText = brand?.display ?? '';
    const modelText = model?.display ?? '';
    parts.push(
      modelText.toLowerCase().startsWith(brandText.toLowerCase()) && modelText
        ? modelText
        : [brandText, modelText].filter(Boolean).join(' '),
    );
  } else {
    const category = byField('category');
    if (category) parts.push(category.display);
  }

  for (const condition of conditions) {
    if (['brand', 'model', 'category'].includes(condition.field)) continue;
    if (condition.field === 'location' && query.location?.mode === 'context') continue;
    parts.push(conditionText(condition));
  }
  // Город, названный во фразе, но не ставший отдельным условием (кино, новости)
  if (
    query.location?.cityName &&
    (query.location.mode === 'exact' || query.location.mode === 'preferred') &&
    !conditions.some((item) => item.field === 'location')
  ) {
    parts.push(query.location.cityName);
  }
  for (const preference of query.preferences) {
    if (preference.applied) parts.push(`желательно ${lowerFirst(preference.display)}`);
  }
  if (query.text && !conditions.some((item) => item.field === 'search'))
    parts.push(`«${query.text}»`);

  return parts.filter((part) => part.trim().length > 0);
}

export function understoodSummary(query: SmartSearchNormalizedQuery): string {
  return understoodParts(query).join(' · ');
}

/**
 * Что человек сказал, но поиск не учёл: «Цен билетов в поиске сеансов нет —
 * условие не применено», «Такого числа нет в запросе». Без служебных пометок
 * (день по умолчанию, поле не на своём месте) — они человеку ничего не дают.
 */
export function understoodNotes(query: SmartSearchNormalizedQuery, limit = 2): string[] {
  const notes = [
    ...query.ignored
      .filter((item) => item.field !== 'date' && item.field !== 'time')
      .filter((item) => !/не на своём месте/u.test(item.reason))
      .map((item) => item.reason),
    ...query.preferences.filter((item) => !item.applied).map((item) => item.note),
  ];
  return [...new Set(notes)].slice(0, limit);
}

function conditionText(condition: SmartSearchCondition): string {
  if (condition.field === 'price') {
    const range = condition.value as { min?: number; max?: number } | null;
    if (range && typeof range === 'object') {
      const from = typeof range.min === 'number' ? range.min : undefined;
      const to = typeof range.max === 'number' ? range.max : undefined;
      if (from !== undefined && to !== undefined && from !== to)
        return `${compactRubles(from, false)} – ${compactRubles(to)}`;
      if (to !== undefined) return `до ${compactRubles(to)}`;
      if (from !== undefined) return `от ${compactRubles(from)}`;
    }
  }
  if (condition.field === 'date' && typeof condition.value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(condition.value);
    if (match) return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? ''}`.trim();
  }
  if (condition.field === 'location') return condition.display;
  return lowerFirst(condition.display);
}

/** «1,2 млн ₽», «40 тыс ₽», «900 ₽». */
export function compactRubles(rubles: number, withSign = true): string {
  const sign = withSign ? ' ₽' : '';
  if (rubles >= 1_000_000)
    return `${(Math.round((rubles / 1_000_000) * 10) / 10).toString().replace('.', ',')} млн${sign}`;
  if (rubles >= 1000)
    return `${(Math.round((rubles / 1000) * 10) / 10).toString().replace('.', ',')} тыс${sign}`;
  return `${Math.round(rubles)}${sign}`;
}

/** «Автомат» → «автомат», но «SSD», «ИЖС» и «iPhone» не трогаются. */
function lowerFirst(text: string): string {
  if (text.length < 2) return text;
  const [first, second] = [text[0]!, text[1]!];
  const isUpper = (char: string) => char !== char.toLowerCase() && char === char.toUpperCase();
  return isUpper(first) && !isUpper(second) ? first.toLowerCase() + text.slice(1) : text;
}
