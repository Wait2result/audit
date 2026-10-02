import {
  attributeValueLabel,
  splitAttributes,
  type AttributeValue,
  type ListingAttribute,
  type ListingAttributeColumns,
} from '@dagestan/shared';

/**
 * Раскладка проверенных характеристик по местам хранения (Этап 7, версия 2).
 *
 * Одно значение живёт в трёх местах, и у каждого своя работа:
 *   • колонка таблицы — самые частые диапазоны (комнаты, площадь, год…);
 *   • `attributes` (JSON) — копия для показа карточки одним чтением;
 *   • `listing_attribute_values` — по строке на значение, с индексами по
 *     числу и по строке: так диапазон работает по любому числовому полю, а
 *     равенство по любому перечислению — без перебора JSON.
 * Плюс поисковый текст: подписи значений словами, чтобы «автомат» и
 * «Toyota» находились поиском, даже если их нет в заголовке.
 */

export interface AttributeValueRow {
  key: string;
  numValue: number | null;
  textValue: string | null;
}

export interface PreparedAttributes {
  columns: ListingAttributeColumns;
  json: Record<string, AttributeValue>;
  values: AttributeValueRow[];
  searchText: string;
}

export function prepareAttributes(
  attributes: readonly ListingAttribute[],
  parsed: Record<string, AttributeValue>,
  dictionaryLabels: Readonly<Record<string, string>>,
  extraWords: readonly (string | null | undefined)[],
): PreparedAttributes {
  const split = splitAttributes(attributes, parsed);
  const values: AttributeValueRow[] = [];
  const words: string[] = [];

  for (const attribute of attributes) {
    const value = parsed[attribute.key];
    if (value === undefined) continue;

    if (!attribute.column) {
      values.push(...valueRows(attribute, value));
    }

    if (!attribute.searchable) continue;

    const label = attributeValueLabel(attribute, value, dictionaryLabels);
    if (label) words.push(label);
    // Само значение тоже: «toyota» ищут латиницей так же часто, как «Toyota»
    if (typeof value === 'string' && value !== label) words.push(value);
  }

  for (const word of extraWords) {
    if (word) words.push(word);
  }

  return {
    columns: split.columns,
    json: split.attributes,
    values,
    searchText: [...new Set(words)].join(' '),
  };
}

/** Строки таблицы значений для одного поля: числа — числом, остальное — строкой. */
function valueRows(attribute: ListingAttribute, value: AttributeValue): AttributeValueRow[] {
  if (Array.isArray(value)) {
    return value.map((item) => ({ key: attribute.key, numValue: null, textValue: String(item) }));
  }

  if (attribute.type === 'number' || attribute.type === 'date') {
    return [{ key: attribute.key, numValue: Number(value), textValue: null }];
  }

  if (attribute.type === 'boolean') {
    return [{ key: attribute.key, numValue: value ? 1 : 0, textValue: null }];
  }

  return [{ key: attribute.key, numValue: null, textValue: String(value) }];
}
