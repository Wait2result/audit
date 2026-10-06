import {
  LISTING_RANKING,
  activityScore,
  boundingBox,
  distanceKm,
  formatDistance,
  isPromoted,
  freshnessScore,
  listingDistanceKm,
  listingRadiusLabel,
  locationScore,
  maxComponentScore,
  promotionEligible,
  promotionMultiplier,
  qualityScore,
  relevanceTier,
  scoreListing,
  type ListingRankInput,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import {
  feedCursor,
  pageFromRanked,
  parseFeedCursor,
  sortByDistance,
  sortByScore,
  type RankableListing,
} from '../src/modules/listings/listing-ranking.js';

/**
 * Ранжирование «Рекомендуемых» и расстояния.
 *
 * Отдельным файлом от listings.spec.ts: там проверяются схемы и фильтры, а
 * здесь — порядок выдачи, то есть то, что человек видит первым и чего никак
 * не проверить глазами. Самый важный тест в файле — «оплаченное объявление
 * никогда не обгоняет подходящее запросу»: он стоит на страже настройки
 * весов и должен падать при неудачной правке коэффициентов.
 */

/** Реальные города: расстояния между ними известны заранее. */
const MAKHACHKALA = { latitude: 42.9849, longitude: 47.5047 };
const KASPIYSK = { latitude: 42.8807, longitude: 47.6383 };
const DERBENT = { latitude: 42.0578, longitude: 48.29 };

const NOW = new Date('2026-09-23T12:00:00.000Z');

const DAY = 24 * 3_600_000;

/** Обычное объявление: свежее, заполненное, без продвижения. */
function listing(overrides: Partial<ListingRankInput> = {}): ListingRankInput {
  return {
    title: 'iPhone 13 128 ГБ',
    bumpedAt: NOW,
    price: 4_000_000,
    hasPhoto: true,
    attributesCount: 4,
    hasAddress: true,
    viewsCount: 10,
    phoneViewsCount: 1,
    latitude: MAKHACHKALA.latitude,
    longitude: MAKHACHKALA.longitude,
    cityPoint: MAKHACHKALA,
    promotedAt: null,
    promotedUntil: null,
    ...overrides,
  };
}

/** Объявление с продвижением, включённым столько-то часов назад. */
function promoted(hoursAgo: number, hoursLeft = 24): ListingRankInput {
  return listing({
    promotedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000),
    promotedUntil: new Date(NOW.getTime() + hoursLeft * 3_600_000),
  });
}

describe('Расстояния', () => {
  it('до Каспийска — около пятнадцати километров', () => {
    expect(distanceKm(MAKHACHKALA, KASPIYSK)).toBeGreaterThan(12);
    expect(distanceKm(MAKHACHKALA, KASPIYSK)).toBeLessThan(18);
  });

  it('до Дербента — больше сотни километров', () => {
    expect(distanceKm(MAKHACHKALA, DERBENT)).toBeGreaterThan(100);
  });

  it('расстояние до самого себя — ноль', () => {
    expect(distanceKm(MAKHACHKALA, MAKHACHKALA)).toBe(0);
  });

  it('круг радиуса накрывает город на этом расстоянии', () => {
    // 20 км от Махачкалы обязаны захватить Каспийск, иначе фильтр «до 25 км»
    // молча прячет соседний город
    const box = boundingBox(MAKHACHKALA, 20);
    expect(KASPIYSK.latitude).toBeGreaterThan(box.minLatitude);
    expect(KASPIYSK.latitude).toBeLessThan(box.maxLatitude);
    expect(KASPIYSK.longitude).toBeGreaterThan(box.minLongitude);
    expect(KASPIYSK.longitude).toBeLessThan(box.maxLongitude);
  });

  it('круг радиуса не накрывает далёкий город', () => {
    expect(DERBENT.latitude).toBeLessThan(boundingBox(MAKHACHKALA, 20).minLatitude);
  });

  it('по долготе прямоугольник шире, чем по широте', () => {
    // Меридианы сходятся к полюсам: без поправки круг превратился бы в овал
    const box = boundingBox(MAKHACHKALA, 10);
    expect(box.maxLongitude - box.minLongitude).toBeGreaterThan(box.maxLatitude - box.minLatitude);
  });

  it('без своих координат расстояние считается от центра города', () => {
    const row = listing({ latitude: null, longitude: null, cityPoint: DERBENT });
    expect(listingDistanceKm(row, MAKHACHKALA)).toBeGreaterThan(100);
  });

  it('без точки человека расстояния нет вовсе', () => {
    expect(listingDistanceKm(listing(), null)).toBeNull();
    expect(
      listingDistanceKm(listing({ cityPoint: null, latitude: null, longitude: null }), MAKHACHKALA),
    ).toBeNull();
  });

  it('подпись: ближнее — словом, дальнее — числом', () => {
    expect(formatDistance(0.4)).toBe('рядом');
    expect(formatDistance(3.2)).toBe('3 км');
    expect(formatDistance(26.7)).toBe('27 км');
    expect(formatDistance(null)).toBeNull();
  });

  it('подпись радиуса: число или весь регион', () => {
    expect(listingRadiusLabel(10)).toBe('10 км');
    expect(listingRadiusLabel(null)).toBe('Весь Дагестан');
  });
});

