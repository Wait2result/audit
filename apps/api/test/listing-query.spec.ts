import {
  ListingSort,
  bindingsOf,
  findSeedCategory,
  listingListQuerySchema,
  resolveAttributes,
  type ListingAttribute,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import {
  areaSql,
  attributeSql,
  feedIdsByDistanceSql,
  feedIdsSql,
  feedWhere,
  keysetSql,
  mapPointsSql,
  orderSql,
  parseAttributeFilter,
  prefixQuery,
  renderSql,
  searchSql,
} from '../src/modules/listings/listing-query.js';
import { distanceCursor, parseDistanceCursor } from '../src/modules/listings/listing-ranking.js';

/**
 * SQL ленты. Проверяется текст запроса с подставленными параметрами: это
 * то, что уходит в базу, и именно здесь фильтр либо работает, либо молча
 * отдаёт всё подряд.
 */

const CITY = '3f6a1c8e-5d2b-4a91-9f0e-7c3b8d1a2f50';
const MAKHACHKALA = { latitude: 42.9849, longitude: 47.5047 };

function attributesOf(slug: string): readonly ListingAttribute[] {
  const category = findSeedCategory(slug);
  if (!category) throw new Error(`Нет категории ${slug}`);
  return resolveAttributes(bindingsOf(category));
}

function where(
  raw: Record<string, unknown>,
  context: Partial<Parameters<typeof feedWhere>[1]> = {},
) {
  return renderSql(
    feedWhere(listingListQuerySchema.parse({ cityId: CITY, ...raw }), {
      categoryIds: [],
      attributes: [],
      ...context,
    }),
  );
}

describe('Условия ленты', () => {
  it('видно только опубликованное и неудалённое своего города', () => {
    const text = where({});
    expect(text).toContain(`l."deleted_at" IS NULL`);
    expect(text).toContain(`l."status" = 'approved'`);
    expect(text).toContain(`l."city_id" = '${CITY}'::uuid`);
  });

  it('«Весь Дагестан» снимает ограничение по городу', () => {
    expect(where({ regionWide: 'true' })).not.toContain(CITY);
  });

  it('радиус заменяет город настоящим кругом', () => {
    const text = where({
      latitude: String(MAKHACHKALA.latitude),
      longitude: String(MAKHACHKALA.longitude),
      radiusKm: '10',
    });
    // Десять километров от Махачкалы — это и Каспийск: ограничение по
    // городу здесь прятало бы ровно то, что человек искал
    expect(text).not.toContain(`l."city_id" = '${CITY}'`);
    expect(text).toContain('ST_DWithin(l."geom"');
    expect(text).toContain('10000');
    expect(text).toContain(`${MAKHACHKALA.longitude}::float8`);
    // Объявление без своей точки попадает в круг по центру своего города —
    // через список городов в круге, а не расчётом на каждую строку
    expect(text).toContain('l."geom" IS NULL AND l."city_id" IN (SELECT ac."id" FROM "cities" ac');
  });

  it('круг работает без города вовсе: место — это точка, а не название', () => {
    const text = renderSql(
      feedWhere(
        listingListQuerySchema.parse({ latitude: '42.744', longitude: '47.6998', radiusKm: '25' }),
        { categoryIds: [], attributes: [] },
      ),
    );
    expect(text).toContain('25000');
    expect(text).not.toContain(`l."city_id" = `);
  });

  it('все радиусы интерфейса принимаются, больше предела — нет', () => {
    for (const radius of [1, 5, 10, 25, 50, 100]) {
      expect(listingListQuerySchema.safeParse({ radiusKm: String(radius) }).success).toBe(true);
    }
    expect(listingListQuerySchema.safeParse({ radiusKm: '301' }).success).toBe(false);
  });

  it('«Весь Дагестан» снимает и круг, остальные фильтры остаются', () => {
    const text = where({
      latitude: '42.744',
      longitude: '47.6998',
      radiusKm: '10',
      regionWide: 'true',
      onlyWithPhoto: 'true',
    });
    expect(text).not.toContain('ST_DWithin');
    expect(text).toContain('cover_media_id');
  });

  it('радиус без координат город не отменяет', () => {
    expect(where({ radiusKm: '10' })).toContain(`l."city_id"`);
    expect(areaSql(listingListQuerySchema.parse({ cityId: CITY, radiusKm: 10 }))).not.toBeNull();
  });

  it('без точки, города и «всего Дагестана» ограничения по месту нет', () => {
    expect(areaSql(listingListQuerySchema.parse({}))).toBeNull();
  });

  it('покупатель ищет «купить» — фильтр по «продам»', () => {
    expect(where({ transactionType: 'buy' })).toContain(
      `l."transaction_type" = 'sale'::"ListingTransactionType"`,
    );
  });

  it('«снять посуточно» — аренда со сроком', () => {
    const text = where({ transactionType: 'rent', rentPeriod: 'daily' });
    expect(text).toContain(`'rent'::"ListingTransactionType"`);
    expect(text).toContain(`l."rent_period" = 'daily'::"ListingRentPeriod"`);
  });

  it('цена сравнивается только внутри одной единицы', () => {
    const text = where({ priceTo: '500000' }, { priceUnit: 'per_day' });
    expect(text).toContain(`l."price" <= 500000`);
    expect(text).toContain(`l."price_unit" = 'per_day'::"ListingPriceUnit"`);
  });

  it('без фильтра и сортировки по цене единица не ограничивает выдачу', () => {
    expect(where({}, { priceUnit: 'total' })).not.toContain('price_unit');
  });

  it('сортировка по цене тоже держится одной единицы', () => {
    expect(where({ sort: ListingSort.PRICE_ASC }, { priceUnit: 'total' })).toContain(
      `l."price_unit" = 'total'`,
    );
  });

  it('«только избранное» без пользователя ничего не фильтрует', () => {
    expect(where({ favoritesOnly: 'true' })).not.toContain('favorite_listings');
    expect(where({ favoritesOnly: 'true' }, { userId: 'u1' })).toContain('favorite_listings');
  });

  it('категория — список её подкатегорий', () => {
    const text = where({}, { categoryIds: ['a', 'b'] });
    expect(text).toContain(`l."category_id" IN ('a'::uuid,'b'::uuid)`);
  });

  it('заморозка ленты ограничивает выдачу моментом открытия', () => {
    const text = where({ freshBefore: '2026-09-23T10:00:00.000Z' });
    expect(text).toContain(`l."bumped_at" <=`);
  });

  it('район и продавец уходят в условия', () => {
    const text = where({ districtId: CITY, sellerId: CITY });
    expect(text).toContain(`l."district_id" = '${CITY}'::uuid`);
    expect(text).toContain(`l."seller_id" = '${CITY}'::uuid`);
  });
});

describe('Поиск', () => {
  it('ищет по вектору с морфологией, по префиксу и по опечаткам', () => {
    const text = renderSql(searchSql('диваны раскл') as never);
    expect(text).toContain(`websearch_to_tsquery('russian', 'диваны раскл')`);
    expect(text).toContain(`to_tsquery('russian', 'диваны:* & раскл:*')`);
    expect(text).toContain(`<% l."title"`);
    expect(text).toContain(`<% l."search_text"`);
  });

  it('одна буква — только начало заголовка', () => {
    expect(renderSql(searchSql('д') as never)).toContain(`l."title" ILIKE 'д%'`);
  });

  it('пустой запрос условия не даёт', () => {
    expect(searchSql('   ')).toBeNull();
    expect(where({})).not.toContain('tsquery');
  });

  it('префикс собирается только из букв и цифр', () => {
    expect(prefixQuery('iPhone 15 (256)')).toBe('iphone:* & 15:* & 256:*');
    expect(prefixQuery('!!')).toBe('');
  });
});

describe('Характеристики', () => {
  it('перечислимое ищется в таблице значений', () => {
    const [text] = attributeSql(attributesOf('transport-cars'), { gearbox: 'auto' }).map(renderSql);
    expect(text).toContain(`v."key" = 'gearbox'`);
    expect(text).toContain(`v."text_value" = 'auto'`);
  });

  it('диапазон по колонке', () => {
    const [text] = attributeSql(attributesOf('transport-cars'), {
      year: { from: 2015, to: 2021 },
    }).map(renderSql);
    expect(text).toBe(`l."year" >= 2015 AND l."year" <= 2021`);
  });

  it('диапазон по числу вне колонок — через таблицу значений', () => {
    const [text] = attributeSql(attributesOf('electronics-phones'), {
      battery: { from: 80 },
    }).map(renderSql);
    expect(text).toContain(`v."key" = 'battery'`);
    expect(text).toContain(`v."num_value" >= 80`);
  });

  it('участок в сотках фильтруется с учётом десятых', () => {
    const [text] = attributeSql(attributesOf('realty-land'), {
      landArea: { from: 6, to: 12 },
    }).map(renderSql);
    expect(text).toContain(`v."num_value" >= 60 AND v."num_value" <= 120`);
  });

  it('площадь пересчитывается в десятые', () => {
    const [text] = attributeSql(attributesOf('realty-flats'), {
      areaTotal: { from: 40, to: 60 },
    }).map(renderSql);
    expect(text).toBe(`l."area_total" >= 400 AND l."area_total" <= 600`);
  });

  it('несколько значений комнат — список', () => {
    const [text] = attributeSql(attributesOf('realty-flats'), { rooms: [1, 2] }).map(renderSql);
    expect(text).toBe(`l."rooms" IN (1,2)`);
  });

  it('«4+» комнат означает от четырёх, а не ровно четыре', () => {
    const [only] = attributeSql(attributesOf('realty-flats'), { rooms: [4] }).map(renderSql);
    expect(only).toBe(`l."rooms" >= 4`);
    const [mixed] = attributeSql(attributesOf('realty-flats'), { rooms: [2, 4] }).map(renderSql);
    expect(mixed).toBe(`(l."rooms" IN (2) OR l."rooms" >= 4)`);
  });

  it('переключатель ищет истину', () => {
    const [text] = attributeSql(attributesOf('realty-flats'), { balcony: true }).map(renderSql);
    expect(text).toContain(`v."key" = 'balcony'`);
    expect(text).toContain(`v."num_value" = 1`);
  });

  it('состояние — перечисление в колонке', () => {
    const [text] = attributeSql(attributesOf('home-furniture'), { condition: 'used' }).map(
      renderSql,
    );
    expect(text).toBe(`l."condition" = 'used'::"ListingCondition"`);
  });

  it('поле без фильтра и чужое поле игнорируются', () => {
    expect(attributeSql(attributesOf('electronics-phones'), { modelName: 'iPhone' })).toEqual([]);
    expect(attributeSql(attributesOf('electronics-phones'), { gearbox: 'auto' })).toEqual([]);
  });

  it('испорченная строка фильтра не ломает выдачу', () => {
    expect(parseAttributeFilter('{не json}')).toEqual({});
    expect(parseAttributeFilter(undefined)).toEqual({});
  });
});

describe('Порядок и курсор', () => {
  it('порядок всегда заканчивается id', () => {
    for (const sort of [undefined, ListingSort.PRICE_ASC, ListingSort.PRICE_DESC]) {
      expect(renderSql(orderSql(sort))).toMatch(/l\."id" ASC$/);
    }
  });

  it('объявления без цены уходят вниз, а не наверх', () => {
    expect(renderSql(orderSql(ListingSort.PRICE_ASC))).toContain('NULLS LAST');
  });

  it('курсор по дате продолжает с того же момента без повторов', () => {
    const at = new Date('2026-09-23T10:00:00.000Z');
    const text = renderSql(keysetSql(ListingSort.DATE, { id: 'x', bumpedAt: at, price: null }));
    expect(text).toContain(`l."bumped_at" <`);
    expect(text).toContain(`l."id" > 'x'::uuid`);
  });

  it('курсор по цене: после платных идут бесплатные', () => {
    const text = renderSql(
      keysetSql(ListingSort.PRICE_ASC, { id: 'x', bumpedAt: new Date(), price: 100 }),
    );
    expect(text).toContain(`l."price" > 100`);
    expect(text).toContain(`l."price" IS NULL`);
    const tail = renderSql(
      keysetSql(ListingSort.PRICE_ASC, { id: 'x', bumpedAt: new Date(), price: null }),
    );
    expect(tail).toBe(`(l."price" IS NULL AND l."id" > 'x'::uuid)`);
  });

  it('«Ближе ко мне» — порядок по расстоянию в базе, курсор по (расстояние, id)', () => {
    const where = feedWhere(listingListQuerySchema.parse({}), { categoryIds: [], attributes: [] });
    const first = renderSql(feedIdsByDistanceSql(where, MAKHACHKALA, 21));
    expect(first).toContain('ORDER BY "distance" ASC, l."id" ASC LIMIT 21');
    // Без своей точки — центр города с надбавкой за неизвестность
    expect(first).toContain('COALESCE(ST_Distance(l."geom"');
    expect(first).toContain('10000::float8');

    const next = renderSql(
      feedIdsByDistanceSql(where, MAKHACHKALA, 21, { distance: 1532.5, id: 'x' }),
    );
    expect(next).toContain('> 1532.5::float8');
    expect(next).toContain(`l."id" > 'x'::uuid`);
  });

  it('курсор расстояния разбирается и отвергает мусор', () => {
    const cursor = distanceCursor(1532.4471, 'abc-1');
    expect(parseDistanceCursor(cursor)).toEqual({ distance: 1532.4471, id: 'abc-1' });
    expect(parseDistanceCursor('g:не-число:abc')).toBeNull();
    expect(parseDistanceCursor('r:abc')).toBeNull();
    expect(parseDistanceCursor(undefined)).toBeNull();
  });

  it('карта — по индексу точки, а не перебором широты и долготы', () => {
    const where = feedWhere(listingListQuerySchema.parse({}), { categoryIds: [], attributes: [] });
    const text = renderSql(mapPointsSql(where, { south: 42, west: 47, north: 43, east: 48 }, 500));
    expect(text).toContain(
      'l."geom" && ST_MakeEnvelope(47::float8, 42::float8, 48::float8, 43::float8, 4326)',
    );
  });

  it('страница — отдельный запрос с пределом', () => {
    const text = renderSql(
      feedIdsSql(
        feedWhere(listingListQuerySchema.parse({ cityId: CITY }), {
          categoryIds: [],
          attributes: [],
        }),
        ListingSort.DATE,
        21,
      ),
    );
    expect(text).toMatch(/^SELECT l\."id" FROM "listings" l JOIN "cities" c/);
    expect(text).toMatch(/LIMIT 21$/);
  });
});
