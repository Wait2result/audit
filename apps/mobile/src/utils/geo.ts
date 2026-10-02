import {
  placeLabel,
  type GeoCoordinates,
  type GeoPlaceDto,
  type ListingLocationAccuracy,
  type ListingLocationInput,
} from '@dagestan/shared';
import * as Location from 'expo-location';

/**
 * Общее для карты, формы объявления и выбора места поиска (ADR-0010).
 */

/** Результат запроса своего места: точка, отказ или «не определилось». */
export type CurrentPosition =
  { status: 'ok'; point: GeoCoordinates } | { status: 'denied' } | { status: 'unavailable' };

/**
 * Своё место — только по нажатию человека, со стандартным окном
 * разрешения. Отказ — не ошибка: всё остальное работает и без него.
 */
export async function requestCurrentPosition(): Promise<CurrentPosition> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) return { status: 'denied' };

    // Balanced, а не Highest: точности в десятки метров для адреса хватает,
    // а ждать высшую человек будет несколько секунд
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
      return { status: 'unavailable' };
    }
    return { status: 'ok', point };
  } catch {
    // Выключен GPS, помещение, эмулятор без координат
    return { status: 'unavailable' };
  }
}

/** Насколько приблизить карту к выбранному: село — целиком, дом — вплотную. */
export function zoomFor(accuracy: ListingLocationAccuracy | GeoPlaceDto['kind']): number {
  switch (accuracy) {
    case 'settlement':
    case 'area':
      return 13;
    case 'street':
      return 15;
    default:
      return 17;
  }
}

/**
 * Место объявления из подсказки или адреса по точке. `point` — если точку
 * поставил человек: координаты остаются его, а адрес берётся найденный.
 */
export function placeToLocation(
  place: GeoPlaceDto,
  point: GeoCoordinates | null = null,
): ListingLocationInput {
  return {
    latitude: point?.latitude ?? place.latitude,
    longitude: point?.longitude ?? place.longitude,
    accuracy: point ? 'point' : place.accuracy,
    address: place.kind === 'settlement' || place.kind === 'area' ? null : place.title,
    formattedAddress: place.formattedAddress,
    ...place.components,
  };
}

/** Подпись места объявления: «Манаскент», «Махачкала, Советский район». */
export function locationLabel(location: ListingLocationInput | null, fallback: string): string {
  if (!location) return fallback;
  return placeLabel(location, fallback);
}
