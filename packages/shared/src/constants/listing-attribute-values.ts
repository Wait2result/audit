import {
  isAttributeVisible,
  type AttributeDefinition,
  type ListingAttribute,
} from './listing-attributes.js';
import { manufacturerFitsOriginality } from './parts/manufacturers.js';

/**
 * Записать значение характеристики вместе с зависимыми от неё полями.
 *
 * Модель принадлежит марке: сменилась марка — модель прежней марки больше не
 * подходит, и если её оставить, сервер ответит «модель принадлежит другой
 * марке». Поэтому при смене значения зависимые поля (`parentKey`) очищаются.
 * Повторный выбор той же марки ничего не сбрасывает. Пустое значение
 * («Любая марка», очистка поля) убирает ключ из набора.
 *
 * Одно место правки для форм подачи, редактирования и экрана фильтров.
 */
export function withAttributeValue(
  fields: readonly Pick<AttributeDefinition, 'key' | 'parentKey'>[],
  values: Readonly<Record<string, unknown>>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...values };
  if (value === undefined || value === null || value === '') delete next[key];
  else next[key] = value;

  // Сменилась оригинальность — производитель другого списка больше не подходит
  // («Оригинал» — производители техники, «Аналог» — производители запчастей)
  if (
    key === 'partOriginality' &&
    typeof next.partManufacturer === 'string' &&
    !manufacturerFitsOriginality(next.partManufacturer, value)
  ) {
    delete next.partManufacturer;
  }

  if (values[key] !== value) {
    // Зависимые поля, включая цепочки длиннее двух звеньев
    const queue = [key];
    for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
      for (const child of fields.filter((field) => field.parentKey === current)) {
        delete next[child.key];
        queue.push(child.key);
      }
    }
  }
  return next;
}

/**
 * Поля формы с вариантами под уже выбранное: у «Производителя детали» — только
 * производители, подходящие к оригинальности («Оригинал» — Toyota, «Аналог» —
 * KYB). Остальные поля — как есть.
 */
export function fieldsForValues<T extends ListingAttribute>(
  fields: readonly T[],
  values: Readonly<Record<string, unknown>>,
): T[] {
  const originality = values.partOriginality;
  if (originality !== 'original' && originality !== 'analog') return [...fields];
  return fields.map((field) =>
    field.key === 'partManufacturer' && field.options
      ? {
          ...field,
          options: field.options.filter((option) =>
            manufacturerFitsOriginality(option.value, originality),
          ),
        }
      : field,
  );
}

/** Почему сбросился производитель — подпись для формы; null — не сбрасывался. */
export function partMakerReset(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): string | null {
  if (typeof before.partManufacturer !== 'string' || after.partManufacturer !== undefined)
    return null;
  if (before.partOriginality === after.partOriginality) return null;
  return after.partOriginality === 'original'
    ? 'Производитель сброшен: у оригинальной детали это производитель техники (Toyota, Samsung…)'
    : 'Производитель сброшен: у аналога это производитель запчастей (KYB, Denso, Bosch…)';
}

/**
 * Что из введённого переносится в другую категорию (аудит, п. 39). Поле
 * остаётся, если оно есть и в новой категории и значение ему подходит:
 * вариант есть среди вариантов, справочник тот же («Марка» машины и «Бренд»
 * телефона — разные справочники, Toyota телефону не подходит). Остальное
 * сбрасывается, а его подписи возвращаются — форма говорит, что именно ушло.
 */
export function carryAttributes(
  previous: readonly ListingAttribute[],
  next: readonly ListingAttribute[],
  values: Readonly<Record<string, unknown>>,
): { kept: Record<string, unknown>; dropped: string[] } {
  const kept: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;
    const before = previous.find((field) => field.key === key);
    const after = next.find((field) => field.key === key);
    const fits =
      after !== undefined &&
      (before?.dictionary ?? null) === (after.dictionary ?? null) &&
      fitsOptions(after, value);
    if (fits) kept[key] = value;
    else dropped.push(before?.label ?? after?.label ?? key);
  }
  return { kept, dropped };
}

function fitsOptions(field: ListingAttribute, value: unknown): boolean {
  if (!field.options || field.options.length === 0 || field.dictionary) return true;
  const allowed = new Set(field.options.map((option) => option.value));
  const items = Array.isArray(value) ? value : [value];
  return items.every((item) => allowed.has(String(item)));
}

/**
 * Только условия по видимым полям: скрытое при текущих значениях (условия
 * аренды у «Купить», ширина диска у шин) не уходит в запрос и не остаётся в
 * фильтре — иначе невидимое условие сузило бы выдачу, а человек не понял бы
 * почему. Ключи, которых нет среди полей, не трогаются.
 */
export function visibleValues(
  fields: readonly AttributeDefinition[],
  values: Readonly<Record<string, unknown>>,
  deal?: { transactionType?: string | null },
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => {
      const field = fields.find((item) => item.key === key);
      return !field || isAttributeVisible(field, values, deal);
    }),
  );
}
