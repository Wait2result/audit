import type {
  GeoAddressComponents,
  GeoCoordinates,
  ListingAddressVisibility,
  ListingLocationAccuracy,
} from '../constants/geo.js';

/** Что нашёл геокодер: населённый пункт, улица, дом или заметное место. */
export type GeoPlaceKind = 'settlement' | 'street' | 'house' | 'poi' | 'area';

/** Один вариант подсказки или результат «адрес по точке». */
export interface GeoPlaceDto extends GeoCoordinates {
  kind: GeoPlaceKind;
  /** Главная строка подсказки: «улица Батырая, 10», «Манаскент» */
  title: string;
  /** Уточнение под ней: «Махачкала, Советский район», «Карабудахкентский район» */
  subtitle: string;
  /** Полный адрес одной строкой */
  formattedAddress: string;
  /** Насколько точна точка — сохраняется в объявлении как есть */
  accuracy: ListingLocationAccuracy;
  components: GeoAddressComponents;
}

/**
 * Место объявления глазами покупателя.
 *
 * Если продавец скрыл точный адрес, здесь только населённый пункт и улица,
 * а точка округлена примерно до километра: поиск по радиусу при этом
 * работает по точным координатам — они хранятся, но наружу не отдаются.
 */
export interface ListingLocationDto {
  /** «Манаскент», «Махачкала, Советский район» */
  label: string;
  /** Адрес, который разрешено показать: с домом или только улица */
  address: string | null;
  point: GeoCoordinates | null;
  /** Точка округлена — рисовать круг «примерно здесь», а не булавку */
  isApproximate: boolean;
}

/** Место своего объявления — всё, что нужно форме правки. */
export interface MyListingLocationDto extends GeoCoordinates, GeoAddressComponents {
  accuracy: ListingLocationAccuracy;
  address: string | null;
  formattedAddress: string | null;
}

export type { ListingAddressVisibility };
