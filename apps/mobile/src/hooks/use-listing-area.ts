import {
  DAGESTAN_DEFAULT_CENTER,
  type GeoCoordinates,
  type ListingRadiusKm,
} from '@dagestan/shared';
import { useEffect, useMemo } from 'react';

import { useCities, type ListingFilters } from '../api/queries';
import { useCityStore } from '../store/city-store';
import { radiusLabel, useListingAreaStore } from '../store/listing-area-store';

/**
 * Где искать — в виде параметров запроса и подписи.
 *
 * Отдельным хуком, потому что это нужно трём экранам сразу: первому экрану
 * раздела, выдаче и карточке объявления. Собирать одни и те же поля в
 * каждом из них — значит однажды забыть их в одном месте, и человек увидит
 * расстояние в списке, но не увидит в открытом объявлении.
 */
export type ListingAreaFilters = Pick<
  ListingFilters,
  'latitude' | 'longitude' | 'radiusKm' | 'regionWide'
>;

export interface ListingSearchArea {
  filters: ListingAreaFilters;
  /** Центр поиска: выбранное место или центр города */
  center: GeoCoordinates;
  /** «Манаскент» */
  label: string;
  radiusKm: ListingRadiusKm | null;
  /** Центр и название города приложения — место по умолчанию */
  cityCenter: GeoCoordinates;
  cityLabel: string;
  /** «Манаскент · 25 км», «Махачкала · Весь Дагестан» */
  summary: string;
  /** Сохранённый выбор и город загружены — можно запрашивать выдачу */
  ready: boolean;
}

export function useListingArea(): ListingSearchArea {
  const place = useListingAreaStore((state) => state.place);
  const radiusKm = useListingAreaStore((state) => state.radiusKm);
  const hydrated = useListingAreaStore((state) => state.hydrated);
  const hydrate = useListingAreaStore((state) => state.hydrate);
  const cityId = useCityStore((state) => state.cityId);
  const cityName = useCityStore((state) => state.cityName);
  const cities = useCities();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const city = cities.data?.find((item) => item.id === cityId);

  return useMemo(() => {
    const cityCenter = city
      ? { latitude: city.latitude, longitude: city.longitude }
      : DAGESTAN_DEFAULT_CENTER;
    const cityLabel = city?.name ?? cityName ?? 'Дагестан';
    const point = place ?? cityCenter;
    const label = place?.label ?? cityLabel;

    // Точка уходит и при «Весь Дагестан»: по ней считается «3 км» в
    // карточке и сортировка «Ближе»
    const filters: ListingAreaFilters =
      radiusKm === null
        ? { latitude: point.latitude, longitude: point.longitude, regionWide: true }
        : { latitude: point.latitude, longitude: point.longitude, radiusKm };

    return {
      filters,
      center: point,
      label,
      radiusKm,
      cityCenter,
      cityLabel,
      summary: `${label} · ${radiusLabel(radiusKm)}`,
      // Пока город не загрузился, центра нет — запрос с Махачкалой по
      // умолчанию показал бы не те объявления и тут же перезапросился
      // Город не выбран вовсе — ищем от центра Дагестана
      ready:
        hydrated && (place !== null || cityId === null || city !== undefined || cities.isError),
    };
  }, [place, radiusKm, hydrated, city, cityId, cityName, cities.isError]);
}
