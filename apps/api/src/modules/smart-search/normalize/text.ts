import { norm, sameStem, type CityDto } from '@dagestan/shared';

/**
 * Сравнение слов. Сами функции живут в общем пакете
 * (`packages/shared/src/search/parser/normalize.ts`) — ими пользуется и
 * локальный разбор фраз; здесь — прежний путь импорта для сервера.
 */
export { containsAllStems, norm, sameStem, stem, words } from '@dagestan/shared';

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
 * Текст человека перед разбором: без управляющих символов, без
 * разделителей, которыми подсказка модели отделяет данные от правил, с
 * пределом длины. Это не единственная защита — ответ модели всё равно
 * проверяется схемой, — но лишний шанс «сломать» подсказку текстом убирается.
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
