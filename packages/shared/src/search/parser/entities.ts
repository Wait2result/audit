import type { SearchDictionaryEntry, SearchPhrase } from '../types.js';
import { looksLike, norm, stem } from './normalize.js';
import { consume, free, span, type SearchToken } from './tokenize.js';

/** Совпадение записи словаря со словами [start, end). */
export interface DictionaryHit {
  entry: SearchDictionaryEntry;
  start: number;
  end: number;
  alias: string;
  /** Найдено по похожести (опечатка), а не точно */
  fuzzy: boolean;
}

/** Совпадение устойчивого выражения со словами [start, end). */
export interface PhraseHit {
  phrase: SearchPhrase;
  start: number;
  end: number;
}

/** Самое длинное выражение словаря в словах. */
const MAX_SPAN = 4;
/** Короткие синонимы сверяются только точно: «дом» ≠ «домой». */
const STEM_MIN_LENGTH = 5;
/** Опечатка ищется только в длинных словах и только среди длинных синонимов. */
const FUZZY_MIN_LENGTH = 6;

interface DictionaryIndex {
  exact: Map<string, { entry: SearchDictionaryEntry; alias: string }[]>;
  stems: Map<string, { entry: SearchDictionaryEntry; alias: string }[]>;
  long: { entry: SearchDictionaryEntry; alias: string }[];
}

const INDEXES = new WeakMap<readonly SearchDictionaryEntry[], DictionaryIndex>();

function indexOf(entries: readonly SearchDictionaryEntry[]): DictionaryIndex {
  const cached = INDEXES.get(entries);
  if (cached) return cached;
  const index: DictionaryIndex = { exact: new Map(), stems: new Map(), long: [] };
  for (const entry of entries) {
    for (const raw of entry.aliases) {
      const alias = norm(raw);
      if (!alias) continue;
      const item = { entry, alias };
      const exact = index.exact.get(alias);
      if (exact) exact.push(item);
      else index.exact.set(alias, [item]);
      if (!alias.includes(' ') && alias.length >= STEM_MIN_LENGTH) {
        const key = stem(alias);
        const stems = index.stems.get(key);
        if (stems) stems.push(item);
        else index.stems.set(key, [item]);
        if (alias.length >= FUZZY_MIN_LENGTH) index.long.push(item);
      }
    }
  }
  INDEXES.set(entries, index);
  return index;
}

/** Записи, которым слово (или фраза из слов) соответствует точно или по основе. */
function candidates(
  index: DictionaryIndex,
  phrase: string,
): { entry: SearchDictionaryEntry; alias: string; fuzzy: boolean }[] {
  const exact = index.exact.get(phrase);
  if (exact) return exact.map((item) => ({ ...item, fuzzy: false }));
  if (phrase.includes(' ') || phrase.length < STEM_MIN_LENGTH) return [];
  const byStem = index.stems.get(stem(phrase));
  if (byStem) return byStem.map((item) => ({ ...item, fuzzy: false }));
  return [];
}

/**
 * Слово с опечаткой: единственная похожая запись среди длинных синонимов.
 * Две разные записи на одинаковом расстоянии — ничего не применяется.
 */
function fuzzyCandidate(
  index: DictionaryIndex,
  word: string,
  exclude: ReadonlySet<string>,
): { entry: SearchDictionaryEntry; alias: string; fuzzy: boolean } | null {
  if (word.length < FUZZY_MIN_LENGTH || /\d/.test(word) || exclude.has(word)) return null;
  const found = new Map<SearchDictionaryEntry, string>();
  for (const item of index.long) {
    // «Завтра» — не опечатка в «завтрак»: слово, целиком входящее в другое, — другое слово
    if (item.alias.startsWith(word) || word.startsWith(item.alias)) continue;
    if (looksLike(word, item.alias)) found.set(item.entry, item.alias);
  }
  if (found.size !== 1) return null;
  const first = [...found][0]!;
  return { entry: first[0], alias: first[1], fuzzy: true };
}

/**
 * Совпадения словаря во фразе: сначала самые длинные выражения, потом слова.
 * Каждое слово достаётся одной записи — первой по порядку словаря среди
 * совпавших с ним (порядок — это приоритет).
 */
export function matchEntries(
  tokens: SearchToken[],
  entries: readonly SearchDictionaryEntry[],
  options: { by?: string; noFuzzy?: ReadonlySet<string> } = {},
): DictionaryHit[] {
  const by = options.by ?? 'entity';
  const noFuzzy = options.noFuzzy ?? new Set<string>();
  const index = indexOf(entries);
  const hits: DictionaryHit[] = [];
  for (let length = MAX_SPAN; length >= 1; length -= 1) {
    for (let start = 0; start + length <= tokens.length; start += 1) {
      const end = start + length;
      if (!free(tokens, start, end)) continue;
      const phrase = span(tokens, start, end);
      let found = candidates(index, phrase);
      if (found.length === 0 && length === 1) {
        const fuzzy = fuzzyCandidate(index, phrase, noFuzzy);
        if (fuzzy) found = [fuzzy];
      }
      const best = found[0];
      if (!best) continue;
      hits.push({ entry: best.entry, start, end, alias: best.alias, fuzzy: best.fuzzy });
      consume(tokens, start, end, by);
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** Слово фразы совпадает со словом выражения точно или по основе (длинные). */
function sameWord(token: string, word: string): boolean {
  if (token === word) return true;
  return (
    word.length >= STEM_MIN_LENGTH && token.length >= STEM_MIN_LENGTH && stem(token) === stem(word)
  );
}

/** Устойчивые выражения во фразе — длинные раньше коротких, каждое слово один раз. */
export function matchPhrases(
  tokens: SearchToken[],
  phrases: readonly SearchPhrase[],
  skippable: ReadonlySet<string> = new Set(),
): PhraseHit[] {
  const prepared = phrases
    .map((phrase) => ({ phrase, words: norm(phrase.phrase).split(' ').filter(Boolean) }))
    .sort((a, b) => b.words.length - a.words.length);
  const hits: PhraseHit[] = [];
  for (const { phrase, words: expected } of prepared) {
    for (let start = 0; start < tokens.length; start += 1) {
      if (tokens[start]!.consumed) continue;
      // Слова выражения по порядку; между ними допускается одно слово времени
      // («что сегодня посмотреть»), оно остаётся свободным
      const taken: number[] = [];
      let cursor = start;
      let skipped = 0;
      let matches = true;
      for (const word of expected) {
        while (
          cursor < tokens.length &&
          !tokens[cursor]!.consumed &&
          taken.length > 0 &&
          skipped < 1 &&
          !sameWord(tokens[cursor]!.text, word) &&
          skippable.has(tokens[cursor]!.text)
        ) {
          cursor += 1;
          skipped += 1;
        }
        if (
          cursor >= tokens.length ||
          tokens[cursor]!.consumed ||
          !sameWord(tokens[cursor]!.text, word)
        ) {
          matches = false;
          break;
        }
        taken.push(cursor);
        cursor += 1;
      }
      if (!matches) continue;
      hits.push({ phrase, start, end: cursor });
      for (const index of taken) consume(tokens, index, index + 1, 'phrase');
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}
