import { listingListQuerySchema, type SmartSearchIntentCore } from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import type { NormalizeOutcome } from '../src/modules/smart-search/domains/domain-adapter.js';
import {
  findEntry,
  listingFilterKeys,
  normalizeListings,
  type ListingPlan,
} from '../src/modules/smart-search/domains/listings.normalizer.js';
import {
  KASPIYSK,
  core,
  place,
  requestContext,
  seedCatalogue,
} from './helpers/smart-search-fixtures.js';

/**
 * Объявления: значения от модели сверяются с каталогом (категории, поля,
 * справочники марок и моделей из последних коммитов). Ничего не
 * угадывается: нет в справочнике — не применяется или уточняется.
 */

function run(intent: Partial<SmartSearchIntentCore>, text = '', overrides = {}) {
  return normalizeListings(
    core({ domain: 'listings', ...intent }),
    seedCatalogue(),
    requestContext({ text, ...overrides }),
  );
}

function ready(outcome: NormalizeOutcome<ListingPlan>) {
  if (outcome.kind !== 'ready')
    throw new Error(`Ожидался готовый запрос, а не ${outcome.kind}: ${JSON.stringify(outcome)}`);
  return outcome;
}

function attrs(outcome: NormalizeOutcome<ListingPlan>): Record<string, unknown> {
  const attributes = ready(outcome).plan.query.attributes;
  return attributes ? (JSON.parse(attributes) as Record<string, unknown>) : {};
}

describe('Объявления: «Toyota Succeed до 1.2 млн, автомат, бензин»', () => {
  const outcome = run(
    {
      filters: {
        brand: 'Toyota',
        model: 'Succeed',
        price: { max: 1_200_000 },
        gearbox: 'автомат',
        fuel: 'бензин',
      },
    },
    'Toyota Succeed до 1.2 миллиона, автомат, бензин',
  );

  it('категория — легковые, марка и модель — из справочника', () => {
    const { plan, query } = ready(outcome);
    expect(plan.query.category).toBe('transport-cars');
    expect(attrs(outcome)).toMatchObject({
      brand: 'toyota',
      model: 'succeed',
      gearbox: ['auto'],
      fuel: ['petrol'],
    });
    expect(query.conditions.map((item) => item.field)).toEqual(
      expect.arrayContaining(['category', 'brand', 'model', 'price', 'gearbox', 'fuel']),
    );
  });

  it('цена — в копейках, как у ленты; запрос проходит валидатор ленты', () => {
    const { plan, query } = ready(outcome);
    expect(plan.query.priceTo).toBe(120_000_000);
    expect(plan.query.priceFrom).toBeUndefined();
    expect(listingListQuerySchema.safeParse(query.params).success).toBe(true);
    expect(query.conditions.find((item) => item.field === 'price')?.display).toBe('до 1 200 000 ₽');
  });

  it('марка и модель не дублируются в текстовом поиске', () => {
    expect(
      ready(run({ query: 'Toyota Succeed', filters: { brand: 'Toyota', model: 'Succeed' } })).plan
        .query.search,
    ).toBeUndefined();
  });
});

describe('Объявления: написания и разговорные варианты', () => {
  it('«тойота саксид», «филдер», «премио» — через написания справочника', () => {
    expect(attrs(run({ filters: { brand: 'тойота', model: 'саксид' } }))).toMatchObject({
      brand: 'toyota',
      model: 'succeed',
    });
    expect(attrs(run({ filters: { brand: 'Тойота', model: 'филдер' } }))).toMatchObject({
      model: 'corolla_fielder',
    });
    expect(attrs(run({ filters: { model: 'премио' } }))).toMatchObject({
      brand: 'toyota',
      model: 'premio',
    });
  });

  it('«айфон» — телефоны Apple, а не часы или ноутбуки', () => {
    const outcome = run({ filters: { brand: 'айфон' } }, 'айфон');
    expect(ready(outcome).plan.query.category).toBe('electronics-phones');
    expect(attrs(outcome)).toMatchObject({ brand: 'apple' });
  });

  it('«макбук» — ноутбуки Apple, модель MacBook из справочника', () => {
    const outcome = run({ filters: { model: 'макбук' } }, 'макбук');
    expect(ready(outcome).plan.query.category).toBe('electronics-laptops');
    expect(attrs(outcome)).toMatchObject({ brand: 'apple', model: 'macbook' });
  });

  it('название линейки без точной модели — вся линейка: «ThinkPad»', () => {
    const outcome = run({
      filters: { category: 'electronics-laptops', brand: 'Lenovo', model: 'ThinkPad' },
    });
    const model = attrs(outcome).model as string[];
    expect(model).toEqual(expect.arrayContaining(['thinkpad_t', 'thinkpad_x1_carbon']));
    expect(model).not.toContain('ideapad');
  });

  it('справочник находит запись по коду, подписи и написанию', () => {
    const entries = seedCatalogue().dictionaryEntries('car_model', 'toyota');
    expect(findEntry(entries, 'corolla_fielder')?.label).toBe('Corolla Fielder');
    expect(findEntry(entries, 'COROLLA-FIELDER')?.label).toBe('Corolla Fielder');
    expect(findEntry(entries, 'королла филдер')?.label).toBe('Corolla Fielder');
    expect(findEntry(entries, 'Королла Филдерр')).toBeNull();
  });
});

