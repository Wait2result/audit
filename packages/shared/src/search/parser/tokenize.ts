import { TYPO_MAP } from '../dictionary/typo-map.js';

/** Слово фразы после нормализации. Съеденное слово уже кому-то досталось. */
export interface SearchToken {
  text: string;
  /** Как слово выглядело до исправления опечатки (для текста поиска) */
  original: string;
  consumed: boolean;
  /** Кто съел слово: 'entity', 'number', 'city', 'time', 'phrase', 'subject' … */
  by?: string;
}

/** Нормализованный текст → слова; известные опечатки исправлены. */
export function tokenize(normalized: string): SearchToken[] {
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((word) => ({ text: TYPO_MAP[word] ?? word, original: word, consumed: false }));
}

/** Пометить слова [from, to) как использованные. */
export function consume(tokens: SearchToken[], from: number, to: number, by: string): void {
  for (let i = from; i < to && i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (!token.consumed) {
      token.consumed = true;
      token.by = by;
    }
  }
}

/** Все ли слова [from, to) свободны. */
export function free(tokens: readonly SearchToken[], from: number, to: number): boolean {
  if (from < 0 || to > tokens.length || from >= to) return false;
  for (let i = from; i < to; i += 1) if (tokens[i]!.consumed) return false;
  return true;
}

/** Текст слов [from, to) через пробел. */
export function span(tokens: readonly SearchToken[], from: number, to: number): string {
  return tokens
    .slice(from, to)
    .map((token) => token.text)
    .join(' ');
}

/** Оставшиеся (ничьи) слова по порядку. */
export function leftover(tokens: readonly SearchToken[]): string[] {
  return tokens.filter((token) => !token.consumed).map((token) => token.text);
}
