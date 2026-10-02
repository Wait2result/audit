import { create } from 'zustand';

import type { ListingFilters } from '../api/queries';

/**
 * Выбранные фильтры каталога объявлений — отдельно для каждой категории.
 *
 * Живут в сторе, а не в состоянии экрана, по простой причине: фильтры
 * выбирают на отдельном экране, а expo-router не умеет возвращать значение
 * с закрытого экрана назад. Передавать их обратно через параметры адреса —
 * значит складывать вложенные характеристики в строку и разбирать её руками.
 *
 * По категории, а не общие: «до 3 млн» и «автомат», выбранные в автомобилях,
 * не должны молча применяться к телефонам — там получится пустая доска, а
 * человек не поймёт, почему. Переход в другую категорию начинает с чистого
 * листа, возврат в прежнюю — с того, что там было выбрано.
 *
 * Не сохраняется на устройство намеренно: вчерашний фильтр «до 50 000 ₽»,
 * молча применённый к сегодняшнему поиску, выглядит как пустая доска.
 */

/**
 * Фильтры, выбираемые на отдельном экране (без категории и поиска). Сортировка
 * здесь тоже: она общая для всех категорий и задаётся рядом с остальным.
 */
export type ExtraListingFilters = Pick<
  ListingFilters,
  | 'priceFrom'
  | 'priceTo'
  | 'priceUnit'
  | 'transactionType'
  | 'rentPeriod'
  | 'onlyWithPhoto'
  | 'attributes'
  | 'sort'
>;

/** Ключ категории в сторе; пустая строка — общий каталог без категории. */
export type FilterScope = string;

interface ListingFilterState {
  byScope: Record<FilterScope, ExtraListingFilters>;
  filtersFor: (scope: FilterScope) => ExtraListingFilters;
  /** Сколько фильтров выбрано — для значка на кнопке */
  count: (scope: FilterScope) => number;
  set: (scope: FilterScope, filters: ExtraListingFilters) => void;
  reset: (scope: FilterScope) => void;
}

const EMPTY: ExtraListingFilters = {};

/** Число реально применённых условий: цена «от и до» — одно, а не два. */
export function countFilters(filters: ExtraListingFilters): number {
  let count = 0;
  if (filters.priceFrom !== undefined || filters.priceTo !== undefined) count += 1;
  if (filters.transactionType) count += 1;
  if (filters.onlyWithPhoto) count += 1;
  count += Object.keys(filters.attributes ?? {}).length;
  return count;
}

export const useListingFilterStore = create<ListingFilterState>((set, get) => ({
  byScope: {},

  filtersFor: (scope) => get().byScope[scope] ?? EMPTY,

  count: (scope) => countFilters(get().byScope[scope] ?? EMPTY),

  set: (scope, filters) => set((state) => ({ byScope: { ...state.byScope, [scope]: filters } })),

  reset: (scope) =>
    set((state) => {
      const next = { ...state.byScope };
      delete next[scope];
      return { byScope: next };
    }),
}));
