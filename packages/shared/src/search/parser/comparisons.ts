import { consume, free, span, type SearchToken } from './tokenize.js';

/** Граница условия: не больше, не меньше, ровно. */
export type ComparisonOp = 'min' | 'max' | 'eq';

export interface ComparisonHit {
  op: ComparisonOp;
  /** Для года смысл другой: «не старше 2015» — это от 2015, «старше 2015» — до */
  yearOp?: ComparisonOp;
  start: number;
  end: number;
}

/**
 * Слова сравнения перед числом. Многословные проверяются раньше коротких:
 * «не дороже» — граница сверху, хотя «дороже» — снизу.
 */
const COMPARISONS: readonly { words: string; op: ComparisonOp; yearOp?: ComparisonOp }[] = [
  { words: 'не дороже', op: 'max' },
  { words: 'не больше', op: 'max' },
  { words: 'не более', op: 'max' },
  { words: 'не выше', op: 'max' },
  { words: 'в пределах', op: 'max' },
  { words: 'максимум до', op: 'max' },
  { words: 'не старше', op: 'max', yearOp: 'min' },
  { words: 'не новее', op: 'max', yearOp: 'max' },
  { words: 'не позже', op: 'max', yearOp: 'max' },
  { words: 'не раньше', op: 'min', yearOp: 'min' },
  { words: 'не дешевле', op: 'min' },
  { words: 'не меньше', op: 'min' },
  { words: 'не менее', op: 'min' },
  { words: 'не ниже', op: 'min' },
  { words: 'начиная от', op: 'min' },
  { words: 'начиная с', op: 'min' },
  { words: 'минимум от', op: 'min' },
  { words: 'до', op: 'max' },
  { words: 'максимум', op: 'max' },
  { words: 'максимально', op: 'max' },
  { words: 'дешевле', op: 'max' },
  { words: 'менее', op: 'max' },
  { words: 'меньше', op: 'max' },
  { words: 'ниже', op: 'max' },
  { words: 'старше', op: 'max', yearOp: 'max' },
  { words: 'раньше', op: 'max', yearOp: 'max' },
  { words: 'от', op: 'min' },
  { words: 'минимум', op: 'min' },
  { words: 'больше', op: 'min' },
  { words: 'свыше', op: 'min' },
  { words: 'более', op: 'min' },
  { words: 'дороже', op: 'min' },
  { words: 'выше', op: 'min' },
  { words: 'новее', op: 'min', yearOp: 'min' },
  { words: 'позже', op: 'min', yearOp: 'min' },
  { words: 'после', op: 'min', yearOp: 'min' },
  { words: 'за', op: 'eq' },
  { words: 'по', op: 'eq' },
  { words: 'около', op: 'eq' },
  { words: 'примерно', op: 'eq' },
  { words: 'в районе', op: 'eq' },
];

const PREPARED = COMPARISONS.map((item) => ({ ...item, parts: item.words.split(' ') })).sort(
  (a, b) => b.parts.length - a.parts.length,
);

/** Сравнение, стоящее прямо перед словом с номером `index`; слова сравнения съедаются. */
export function comparisonBefore(tokens: SearchToken[], index: number): ComparisonHit | null {
  for (const item of PREPARED) {
    const start = index - item.parts.length;
    if (start < 0 || !free(tokens, start, index)) continue;
    if (span(tokens, start, index) !== item.words) continue;
    consume(tokens, start, index, 'comparison');
    return {
      op: item.op,
      ...(item.yearOp ? { yearOp: item.yearOp } : {}),
      start,
      end: index,
    };
  }
  return null;
}

/** «Между X и Y»: слово «между» перед первым числом. */
export function betweenBefore(tokens: SearchToken[], index: number): boolean {
  if (index < 1 || !free(tokens, index - 1, index)) return false;
  if (tokens[index - 1]!.text !== 'между') return false;
  consume(tokens, index - 1, index, 'comparison');
  return true;
}