describe('Объявления: проверка марки и модели', () => {
  it('несуществующая марка не применяется и не выдумывается', () => {
    const outcome = run({
      category: undefined,
      filters: { category: 'transport-cars', brand: 'Тойотаа' },
    } as never);
    const { query } = ready(outcome);
    expect(attrs(outcome).brand).toBeUndefined();
    expect(query.ignored).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'brand' })]),
    );
  });

  it('модель другой марки — уточнение с реальной маркой, а не подмена', () => {
    const outcome = run({
      filters: { category: 'transport-cars', brand: 'Honda', model: 'Corolla Fielder' },
    });
    expect(outcome.kind).toBe('clarify');
    if (outcome.kind === 'clarify') {
      expect(outcome.clarification.reason).toBe('model_brand_mismatch');
      expect(outcome.clarification.options).toEqual([
        expect.objectContaining({ value: 'toyota', label: 'Toyota' }),
      ]);
    }
  });

  it('несуществующая модель — в «нет в справочнике», выдача не сужается', () => {
    const outcome = run({
      filters: { category: 'transport-cars', brand: 'Toyota', model: 'Superprius 9000' },
    });
    const { query } = ready(outcome);
    expect(attrs(outcome)).toEqual({ brand: 'toyota' });
    expect(query.unresolved).toContain('Superprius 9000');
  });

  it('«Камри» без марки — модель однозначна: Toyota, легковые', () => {
    const outcome = run(
      { filters: { model: 'Камри', price: { max: 1_000_000 } } },
      'Камри до миллиона',
    );
    expect(ready(outcome).plan.query.category).toBe('transport-cars');
    expect(attrs(outcome)).toMatchObject({ brand: 'toyota', model: 'camry' });
  });

  it('«Honda» без категории — и машины, и мотоциклы: уточнение, а не догадка', () => {
    const outcome = run(
      { filters: { brand: 'Honda', price: { max: 300_000 } } },
      'Хонда до 300 тысяч',
    );
    expect(outcome.kind).toBe('clarify');
    if (outcome.kind === 'clarify') {
      expect(outcome.clarification.reason).toBe('ambiguous_category');
      expect(outcome.clarification.options.map((option) => option.value)).toEqual(
        expect.arrayContaining(['transport-cars', 'transport-moto']),
      );
    }
  });

  it('слово-признак решает неоднозначность: «мотоцикл Honda»', () => {
    const outcome = run({ filters: { brand: 'Honda' } }, 'мотоцикл Honda');
    expect(ready(outcome).plan.query.category).toBe('transport-moto');
  });
});

