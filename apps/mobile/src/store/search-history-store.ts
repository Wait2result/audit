import { SearchHistory } from '@dagestan/shared';
import { create } from 'zustand';

import { StorageKey, plainStorage } from '../api/storage';

/**
 * История поиска объявлений — одна на все экраны (главная раздела, выдача).
 *
 * Раньше у каждой строки поиска была своя копия, прочитанная при открытии
 * экрана, и «Очистить» в выдаче не доходило до главной под ней: та при
 * следующем поиске записывала старый список обратно. Теперь все строки
 * читают и меняют одно хранилище, а запись в память телефона — сразу.
 */

const history = new SearchHistory(
  {
    get: (key) => plainStorage.get(key),
    set: (key, value) => plainStorage.set(key, value),
    remove: (key) => plainStorage.remove(key),
  },
  StorageKey.LISTING_SEARCH_HISTORY,
);

interface SearchHistoryState {
  items: string[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Поиск выполнен — запрос в историю (набранный текст сюда не попадает) */
  add: (text: string) => Promise<void>;
  /** «×» у запроса */
  remove: (text: string) => Promise<void>;
  /** «Очистить» */
  clear: () => Promise<void>;
}

export const useSearchHistoryStore = create<SearchHistoryState>((set) => ({
  items: [],
  loaded: false,
  load: async () => set({ items: await history.load(), loaded: true }),
  add: async (text) => set({ items: await history.add(text), loaded: true }),
  remove: async (text) => set({ items: await history.remove(text) }),
  clear: async () => set({ items: await history.clear(), loaded: true }),
}));
