import {
  LISTING_AUTO_SUSPEND_REPORTS,
  LISTING_LIFETIME_DAYS,
  allowedPriceUnits,
  attributesSchemaFor,
  bindingsOf,
  canAuthorTransition,
  canBump,
  canModeratorTransition,
  createListingSchema,
  createReportSchema,
  defaultPriceUnit,
  describeAttributes,
  draftListingSchema,
  expiresAtFor,
  findSeedCategory,
  hoursUntilBump,
  isExpired,
  mergeAttributeLists,
  resolveAttributes,
  splitAttributes,
  transactionCardLabel,
  updateMyListingSchema,
  validatePrice,
  type ListingAttribute,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { prepareAttributes } from '../src/modules/listings/listing-attribute-store.js';
import { maskPhone } from '../src/modules/listings/listings.service.js';

const CITY = '3f6a1c8e-5d2b-4a91-9f0e-7c3b8d1a2f50';
const CATEGORY = '8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f';

/** Поля категории из исходника — так же, как их собирает сервер из базы. */
function attributesOf(slug: string): readonly ListingAttribute[] {
  const category = findSeedCategory(slug);
  if (!category) throw new Error(`Нет категории ${slug}`);
  return resolveAttributes(bindingsOf(category));
}

function rulesOf(slug: string) {
  const category = findSeedCategory(slug);
  if (!category) throw new Error(`Нет категории ${slug}`);
  return {
    allowedPriceUnits: category.priceUnits ?? ['total'],
    defaultPriceUnit: category.defaultPriceUnit ?? 'total',
  } as const;
}

/** Место из подсказки: Манаскент, Приморская улица, 40. */
const MANASKENT_LOCATION = {
  latitude: 42.744,
  longitude: 47.6998,
  accuracy: 'house',
  address: 'Приморская улица, 40',
  region: 'Республика Дагестан',
  district: 'Карабудахкентский район',
  settlement: 'Манаскент',
  street: 'Приморская улица',
  houseNumber: '40',
};

function baseListing(extra: Record<string, unknown> = {}) {
  return {
    cityId: CITY,
    categoryId: CATEGORY,
    title: 'Toyota Camry, 2021',
    description: 'Один владелец, обслуживалась у дилера',
    contactPhone: '+79280000000',
    location: MANASKENT_LOCATION,
    ...extra,
  };
}

describe('Схема объявления', () => {
  it('умолчания есть только при создании', () => {
    const created = createListingSchema.parse(baseListing());
    expect(created.priceUnit).toBe('total');
    expect(created.allowChat).toBe(true);
    expect(created.allowCalls).toBe(true);
    expect(created.photoIds).toEqual([]);
    // Частный продавец по умолчанию не раскрывает дом
    expect(created.addressVisibility).toBe('approximate');
  });

  it('опубликовать без точки нельзя, черновик — можно', () => {
    expect(createListingSchema.safeParse(baseListing({ location: null })).success).toBe(false);
    expect(draftListingSchema.safeParse({ cityId: CITY, categoryId: CATEGORY }).success).toBe(true);
  });

  it('координаты проверяются строго: NaN, строки и выход за шар — ошибка', () => {
    for (const point of [
      { latitude: Number.NaN, longitude: 47.5 },
      { latitude: 91, longitude: 47.5 },
      { latitude: 42.9, longitude: 181 },
      { latitude: '42.9', longitude: 47.5 },
      { latitude: null, longitude: 47.5 },
    ]) {
      const result = createListingSchema.safeParse(
        baseListing({ location: { ...MANASKENT_LOCATION, ...point } }),
      );
      expect(result.success, JSON.stringify(point)).toBe(false);
    }
  });

  it('точка без адреса — годное место: дом не обязателен', () => {
    const created = createListingSchema.parse(
      baseListing({ location: { latitude: 42.744, longitude: 47.6998, accuracy: 'point' } }),
    );
    expect(created.location.latitude).toBe(42.744);
    expect(created.location.address).toBeUndefined();
  });

  it('правка не может стереть место', () => {
    expect(updateMyListingSchema.safeParse({ location: null }).success).toBe(false);
  });

  it('правка одного поля не сбрасывает соседние', () => {
    // Zod подставляет умолчания даже в .partial(), поэтому умолчания живут
    // только в схеме создания — иначе правка заголовка включила бы звонки
    const parsed = updateMyListingSchema.parse({ title: 'Новый заголовок' });
    expect(parsed).toEqual({ title: 'Новый заголовок' });
    expect('allowCalls' in parsed).toBe(false);
  });

  it('автор не может сменить город и категорию своего объявления', () => {
    const parsed = updateMyListingSchema.parse({ cityId: CITY, categoryId: CATEGORY });
    expect('cityId' in parsed).toBe(false);
    expect('categoryId' in parsed).toBe(false);
  });

  it('слишком короткий заголовок отклоняется', () => {
    expect(createListingSchema.safeParse(baseListing({ title: 'Авто' })).success).toBe(false);
  });

  it('верхняя граница цены не может быть меньше нижней', () => {
    const result = createListingSchema.safeParse(
      baseListing({ price: 500_000, priceMax: 100_000 }),
    );
    expect(result.success).toBe(false);
  });

  it('телефон приводится к единому виду', () => {
    for (const raw of ['8 928 000-00-00', '9280000000', '+7 (928) 000-00-00', '+79280000000']) {
      const created = createListingSchema.parse(baseListing({ contactPhone: raw }));
      expect(created.contactPhone, raw).toBe('+79280000000');
    }
  });

  it('недописанный номер не сохраняется, а объясняется', () => {
    for (const raw of ['950', '8950', '+7950123', '+7 950 123 45']) {
      const result = createListingSchema.safeParse(baseListing({ contactPhone: raw }));
      expect(result.success, raw).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('неполный');
      }
    }
  });

  it('больше десяти фотографий не принимается', () => {
    const photoIds = Array.from({ length: 11 }, () => CATEGORY);
    expect(createListingSchema.safeParse(baseListing({ photoIds })).success).toBe(false);
  });

  it('сделка принимается только из известных: «куплю» не тип объявления', () => {
    expect(createListingSchema.safeParse(baseListing({ transactionType: 'sale' })).success).toBe(
      true,
    );
    expect(createListingSchema.safeParse(baseListing({ transactionType: 'buy' })).success).toBe(
      false,
    );
    expect(
      createListingSchema.safeParse(baseListing({ transactionType: 'rent_wanted' })).success,
    ).toBe(false);
  });

  it('черновику достаточно города и категории', () => {
    const draft = draftListingSchema.parse({ cityId: CITY, categoryId: CATEGORY, title: 'Ав' });
    expect(draft.title).toBe('Ав');
    expect(draftListingSchema.safeParse({ cityId: CITY }).success).toBe(false);
  });
});