describe('Объявления: телефоны и недвижимость', () => {
  it('«Айфон 15 или новее до 70 тысяч, 256 гигов» — линейка от 15, память от 256', () => {
    const outcome = run(
      {
        filters: {
          category: 'electronics-phones',
          brand: 'Apple',
          model: { min: 'iPhone 15' },
          price: { max: 70_000 },
          memory: { min: 256 },
        },
      },
      'Айфон 15 или новее до 70 тысяч, 256 гигов',
    );
    const values = attrs(outcome);
    expect(values.model).toEqual(
      expect.arrayContaining(['iphone_15', 'iphone_15_pro_max', 'iphone_16', 'iphone_17_pro']),
    );
    expect(values.model).not.toContain('iphone_14');
    expect(values.memory).toEqual(['256', '512', '1024']);
    expect(ready(outcome).plan.query.priceTo).toBe(7_000_000);
  });

  it('«Двушка в Каспийске до 40 тысяч» — квартиры, 2 комнаты, аренда помесячно, Каспийск', () => {
    const outcome = run(
      {
        filters: {
          category: 'realty-flats',
          rooms: 2,
          transactionType: 'rent',
          rentPeriod: 'monthly',
          price: { max: 40_000 },
        },
        location: place('Каспийск'),
      },
      'Двушка в Каспийске до 40 тысяч',
    );
    const { plan, query } = ready(outcome);
    expect(plan.query).toMatchObject({
      category: 'realty-flats',
      transactionType: 'rent',
      rentPeriod: 'monthly',
      priceTo: 4_000_000,
      radiusKm: 25,
    });
    expect(plan.query.latitude).toBe(KASPIYSK.latitude);
    expect(attrs(outcome)).toEqual({ rooms: [2] });
    expect(query.location).toMatchObject({ cityName: 'Каспийск', mode: 'exact' });
  });

  it('«5 комнат» при варианте «4+» — «4 и больше»', () => {
    expect(attrs(run({ filters: { category: 'realty-flats', rooms: 5 } }))).toEqual({ rooms: [4] });
  });

  it('сделка, которой нет в категории, не применяется', () => {
    const { query, plan } = ready(
      run({ filters: { category: 'electronics-phones', transactionType: 'rent' } }),
    );
    expect(plan.query.transactionType).toBeUndefined();
    expect(query.ignored.map((item) => item.field)).toContain('transactionType');
  });

  it('поле, которого нет у категории (комнаты у машин), не применяется', () => {
    const { query } = ready(run({ filters: { category: 'transport-cars', rooms: 2 } }));
    expect(query.ignored.map((item) => item.field)).toContain('rooms');
  });

  it('вариант, которого нет в поле, не применяется', () => {
    const { query } = ready(run({ filters: { category: 'transport-cars', gearbox: 'телепорт' } }));
    expect(query.ignored.map((item) => item.field)).toContain('gearbox');
  });
});

describe('Объявления: условие или пожелание', () => {
  it('«желательно автомат» — пожелание, выдача не сужается', () => {
    const outcome = run({
      filters: { category: 'transport-cars' },
      preferences: { gearbox: 'автомат' },
    });
    const { query } = ready(outcome);
    expect(attrs(outcome).gearbox).toBeUndefined();
    expect(query.preferences).toEqual([
      expect.objectContaining({ field: 'gearbox', display: 'Автомат', applied: false }),
    ]);
  });

  it('«желательно в Каспийске» — весь Дагестан, сначала ближе к Каспийску', () => {
    const outcome = run({
      filters: { category: 'transport-cars' },
      location: place('Каспийск', true),
    });
    const { plan, query } = ready(outcome);
    expect(plan.query.regionWide).toBe(true);
    expect(plan.query.radiusKm).toBeUndefined();
    expect(plan.query.sort).toBe('distance');
    expect(query.preferences).toEqual([
      expect.objectContaining({ field: 'location', applied: true }),
    ]);
  });

  it('«обязательно во Владивостоке» — такого города нет: уточнение', () => {
    const outcome = run({
      filters: { category: 'transport-cars' },
      location: place('Владивосток'),
    });
    expect(outcome.kind).toBe('clarify');
    if (outcome.kind === 'clarify') {
      expect(outcome.clarification.reason).toBe('unknown_city');
      expect(outcome.clarification.options[0]?.label).toBe('Весь Дагестан');
    }
  });

  it('«желательно во Владивостоке» — пожелание не учтено, поиск идёт', () => {
    const { query } = ready(
      run({ filters: { category: 'transport-cars' }, location: place('Владивосток', true) }),
    );
    expect(query.preferences).toEqual([
      expect.objectContaining({ field: 'location', applied: false }),
    ]);
  });
});

describe('Объявления: белый список полей', () => {
  it('ключи — только общие и из полей категорий каталога', () => {
    const keys = listingFilterKeys(seedCatalogue());
    for (const key of ['brand', 'model', 'price', 'gearbox', 'rooms', 'memory', 'mileage'])
      expect(keys.has(key)).toBe(true);
    for (const key of ['sql', 'endpoint', 'userId', 'password']) expect(keys.has(key)).toBe(false);
  });
});
