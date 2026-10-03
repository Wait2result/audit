import type { AttributeDefinition } from './listing-attributes.js';

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
