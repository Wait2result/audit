import {
  EMPTY_ADDRESS_COMPONENTS,
  ListingLocationAccuracy,
  formatAddress,
  placeName,
  streetLine,
  type GeoAddressComponents,
  type GeoPlaceDto,
  type GeoPlaceKind,
} from '@dagestan/shared';

/**
 * Ответы поставщиков → единый `GeoPlaceDto`.
 *
 * Отдельно от HTTP, чистыми функциями: формат ответа OpenStreetMap полон
 * особенностей Дагестана, и каждая из них проверена тестом на настоящем
 * ответе (test/geo-normalize.spec.ts).
 */

/** «Дагестан» у OpenStreetMap — «Республика Дагестан» в адресе. */
export function normalizeRegion(state: string | null | undefined): string | null {
  if (!state) return null;
  const trimmed = state.trim();
  if (/^дагестан$/i.test(trimmed)) return 'Республика Дагестан';
  return trimmed;
}

/**
 * Город это или село. OpenStreetMap помечает «town» и крупные сёла вроде
 * Касумкента, так что по тегу не отличить. Надёжный признак в Дагестане —
 * городской округ: Махачкала, Каспийск, Дербент, Хасавюрт, Буйнакск,
 * Избербаш и остальные города — отдельные городские округа, а сёла и посёлки
 * входят в муниципальные районы.
 */
