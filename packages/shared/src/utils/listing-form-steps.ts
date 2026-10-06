import type { ListingAttribute } from '../constants/listing-attributes.js';

/**
 * Шаги пошаговой подачи объявления: какие будут и в каком порядке.
 *
 * Решает категория — тем же описанием полей, по которому строятся фильтры и
 * проверка на сервере, — и выбранная сделка (условия аренды есть только у
 * «Сдам»): заголовок → категория → сделка и срок аренды → обязательные
 * характеристики и «что именно» (деталь, тип товара) по одной →
 * необязательные одним шагом → номера и совместимость запчасти → фото →
 * цена → место и телефон → описание.
 *
 * Чистая функция: форма рисует шаги по этому плану, тесты проверяют план.
 */

/**
 * Поля «что именно это»: деталь запчасти, тип товара направления. Даже
 * необязательные — отдельным шагом: от них зависят остальные характеристики.
 */
export const LISTING_TYPE_KEYS: ReadonlySet<string> = new Set([
  'partGroup',
  'partItem',
  'goodsType',
  'tireType',
  'accessoryType',
]);

export type ListingFormStepId =
  | 'title'
  | 'category'
  | 'deal'
  | `field:${string}`
  | 'details'
  | 'part'
  | 'photos'
  | 'price'
  | 'location'
  | 'description';

export interface ListingFormPlan {
  steps: ListingFormStepId[];
  /** Характеристики-шаги по одной, по порядку */
  stepFields: ListingAttribute[];
  /** Необязательные — одним шагом «Дополнительно» */
  detailFields: ListingAttribute[];
}

export function planListingSteps(input: {
  /** Категория выбрана */
  hasCategory: boolean;
  /** У категории есть выбор сделки или срока аренды */
  dealStep: boolean;
  /** Поля категории, видимые при нынешних значениях и сделке */
  visibleFields: readonly ListingAttribute[];
  /** Подкатегория со слоем номеров и «Подходит к» */
  partLayer: boolean;
  /** Сделка без цены: «Отдам бесплатно», «Вязка» */
  priceless: boolean;
}): ListingFormPlan {
  const steps: ListingFormStepId[] = ['title', 'category'];
  if (!input.hasCategory) return { steps, stepFields: [], detailFields: [] };

  const stepFields = input.visibleFields.filter(
    (field) => field.required || LISTING_TYPE_KEYS.has(field.key),
  );
  const detailFields = input.visibleFields.filter((field) => !stepFields.includes(field));

  if (input.dealStep) steps.push('deal');
  for (const field of stepFields) steps.push(`field:${field.key}`);
  if (detailFields.length > 0) steps.push('details');
  if (input.partLayer) steps.push('part');
  steps.push('photos');
  if (!input.priceless) steps.push('price');
  steps.push('location', 'description');
  return { steps, stepFields, detailFields };
}

/** Состояние шага для выбора следующего. */
export interface StepState {
  id: string;
  /** Заполнен по правилам поля */
  valid: boolean;
  /** Выбор из вариантов закрывает шаг сам; иначе — «Далее» */
  auto?: boolean;
  /** Можно пропустить */
  optional?: boolean;
}

/** Шаг пройден: выбран вариант или нажато «Далее» (пропустить можно необязательный). */
export function stepComplete(step: StepState, confirmed: ReadonlySet<string>): boolean {
  return (
    (step.auto === true && step.valid) ||
    (confirmed.has(step.id) && (step.valid || step.optional === true))
  );
}

/**
 * Номер открытого шага: первый непройденный. Все пройдены — длина списка.
 * Следующие за ним шаги форма не показывает.
 */
export function openStepIndex(steps: readonly StepState[], confirmed: ReadonlySet<string>): number {
  const index = steps.findIndex((step) => !stepComplete(step, confirmed));
  return index === -1 ? steps.length : index;
}

/** Шаги, которые принадлежат категории: при её смене проходятся заново. */
export function isCategoryStep(id: string): boolean {
  return id === 'deal' || id === 'details' || id === 'part' || id.startsWith('field:');
}
