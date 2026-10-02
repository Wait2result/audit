import type { CityDto } from '@dagestan/shared';
import { create } from 'zustand';

import { StorageKey, plainStorage } from '../api/storage';

/**
 * Выбранный город (пункты 2 и 7 ТЗ).
 *
 * Город — это ось всего приложения: погода, кино, рестораны, объявления
 * и поездки показываются относительно него. Поэтому он хранится на
 * устройстве и спрашивается ровно один раз, при первом запуске.
 *
 * Отдельно от геолокации: выбор города вручную должен работать, даже если
 * человек навсегда запретил доступ к местоположению (пункт 8 ТЗ).
 */

interface CityState {
  cityId: string | null;
  cityName: string | null;
  /** Пока идёт чтение с устройства, экраны ждут и не мигают содержимым */
  isLoaded: boolean;

  load: () => Promise<void>;
  select: (city: Pick<CityDto, 'id' | 'name'>) => Promise<void>;
  /** Забыть город: он исчез с сервера или был отключён */
  forget: () => Promise<void>;
}

export const useCityStore = create<CityState>((set) => ({
  cityId: null,
  cityName: null,
  isLoaded: false,

  load: async () => {
    const [cityId, cityName] = await Promise.all([
      plainStorage.get(StorageKey.CITY_ID),
      plainStorage.get(StorageKey.CITY_NAME),
    ]);

    set({ cityId, cityName, isLoaded: true });
  },

  select: async (city) => {
    // Сначала сохраняем на устройство, потом меняем состояние: если запись
    // не удалась, интерфейс не покажет город, которого на самом деле нет.
    await plainStorage.set(StorageKey.CITY_ID, city.id);
    await plainStorage.set(StorageKey.CITY_NAME, city.name);

    set({ cityId: city.id, cityName: city.name });
  },

  forget: async () => {
    await plainStorage.remove(StorageKey.CITY_ID);
    await plainStorage.remove(StorageKey.CITY_NAME);

    set({ cityId: null, cityName: null });
  },
}));