describe('Сделка и цена', () => {
  it('квартира: продажа — целиком, аренда надолго — в месяц, посуточно — в сутки', () => {
    const rules = rulesOf('realty-flats');
    expect(allowedPriceUnits(rules, 'sale', null)).toEqual(['total']);
    expect(allowedPriceUnits(rules, 'rent', 'monthly')).toEqual(['per_month']);
    expect(allowedPriceUnits(rules, 'rent', 'daily')).toEqual(['per_day']);
    expect(defaultPriceUnit(rules, 'rent', 'monthly')).toBe('per_month');
  });

  it('«сдам надолго» с ценой целиком отклоняется', () => {
    const error = validatePrice(rulesOf('realty-flats'), {
      transactionType: 'rent',
      rentPeriod: 'monthly',
      price: 50_000_00,
      priceUnit: 'total',
    });
    expect(error).not.toBeNull();
  });

  it('продажа квартиры целиком проходит', () => {
    const error = validatePrice(rulesOf('realty-flats'), {
      transactionType: 'sale',
      rentPeriod: null,
      price: 2_500_000_00,
      priceUnit: 'total',
    });
    expect(error).toBeNull();
  });

  it('у бесплатной отдачи цены не бывает', () => {
    expect(allowedPriceUnits(rulesOf('animals-dogs'), 'free', null)).toEqual([]);
    const error = validatePrice(rulesOf('animals-dogs'), {
      transactionType: 'free',
      rentPeriod: null,
      price: 1000,
      priceUnit: 'total',
    });
    expect(error).not.toBeNull();
  });

  it('вакансия без сделки: зарплата в месяц по умолчанию', () => {
    expect(defaultPriceUnit(rulesOf('job-vacancies'), null, null)).toBe('per_month');
  });

  it('аренда автомобиля — за время, не целиком', () => {
    expect(allowedPriceUnits(rulesOf('transport-cars'), 'rent', null)).toEqual(['per_day']);
  });

  it('подпись сделки в карточке', () => {
    expect(transactionCardLabel('sale', null)).toBe('Продам');
    expect(transactionCardLabel('rent', 'daily')).toBe('Сдам посуточно');
    expect(transactionCardLabel('rent', 'monthly')).toBe('Сдам надолго');
    expect(transactionCardLabel(null, null)).toBeNull();
  });
});

