/**
 * Номера деталей: OEM, каталожный, производителя, артикул. Номер ищут по
 * ключу — то, что остаётся после «90915-YZZD1» → «90915YZZD1»: без
 * регистра, дефисов, точек и пробелов, с латинскими буквами вместо
 * кириллических двойников (русская «С» в «ТОYOTA» — частая опечатка).
 */

/** Виды номера: оригинальный, каталожный, производителя детали, артикул продавца. */
export const PART_NUMBER_KINDS = ['oem', 'catalog', 'manufacturer', 'article'] as const;
export type PartNumberKind = (typeof PART_NUMBER_KINDS)[number];

export const PART_NUMBER_KIND_LABELS: Readonly<Record<PartNumberKind, string>> = {
  oem: 'OEM',
  catalog: 'Каталожный номер',
  manufacturer: 'Номер производителя',
  article: 'Артикул',
};

/** Кириллические буквы, неотличимые на глаз от латинских. */
const LOOKALIKES: Readonly<Record<string, string>> = {
  А: 'A',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  У: 'Y',
  Х: 'X',
};

/** Ключ номера для поиска и хранения; пусто, если после очистки ничего не осталось. */
export function partNumberKey(value: string): string {
  return value
    .toUpperCase()
    .replace(/[АВЕКМНОРСТУХ]/g, (char) => LOOKALIKES[char] ?? char)
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Похожа ли строка на номер детали. «90915-YZZD1», «04465-33450», «MR-123456»
 * — да (буквы и цифры, соединённые знаком); «iphone13», «ncp165» — нет (это
 * модель и номер кузова); «12345» без слова «OEM» — нет (это цена или год).
 */
export function looksLikePartNumber(value: string): boolean {
  const token = value.trim();
  if (token.length < 5 || token.length > 40) return false;
  if (!/^[A-Za-z0-9]+(?:[-–./][A-Za-z0-9]+)+$/.test(token)) return false;
  if (!/\d/.test(token)) return false;
  // «2015-2018», «10-20-30»: одни цифры с тире — диапазон, а не номер
  if (/^[\d\-–./]+$/.test(token))
    return /^\d{4,6}-\d{4,6}$/.test(token) && !/^(19|20)\d\d-(19|20)\d\d$/.test(token);
  return partNumberKey(token).length >= 5;
}