export function isCityDistrictCounty(county: string | null | undefined): boolean {
  return Boolean(county && /городской округ/i.test(county));
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Административные «оболочки», а не места: «сельское поселение Село Манаскент». */
function isAdministrativeWrapper(name: string | null): boolean {
  return Boolean(name && /(поселение|сельсовет|муниципальный|городской округ)/i.test(name));
}

function accuracyFor(kind: GeoPlaceKind): GeoPlaceDto['accuracy'] {
  switch (kind) {
    case 'house':
    case 'poi':
      return ListingLocationAccuracy.HOUSE;
    case 'street':
      return ListingLocationAccuracy.STREET;
    default:
      return ListingLocationAccuracy.SETTLEMENT;
  }
}

/** Подпись под заголовком подсказки. */
function subtitleFor(kind: GeoPlaceKind, c: GeoAddressComponents): string {
  const place = placeName(c);
  const parts =
    kind === 'settlement' ? [c.district, c.region] : [place, c.city ? c.cityDistrict : c.district];
  return [...new Set(parts.filter((part): part is string => Boolean(part)))].join(', ');
}

function build(
  kind: GeoPlaceKind,
  title: string,
  latitude: number,
  longitude: number,
  components: GeoAddressComponents,
): GeoPlaceDto {
  return {
    kind,
    title,
    subtitle: subtitleFor(kind, components),
    latitude,
    longitude,
    formattedAddress: formatAddress(components),
    accuracy: accuracyFor(kind),
    components,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Photon (https://github.com/komoot/photon)
// ─────────────────────────────────────────────────────────────────────────────

export interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}

const SETTLEMENT_VALUES = new Set(['city', 'town', 'village', 'hamlet', 'isolated_dwelling']);
const AREA_VALUES = new Set(['suburb', 'neighbourhood', 'quarter', 'borough', 'city_district']);

/** Одна точка из ответа Photon, или null, если это не место, а «оболочка». */
export function photonToPlace(feature: PhotonFeature): GeoPlaceDto | null {
  const p = feature.properties ?? {};
  const coords = feature.geometry?.coordinates;
  if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
  const [longitude, latitude] = coords;

  const osmKey = clean(p.osm_key);
  const osmValue = clean(p.osm_value);
  const name = clean(p.name);
  const county = clean(p.county);
  const houseNumber = clean(p.housenumber);
  const isCity = isCityDistrictCounty(county);

  let kind: GeoPlaceKind;
  if (osmKey === 'place' && osmValue && SETTLEMENT_VALUES.has(osmValue)) kind = 'settlement';
  else if (osmKey === 'place' && osmValue && AREA_VALUES.has(osmValue)) kind = 'area';
  else if (osmKey === 'boundary') {
    // «Кассагумахинский сельсовет» — не место, а граница вокруг него
    if (isAdministrativeWrapper(name)) return null;
    kind = 'area';
  } else if (houseNumber && (clean(p.type) === 'house' || osmKey === 'building' || !name)) {
    kind = 'house';
  } else if (osmKey === 'highway' || clean(p.type) === 'street') kind = 'street';
  else kind = 'poi';

  // Для самого населённого пункта его имя — и есть город или село; для
  // улицы и дома Photon кладёт населённый пункт в `city`
  const locality = kind === 'settlement' ? name : clean(p.city);
  const components: GeoAddressComponents = {
    ...EMPTY_ADDRESS_COMPONENTS,
    country: clean(p.country),
    region: normalizeRegion(clean(p.state)),
    district: county,
    cityDistrict: null,
    city: isCity ? locality : null,
    settlement: isCity ? null : locality,
    street: kind === 'street' ? name : clean(p.street),
    houseNumber,
  };

  const title =
    kind === 'house'
      ? (streetLine(components) ?? name ?? 'Дом')
      : kind === 'street'
        ? (components.street ?? name ?? 'Улица')
        : (name ?? placeName(components) ?? 'Место');

  return build(kind, title, latitude, longitude, components);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Nominatim (https://nominatim.org)
// ─────────────────────────────────────────────────────────────────────────────

export interface NominatimResult {
  lat?: string;
  lon?: string;
  name?: string;
  category?: string;
  type?: string;
  addresstype?: string;
  address?: Record<string, string | undefined>;
}

/** Ответ Nominatim (reverse или search с addressdetails) → место. */
export function nominatimToPlace(result: NominatimResult): GeoPlaceDto | null {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const a = result.address ?? {};
  const county = clean(a.county);
  const town = clean(a.town);
  const cityRaw = clean(a.city);
  // Город: сам city или town в городском округе («посёлок городского типа»
  // в OSM бывает town). Остальное — село
  const city = cityRaw ?? (town && isCityDistrictCounty(county) ? town : null);
  const settlement =
    city === null
      ? (clean(a.village) ?? clean(a.hamlet) ?? town ?? clean(a.isolated_dwelling))
      : null;

  const components: GeoAddressComponents = {
    ...EMPTY_ADDRESS_COMPONENTS,
    country: clean(a.country),
    region: normalizeRegion(clean(a.state)),
    district: county,
    cityDistrict: city ? clean(a.city_district) : null,
    city,
    settlement,
    street: clean(a.road) ?? clean(a.pedestrian) ?? clean(a.footway),
    houseNumber: clean(a.house_number),
  };

  const addressType = clean(result.addresstype) ?? clean(result.type);
  let kind: GeoPlaceKind;
  if (components.houseNumber) kind = 'house';
  else if (addressType && ['city', 'town', 'village', 'hamlet'].includes(addressType)) {
    kind = 'settlement';
  } else if (components.street) kind = 'street';
  else if (placeName(components)) kind = 'settlement';
  else kind = 'area';

  const title =
    kind === 'house' || kind === 'street'
      ? (streetLine(components) ?? clean(result.name) ?? 'Адрес')
      : (placeName(components) ?? clean(result.name) ?? components.district ?? 'Место');

  return build(kind, title, latitude, longitude, components);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Общие правила выдачи
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Подсказки без повторов: OpenStreetMap хранит длинную улицу отрезками, и
 * «улица Батырая, Махачкала» приходит трижды с разными точками.
 */
export function dedupePlaces(places: readonly GeoPlaceDto[]): GeoPlaceDto[] {
  const seen = new Set<string>();
  const result: GeoPlaceDto[] = [];
  for (const place of places) {
    const key = `${place.kind}|${place.title.toLowerCase()}|${place.subtitle.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(place);
  }
  return result;
}

/**
 * Сначала Дагестан: приложение про него, а поиск по «Ленина» без этого
 * первым выдаёт улицу в соседнем регионе.
 */
export function dagestanFirst(places: readonly GeoPlaceDto[]): GeoPlaceDto[] {
  const inside = places.filter((place) => place.components.region === 'Республика Дагестан');
  const outside = places.filter((place) => place.components.region !== 'Республика Дагестан');
  return [...inside, ...outside];
}
