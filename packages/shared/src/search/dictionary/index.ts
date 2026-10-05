import type { SearchDictionaryEntry } from '../types.js';
import {
  ATTRIBUTE_SYNONYMS,
  DEAL_WORDS,
  GENRE_WORDS,
  NEAR_WORDS,
  PERIOD_WORDS,
  SCOPE_WORDS,
  SORT_WORDS,
} from './abbreviations.js';
import { ACTION_WORDS } from './phrases.js';
import { CATEGORY_SLANG, DISH_WORDS } from './slang.js';
import { CATEGORY_SYNONYMS, DOMAIN_SYNONYMS } from './synonyms.js';

export * from './abbreviations.js';
export * from './numbers.js';
export * from './phrases.js';
export * from './slang.js';
export * from './synonyms.js';
export * from './typo-map.js';
export * from './units.js';

/**
 * Единый словарь умного поиска. Порядок — порядок предпочтения при равной
 * длине совпадения: литературные синонимы, сленг, значения характеристик,
 * сделка и срок, блюда, лента новостей, порядок, «рядом», действия.
 */
export const SEARCH_DICTIONARY: readonly SearchDictionaryEntry[] = [
  ...CATEGORY_SYNONYMS,
  ...CATEGORY_SLANG,
  ...DOMAIN_SYNONYMS,
  ...ATTRIBUTE_SYNONYMS,
  ...GENRE_WORDS,
  ...DEAL_WORDS,
  ...PERIOD_WORDS,
  ...DISH_WORDS,
  ...SCOPE_WORDS,
  ...SORT_WORDS,
  ...NEAR_WORDS,
  ...ACTION_WORDS,
];

/** Сколько записей и слов в словаре — для отчёта и проверки роста. */
export function searchDictionaryStats(): {
  entries: number;
  aliases: number;
  byType: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  let aliases = 0;
  for (const entry of SEARCH_DICTIONARY) {
    byType[entry.type] = (byType[entry.type] ?? 0) + 1;
    aliases += entry.aliases.length;
  }
  return { entries: SEARCH_DICTIONARY.length, aliases, byType };
}
