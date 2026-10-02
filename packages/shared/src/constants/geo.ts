/**
 * География объявлений (ADR-0010).
 *
 * Основа поиска — точка и радиус вокруг неё, а не город и не район. Районы
 * городов («Советский», «Ленинский») есть только у трёх городов из сотен
 * населённых пунктов Дагестана, и сделать их главным фильтром — значит
 * оставить без поиска все сёла. Точка есть у любого места.
 */

/** Точка на карте. */
export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Прямоугольник, в котором лежит Дагестан, с небольшим запасом. Нужен для
 * подсказок адреса (искать сначала здесь) и мягкой проверки, а не для
 * запрета: геокодер иногда ставит приграничное село на сотню метров за
 * границу, и отказывать из-за этого в публикации нельзя.
 */
export const DAGESTAN_BOUNDS = { south: 41.1, west: 45.0, north: 45.1, east: 48.7 } as const;

/** Центр карты, когда больше не на что опереться: Махачкала. */
export const DAGESTAN_DEFAULT_CENTER: GeoCoordinates = { latitude: 42.9849, longitude: 47.5047 };

/** Лежит ли точка в пределах Дагестана (с запасом). */
export function isInDagestan(point: GeoCoordinates): boolean {
  return (
    point.latitude >= DAGESTAN_BOUNDS.south &&
    point.latitude <= DAGESTAN_BOUNDS.north &&
    point.longitude >= DAGESTAN_BOUNDS.west &&
    point.longitude <= DAGESTAN_BOUNDS.east
  );
}

/** Корректная ли это точка вообще: числа, не NaN, в пределах шара. */
export function isValidPoint(
  point: Partial<GeoCoordinates> | null | undefined,
): point is GeoCoordinates {
  if (!point) return false;
  const { latitude, longitude } = point;
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Место объявления
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Насколько точно известна точка объявления.
 *   house      — выбран адрес с номером дома;
 *   street     — выбрана улица (точка где-то на ней);
 *   settlement — выбран только населённый пункт (точка — его центр);
 *   point      — точку поставили на карте руками: координаты точные,
 *                адрес подобран по ним и может быть приблизительным.
 */
export const ListingLocationAccuracy = {
  HOUSE: 'house',
  STREET: 'street',
  SETTLEMENT: 'settlement',
  POINT: 'point',
} as const;

export type ListingLocationAccuracy =
  (typeof ListingLocationAccuracy)[keyof typeof ListingLocationAccuracy];

/**
 * Что из адреса видят другие. Точные координаты хранятся всегда и работают
 * в поиске по радиусу — от видимости зависит только показ.
 *   exact       — адрес с домом и точная точка (магазины, СТО, кафе);
 *   approximate — населённый пункт и улица без дома, точка на карте
 *                 округлена примерно до километра (частные продавцы).
 */
export const ListingAddressVisibility = {
  EXACT: 'exact',
  APPROXIMATE: 'approximate',
} as const;

export type ListingAddressVisibility =
  (typeof ListingAddressVisibility)[keyof typeof ListingAddressVisibility];

/**
 * Разделы, где точный адрес по умолчанию открыт: у сервиса, магазина или
 * бизнеса адрес — часть предложения, а не личные данные.
 */
export const EXACT_ADDRESS_SECTIONS: readonly string[] = ['services', 'business'];

/** Части адреса — как их отдаёт геокодер и как они хранятся у объявления. */
export interface GeoAddressComponents {
  /** «Россия» */
  country: string | null;
  /** «Республика Дагестан» */
  region: string | null;
  /** Административный район или городской округ: «Карабудахкентский район» */
  district: string | null;
  /** Район внутри города: «Советский район» */
  cityDistrict: string | null;
  /** Город или посёлок городского типа: «Махачкала» */
  city: string | null;
  /** Село, посёлок, хутор: «Манаскент» */
  settlement: string | null;
  /** «улица Батырая» */
  street: string | null;
  /** «10» */
  houseNumber: string | null;
}

export const EMPTY_ADDRESS_COMPONENTS: GeoAddressComponents = {
  country: null,
  region: null,
  district: null,
  cityDistrict: null,
  city: null,
  settlement: null,
  street: null,
  houseNumber: null,
};

/** Название места: город, иначе село. */
export function placeName(components: Partial<GeoAddressComponents>): string | null {
  return components.city || components.settlement || null;
}

/**
 * Подпись места для карточки: «Манаскент», «Махачкала, Советский район».
 * Район города добавляется только к городу — у села его не бывает.
 */
export function placeLabel(
  components: Partial<GeoAddressComponents>,
  fallback: string | null = null,
): string {
  const place = placeName(components) ?? fallback ?? components.district ?? components.region;
  if (!place) return 'Дагестан';
  if (components.city && components.cityDistrict) return `${place}, ${components.cityDistrict}`;
  return place;
}

/** «улица Батырая, 10» — улица с домом, если он есть. */
export function streetLine(components: Partial<GeoAddressComponents>): string | null {
  if (!components.street) return null;
  return components.houseNumber
    ? `${components.street}, ${components.houseNumber}`
    : components.street;
}

/**
 * Полный адрес строкой из частей: «Республика Дагестан, Карабудахкентский
 * район, Манаскент, Приморская улица, 40». Для случаев, когда геокодер
 * готовой строки не дал.
 */
export function formatAddress(components: Partial<GeoAddressComponents>): string {
  const place = placeName(components);
  const parts = [
    components.region,
    components.city ? null : components.district,
    place,
    components.city ? components.cityDistrict : null,
    streetLine(components),
  ].filter((part): part is string => Boolean(part));
  return [...new Set(parts)].join(', ');
}

/** Округление точки для показа при скрытом адресе: ~1 км по широте. */
export function approximatePoint(point: GeoCoordinates): GeoCoordinates {
  return {
    latitude: Math.round(point.latitude * 100) / 100,
    longitude: Math.round(point.longitude * 100) / 100,
  };
}

/** Радиус круга «примерно здесь» на карте объявления со скрытым адресом, м. */
export const APPROXIMATE_AREA_METERS = 700;
