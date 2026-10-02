import { stems } from './news-classifier.js';

/**
 * Поиск повторов: одна и та же новость, попавшая в ленту дважды.
 *
 * Повторы бывают трёх видов, и для каждого своя проверка:
 *  1. точная копия — тот же заголовок (с точностью до «ё/е», регистра и знаков);
 *  2. та же статья, найденная дважды — то же фото и хотя бы отчасти те же слова;
 *  3. то же событие у двух изданий — похожий текст, где совпадают не только
 *     частые слова недели («выборы», «Дагестан», «голосование»), но и редкие:
 *     фамилии, названия, числа.
 *
 * Сравнение слов — с весами (IDF): слово, которое встречается в десятках заметок
 * недели, почти ничего не доказывает, а фамилия из двух заметок — почти всё.
 * Без весов «Врио главы проголосовал» и «В РД задействуют 1726 участков» выглядели
 * бы дублями из-за слов «выбор», «Дагестан», «голос».
 */

export interface DedupeRow {
  id: string;
  source: string;
  title: string;
  lead: string | null;
  imageUrl: string | null;
  /** Длина полного текста: полнее — лучше */
  bodyLength: number;
  publishedAt: Date;
}

/** Повтором считается заметка того же события в пределах этого срока. */
const WINDOW_MS = 48 * 3_600_000;

function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9]+/g, ' ')
    .trim();
}

interface Prepared {
  row: DedupeRow;
  key: string;
  words: Set<string>;
}

/**
 * Возвращает идентификаторы заметок, которые нужно убрать как повторы.
 * Из группы повторов остаётся лучшая: с фото, с более полным текстом, из более
 * приоритетного издания (`priority` — чем меньше число, тем важнее), а при
 * равенстве — самая ранняя, то есть первоисточник.
 */
export function findDuplicates(
  rows: readonly DedupeRow[],
  priority: (source: string) => number,
): string[] {
  const prepared: Prepared[] = rows.map((row) => ({
    row,
    key: titleKey(row.title),
    words: stems(`${row.title} ${row.lead ?? ''}`),
  }));

  const frequency = new Map<string, number>();
  for (const { words } of prepared) {
    for (const word of words) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }

  const weight = (word: string) =>
    Math.log((prepared.length + 1) / ((frequency.get(word) ?? 0) + 0.5));
  const mass = (words: Set<string>) => [...words].reduce((sum, word) => sum + weight(word), 0);

  const ordered = [...prepared].sort(
    (a, b) =>
      Number(Boolean(b.row.imageUrl)) - Number(Boolean(a.row.imageUrl)) ||
      b.row.bodyLength - a.row.bodyLength ||
      priority(a.row.source) - priority(b.row.source) ||
      a.row.publishedAt.getTime() - b.row.publishedAt.getTime(),
  );

  const kept: Prepared[] = [];
  const duplicates: string[] = [];

  for (const candidate of ordered) {
    const isDuplicate = kept.some((other) => areSame(candidate, other, weight, mass, frequency));
    if (isDuplicate) duplicates.push(candidate.row.id);
    else kept.push(candidate);
  }

  return duplicates;
}

function areSame(
  a: Prepared,
  b: Prepared,
  weight: (word: string) => number,
  mass: (words: Set<string>) => number,
  frequency: Map<string, number>,
): boolean {
  if (Math.abs(a.row.publishedAt.getTime() - b.row.publishedAt.getTime()) > WINDOW_MS) return false;

  if (a.key !== '' && a.key === b.key) return true;

  let shared = 0;
  let rare = 0;
  for (const word of a.words) {
    if (!b.words.has(word)) continue;
    shared += weight(word);
    // Слово из двух заметок — фамилия, название, число; из десятков — лексика недели
    if ((frequency.get(word) ?? 0) <= 2) rare += 1;
  }

  const smaller = Math.min(mass(a.words), mass(b.words));
  if (smaller <= 0) return false;
  const similarity = shared / smaller;

  const samePhoto = a.row.imageUrl !== null && a.row.imageUrl === b.row.imageUrl;
  if (samePhoto && similarity >= 0.3) return true;
  if (similarity >= 0.85) return true;

  // Разные издания об одном событии: одного сходства мало, нужны общие редкие слова
  if (a.row.source !== b.row.source) {
    if (similarity >= 0.55 && rare >= 3) return true;
    if (similarity >= 0.4 && rare >= 2) return true;
  }

  return false;
}
