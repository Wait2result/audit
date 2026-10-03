import { OTHER_BRAND } from './car-brands.js';
import type { DictionaryBrand } from './electronics-brands.js';

/**
 * Список названий из строки через «|»: справочники моделей занимают сотни
 * позиций, и в одну строку на марку они читаются и правятся легче, чем в
 * столбик. Пустые части и пробелы по краям отбрасываются.
 */
export function names(text: string): string[] {
  return text
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Значение из подписи латиницей: «Black+Decker» → `black_decker`. */
function slug(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Список брендов из строки: «Apple | lg:LG | atlant:Атлант». Без двоеточия
 * значение берётся из латинской подписи; для кириллицы и особых случаев
 * значение задаётся явно (оно хранится в объявлениях и не должно меняться).
 * В конец добавляется пункт «Другой бренд» — нужного может не оказаться.
 */
export function brandsOf(text: string, otherLabel = 'Другой бренд'): DictionaryBrand[] {
  const seen = new Set<string>();
  const brands = names(text)
    .map((entry) => {
      const colon = entry.indexOf(':');
      return colon > 0
        ? { value: entry.slice(0, colon).trim(), label: entry.slice(colon + 1).trim() }
        : { value: slug(entry), label: entry };
    })
    // Повтор в списке — опечатка составителя, а не второй бренд: остаётся первый
    .filter((brand) => (seen.has(brand.value) ? false : (seen.add(brand.value), true)));
  return [...brands, { value: OTHER_BRAND, label: otherLabel }];
}