describe('Характеристики по категориям', () => {
  it('обязательное поле набора требуется', () => {
    const schema = attributesSchemaFor(attributesOf('realty-flats'));
    const result = schema.safeParse({ areaTotal: 54.5 });
    expect(result.success).toBe(false);
  });

  it('у квартиры больше нет поля «тип сделки»', () => {
    const keys = attributesOf('realty-flats').map((attribute) => attribute.key);
    expect(keys).not.toContain('dealType');
  });

  it('площадь хранится в десятых квадратного метра', () => {
    const schema = attributesSchemaFor(attributesOf('realty-flats'));
    const parsed = schema.parse({ sellerType: 'owner', rooms: 2, areaTotal: 54.5 });
    // 54,5 м² — это 545: целые числа в фильтрах сравниваются точно
    expect(parsed.areaTotal).toBe(545);
  });

  it('студия — это ноль комнат, а не отдельный признак', () => {
    const schema = attributesSchemaFor(attributesOf('realty-flats'));
    const parsed = schema.parse({ sellerType: 'owner', rooms: 0, areaTotal: 28 });
    expect(parsed.rooms).toBe(0);
  });

  it('число, пришедшее строкой из формы, приводится', () => {
    const schema = attributesSchemaFor(attributesOf('transport-cars'));
    const parsed = schema.parse({ brand: 'toyota', year: '2021', mileage: '65000' });
    expect(parsed.year).toBe(2021);
    expect(parsed.mileage).toBe(65_000);
  });

  it('неизвестный ключ молча отбрасывается', () => {
    // Приложение старой версии может прислать поле, которого уже нет, —
    // отказывать ему в публикации из-за этого неправильно
    const schema = attributesSchemaFor(attributesOf('home-dishes'));
    const parsed = schema.parse({ condition: 'used', colorOfTheYear: 'бирюзовый' });
    expect(parsed).toEqual({ condition: 'used' });
  });

  it('значение вне перечисления — ошибка', () => {
    const schema = attributesSchemaFor(attributesOf('transport-cars'));
    const result = schema.safeParse({ brand: 'toyota', year: 2021, gearbox: 'телепорт' });
    expect(result.success).toBe(false);
  });

  it('значение за границами диапазона — ошибка', () => {
    const schema = attributesSchemaFor(attributesOf('transport-cars'));
    const result = schema.safeParse({ brand: 'toyota', year: 1899 });
    expect(result.success).toBe(false);
  });

  it('марка проверяется по справочнику, модель — своя допустима', () => {
    const lookup = (kind: string, value: string) => kind !== 'car_brand' || value === 'toyota';
    const schema = attributesSchemaFor(attributesOf('transport-cars'), lookup);

    const base = { year: 2021, mileage: 1000 };
    expect(schema.safeParse({ brand: 'toyota', model: 'camry', ...base }).success).toBe(true);
    expect(schema.safeParse({ brand: 'toyota', model: 'своя', ...base }).success).toBe(true);
    expect(schema.safeParse({ brand: 'тойота', ...base }).success).toBe(false);
  });

  it('булево из формы приходит строкой и приводится', () => {
    const schema = attributesSchemaFor(attributesOf('electronics-phones'));
    const parsed = schema.parse({
      brand: 'apple',
      condition: 'used',
      warranty: 'true',
      faceId: false,
    });
    expect(parsed.warranty).toBe(true);
    expect(parsed.faceId).toBe(false);
  });

  it('диапазонные поля уходят в колонки, остальные — в attributes', () => {
    const attributes = attributesOf('transport-cars');
    const values = attributesSchemaFor(attributes).parse({
      brand: 'toyota',
      year: 2021,
      mileage: 65_000,
      gearbox: 'auto',
    });
    const split = splitAttributes(attributes, values);

    expect(split.columns).toEqual({ year: 2021, mileage: 65_000 });
    expect(split.attributes).toEqual({ brand: 'toyota', gearbox: 'auto' });
  });

  it('очищенная колонка набора явно обнуляется — правка не оставляет старый пробег', () => {
    const attributes = attributesOf('transport-cars');
    const split = splitAttributes(attributes, { brand: 'toyota', year: 2021 });
    expect(split.columns.mileage).toBeNull();
  });

  it('значения раскладываются в таблицу значений и поисковый текст', () => {
    const attributes = attributesOf('electronics-phones');
    const values = attributesSchemaFor(attributes).parse({
      brand: 'apple',
      model: 'iphone_15_pro',
      memory: '256',
      battery: 96,
      warranty: true,
      condition: 'used',
    });
    const prepared = prepareAttributes(
      attributes,
      values,
      { apple: 'Apple', iphone_15_pro: 'iPhone 15 Pro' },
      ['Телефоны'],
    );

    expect(prepared.values).toContainEqual({ key: 'battery', numValue: 96, textValue: null });
    expect(prepared.values).toContainEqual({ key: 'warranty', numValue: 1, textValue: null });
    expect(prepared.values).toContainEqual({ key: 'brand', numValue: null, textValue: 'apple' });
    // Состояние — колонка, в таблицу значений не попадает
    expect(prepared.values.find((row) => row.key === 'condition')).toBeUndefined();
    expect(prepared.searchText).toContain('Apple');
    expect(prepared.searchText).toContain('iPhone 15 Pro');
    expect(prepared.searchText).toContain('256 ГБ');
    expect(prepared.searchText).toContain('Телефоны');
  });

  it('строка характеристик собирается человекочитаемо', () => {
    const summary = describeAttributes(attributesOf('realty-flats'), {
      rooms: 2,
      areaTotal: 545,
      floor: 3,
      floorsTotal: 9,
      balcony: false,
    });

    expect(summary).toContain('2 комн.');
    expect(summary).toContain('54,5 м²');
    // Этаж читается только вместе с этажностью
    expect(summary).toContain('3/9 эт.');
    // Выключенный флажок в строку не попадает: «Балкон: нет» — не то, ради
    // чего читают карточку
    expect(summary).not.toContain('Балкон');
  });

  it('студия не превращается в «Студия комн.»', () => {
    const summary = describeAttributes(attributesOf('realty-flats'), { rooms: 0, areaTotal: 280 });
    expect(summary).toContain('Студия');
    expect(summary).not.toContain('Студия комн.');
  });

  it('марка в карточке — подписью из справочника', () => {
    const summary = describeAttributes(
      attributesOf('transport-cars'),
      { brand: 'toyota', model: 'camry', mileage: 68_000 },
      { toyota: 'Toyota', camry: 'Camry' },
    );
    expect(summary).toContain('Toyota');
    expect(summary).toContain('Camry');
    // Разделитель — неразрывный пробел: «68 000» не должно переноситься
    expect(summary).toContain('68 000 км');
  });

  it('год печатается без разделителя тысяч', () => {
    // «2 021» выглядит опечаткой, а не годом выпуска
    const summary = describeAttributes(attributesOf('transport-cars'), {
      brand: 'toyota',
      year: 2021,
    });
    expect(summary).toContain('2021');
    expect(summary).not.toContain('2 021');
  });

  it('наборы поддерева объединяются по ключу поля', () => {
    // Фильтр «2 комнаты» обязан работать и на уровне раздела «Недвижимость»,
    // где лежат квартиры, дома и участки с разными наборами
    const merged = mergeAttributeLists([
      attributesOf('realty-flats'),
      attributesOf('realty-houses'),
      attributesOf('realty-land'),
    ]);
    const keys = merged.map((attribute) => attribute.key);

    expect(keys).toContain('rooms');
    expect(keys).toContain('landArea');
    // Площадь есть в двух наборах, но поле одно
    expect(keys.filter((key) => key === 'areaTotal')).toHaveLength(1);
    // На уровне раздела ничего не обязательно
    expect(merged.every((attribute) => !attribute.required)).toBe(true);
  });
});

