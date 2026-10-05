import { CURRENCY_WORDS, HALF_WORDS, NUMBER_WORDS } from '../dictionary/numbers.js';
import { RAM_CONTEXT, SEARCH_UNITS } from '../dictionary/units.js';
import { multiplierOf } from './amounts.js';
import { betweenBefore, comparisonBefore, type ComparisonOp } from './comparisons.js';
import { norm } from './normalize.js';
import { consume, free, type SearchToken } from './tokenize.js';

/** Числовое условие: ровно, не больше, не меньше или между. */
export type NumericValue = number | { min?: number; max?: number };

/** Деньги узнаются по множителю, валюте или величине: «500к», «800 р», «1200000». */
const MONEY_MIN = 10_000;
/** Что похоже на год выпуска или постройки. */
const YEAR_MIN = 1950;
const YEAR_MAX = 2035;
/** Самое длинное название единицы в словах. */
const UNIT_SPAN = 3;

interface Amount {
  value: number;
  /** Деньги: был множитель, слово «рублей» или сумма от 10 000 */
  money: boolean;
  /** Число записано словом или с множителем — точно не год и не номер модели */
  spelled: boolean;
  /** Сколько слов занято, начиная с index */
  length: number;
  /** Единица, приклеенная к числу: «500к», «2.0л», «256гб» */
  glued?: string;
}

const GLUED = /^(\d+(?:\.\d+)?)(к|k|млн|тыс|тыщ|м2|м²|кв|л|гб|gb|тб|tb|км|лс|г|гв|х|мин|сот)$/u;

/** Сумма или число, начинающееся со слова `index`; null — слово не число. */
function amountAt(tokens: readonly SearchToken[], index: number): Amount | null {
  const first = tokens[index]!.text;
  // Цифры: «1200000», «1.5», «500к»
  const glued = GLUED.exec(first);
  const digits = glued ? glued[1]! : /^\d+(?:\.\d+)?$/.test(first) ? first : null;
  if (digits !== null) {
    const base = Number(digits);
    if (!Number.isFinite(base)) return null;
    const suffix = glued?.[2];
    const suffixMultiplier = multiplierOf(suffix);
    if (suffixMultiplier) {
      return { value: Math.round(base * suffixMultiplier), money: true, spelled: true, length: 1 };
    }
    if (suffix) return { value: base, money: false, spelled: false, length: 1, glued: suffix };
    const next = tokens[index + 1];
    const multiplier = next && !next.consumed ? multiplierOf(next.text) : null;
    if (multiplier) {
      return { value: Math.round(base * multiplier), money: true, spelled: true, length: 2 };
    }
    return { value: base, money: base >= MONEY_MIN, spelled: false, length: 1 };
  }
  // Словами: «два миллиона», «полтора ляма», «пол миллиона», «лям»
  const next = tokens[index + 1];
  const nextMultiplier = next && !next.consumed ? multiplierOf(next.text) : null;
  const count = NUMBER_WORDS[first];
  if (count !== undefined && nextMultiplier) {
    return { value: count * nextMultiplier, money: true, spelled: true, length: 2 };
  }
  if (HALF_WORDS.includes(first) && nextMultiplier) {
    return { value: 1.5 * nextMultiplier, money: true, spelled: true, length: 2 };
  }
  if (first === 'пол' && nextMultiplier) {
    return { value: 0.5 * nextMultiplier, money: true, spelled: true, length: 2 };
  }
  if (/^пол(миллиона|ляма|лимона)$/.test(first)) {
    return { value: 500_000, money: true, spelled: true, length: 1 };
  }
  const bare = multiplierOf(first);
  if (bare && bare >= 1_000_000) {
    // «до миллиона», «за лям» — одна штука множителя
    return { value: bare, money: true, spelled: true, length: 1 };
  }
  return null;
}

/** Единица ровно из `length` слов, начиная с `index`. */
function unitAt(
  tokens: readonly SearchToken[],
  index: number,
  length: number,
): { field: string; multiplier: number } | null {
  if (!free(tokens, index, index + length)) return null;
  const phrase = tokens
    .slice(index, index + length)
    .map((token) => token.text)
    .join(' ');
  for (const unit of SEARCH_UNITS) {
    if (unit.aliases.some((alias) => norm(alias) === phrase))
      return { field: unit.field, multiplier: unit.multiplier ?? 1 };
  }
  return null;
}

/** Единица после суммы: поле и множитель; слова единицы съедаются. */
function unitAfter(
  tokens: SearchToken[],
  index: number,
): { field: string; multiplier: number; length: number } | null {
  for (let length = UNIT_SPAN; length >= 1; length -= 1) {
    if (!free(tokens, index, index + length)) continue;
    const phrase = tokens
      .slice(index, index + length)
      .map((token) => token.text)
      .join(' ');
    for (const unit of SEARCH_UNITS) {
      if (unit.aliases.some((alias) => norm(alias) === phrase)) {
        return { field: unit.field, multiplier: unit.multiplier ?? 1, length };
      }
    }
  }
  return null;
}

