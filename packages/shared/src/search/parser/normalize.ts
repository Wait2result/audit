/**
 * Сравнение слов без учёта регистра, «ё» и знаков: «Corolla-Fielder»,
 * «corolla fielder» и «COROLLA FIELDER» — одно и то же.
 */
export function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}+]+/gu, ' ')
    .trim();
}

/** Слова строки без знаков. */
export function words(value: string): string[] {
  return norm(value).split(' ').filter(Boolean);
}

/**
 * Совпадает ли слово человека с названием с точностью до падежного окончания:
 * «Махачкале» ~ «Махачкала», «Каспийске» ~ «Каспийск», «Дюну» ~ «Дюна».
 * Окончание — не больше двух букв, общая основа — не короче трёх.
 */
export function sameStem(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  if (x.length < 4 || y.length < 4) return false;
  let common = 0;
  while (common < x.length && common < y.length && x[common] === y[common]) common += 1;
  const longest = Math.max(x.length, y.length);
  return common >= Math.max(3, longest - 2) && Math.abs(x.length - y.length) <= 2;
}

/** Основа слова для поиска в тексте: «Дюну» → «дюн», «Махачкалы» → «махачкал». */
export function stem(word: string): string {
  const value = norm(word);
  if (value.length <= 3) return value;
  return value.replace(/(ами|ями|ов|ев|ей|ах|ях|ом|ем|ой|ий|ый|ая|ое|ые|а|я|у|ю|е|и|ы|о)$/u, '');
}

/** Все ли слова запроса (по основам) встречаются в тексте. */
export function containsAllStems(haystack: string, query: string): boolean {
  const text = norm(haystack);
  const stems = words(query)
    .map(stem)
    .filter((item) => item.length >= 2);
  return stems.length > 0 && stems.every((item) => text.includes(item));
}

/** Латинские буквы, которые по начертанию путают с кириллическими (и наоборот). */
const LATIN_LOOKALIKES: Readonly<Record<string, string>> = {
  a: 'а',
  c: 'с',
  e: 'е',
  o: 'о',
  p: 'р',
  x: 'х',
  y: 'у',
  k: 'к',
  m: 'м',
  t: 'т',
  h: 'н',
  b: 'в',
};
const CYRILLIC_LOOKALIKES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LATIN_LOOKALIKES).map(([latin, cyrillic]) => [cyrillic, latin]),
);

/**
 * Слово, набранное в двух раскладках сразу («тoyota» с кириллической «о»,
 * «кaмри» с латинской «a»), приводится к одной: в кириллицу, если кириллических
 * букв больше, иначе в латиницу. Слово из одной раскладки не трогается —
 * «BMW» и «Лада» остаются как есть.
 */
export function unifyScript(word: string): string {
  const latin = (word.match(/[a-z]/g) ?? []).length;
  const cyrillic = (word.match(/[а-я]/g) ?? []).length;
  if (latin === 0 || cyrillic === 0) return word;
  const map = cyrillic >= latin ? LATIN_LOOKALIKES : CYRILLIC_LOOKALIKES;
  return word.replace(/[a-zа-я]/g, (char) => map[char] ?? char);
}

/**
 * Текст человека перед разбором: нижний регистр, «ё» → «е», дефисы и
 * пунктуация → пробелы, числа с пробелами внутри склеены («1 000 000»),
 * лишние пробелы убраны, смешанные раскладки в словах выровнены.
 *
 * «ТОЙОТА   СУКСИД до 1 МЛН!!!» → «тойота суксид до 1 млн».
 */
export function normalizeSearchText(text: string): string {
  const flat = text
    .toLowerCase()
    .replace(/ё/g, 'е')
    // «1 200 000» → «1200000»: пробел внутри числа разделяет тысячи
    .replace(/(\d)[\s\u00a0](?=\d{3}(?!\d))/g, '$1')
    // «2,5» и «1.5» — десятичная дробь; остальные знаки — пробел
    .replace(/(\d)[,.](?=\d)/g, '$1.')
    // Точка — только внутри дроби; «млн.», «г.» и «т.р.» теряют точки
    .replace(/\.(?!\d)/g, ' ')
    .replace(/(?<!\d)\./g, ' ')
    .replace(/[^\p{L}\p{N}.+]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat
    .split(' ')
    .map((word) => unifyScript(word))
    .join(' ');
}

/**
 * Расстояние Дамерау — Левенштейна: сколько букв вставить, удалить, заменить
 * или переставить, чтобы получить одно слово из другого. Для опечаток в
 * известных названиях: «тойта» → «тойота» (1), «суксд» → «суксид» (1).
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        table[i - 1]![j]! + 1,
        table[i]![j - 1]! + 1,
        table[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, table[i - 2]![j - 2]! + 1);
      }
      table[i]![j] = best;
    }
  }
  return table[rows - 1]![cols - 1]!;
}

/**
 * Похоже ли слово человека на известное название с точностью до одной
 * опечатки (двух — у длинных слов). Короткие слова не сравниваются вовсе:
 * «кот» и «код» — разные слова, а не опечатка.
 */
export function looksLike(candidate: string, known: string): boolean {
  const a = norm(candidate);
  const b = norm(known);
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  if (a[0] !== b[0]) return false;
  const allowed = Math.min(a.length, b.length) >= 8 ? 2 : 1;
  return Math.abs(a.length - b.length) <= allowed && editDistance(a, b) <= allowed;
}