describe('Жизненный цикл объявления', () => {
  const published = new Date('2026-09-01T12:00:00.000Z');

  it('срок размещения — ровно 30 дней', () => {
    const expires = expiresAtFor(published);
    const days = (expires.getTime() - published.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(LISTING_LIFETIME_DAYS);
  });

  it('в момент истечения объявление уже считается старым', () => {
    const expires = expiresAtFor(published);
    expect(isExpired(expires, expires)).toBe(true);
    expect(isExpired(expires, new Date(expires.getTime() - 1))).toBe(false);
  });

  it('без срока объявление не истекает', () => {
    expect(isExpired(null, new Date())).toBe(false);
  });

  it('поднимать можно раз в сутки, граница включительно', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(canBump(published, new Date(published.getTime() + day))).toBe(true);
    expect(canBump(published, new Date(published.getTime() + day - 1))).toBe(false);
    expect(hoursUntilBump(published, new Date(published.getTime() + day))).toBe(0);
    expect(hoursUntilBump(published, published)).toBe(24);
  });

  it('автор возвращает своё из архива, но не из снятого модератором', () => {
    expect(canAuthorTransition('archived', 'approved')).toBe(true);
    expect(canAuthorTransition('approved', 'archived')).toBe(true);
    // Снятое модератором возвращает только модератор, иначе снятие
    // ничего не значит
    expect(canAuthorTransition('suspended', 'approved')).toBe(false);
  });

  it('снятое автор отправляет на проверку, а не в ленту', () => {
    expect(canAuthorTransition('suspended', 'pending')).toBe(true);
    expect(canModeratorTransition('pending', 'approved')).toBe(true);
    expect(canModeratorTransition('pending', 'suspended')).toBe(true);
  });

  it('модератор снимает и возвращает', () => {
    expect(canModeratorTransition('approved', 'suspended')).toBe(true);
    expect(canModeratorTransition('suspended', 'approved')).toBe(true);
  });
});

describe('Жалобы', () => {
  it('причина «другое» без пояснения не принимается', () => {
    expect(createReportSchema.safeParse({ reason: 'other' }).success).toBe(false);
    expect(
      createReportSchema.safeParse({ reason: 'other', comment: 'Продаёт чужие фото' }).success,
    ).toBe(true);
  });

  it('обычная причина пояснения не требует', () => {
    expect(createReportSchema.safeParse({ reason: 'fraud' }).success).toBe(true);
  });

  it('автоснятие срабатывает не с первой жалобы', () => {
    // Один обиженный конкурент не должен снимать чужое объявление
    expect(LISTING_AUTO_SUSPEND_REPORTS).toBeGreaterThan(1);
  });
});

describe('Показ телефона', () => {
  it('номер маскируется до узнаваемого', () => {
    expect(maskPhone('+79280001122')).toBe('+7 928 ••• ••-22');
  });

  it('испорченный номер не раскрывается частично', () => {
    expect(maskPhone('123')).toBe('•••');
  });
});
