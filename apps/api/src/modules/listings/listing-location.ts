import {
  ListingAddressVisibility,
  approximatePoint,
  formatAddress,
  phoneParts,
  placeLabel,
  streetLine,
  type GeoAddressComponents,
  type GeoPlaceDto,
  type ListingLocationDto,
  type ListingLocationInput,
  type MyListingLocationDto,
} from '@dagestan/shared';

import type {
  ListingAddressVisibility as DbAddressVisibility,
  ListingLocationAccuracy as DbAccuracy,
} from '../../generated/prisma/enums.js';

/**
 * Место объявления: колонки базы ↔ то, что видит приложение (ADR-0010).
 *
 * Точные координаты хранятся всегда и работают в поиске по радиусу. От
 * настройки видимости зависит только показ: частный продавец по умолчанию
 * показывает населённый пункт и улицу, а точку — примерно, с точностью до
 * километра.
 */

/** Колонки места у строки объявления. */
export interface LocationColumns {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  formattedAddress: string | null;
  country: string | null;
  region: string | null;
  districtName: string | null;
  cityDistrict: string | null;
  cityName: string | null;
  settlement: string | null;
  street: string | null;
  houseNumber: string | null;
  locationAccuracy: DbAccuracy | null;
}

/** Что нужно из строки, чтобы показать место. */
export type LocationRow = LocationColumns & {
  addressVisibility: DbAddressVisibility;
  city: { name: string };
  district?: { name: string } | null;
};

export const LOCATION_SELECT = {
  latitude: true,
  longitude: true,
  address: true,
  formattedAddress: true,
  country: true,
  region: true,
  districtName: true,
  cityDistrict: true,
  cityName: true,
  settlement: true,
  street: true,
  houseNumber: true,
  locationAccuracy: true,
  addressVisibility: true,
} as const;

function componentsOf(row: LocationColumns): GeoAddressComponents {
  return {
    country: row.country,
    region: row.region,
    district: row.districtName,
    cityDistrict: row.cityDistrict,
    city: row.cityName,
    settlement: row.settlement,
    street: row.street,
    houseNumber: row.houseNumber,
  };
}

const orNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * Место из формы → колонки. Части адреса присылает приложение (оно получило
 * их у нашего же геокодера). Если частей о населённом пункте нет — точку
 * поставили руками, а адрес по ней не нашёлся, — берутся части, которые
 * сервер сам определил по точке (`enrichment`), если это удалось.
 */
export function locationColumns(
  input: ListingLocationInput,
  enrichment: GeoPlaceDto | null = null,
): LocationColumns {
  const sent: GeoAddressComponents = {
    country: orNull(input.country),
    region: orNull(input.region),
    district: orNull(input.district),
    cityDistrict: orNull(input.cityDistrict),
    city: orNull(input.city),
    settlement: orNull(input.settlement),
    street: orNull(input.street),
    houseNumber: orNull(input.houseNumber),
  };
  const needsEnrichment = !sent.city && !sent.settlement && enrichment !== null;
  const c: GeoAddressComponents = needsEnrichment
    ? {
        ...enrichment.components,
        // Улицу и дом, которые человек выбрал сам, не перетираем
        street: sent.street ?? enrichment.components.street,
        houseNumber: sent.houseNumber ?? enrichment.components.houseNumber,
      }
    : sent;

  const formatted = orNull(input.formattedAddress) ?? (formatAddress(c) || null);

  return {
    latitude: input.latitude,
    longitude: input.longitude,
    address: orNull(input.address) ?? streetLine(c),
    formattedAddress: formatted,
    country: c.country,
    region: c.region,
    districtName: c.district,
    cityDistrict: c.cityDistrict,
    cityName: c.city,
    settlement: c.settlement,
    street: c.street,
    houseNumber: c.houseNumber,
    locationAccuracy: input.accuracy,
  };
}

/** «Манаскент», «Махачкала, Советский район»; у старых объявлений — город справочника. */
export function listingPlaceLabel(row: LocationRow): string {
  const components = componentsOf(row);
  const label = placeLabel(components, row.city.name);
  // У старых объявлений район есть только связью с таблицей районов
  if (!components.cityDistrict && !components.settlement && row.district?.name) {
    return `${placeLabel(components, row.city.name)}, ${row.district.name}`;
  }
  return label;
}

/**
 * Место для покупателя. При скрытом адресе — улица без дома и точка,
 * округлённая примерно до километра. Точные координаты наружу не уходят.
 */
export function publicLocation(row: LocationRow): ListingLocationDto {
  const components = componentsOf(row);
  const exact = row.addressVisibility === ListingAddressVisibility.EXACT;
  const hasPoint = row.latitude !== null && row.longitude !== null;
  const point = hasPoint
    ? { latitude: row.latitude as number, longitude: row.longitude as number }
    : null;

  return {
    label: listingPlaceLabel(row),
    address: exact ? (row.address ?? streetLine(components)) : (components.street ?? null),
    point: point ? (exact ? point : approximatePoint(point)) : null,
    isApproximate: !exact,
  };
}

/** Место своего объявления — целиком, для формы правки. */
export function myLocation(row: LocationColumns): MyListingLocationDto | null {
  if (row.latitude === null || row.longitude === null) return null;
  return {
    latitude: row.latitude,
    longitude: row.longitude,
    ...componentsOf(row),
    accuracy: row.locationAccuracy ?? 'point',
    address: row.address,
    formattedAddress: row.formattedAddress,
  };
}

/** Телефон объявления по частям для колонок базы. */
export function phoneColumns(e164: string): {
  contactPhone: string;
  contactPhoneCountryCode: string | null;
  contactPhoneNational: string | null;
} {
  const parts = phoneParts(e164);
  return {
    contactPhone: e164,
    contactPhoneCountryCode: parts?.countryCode || null,
    contactPhoneNational: parts?.nationalNumber ?? null,
  };
}
