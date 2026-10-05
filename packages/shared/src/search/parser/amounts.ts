import {
  AMOUNT_MULTIPLIERS,
  AMOUNT_MULTIPLIER_PATTERN,
  HALF_WORDS,
  NUMBER_WORDS,
} from '../dictionary/numbers.js';

/**
 * Числа во фразе человека: «до 1.2 млн», «40 тысяч», «70к», «до миллиона»,
 * «полтора миллиона», «1 200 000», «256 гигов», «1 ТБ», «два ляма».
 *
 * Зачем свой разбор, если число уже вернула модель: модель может «досочинить»
 * цену («айфон недорого» → 30 000). Поэтому каждое крупное число из её ответа
 * сверяется с числами, которые человек действительно написал
 * (`isGroundedNumber`). Локальный разбор фраз берёт суммы отсюда же.
 */

const NUMBER_WORDS_PATTERN = Object.keys(NUMBER_WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|');
const HALF_PATTERN = HALF_WORDS.join('|');
const WORD_MULTIPLIER =
  'миллион\\p{L}*|млн|лям(?:а|ов|ы|у|ом|ами)?|лимон(?:а|ов|ы|у|ом)?|тысяч\\p{L}*|тыщ\\p{L}*|тыс';
const NUMBER_WORD_AMOUNT = new RegExp(
  `(?:^|[^\\p{L}])(${NUMBER_WORDS_PATTERN})\\s+(${WORD_MULTIPLIER})`,
  'gu',
);
const HALF_AMOUNT = new RegExp(
  `(?:^|[^\\p{L}\\d.,])(${HALF_PATTERN})\\s+(${WORD_MULTIPLIER})`,
  'gu',
);
const ENDS_WITH_NUMBER_WORD = new RegExp(`(?:^|[^\\p{L}])(${NUMBER_WORDS_PATTERN})$`, 'u');
const ENDS_WITH_HALF = new RegExp(`(${HALF_PATTERN})$`, 'u');
const DIGIT_AMOUNT = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(${AMOUNT_MULTIPLIER_PATTERN}|тб|tb)?(?![\\p{L}\\d])`,
  'gu',
);
const BARE_MULTIPLIER =
  /(?:^|[^\p{L}\d.,]\s*)(миллион\p{L}*|лям(?:а|ов|ы|у|ом|ами)?|лимон(?:а|ов|ы|у|ом)?|тысяч[ауи]?)(?!\p{L})/gu;

/** Множитель по слову: «млн» → 1 000 000, «к» → 1 000; нет — null. */
export function multiplierOf(word: string | undefined): number | null {
  if (!word) return null;
  for (const { pattern, value } of AMOUNT_MULTIPLIERS) if (pattern.test(word)) return value;
  return null;
}

/** Числа из текста в рублях (или в штуках — для памяти, лет, минут). */
export function extractAmounts(text: string): number[] {
  const value = text
    .toLowerCase()
    .replace(/ё/g, 'е')
    // «1 200 000» → «1200000»: пробел внутри числа разделяет тысячи
    .replace(/(\d)[\s\u00a0](?=\d{3}(?!\d))/g, '$1');

  const result: number[] = [];

  for (const match of value.matchAll(DIGIT_AMOUNT)) {
    const number = Number((match[1] ?? '').replace(',', '.'));
    if (!Number.isFinite(number)) continue;
    const unit = match[2];
    if (unit === 'тб' || unit === 'tb') {
      result.push(number * 1024, number);
      continue;
    }
    const multiplier = multiplierOf(unit);
    result.push(multiplier ? Math.round(number * multiplier) : number);
  }

  // Слова без цифр: «полтора миллиона», «полмиллиона», «два ляма», «до миллиона»
  for (const match of value.matchAll(HALF_AMOUNT)) {
    const multiplier = multiplierOf(match[2]);
    if (multiplier) result.push(1.5 * multiplier);
  }
  if (/(?:^|[^\p{L}])пол\s?(миллиона|ляма|лимона)/u.test(value)) result.push(500_000);
  for (const match of value.matchAll(NUMBER_WORD_AMOUNT)) {
    const count = NUMBER_WORDS[match[1] ?? ''];
    const multiplier = multiplierOf(match[2]);
    if (count && multiplier) result.push(count * multiplier);
  }
  for (const match of value.matchAll(BARE_MULTIPLIER)) {
    const before = value.slice(0, match.index ?? 0).trimEnd();
    if (/[\d.,]$/.test(before) || ENDS_WITH_HALF.test(before)) continue;
    if (ENDS_WITH_NUMBER_WORD.test(before)) continue;
    if (/пол$/.test(before)) continue;
    const multiplier = multiplierOf(match[1]);
    if (multiplier) result.push(multiplier);
  }

  return result;
}

/**
 * Сумма из значения модели: число как есть, строка — разбором («1.2 млн»).
 * Отрицательное, бесконечное и нечисловое — null.
 */
export function parseAmount(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : null;
  if (typeof input !== 'string') return null;
  const [first] = extractAmounts(input);
  return first !== undefined && first >= 0 ? first : null;
}

/** Есть ли такое число во фразе человека (с точностью до полупроцента). */
export function isGroundedNumber(value: number, text: string): boolean {
  return extractAmounts(text).some(
    (amount) => Math.abs(amount - value) <= Math.max(0.5, amount * 0.005),
  );
}

/** «1 200 000 ₽» */
export function formatRubles(value: number): string {
  return `${Math.round(value)
    .toLocaleString('ru-RU')
    .replace(/\u00a0/g, ' ')} ₽`;
}
