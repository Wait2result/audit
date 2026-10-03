import type { CityDto } from '@dagestan/shared';

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

/** Слова, обозначающие весь регион: город в таком запросе не нужен. */
const REGION_WORDS = new Set(['дагестан', 'дагестане', 'дагестана', 'республика', 'рд']);

export type CityMatch = { kind: 'city'; city: CityDto } | { kind: 'region' } | { kind: 'unknown' };

/**
 * Город из слов человека — только из списка городов приложения. Город,
 * которого в приложении нет («Владивосток»), не угадывается: это `unknown`,
 * и дальше решает раздел (уточнить или не учитывать пожелание).
 */
export function matchCity(candidate: string, cities: readonly CityDto[]): CityMatch {
  const value = norm(candidate).replace(/^(в|во|г|город)\s+/, '');
  if (!value) return { kind: 'unknown' };
  if (value.split(' ').some((word) => REGION_WORDS.has(word)) || value === 'весь дагестан') {
    return { kind: 'region' };
  }
  const found =
    cities.find((city) => norm(city.name) === value || city.slug.toLowerCase() === value) ??
    cities.find((city) => sameStem(city.name, value));
  return found ? { kind: 'city', city: found } : { kind: 'unknown' };
}

/** Ближайший к точке город — когда человек дал геолокацию, а не город. */
export function nearestCity(
  cities: readonly CityDto[],
  latitude: number,
  longitude: number,
): CityDto | null {
  let best: CityDto | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const city of cities) {
    const distance = (city.latitude - latitude) ** 2 + (city.longitude - longitude) ** 2;
    if (distance < bestDistance) {
      best = city;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Текст человека перед отправкой в модель: без управляющих символов, без
 * разделителей, которыми подсказка отделяет данные от правил, с пределом
 * длины. Это не единственная защита — ответ модели всё равно проверяется
 * схемой, — но лишний шанс «сломать» подсказку текстом убирается.
 */
export function sanitizeUserText(text: string, maxLength: number): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- управляющие символы здесь и убираются
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/<<<|>>>|```/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength)
  );
}
