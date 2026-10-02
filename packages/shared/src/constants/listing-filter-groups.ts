import type { AttributeDefinition } from './listing-attributes.js';

/**
 * Как поля категории раскладываются по блокам экрана фильтров.
 *
 * Экран не должен быть длинной простынёй технических параметров: человек
 * ищет «Camry до 2 млн», а не заполняет анкету. Поэтому поля делятся на
 * главные (их видно сразу), состояние, продавца и «дополнительные» — те
 * сворачиваются и открываются по желанию. Деление выводится из самих
 * определений, а не из списков по категориям: новая категория получит
 * разумный экран без правки кода.
 */
export interface FilterFieldGroups<T extends Pick<AttributeDefinition, 'key' | 'showInCard'>> {
  /** Основные параметры: то, что видно в карточке (марка, год, комнаты, площадь) */
  main: T[];
  condition: T[];
  seller: T[];
  /** Остальное: открывается по кнопке «Ещё параметры» */
  extra: T[];
}

const CONDITION_KEYS = new Set(['condition']);
const SELLER_KEYS = new Set(['sellerType']);

/** Сколько основных полей показывать открытыми, даже если все они «из карточки» */
const MAIN_LIMIT = 8;

export function groupFilterFields<T extends Pick<AttributeDefinition, 'key' | 'showInCard'>>(
  fields: readonly T[],
  /**
   * Ключи, которые категория считает главными для сравнения (CARD_FACTS): у
   * автомобиля это ещё и топливо с приводом, хотя в строку карточки они
   * попадают не всегда
   */
  priorityKeys: ReadonlySet<string> = new Set(),
): FilterFieldGroups<T> {
  const groups: FilterFieldGroups<T> = { main: [], condition: [], seller: [], extra: [] };

  for (const field of fields) {
    if (CONDITION_KEYS.has(field.key)) groups.condition.push(field);
    else if (SELLER_KEYS.has(field.key)) groups.seller.push(field);
    else if ((field.showInCard || priorityKeys.has(field.key)) && groups.main.length < MAIN_LIMIT) {
      groups.main.push(field);
    } else groups.extra.push(field);
  }

  // Совсем без отмеченных полей экран остался бы пустым до «Ещё параметры»:
  // тогда первые несколько полей становятся основными
  if (groups.main.length === 0 && groups.extra.length > 0) {
    groups.main = groups.extra.splice(0, Math.min(3, groups.extra.length));
  }

  return groups;
}
