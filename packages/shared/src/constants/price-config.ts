import { ListingPriceUnit } from './listings.js';
import type { ListingRentPeriod, ListingTransactionType } from './transactions.js';

/**
 * Правила цены (Этап 7, версия 2).
 *
 * «2 500 000 ₽» и «2 500 ₽/сут» — разные величины, и сравнивать их одним
 * фильтром нельзя. Единица цены не угадывается по категории и не выбирается
 * вольно: её определяет сделка. Сдал посуточно — только «в сутки», сдал
 * надолго — только «в месяц», продал — целиком. Сервер отклоняет остальное,
 * а фильтр и сортировка по цене всегда работают внутри одной единицы.
 */

/** Что категория разрешает: единицы и умолчание. */
export interface PriceRules {
  allowedPriceUnits: readonly ListingPriceUnit[];
  defaultPriceUnit: ListingPriceUnit;
}

/**
 * Единицы, которые имеют смысл только у аренды: «за время». У продажи цена
 * либо целиком, либо за штуку.
 */
export const RENT_PRICE_UNITS: readonly ListingPriceUnit[] = [
  ListingPriceUnit.PER_HOUR,
  ListingPriceUnit.PER_DAY,
  ListingPriceUnit.PER_WEEK,
  ListingPriceUnit.PER_MONTH,
];
const RENT_UNITS = RENT_PRICE_UNITS;

/**
 * Единицы, допустимые для конкретной сделки в категории.
 *
 * Пустой список означает «цены быть не должно»: бесплатная отдача и вязка.
 */
export function allowedPriceUnits(
  rules: PriceRules,
  transactionType: ListingTransactionType | null | undefined,
  rentPeriod: ListingRentPeriod | null | undefined,
): ListingPriceUnit[] {
  const allowed = [...rules.allowedPriceUnits];

  if (transactionType === 'free' || transactionType === 'mating') return [];

  if (transactionType === 'rent') {
    if (rentPeriod === 'daily') return allowed.includes('per_day') ? ['per_day'] : [];
    if (rentPeriod === 'monthly') return allowed.includes('per_month') ? ['per_month'] : [];
    // Аренда без срока (автомобиль, оборудование): любая единица «за время»
    const timeUnits = allowed.filter((unit) => unit !== 'total' && unit !== 'per_unit');
    return timeUnits.length > 0 ? timeUnits : allowed;
  }

  if (transactionType === 'sale') {
    const saleUnits = allowed.filter((unit) => !RENT_UNITS.includes(unit));
    return saleUnits.length > 0 ? saleUnits : allowed;
  }

  // Категории без сделки: работа, услуги, вещи — как разрешено категорией
  return allowed;
}

/**
 * Срок аренды, который надо выбрать отдельно: «посуточно» или «надолго».
 *
 * Выбор срока есть только там, где аренда бывает ровно в этих двух единицах
 * (жильё, гаражи, помещения). Там, где аренда ещё и почасовая или недельная
 * (техника, инструмент, автомобиль), срок — это сама единица цены, и второй
 * выбор рядом только путал бы: «посуточно» и «₽/сут» — одно и то же.
 */
export function rentPeriodChoices(rules: PriceRules): ListingRentPeriod[] {
  const units = rules.allowedPriceUnits;
  if (units.includes(ListingPriceUnit.PER_HOUR) || units.includes(ListingPriceUnit.PER_WEEK)) {
    return [];
  }
  const periods: ListingRentPeriod[] = [];
  if (units.includes(ListingPriceUnit.PER_DAY)) periods.push('daily');
  if (units.includes(ListingPriceUnit.PER_MONTH)) periods.push('monthly');
  return periods.length > 1 ? periods : [];
}

/**
 * Срок по единице цены: «₽/сут» — посуточно, «₽/мес» — надолго. У почасовой и
 * недельной аренды срока в этом смысле нет. Нужен, чтобы «Снять посуточно» в
 * поиске находило и квартиру, и автомобиль, сданный в сутки.
 */
export function rentPeriodOfUnit(unit: ListingPriceUnit): ListingRentPeriod | null {
  if (unit === ListingPriceUnit.PER_DAY) return 'daily';
  if (unit === ListingPriceUnit.PER_MONTH) return 'monthly';
  return null;
}

/** Единица цены по сроку аренды: «посуточно» — «в сутки», «надолго» — «в месяц». */
export function rentPeriodUnit(period: ListingRentPeriod): ListingPriceUnit {
  return period === 'daily' ? ListingPriceUnit.PER_DAY : ListingPriceUnit.PER_MONTH;
}

/** Единица по умолчанию для сделки. */
export function defaultPriceUnit(
  rules: PriceRules,
  transactionType: ListingTransactionType | null | undefined,
  rentPeriod: ListingRentPeriod | null | undefined,
): ListingPriceUnit {
  const allowed = allowedPriceUnits(rules, transactionType, rentPeriod);
  if (allowed.length === 0) return ListingPriceUnit.TOTAL;
  if (allowed.includes(rules.defaultPriceUnit)) return rules.defaultPriceUnit;
  // Аренда без выбранной единицы: сутки — самая обычная, а не первая в списке
  if (transactionType === 'rent' && allowed.includes(ListingPriceUnit.PER_DAY)) {
    return ListingPriceUnit.PER_DAY;
  }
  return allowed[0] ?? ListingPriceUnit.TOTAL;
}

/**
 * Проверка цены объявления. Возвращает текст ошибки или null.
 *
 * Здесь же единственное место, где решается, что «Сдам надолго» с ценой
 * «целиком» — ошибка, а не «как получилось».
 */
export function validatePrice(
  rules: PriceRules,
  input: {
    transactionType: ListingTransactionType | null | undefined;
    rentPeriod: ListingRentPeriod | null | undefined;
    price: number | null | undefined;
    priceUnit: ListingPriceUnit;
  },
): string | null {
  const allowed = allowedPriceUnits(rules, input.transactionType, input.rentPeriod);

  if (allowed.length === 0) {
    if (input.price != null && input.price > 0) {
      return 'У этого типа объявления цены не бывает';
    }
    return null;
  }

  if (!allowed.includes(input.priceUnit)) {
    return `Единица цены «${PRICE_UNIT_LABELS[input.priceUnit]}» не подходит для этой сделки`;
  }

  return null;
}

/** Подпись единицы для выбора: «₽», «₽/мес», «₽/сут», «₽/час», «₽/шт». */
export const PRICE_UNIT_LABELS: Record<ListingPriceUnit, string> = {
  total: '₽',
  per_month: '₽/мес',
  per_day: '₽/сут',
  per_week: '₽/нед',
  per_hour: '₽/час',
  per_unit: '₽/шт',
};