/** Поле по приклеенной единице («500км», «2.0л»). */
function fieldOfGlued(glued: string): { field: string; multiplier: number } | null {
  for (const unit of SEARCH_UNITS) {
    if (unit.aliases.some((alias) => norm(alias) === glued)) {
      return { field: unit.field, multiplier: unit.multiplier ?? 1 };
    }
  }
  return null;
}

/** Рядом с «гб» стоит «оперативки» — это ОЗУ, а не накопитель. */
function ramNearby(tokens: SearchToken[], from: number, to: number): boolean {
  for (let i = Math.max(0, from - 2); i < Math.min(tokens.length, to + 2); i += 1) {
    const token = tokens[i]!;
    if (!token.consumed && RAM_CONTEXT.test(token.text)) {
      consume(tokens, i, i + 1, 'number');
      return true;
    }
  }
  return false;
}

function merge(
  into: Record<string, NumericValue>,
  field: string,
  op: ComparisonOp,
  value: number,
): void {
  const current = into[field];
  if (op === 'eq') {
    if (current === undefined) into[field] = value;
    return;
  }
  const range = typeof current === 'object' ? { ...current } : {};
  if (typeof current === 'number') return;
  if (range[op] === undefined) range[op] = value;
  into[field] = range;
}

/**
 * Числовые условия фразы: «до ляма» → price.max, «от 2018» → year.min,
 * «100 тыс км» → mileage, «256 гигов» → memory, «за 30 минут» → maxMinutes.
 *
 * Число без единицы — год, если похоже на год, или цена, если это сумма.
 * Маленькое число без единицы («айфон 15», «форсаж 9») не трогается:
 * это часть названия, а не условие.
 */
export function extractNumericConditions(
  tokens: SearchToken[],
  options: { realty?: boolean } = {},
): Record<string, NumericValue> {
  const result: Record<string, NumericValue> = {};
  let pendingBetween: { field: string } | null = null;

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]!.consumed) continue;
    const amount = amountAt(tokens, index);
    if (!amount) continue;
    const afterAmount = index + amount.length;

    let value = amount.value;
    let field: string | null = null;
    let unitLength = 0;

    if (amount.glued) {
      const unit = fieldOfGlued(amount.glued);
      if (unit) {
        field = unit.field;
        value *= unit.multiplier;
      } else if ((amount.glued === 'х' || amount.glued === 'к') && options.realty && value <= 9) {
        field = 'rooms';
      } else {
        continue;
      }
    }

    // «Оперативы 16», «памяти 256» — единица перед числом
    if (!field && index > 0 && !tokens[index - 1]!.consumed) {
      const before = unitAt(tokens, index - 1, 1);
      if (before && (before.field === 'ram' || before.field === 'memory')) {
        field = before.field;
        consume(tokens, index - 1, index, 'number');
      }
    }

    // «800 рублей» — деньги
    let money = amount.money;
    const currency = tokens[afterAmount];
    if (!field && currency && !currency.consumed && CURRENCY_WORDS.test(currency.text)) {
      money = true;
      unitLength = 1;
    }
    if (!field) {
      const unit = unitAfter(tokens, afterAmount + unitLength);
      if (unit) {
        field = unit.field;
        value *= unit.multiplier;
        unitLength += unit.length;
      }
    }
    if (field === 'memory' && ramNearby(tokens, index, afterAmount + unitLength)) field = 'ram';

    let op: ComparisonOp;
    if (!field) {
      const isYear =
        !amount.spelled &&
        !money &&
        Number.isInteger(value) &&
        value >= YEAR_MIN &&
        value <= YEAR_MAX;
      if (isYear) field = 'year';
      else if (money) field = 'price';
      else continue;
    }

    const between = betweenBefore(tokens, index);
    const comparison = between ? null : comparisonBefore(tokens, index);
    if (between) {
      op = 'min';
      pendingBetween = { field };
    } else if (comparison) {
      op = field === 'year' && comparison.yearOp ? comparison.yearOp : comparison.op;
      // «с 2015» — год от; «с 500к» — цена от; но «за 800» — ровно/примерно
    } else if (pendingBetween?.field === field && tokens[index - 1]?.text === 'и') {
      op = 'max';
      consume(tokens, index - 1, index, 'comparison');
      pendingBetween = null;
    } else {
      // Без слова сравнения — ровно: число как есть (цену без границы лента считает бюджетом)
      op = 'eq';
    }

    if (field === 'year' && op === 'eq' && !Number.isInteger(value)) continue;
    merge(result, field, op, Math.round(value * 1000) / 1000);
    consume(tokens, index, afterAmount + unitLength, 'number');
  }

  return result;
}
