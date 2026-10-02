import {
  scoreListing,
  sortingDistanceKm,
  type GeoPoint,
  type ListingRankContext,
  type ListingRankInput,
} from '@dagestan/shared';

/**
 * «Рекомендуемые» и «Ближе ко мне»: порядок, которого база сама не знает.
 *
 * Оценка объявления зависит от того, КТО и КОГДА спрашивает — от точки
 * человека и от момента запроса. Такого порядка в индексе не бывает, и
 * заранее посчитать его в колонке нельзя: он у каждого свой.
 *
 * Поэтому выдача устроена в два шага. Сначала берётся окно самых свежих
 * объявлений выборки и раскладывается по оценке — это и есть
 * «Рекомендуемые». Когда окно кончилось, лента продолжается по дате, как
 * обычно. Человек этого перехода не замечает: до четырёхсотого объявления
 * в одной категории одного города долистывают единицы, а те, кто долистал,
 * получают ленту, а не пустой экран.
 *
 * Условие, без которого всё это разваливается: момент расчёта на всех
 * страницах один и тот же (`freshBefore`). Иначе свежесть пересчитывалась
 * бы между подгрузками, порядок менялся бы на ходу, и карточки начали бы
 * повторяться — ровно та болезнь, от которой заведена заморозка ленты.
 */

/**
 * Сколько объявлений участвует в ранжировании.
 *
 * Четыреста — это примерно семнадцать экранов подряд. Больше значило бы
 * тянуть из базы лишние строки на КАЖДУЮ подгрузку (окно считается заново),
 * меньше — обрывать ранжирование там, куда люди ещё долистывают.
 */
export const LISTING_RANK_WINDOW = 400;

/** Поля объявления, нужные для оценки. */
export interface RankableListing {
  id: string;
  title: string;
  searchText?: string;
  bumpedAt: Date;
  price: number | null;
  coverMediaId: string | null;
  attributes: unknown;
  address: string | null;
  viewsCount: number;
  phoneViewsCount: number;
  latitude: number | null;
  longitude: number | null;
  promotedAt: Date | null;
  promotedUntil: Date | null;
  city: { latitude: number; longitude: number };
  seller?: { isVerified: boolean; ratingAverage: number; ratingCount: number };
}

/** Строка выдачи → данные для оценки. */
export function rankInput(row: RankableListing): ListingRankInput {
  return {
    title: row.title,
    searchText: row.searchText,
    bumpedAt: row.bumpedAt,
    price: row.price,
    hasPhoto: row.coverMediaId !== null,
    attributesCount: countAttributes(row.attributes),
    hasAddress: Boolean(row.address),
    viewsCount: row.viewsCount,
    phoneViewsCount: row.phoneViewsCount,
    latitude: row.latitude,
    longitude: row.longitude,
    cityPoint: row.city,
    promotedAt: row.promotedAt,
    promotedUntil: row.promotedUntil,
    sellerVerified: row.seller?.isVerified,
    sellerRating: row.seller?.ratingAverage,
    sellerRatingCount: row.seller?.ratingCount,
  };
}

function countAttributes(attributes: unknown): number {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return 0;

  return Object.values(attributes as Record<string, unknown>).filter(
    (value) => value !== null && value !== undefined && value !== '',
  ).length;
}

/**
 * Порядок «Рекомендуемых». При равной оценке — по идентификатору: без
 * однозначного порядка курсор показывает одну карточку дважды, а другую
 * пропускает.
 */
export function sortByScore<T extends RankableListing>(
  rows: readonly T[],
  context: ListingRankContext,
): T[] {
  const scores = new Map(rows.map((row) => [row.id, scoreListing(rankInput(row), context)]));

  return [...rows].sort((a, b) => {
    const difference = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
    return difference !== 0 ? difference : a.id.localeCompare(b.id);
  });
}

/**
 * Порядок «Ближе ко мне».
 *
 * Объявление без своей точки идёт по расстоянию до города и с надбавкой за
 * неизвестность — иначе наверх встают карточки, у которых расстояние даже
 * не показано. Совсем без координат — в конец: неизвестное расстояние не
 * «ноль километров».
 */
export function sortByDistance<T extends RankableListing>(
  rows: readonly T[],
  point: GeoPoint,
): T[] {
  const distances = new Map(
    rows.map((row) => [
      row.id,
      sortingDistanceKm(rankInput(row), point) ?? Number.POSITIVE_INFINITY,
    ]),
  );

  return [...rows].sort((a, b) => {
    const difference =
      (distances.get(a.id) ?? Number.POSITIVE_INFINITY) -
      (distances.get(b.id) ?? Number.POSITIVE_INFINITY);
    return difference !== 0 ? difference : a.id.localeCompare(b.id);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Курсор
// ─────────────────────────────────────────────────────────────────────────────

/** В какой части ленты находится курсор. */
export type FeedPhase = 'ranked' | 'date';

export interface FeedCursor {
  phase: FeedPhase;
  id: string;
}

/**
 * Курсор ранжированной ленты: буква части и идентификатор.
 *
 * Часть нужна именно в курсоре, а не в отдельном параметре: приложение
 * возвращает курсор как есть, ничего о нём не зная, — и так же будет вести
 * себя любой следующий клиент.
 */
export function feedCursor(phase: FeedPhase, id: string): string {
  return `${phase === 'ranked' ? 'r' : 'd'}:${id}`;
}

export function parseFeedCursor(cursor: string | undefined): FeedCursor | null {
  if (!cursor) return null;

  const [prefix, ...rest] = cursor.split(':');
  const id = rest.join(':');
  if (!id) return null;
  if (prefix === 'r') return { phase: 'ranked', id };
  if (prefix === 'd') return { phase: 'date', id };

  return null;
}

/**
 * Курсор «Ближе ко мне»: расстояние последней карточки в метрах и её id —
 * «g:1532.4471:uuid». Расстояние в курсоре, а не пересчётом по id: карточку
 * между страницами могли снять, а продолжить ленту всё равно нужно.
 */
export function distanceCursor(distance: number, id: string): string {
  return `g:${distance}:${id}`;
}

export function parseDistanceCursor(
  cursor: string | undefined,
): { distance: number; id: string } | null {
  if (!cursor?.startsWith('g:')) return null;
  const rest = cursor.slice(2);
  const separator = rest.indexOf(':');
  if (separator < 0) return null;
  const distance = Number(rest.slice(0, separator));
  const id = rest.slice(separator + 1);
  if (!Number.isFinite(distance) || !id) return null;
  return { distance, id };
}

/**
 * Страница из разложенного по оценке окна.
 *
 * Курсор ищется в окне заново на каждый запрос — окно детерминировано, пока
 * приложение присылает один и тот же `freshBefore`. Если карточки в окне
 * уже нет (сняли по жалобе, пока человек листал), ранжированная часть
 * считается пройденной и лента продолжается по дате: это лучше, чем
 * оборвать подгрузку на пустом месте.
 */
export function pageFromRanked<T extends { id: string }>(
  ranked: readonly T[],
  cursorId: string | undefined,
  limit: number,
): { items: T[]; exhausted: boolean } {
  let start = 0;

  if (cursorId) {
    const index = ranked.findIndex((row) => row.id === cursorId);
    if (index < 0) return { items: [], exhausted: true };
    start = index + 1;
  }

  const items = ranked.slice(start, start + limit);

  return { items, exhausted: start + items.length >= ranked.length };
}
