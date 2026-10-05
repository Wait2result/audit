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

/**
 * Подписи операции: что продавец выбирает при подаче и что покупатель — при
 * поиске. Значение под ними одно, а слова зависят от категории: квартиру
 * «сдают» и «снимают», а автомобиль, инструмент или экскаватор — «сдают в
 * аренду» и «арендуют». Куплю и сниму — не операции объявления вовсе.
 */
export interface OperationLabels {
  /** Форма подачи: «Продам», «Сдам», «Сдам в аренду» */
  create: string;
  /**
   * Тип объявления в поиске: «Продажа», «Аренда». Существительное, а не
   * действие: «Купить» и «Снять» — не фильтры, это объявления о продаже и аренде
   */
  search: string;
  /** К подписи в карточке добавляется срок: «Сдам посуточно», «Сдам надолго» */
  withPeriod?: boolean;
}

/** Подписи по умолчанию — для категории, у которой своих нет. */
const DEFAULT_OPERATION_LABELS: Record<ListingTransactionType, OperationLabels> = {
  sale: { create: 'Продам', search: 'Продажа' },
  rent: { create: 'Сдам в аренду', search: 'Аренда' },
  free: { create: 'Отдам бесплатно', search: 'Бесплатно' },
  mating: { create: 'Вязка', search: 'Вязка' },
};

/**
 * Подписи, отличающиеся от умолчания. Ключ — код раздела («realty») или
 * конкретной категории («realty-flats»); конкретная перекрывает раздел. Новая
 * операция или своя формулировка категории — одна строка здесь, без правки экранов.
 */
export const CATEGORY_OPERATION_LABELS: Readonly<
  Record<string, Partial<Record<ListingTransactionType, OperationLabels>>>
> = {
  realty: { rent: { create: 'Сдам', search: 'Аренда', withPeriod: true } },
};

/** Подписи операции в категории; без категории — умолчание. */
export function operationLabels(
  categorySlug: string | null | undefined,
  type: ListingTransactionType,
): OperationLabels {
  if (categorySlug) {
    const section = categorySlug.split('-')[0] ?? '';
    const own = CATEGORY_OPERATION_LABELS[categorySlug]?.[type];
    const shared = CATEGORY_OPERATION_LABELS[section]?.[type];
    if (own ?? shared) return (own ?? shared) as OperationLabels;
  }
  return DEFAULT_OPERATION_LABELS[type];
}

/** Умолчания подписей — там, где категория неизвестна. */
export const TRANSACTION_CREATE_LABELS: Record<ListingTransactionType, string> = {
  sale: DEFAULT_OPERATION_LABELS.sale.create,
  rent: DEFAULT_OPERATION_LABELS.rent.create,
  free: DEFAULT_OPERATION_LABELS.free.create,
  mating: DEFAULT_OPERATION_LABELS.mating.create,
};

export const TRANSACTION_SEARCH_LABELS: Record<ListingTransactionType, string> = {
  sale: DEFAULT_OPERATION_LABELS.sale.search,
  rent: DEFAULT_OPERATION_LABELS.rent.search,
  free: DEFAULT_OPERATION_LABELS.free.search,
  mating: DEFAULT_OPERATION_LABELS.mating.search,
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

/**
 * Подпись в карточке: «Продам», «Сдам посуточно», «Сдам надолго», «Сдам в
 * аренду». Срок добавляется там, где он — выбор человека (жильё), а не часть
 * единицы цены.
 */
export function transactionCardLabel(
  type: ListingTransactionType | null | undefined,
  period: ListingRentPeriod | null | undefined,
  categorySlug?: string | null,
): string | null {
  if (!type) return null;
  const labels = operationLabels(categorySlug, type);
  if (type === 'rent' && labels.withPeriod) {
    if (period === 'daily') return `${labels.create} посуточно`;
    if (period === 'monthly') return `${labels.create} надолго`;
  }
  return labels.create;
}
