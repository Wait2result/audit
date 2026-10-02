import {
  ANY_DICTIONARY_PARENT,
  CATEGORY_OPERATION_LABELS,
  DICTIONARY_SEEDS,
  DictionaryKind,
  LISTING_PRICE_UNITS,
  ListingSort,
  allowedPriceUnits,
  attributesSchemaFor,
  bindingsOf,
  createListingSchema,
  defaultPriceUnit,
  findSeedCategory,
  listingListQuerySchema,
  operationLabels,
  rentPeriodChoices,
  rentPeriodOfUnit,
  rentPeriodUnit,
  resolveAttributes,
  scoreListing,
  transactionCardLabel,
  validatePrice,
  type ListingAttribute,
  type ListingRankInput,
  type ListingTransactionType,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import {
  attributeSql,
  feedWhere,
  renderSql,
  textNeedle,
} from '../src/modules/listings/listing-query.js';

/**
 * ТЗ «Объявления», фаза 3: операции и цена — параметры объявления, а не
 * отдельные категории; подписи зависят от категории; единицы цены не
 * смешиваются; фильтры соответствуют смыслу поля.
 */

const CITY = '3f6a1c8e-5d2b-4a91-9f0e-7c3b8d1a2f50';
const CATEGORY = '8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f';

function category(slug: string) {
  const found = findSeedCategory(slug);
  if (!found) throw new Error(`Нет категории ${slug}`);
  return found;
}

function attributesOf(slug: string): readonly ListingAttribute[] {
  return resolveAttributes(bindingsOf(category(slug)));
}

function rulesOf(slug: string) {
  const found = category(slug);
  return {
    allowedPriceUnits: found.priceUnits ?? ['total'],
    defaultPriceUnit: found.defaultPriceUnit ?? 'total',
  } as const;
}

function where(raw: Record<string, unknown>, priceUnit?: (typeof LISTING_PRICE_UNITS)[number]) {
  return renderSql(
    feedWhere(listingListQuerySchema.parse({ cityId: CITY, ...raw }), {
      categoryIds: [],
      attributes: [],
      ...(priceUnit ? { priceUnit } : {}),
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Операции
// ─────────────────────────────────────────────────────────────────────────────

describe('Операции: какие бывают в категории', () => {
  it('недвижимость: продажа и аренда', () => {
    expect(category('realty-flats').transactions).toEqual(['sale', 'rent']);
    expect(category('realty-houses').transactions).toEqual(['sale', 'rent']);
    expect(category('realty-land').transactions).toEqual(['sale', 'rent']);
    expect(category('realty-commercial').transactions).toEqual(['sale', 'rent']);
  });

  it('транспорт, техника, инструмент: продажа и аренда', () => {
    for (const slug of [
      'transport-cars',
      'transport-moto',
      'transport-trucks',
      'transport-special',
      'transport-water',
      'home-tools',
      'business-equipment',
      'hobby-bikes',
      'hobby-outdoor',
      'electronics-photo',
    ]) {
      expect(category(slug).transactions, slug).toEqual(['sale', 'rent']);
    }
  });

  it('категории без аренды — только продажа', () => {
    for (const slug of [
      'electronics-phones',
      'electronics-laptops',
      'home-furniture',
      'personal-clothes',
      'transport-parts',
      'transport-tires',
    ]) {
      expect(category(slug).transactions, slug).toEqual(['sale']);
    }
  });

  it('вещи, работа и услуги — без операции вовсе', () => {
    expect(category('job-vacancies').transactions ?? []).toEqual([]);
    expect(category('services-repair').transactions ?? []).toEqual([]);
  });

  it('«Аренда оборудования» — ярлык на «Оборудование», а не отдельная категория', () => {
    expect(category('business-rent').shortcut).toEqual({
      category: 'business-equipment',
      transactionType: 'rent',
    });
    // как «Посуточная аренда» у квартир: ярлык с готовой сделкой
    expect(category('realty-daily').shortcut).toMatchObject({
      category: 'realty-flats',
      transactionType: 'rent',
      rentPeriod: 'daily',
    });
  });

  it('каждая категория с арендой допускает именно её единицы «за время»', () => {
    for (const slug of ['transport-cars', 'home-tools', 'business-equipment']) {
      const units = allowedPriceUnits(rulesOf(slug), 'rent', null);
      expect(units, slug).toEqual(['per_hour', 'per_day', 'per_week', 'per_month']);
    }
  });
});

describe('Операции: подписи зависят от категории', () => {
  const sale: ListingTransactionType = 'sale';
  const rent: ListingTransactionType = 'rent';

  it('недвижимость: Продам / Сдам → Купить / Снять', () => {
    expect(operationLabels('realty-flats', sale)).toMatchObject({
      create: 'Продам',
      search: 'Купить',
    });
    expect(operationLabels('realty-flats', rent)).toMatchObject({
      create: 'Сдам',
      search: 'Снять',
    });
    // и у раздела целиком, и у любой подкатегории
    expect(operationLabels('realty', rent).search).toBe('Снять');
    expect(operationLabels('realty-land', rent).create).toBe('Сдам');
  });

  it('транспорт и техника: Продам / Сдам в аренду → Купить / Арендовать', () => {
    for (const slug of [
      'transport-cars',
      'transport-special',
      'home-tools',
      'business-equipment',
    ]) {
      expect(operationLabels(slug, sale), slug).toMatchObject({
        create: 'Продам',
        search: 'Купить',
      });
      expect(operationLabels(slug, rent), slug).toMatchObject({
        create: 'Сдам в аренду',
        search: 'Арендовать',
      });
    }
  });

  it('без категории — умолчание, без «Сниму» и «Куплю»', () => {
    expect(operationLabels(null, rent)).toMatchObject({
      create: 'Сдам в аренду',
      search: 'Арендовать',
    });
    const words = JSON.stringify([
      ...(['sale', 'rent', 'free', 'mating'] as const).map((type) => operationLabels(null, type)),
      CATEGORY_OPERATION_LABELS,
    ]).toLowerCase();
    expect(words).not.toContain('куплю');
    expect(words).not.toContain('сниму');
  });

  it('подпись в карточке: у жилья со сроком, у остального «в аренду»', () => {
    expect(transactionCardLabel('rent', 'daily', 'realty-flats')).toBe('Сдам посуточно');
    expect(transactionCardLabel('rent', 'monthly', 'realty-flats')).toBe('Сдам надолго');
    expect(transactionCardLabel('rent', null, 'transport-cars')).toBe('Сдам в аренду');
    expect(transactionCardLabel('rent', 'daily', 'transport-cars')).toBe('Сдам в аренду');
    expect(transactionCardLabel('sale', null, 'transport-cars')).toBe('Продам');
  });
});

describe('Операции: запрещённые значения не принимаются API', () => {
  const base = {
    cityId: CITY,
    categoryId: CATEGORY,
    title: 'Toyota Camry, 2021',
    description: 'Один владелец, обслуживалась у дилера',
    contactPhone: '+79280000000',
    location: {
      latitude: 42.744,
      longitude: 47.6998,
      accuracy: 'house',
      address: 'Приморская улица, 40',
      region: 'Республика Дагестан',
      settlement: 'Манаскент',
    },
  };

  it('«куплю», «сниму» и их синонимы — не операция объявления', () => {
    for (const transactionType of ['buy', 'rent_wanted', 'wanted', 'куплю', 'сниму', 'want_rent']) {
      expect(
        createListingSchema.safeParse({ ...base, transactionType }).success,
        transactionType,
      ).toBe(false);
    }
  });

  it('допустимые операции принимаются', () => {
    for (const transactionType of ['sale', 'rent', 'free', 'mating']) {
      expect(createListingSchema.safeParse({ ...base, transactionType }).success).toBe(true);
    }
  });

  it('единица цены — только из известных', () => {
    expect(createListingSchema.safeParse({ ...base, priceUnit: 'per_week' }).success).toBe(true);
    expect(createListingSchema.safeParse({ ...base, priceUnit: 'per_year' }).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Цена
// ─────────────────────────────────────────────────────────────────────────────

describe('Цена: единицы по операции', () => {
  it('продажа — целиком (₽), без единиц «за время»', () => {
    expect(allowedPriceUnits(rulesOf('realty-flats'), 'sale', null)).toEqual(['total']);
    expect(allowedPriceUnits(rulesOf('transport-cars'), 'sale', null)).toEqual(['total']);
    expect(allowedPriceUnits(rulesOf('home-tools'), 'sale', null)).toEqual(['total']);
  });

  it('жильё: надолго — ₽/мес, посуточно — ₽/сут', () => {
    expect(allowedPriceUnits(rulesOf('realty-flats'), 'rent', 'monthly')).toEqual(['per_month']);
    expect(allowedPriceUnits(rulesOf('realty-flats'), 'rent', 'daily')).toEqual(['per_day']);
  });

  it('техника: час, сутки, неделя, месяц — выбирает продавец', () => {
    expect(allowedPriceUnits(rulesOf('transport-special'), 'rent', null)).toEqual([
      'per_hour',
      'per_day',
      'per_week',
      'per_month',
    ]);
    expect(defaultPriceUnit(rulesOf('transport-special'), 'rent', null)).toBe('per_day');
  });

  it('срок аренды выбирают отдельно только у жилья', () => {
    expect(rentPeriodChoices(rulesOf('realty-flats'))).toEqual(['daily', 'monthly']);
    expect(rentPeriodChoices(rulesOf('transport-cars'))).toEqual([]);
    expect(rentPeriodChoices(rulesOf('home-tools'))).toEqual([]);
    expect(rentPeriodChoices(rulesOf('electronics-phones'))).toEqual([]);
  });

  it('срок по единице и обратно: сутки — посуточно, месяц — надолго', () => {
    expect(rentPeriodOfUnit('per_day')).toBe('daily');
    expect(rentPeriodOfUnit('per_month')).toBe('monthly');
    expect(rentPeriodOfUnit('per_hour')).toBeNull();
    expect(rentPeriodOfUnit('per_week')).toBeNull();
    expect(rentPeriodOfUnit('total')).toBeNull();
    expect(rentPeriodUnit('daily')).toBe('per_day');
    expect(rentPeriodUnit('monthly')).toBe('per_month');
  });
});

describe('Цена: несовместимое отклоняется', () => {
  const validate = (
    slug: string,
    transactionType: ListingTransactionType,
    rentPeriod: 'daily' | 'monthly' | null,
    priceUnit: (typeof LISTING_PRICE_UNITS)[number],
  ) =>
    validatePrice(rulesOf(slug), {
      transactionType,
      rentPeriod,
      price: 5_000_00,
      priceUnit,
    });

  it('продажа ₽ — можно; аренда «целиком» — нельзя', () => {
    expect(validate('transport-cars', 'sale', null, 'total')).toBeNull();
    expect(validate('transport-cars', 'rent', null, 'total')).not.toBeNull();
    expect(validate('realty-flats', 'rent', 'monthly', 'total')).not.toBeNull();
  });

  it('продажа «в сутки» — нельзя', () => {
    expect(validate('transport-cars', 'sale', null, 'per_day')).not.toBeNull();
    expect(validate('realty-flats', 'sale', null, 'per_month')).not.toBeNull();
  });

  it('аренда в сутки / в месяц / в час / в неделю — можно у техники', () => {
    for (const unit of ['per_hour', 'per_day', 'per_week', 'per_month'] as const) {
      expect(validate('transport-special', 'rent', null, unit), unit).toBeNull();
    }
  });

  it('срок и единица не должны противоречить друг другу', () => {
    // «посуточно» с ценой «в месяц»
    expect(validate('realty-flats', 'rent', 'daily', 'per_month')).not.toBeNull();
    expect(validate('realty-flats', 'rent', 'monthly', 'per_day')).not.toBeNull();
    // жильё не сдаётся по часам и неделям
    expect(validate('realty-flats', 'rent', null, 'per_hour')).not.toBeNull();
    expect(validate('realty-flats', 'rent', null, 'per_week')).not.toBeNull();
  });

  it('там, где аренды нет, её единицы не принимаются', () => {
    expect(validate('electronics-phones', 'rent', null, 'per_day')).not.toBeNull();
  });
});

describe('Цена: фильтр и сортировка внутри одной единицы', () => {
  it('«до 5 000» без единицы не смешивает сутки и месяц', () => {
    const daily = where({ priceTo: '500000' }, 'per_day');
    const monthly = where({ priceTo: '500000' }, 'per_month');
    expect(daily).toContain(`l."price_unit" = 'per_day'::"ListingPriceUnit"`);
    expect(monthly).toContain(`l."price_unit" = 'per_month'::"ListingPriceUnit"`);
    expect(daily).not.toContain('per_month');
  });

  it('каждая единица фильтруется своим условием, включая час и неделю', () => {
    for (const unit of LISTING_PRICE_UNITS) {
      expect(where({ priceFrom: '100' }, unit)).toContain(
        `l."price_unit" = '${unit}'::"ListingPriceUnit"`,
      );
    }
  });

  it('явно выбранная единица — условие и без цены', () => {
    expect(where({ priceUnit: 'per_day' }, 'per_day')).toContain(
      `l."price_unit" = 'per_day'::"ListingPriceUnit"`,
    );
    // без явной единицы и без цены выдачу единица не сужает
    expect(where({}, 'per_day')).not.toContain('price_unit');
  });

  it('сортировка по цене держится одной единицы', () => {
    expect(where({ sort: ListingSort.PRICE_DESC }, 'per_week')).toContain(
      `l."price_unit" = 'per_week'`,
    );
  });
});

describe('Ранжирование: цена как число не сравнивается', () => {
  const NOW = new Date('2026-10-02T12:00:00Z');
  const listing = (price: number | null): ListingRankInput => ({
    title: 'Аренда экскаватора',
    bumpedAt: NOW,
    price,
    hasPhoto: true,
    attributesCount: 4,
    hasAddress: true,
    viewsCount: 10,
    phoneViewsCount: 1,
    latitude: null,
    longitude: null,
    cityPoint: null,
    promotedAt: null,
    promotedUntil: null,
  });

  it('5 000 ₽/сут и 50 000 000 ₽ ранжируются одинаково: величина цены не влияет', () => {
    const cheap = scoreListing(listing(500_000), { now: NOW });
    const huge = scoreListing(listing(5_000_000_000), { now: NOW });
    expect(cheap).toBe(huge);
  });

  it('учитывается только то, что цена указана', () => {
    expect(scoreListing(listing(500_000), { now: NOW })).toBeGreaterThan(
      scoreListing(listing(null), { now: NOW }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Фильтры
// ─────────────────────────────────────────────────────────────────────────────

describe('Числовые диапазоны — это диапазоны, а не равенство', () => {
  const run = (slug: string, filter: Record<string, unknown>) =>
    attributeSql(attributesOf(slug), filter).map(renderSql);

  it('battery: от и до', () => {
    const [text] = run('electronics-phones', { battery: { from: 80, to: 95 } });
    expect(text).toContain(`v."key" = 'battery'`);
    expect(text).toContain('v."num_value" >= 80');
    expect(text).toContain('v."num_value" <= 95');
    expect(text).not.toContain('v."num_value" = ');
  });

  it('battery: только «от» и только «до»', () => {
    expect(run('electronics-phones', { battery: { from: 90 } })[0]).toContain('>= 90');
    expect(run('electronics-phones', { battery: { to: 85 } })[0]).toContain('<= 85');
  });

  it('landArea: границы с учётом масштаба поля', () => {
    // «10 соток» хранятся как 100: поле с одним знаком после запятой
    const [text] = run('realty-land', { landArea: { from: 10, to: 20 } });
    expect(text).toContain(`v."key" = 'landArea'`);
    expect(text).toContain('v."num_value" >= 100');
    expect(text).toContain('v."num_value" <= 200');
  });

  it('experienceYears: от и до у резюме', () => {
    const [text] = run('job-resume', { experienceYears: { from: 1, to: 3 } });
    expect(text).toContain(`v."key" = 'experienceYears'`);
    expect(text).toContain('v."num_value" >= 1');
    expect(text).toContain('v."num_value" <= 3');
  });

  it('experienceYears есть и у услуг — тот же диапазон', () => {
    const [text] = run('services-repair', { experienceYears: { from: 5 } });
    expect(text).toContain('v."num_value" >= 5');
  });

  it('пробег и площадь — по колонкам', () => {
    expect(run('transport-cars', { mileage: { from: 10_000, to: 90_000 } })[0]).toBe(
      'l."mileage" >= 10000 AND l."mileage" <= 90000',
    );
    expect(run('realty-flats', { areaTotal: { from: 40 } })[0]).toContain('l."area_total" >= 400');
  });

  it('комнаты: 1, 2, 3 — точно, «4+» — от четырёх', () => {
    expect(run('realty-flats', { rooms: [1] })[0]).toBe('l."rooms" IN (1)');
    expect(run('realty-flats', { rooms: [1, 2, 3] })[0]).toBe('l."rooms" IN (1,2,3)');
    expect(run('realty-flats', { rooms: [4] })[0]).toBe('l."rooms" >= 4');
    expect(run('realty-flats', { rooms: [2, 4] })[0]).toBe('(l."rooms" IN (2) OR l."rooms" >= 4)');
  });
});

describe('Фильтры разведены по смыслу поля', () => {
  const run = (slug: string, filter: Record<string, unknown>) =>
    attributeSql(attributesOf(slug), filter).map(renderSql);

  it('перечисление — точное значение, а не поиск по тексту', () => {
    const [text] = run('transport-cars', { gearbox: 'auto' });
    expect(text).toContain(`v."text_value" = 'auto'`);
    expect(text).not.toContain('ILIKE');
  });

  it('текстовое поле — часть слова без учёта регистра', () => {
    const slug = ['home-tools', 'electronics-laptops', 'personal-clothes', 'hobby-bikes'].find(
      (candidate) => attributesOf(candidate).some((field) => field.key === 'brandName'),
    );
    expect(slug).toBeDefined();
    const [text] = run(slug as string, { brandName: 'bosc' });
    expect(text).toContain(`v."key" = 'brandName'`);
    expect(text).toContain(`v."text_value" ILIKE '%bosc%'`);
  });

  it('текстовые поля фильтруются, VIN — нет', () => {
    const fieldsWith = (key: string) =>
      ['transport-cars', 'transport-parts', 'animals-dogs', 'electronics-laptops']
        .flatMap((slug) => attributesOf(slug))
        .filter((field) => field.key === key);
    for (const key of ['breed', 'cpu', 'gpu', 'producer', 'modelName']) {
      const found = fieldsWith(key);
      if (found.length === 0) continue;
      expect(found[0]?.filter, key).toBe('text');
      expect(found[0]?.filterable, key).toBe(true);
    }
    const vin = attributesOf('transport-cars').find((field) => field.key === 'vin');
    expect(vin?.filter).toBe('none');
    expect(attributeSql(attributesOf('transport-cars'), { vin: 'XTA' })).toEqual([]);
  });

  it('спецсимволы LIKE — обычные буквы, пустое — не условие', () => {
    expect(textNeedle('50%')).toBe('50\\%');
    expect(textNeedle('a_b')).toBe('a\\_b');
    expect(textNeedle('a\\b')).toBe('a\\\\b');
    expect(textNeedle('  cam  ')).toBe('cam');
    expect(textNeedle('   ')).toBeNull();
    expect(textNeedle({})).toBeNull();
    expect(textNeedle('x'.repeat(200))).toHaveLength(60);
  });

  it('значение уходит параметром запроса, а не склеивается с текстом', () => {
    const slug = ['home-tools', 'electronics-laptops', 'hobby-bikes'].find((candidate) =>
      attributesOf(candidate).some((field) => field.key === 'brandName'),
    ) as string;
    const [condition] = attributeSql(attributesOf(slug), { brandName: `x' OR 1=1 --` });
    // В тексте запроса — только заполнитель; значение едет отдельно
    expect(condition?.sql).not.toContain('OR 1=1');
    expect(condition?.values).toContain(`%x' OR 1=1 --%`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Автомобили: марка и модель
// ─────────────────────────────────────────────────────────────────────────────

describe('Автомобили: марка и модель', () => {
  const brands = DICTIONARY_SEEDS.find((seed) => seed.kind === DictionaryKind.CAR_BRAND);
  const models = DICTIONARY_SEEDS.find((seed) => seed.kind === DictionaryKind.CAR_MODEL);

  it('справочники есть и велики', () => {
    expect(brands?.entries.length).toBeGreaterThan(30);
    expect(models?.entries.length).toBeGreaterThan(200);
  });

  it('у каждой модели есть марка, и такая марка существует', () => {
    const known = new Set(brands?.entries.map((entry) => entry.value));
    const orphans = (models?.entries ?? []).filter(
      (entry) => !entry.parent || !known.has(entry.parent),
    );
    expect(orphans.map((entry) => entry.label)).toEqual([]);
  });

  it('модель зависит от марки: поле «Модель» привязано к «Марке»', () => {
    const fields = attributesOf('transport-cars');
    const model = fields.find((field) => field.key === 'model');
    const brand = fields.find((field) => field.key === 'brand');
    expect(brand?.type).toBe('brand');
    expect(model?.type).toBe('model');
    expect(model?.parentKey).toBe('brand');
    expect(brand?.filter).toBe('select');
    expect(model?.filter).toBe('select');
    expect(brand?.showInCard).toBe(true);
    expect(model?.showInCard).toBe(true);
  });

  it('фильтр «марка + модель» — оба условия вместе', () => {
    const texts = attributeSql(attributesOf('transport-cars'), {
      brand: 'chery',
      model: 'tiggo_8',
    }).map(renderSql);
    expect(texts).toHaveLength(2);
    expect(texts.join(' ')).toContain(`v."key" = 'brand'`);
    expect(texts.join(' ')).toContain(`v."text_value" = 'chery'`);
    expect(texts.join(' ')).toContain(`v."key" = 'model'`);
    expect(texts.join(' ')).toContain(`v."text_value" = 'tiggo_8'`);
  });

  it('несколько марок сразу — «или» внутри поля', () => {
    const [text] = attributeSql(attributesOf('transport-cars'), {
      brand: ['toyota', 'chery'],
    }).map(renderSql);
    expect(text).toContain(`v."text_value" IN ('toyota','chery')`);
  });
});

describe('Автомобили: модель должна принадлежать марке', () => {
  // Справочник из исходника — так же, как его видит сервер
  const lookup = (kind: string, value: string, parent?: string) =>
    (DICTIONARY_SEEDS.find((seed) => seed.kind === kind)?.entries ?? []).some(
      (entry) =>
        entry.value === value &&
        (parent === ANY_DICTIONARY_PARENT || (entry.parent ?? '') === (parent ?? '')),
    );
  const schema = attributesSchemaFor(attributesOf('transport-cars'), lookup);
  const models = DICTIONARY_SEEDS.find((seed) => seed.kind === DictionaryKind.CAR_MODEL)?.entries;
  const modelOf = (brand: string) => models?.find((entry) => entry.parent === brand)?.value ?? '';
  const base = { year: 2020, mileage: 50_000 };

  it('модель своей марки проходит', () => {
    const result = schema.safeParse({ ...base, brand: 'toyota', model: modelOf('toyota') });
    expect(result.success).toBe(true);
  });

  it('модель чужой марки — ошибка выбора', () => {
    const result = schema.safeParse({ ...base, brand: 'chery', model: modelOf('toyota') });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['model']);
      expect(result.error.issues[0]?.message).toContain('другой марке');
    }
  });

  it('«своя» модель, которой нет в справочнике, допустима', () => {
    const result = schema.safeParse({ ...base, brand: 'toyota', model: 'camry_hybrid_xl_special' });
    expect(result.success).toBe(true);
  });

  it('модель без марки не проверяется (марка обязательна отдельно)', () => {
    expect(schema.safeParse({ ...base, model: modelOf('toyota') }).success).toBe(false);
  });

  it('марки вне справочника нет', () => {
    expect(schema.safeParse({ ...base, brand: 'несуществующая' }).success).toBe(false);
  });
});

describe('Создание: единица цены необязательна', () => {
  it('без единицы категория подставит свою', () => {
    const parsed = createListingSchema.safeParse({
      cityId: CITY,
      categoryId: CATEGORY,
      title: 'Резюме повара',
      description: 'Опыт десять лет, готовлю кавказскую кухню',
      contactPhone: '+79280000000',
      location: { latitude: 42.744, longitude: 47.6998, accuracy: 'point' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.priceUnit).toBeUndefined();
  });
});
