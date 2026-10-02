/**
 * Тип сделки объявления (Этап 7, версия 2).
 *
 * Хранится ОДНО значение — что делает продавец: продаёт, сдаёт, отдаёт.
 * «Куплю» и «Сниму» типами объявления не являются: покупатель ищет уже
 * существующие объявления, и его намерение — это фильтр поиска, а не
 * запись в базе. Поэтому подписи разведены надвое: для формы подачи
 * («Продам») и для экрана поиска («Купить»), а значение под ними одно.
 */

export const ListingTransactionType = {
  SALE: 'sale',
  RENT: 'rent',
  /** Отдам бесплатно: животные, вещи */
  FREE: 'free',
  /** Вязка животных — сделка без продажи и аренды */
  MATING: 'mating',
} as const;

export type ListingTransactionType =
  (typeof ListingTransactionType)[keyof typeof ListingTransactionType];

export const LISTING_TRANSACTION_TYPES = Object.values(
  ListingTransactionType,
) as ListingTransactionType[];

/** Срок аренды. Только для `rent`; у продажи периода нет. */
export const ListingRentPeriod = {
  DAILY: 'daily',
  MONTHLY: 'monthly',
} as const;

export type ListingRentPeriod = (typeof ListingRentPeriod)[keyof typeof ListingRentPeriod];

export const LISTING_RENT_PERIODS = Object.values(ListingRentPeriod) as ListingRentPeriod[];

/** Что продавец выбирает при подаче. */
export const TRANSACTION_CREATE_LABELS: Record<ListingTransactionType, string> = {
  sale: 'Продам',
  rent: 'Сдам',
  free: 'Отдам бесплатно',
  mating: 'Вязка',
};

/** Что покупатель выбирает при поиске — та же сделка с другой стороны. */
export const TRANSACTION_SEARCH_LABELS: Record<ListingTransactionType, string> = {
  sale: 'Купить',
  rent: 'Снять',
  free: 'Бесплатно',
  mating: 'Вязка',
};

export const RENT_PERIOD_LABELS: Record<ListingRentPeriod, string> = {
  daily: 'Посуточно',
  monthly: 'На длительный срок',
};

/**
 * Синонимы в строке запроса: приложение может прислать «buy» — это то же
 * «sale» глазами покупателя. Ничего нового в базу такие синонимы не заводят.
 */
export const TRANSACTION_QUERY_ALIASES: Record<string, ListingTransactionType> = {
  buy: 'sale',
  sale: 'sale',
  rent: 'rent',
  free: 'free',
  mating: 'mating',
};

/** Подпись в карточке: «Продам», «Сдам посуточно», «Сдам надолго». */
export function transactionCardLabel(
  type: ListingTransactionType | null | undefined,
  period: ListingRentPeriod | null | undefined,
): string | null {
  if (!type) return null;
  if (type === 'rent' && period === 'daily') return 'Сдам посуточно';
  if (type === 'rent' && period === 'monthly') return 'Сдам надолго';
  return TRANSACTION_CREATE_LABELS[type];
}