describe('Слагаемые ранжирования', () => {
  it('свежесть падает вдвое за период полураспада', () => {
    const hours = LISTING_RANKING.freshnessHalfLifeHours;
    const older = listing({ bumpedAt: new Date(NOW.getTime() - hours * 3_600_000) });
    expect(freshnessScore(older, { now: NOW })).toBeCloseTo(0.5, 5);
  });

  it('только что поднятое объявление свежее некуда', () => {
    expect(freshnessScore(listing(), { now: NOW })).toBe(1);
  });

  it('близкое объявление получает больше далёкого', () => {
    expect(locationScore(listing(), { now: NOW, point: MAKHACHKALA })).toBe(1);
    expect(
      locationScore(listing({ latitude: DERBENT.latitude, longitude: DERBENT.longitude }), {
        now: NOW,
        point: MAKHACHKALA,
      }),
    ).toBe(0);
  });

  it('соседний город получает промежуточную оценку, а не ноль', () => {
    const score = locationScore(
      listing({ latitude: KASPIYSK.latitude, longitude: KASPIYSK.longitude }),
      { now: NOW, point: MAKHACHKALA },
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('объявление без своей точки не обгоняет настоящее соседнее', () => {
    // Иначе отсутствие данных вознаграждалось бы: расстояние от центра
    // города вышло бы «нулевым» и перебило честные три километра
    const guessed = locationScore(
      listing({ latitude: null, longitude: null, cityPoint: MAKHACHKALA }),
      { now: NOW, point: MAKHACHKALA },
    );
    const exact = locationScore(listing(), { now: NOW, point: MAKHACHKALA });

    expect(guessed).toBeLessThan(exact);
    expect(guessed).toBeGreaterThan(0);
  });

  it('без геолокации близость молчит одинаково у всех', () => {
    expect(locationScore(listing(), { now: NOW })).toBe(0);
    expect(locationScore(listing({ latitude: null, longitude: null }), { now: NOW })).toBe(0);
  });

  it('заполненное объявление ценится выше пустого', () => {
    const empty = qualityScore(
      listing({ hasPhoto: false, price: null, hasAddress: false, attributesCount: 0 }),
    );
    expect(qualityScore(listing())).toBeGreaterThan(empty);
    expect(empty).toBe(0);
  });

  it('отклик сжат: двадцатый просмотр весит больше пятисотого', () => {
    const first = activityScore(listing({ viewsCount: 20, phoneViewsCount: 0 }));
    const second = activityScore(listing({ viewsCount: 500, phoneViewsCount: 0 }));
    expect(second - first).toBeLessThan(first);
  });

  it('показ телефона весомее просмотра', () => {
    const views = activityScore(listing({ viewsCount: 10, phoneViewsCount: 0 }));
    const calls = activityScore(listing({ viewsCount: 0, phoneViewsCount: 10 }));
    expect(calls).toBeGreaterThan(views);
  });

  it('объявление без просмотров не наказано', () => {
    expect(activityScore(listing({ viewsCount: 0, phoneViewsCount: 0 }))).toBe(0);
  });
});

describe('Продвижение', () => {
  it('без продвижения множитель нейтральный', () => {
    expect(promotionMultiplier(listing(), NOW)).toBe(1);
  });

  it('надбавка затухает ступенями', () => {
    expect(promotionMultiplier(promoted(1), NOW)).toBe(2);
    expect(promotionMultiplier(promoted(8), NOW)).toBe(1.7);
    expect(promotionMultiplier(promoted(18), NOW)).toBe(1.4);
    expect(promotionMultiplier(promoted(30, 48), NOW)).toBe(1);
  });

  it('истёкшее продвижение не даёт ничего', () => {
    const expired = listing({
      promotedAt: new Date(NOW.getTime() - 3_600_000),
      promotedUntil: new Date(NOW.getTime() - 60_000),
    });
    expect(promotionMultiplier(expired, NOW)).toBe(1);
  });

  it('оплаченное объявление обгоняет такое же неоплаченное', () => {
    expect(scoreListing(promoted(1), { now: NOW })).toBeGreaterThan(
      scoreListing(listing(), { now: NOW }),
    );
  });

  it('оплаченное пустое объявление не обгоняет живое заполненное', () => {
    // Множитель, а не прибавка: усиливать нечего, когда усиливать нечего
    const paidEmpty = scoreListing(
      {
        ...promoted(1),
        hasPhoto: false,
        price: null,
        hasAddress: false,
        attributesCount: 0,
        viewsCount: 0,
        phoneViewsCount: 0,
        bumpedAt: new Date(NOW.getTime() - 20 * DAY),
      },
      { now: NOW },
    );
    expect(paidEmpty).toBeLessThan(scoreListing(listing(), { now: NOW }));
  });

  it('оплаченное объявление НИКОГДА не обгоняет подходящее запросу', () => {
    // Главное свойство формулы: место в выдаче продаётся, соответствие
    // запросу — нет. Заброшенный, пустой, но подходящий iPhone обязан
    // стоять выше свежей оплаченной стиральной машины
    const context = { now: NOW, search: 'iphone' };

    const relevant = scoreListing(
      listing({
        bumpedAt: new Date(NOW.getTime() - 25 * DAY),
        hasPhoto: false,
        price: null,
        hasAddress: false,
        attributesCount: 0,
        viewsCount: 0,
        phoneViewsCount: 0,
      }),
      context,
    );
    const paidOther = scoreListing(
      { ...promoted(1, 48), title: 'Стиральная машина Bosch' },
      context,
    );

    expect(relevant).toBeGreaterThan(paidOther);
  });

  it('настройка весов не может перебить соответствие запросу', () => {
    // Тест на саму конфигурацию: при неудачной правке коэффициентов он
    // упадёт раньше, чем продвижение начнёт подменять собой поиск
    expect(maxComponentScore()).toBeLessThan(LISTING_RANKING.relevanceTierStep);
  });
});

describe('Соответствие запросу', () => {
  it('запрос целиком в заголовке — высшая ступень', () => {
    expect(relevanceTier('Продам iPhone 13', 'iphone 13')).toBe(2);
  });

  it('все слова запроса в заголовке — ступень ниже', () => {
    expect(relevanceTier('iPhone 13 Pro, 128 ГБ', 'iphone 128')).toBe(1);
  });

  it('совпадения в заголовке нет — нулевая ступень', () => {
    expect(relevanceTier('Стиральная машина', 'iphone')).toBe(0);
  });

  it('без поиска ступень у всех одинакова', () => {
    expect(relevanceTier('Любой заголовок', undefined)).toBe(0);
    expect(relevanceTier('Любой заголовок', '  ')).toBe(0);
  });
});

describe('Страницы ранжированной ленты', () => {
  const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));

  it('первая страница начинается сначала', () => {
    const page = pageFromRanked(rows, undefined, 2);
    expect(page.items.map((row) => row.id)).toEqual(['a', 'b']);
    expect(page.exhausted).toBe(false);
  });

  it('следующая страница продолжает с курсора, не повторяя карточку', () => {
    expect(pageFromRanked(rows, 'b', 2).items.map((row) => row.id)).toEqual(['c', 'd']);
  });

  it('конец окна отмечается явно', () => {
    const page = pageFromRanked(rows, 'd', 2);
    expect(page.items.map((row) => row.id)).toEqual(['e']);
    expect(page.exhausted).toBe(true);
  });

  it('исчезнувшая карточка не обрывает ленту молча', () => {
    // Объявление сняли по жалобе, пока человек листал: окно считается
    // пройденным, и лента продолжается по дате
    const page = pageFromRanked(rows, 'unknown', 2);
    expect(page.items).toEqual([]);
    expect(page.exhausted).toBe(true);
  });

  it('курсор различает ранжированную часть и продолжение по дате', () => {
    expect(parseFeedCursor(feedCursor('ranked', 'abc'))).toEqual({ phase: 'ranked', id: 'abc' });
    expect(parseFeedCursor(feedCursor('date', 'abc'))).toEqual({ phase: 'date', id: 'abc' });
    expect(parseFeedCursor(undefined)).toBeNull();
    expect(parseFeedCursor('abc')).toBeNull();
  });
});

describe('Порядок выдачи', () => {
  const row = (id: string, overrides: Partial<RankableListing> = {}): RankableListing => ({
    id,
    title: 'Объявление',
    bumpedAt: NOW,
    price: 100_000,
    coverMediaId: 'cover',
    attributes: { gearbox: 'auto' },
    address: 'ул. Ленина, 1',
    viewsCount: 0,
    phoneViewsCount: 0,
    latitude: MAKHACHKALA.latitude,
    longitude: MAKHACHKALA.longitude,
    promotedAt: null,
    promotedUntil: null,
    city: MAKHACHKALA,
    ...overrides,
  });

  it('«Рекомендуемые» поднимают свежее выше залежавшегося', () => {
    const old = row('old', { bumpedAt: new Date(NOW.getTime() - 30 * DAY) });
    const ordered = sortByScore([old, row('fresh')], { now: NOW });
    expect(ordered.map((item) => item.id)).toEqual(['fresh', 'old']);
  });

  it('«Ближе ко мне» считает от точки человека', () => {
    const far = row('far', { latitude: DERBENT.latitude, longitude: DERBENT.longitude });
    const ordered = sortByDistance([far, row('near')], MAKHACHKALA);
    expect(ordered.map((item) => item.id)).toEqual(['near', 'far']);
  });

  it('«где-то в городе» не встаёт впереди соседнего дома', () => {
    // Объявление без точки считается по центру города. Без надбавки за
    // неизвестность оно оказалось бы первым в «Ближе ко мне» — с прочерком
    // вместо расстояния
    const vague = row('vague', { latitude: null, longitude: null });
    const exact = row('exact', { latitude: 42.9764, longitude: 47.5024 });
    const ordered = sortByDistance([vague, exact], MAKHACHKALA);

    expect(ordered.map((item) => item.id)).toEqual(['exact', 'vague']);
  });

  it('объявление без координат уходит в конец, а не в начало', () => {
    const unknown = row('unknown', {
      latitude: null,
      longitude: null,
      city: null as unknown as RankableListing['city'],
    });
    const ordered = sortByDistance([unknown, row('near')], MAKHACHKALA);
    expect(ordered.map((item) => item.id)).toEqual(['near', 'unknown']);
  });

  it('порядок повторяем: одинаковые объявления не меняются местами', () => {
    const first = sortByScore([row('b'), row('a')], { now: NOW });
    const second = sortByScore([row('a'), row('b')], { now: NOW });
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
  });
});

describe('Продвижение весь оплаченный срок (аудит, п. 15)', () => {
  const context = { now: NOW, point: MAKHACHKALA };

  it('продвигаемое заполненное объявление выше обычного и на пятый день недели', () => {
    const paid = promoted(4 * 24, 3 * 24);
    const fresh = listing({ viewsCount: 150, phoneViewsCount: 20 });
    expect(scoreListing(paid, context)).toBeGreaterThan(scoreListing(fresh, context));
  });

  it('но не выше более подходящего запросу', () => {
    const search = { ...context, search: 'iPhone 13' };
    const paid = { ...promoted(1), title: 'Телефон в хорошем состоянии' };
    const exact = listing({ title: 'iPhone 13 128 ГБ' });
    expect(scoreListing(exact, search)).toBeGreaterThan(scoreListing(paid, search));
  });

  it('срок вышел — прибавки нет', () => {
    const expired = listing({
      promotedAt: new Date(NOW.getTime() - 8 * DAY),
      promotedUntil: new Date(NOW.getTime() - DAY),
    });
    expect(isPromoted(expired, NOW)).toBe(false);
    expect(scoreListing(expired, context)).toBeCloseTo(scoreListing(listing(), context), 5);
  });

  it('без фото или без цены прибавки нет', () => {
    expect(promotionEligible(listing({ hasPhoto: false }))).toBe(false);
    expect(promotionEligible(listing({ price: null }))).toBe(false);
    expect(promotionEligible(listing())).toBe(true);
  });
});
