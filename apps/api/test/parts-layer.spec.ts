import {
  PART_NUMBER_KIND_LABELS,
  attributesSchemaFor,
  bindingsOf,
  describeCardFacts,
  findSeedCategory,
  listingListQuerySchema,
  listingPartInputSchema,
  looksLikePartNumber,
  partNumberKey,
  resolveAttributes,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import {
  attributeSql,
  feedWhere,
  partNumberSql,
  renderSql,
  searchSql,
} from '../src/modules/listings/listing-query.js';
import {
  compatibilityText,
  partCardFacts,
  partDto,
  preparePart,
} from '../src/modules/listings/listing-parts.js';
import { seedCatalogue } from './helpers/smart-search-fixtures.js';

/**
 * Слой запчасти: проверка и подготовка совместимости и номеров, SQL
 * фильтров, карточка. Хранение и выдачу через базу проверяет e2e
 * (test/e2e/listing-parts.mjs).
 */

const catalogue = seedCatalogue();
const attributesOf = (slug: string) => resolveAttributes(bindingsOf(findSeedCategory(slug)!));

describe('Номера деталей', () => {
  it('ключ номера: регистр, дефисы, пробелы и кириллические двойники не мешают', () => {
    expect(partNumberKey('90915-YZZD1')).toBe('90915YZZD1');
    expect(partNumberKey('90915 yzzd1')).toBe('90915YZZD1');
    expect(partNumberKey('04465.33450')).toBe('0446533450');
    // русская «С» и «Т» вместо латинских
    expect(partNumberKey('СТ-1234')).toBe('CT1234');
    expect(partNumberKey('')).toBe('');
  });

  it.each([
    ['90915-YZZD1', true],
    ['04465-33450', true],
    ['MR-123456', true],
    ['1K0-615-301-AA', true],
    ['ncp165', false],
    ['iphone13', false],
    ['12345', false],
    ['2015-2018', false],
    ['abc-def', false],
    ['а-б', false],
  ])('«%s» — номер детали: %s', (text, expected) => {
    expect(looksLikePartNumber(text)).toBe(expected);
  });

  it('виды номера: OEM, каталожный, производителя, артикул', () => {
    expect(Object.keys(PART_NUMBER_KIND_LABELS)).toEqual([
      'oem',
      'catalog',
      'manufacturer',
      'article',
    ]);
  });
});

describe('Схема слоя запчасти', () => {
  it('пустое — допустимо; номера и совместимость нормализуются', () => {
    expect(listingPartInputSchema.parse({})).toEqual({ numbers: [], compatibility: [] });
    const parsed = listingPartInputSchema.parse({
      numbers: [{ value: ' 90915-YZZD1 ' }],
      compatibility: [{ brand: 'toyota', model: 'succeed', chassis: ' ncp165 ', yearFrom: 2015 }],
    });
    expect(parsed.numbers[0]).toEqual({ kind: 'oem', value: '90915-YZZD1' });
    expect(parsed.compatibility[0]?.chassis).toBe('ncp165');
  });

  it('строка совместимости без марки, модели, кузова и двигателя — отказ', () => {
    expect(listingPartInputSchema.safeParse({ compatibility: [{ yearFrom: 2015 }] }).success).toBe(
      false,
    );
    expect(
      listingPartInputSchema.safeParse({
        compatibility: [{ brand: 'toyota', yearFrom: 2018, yearTo: 2015 }],
      }).success,
    ).toBe(false);
  });

  it('лишние поля и слишком длинные списки — отказ', () => {
    expect(listingPartInputSchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(
      listingPartInputSchema.safeParse({
        compatibility: Array.from({ length: 31 }, () => ({ brand: 'toyota' })),
      }).success,
    ).toBe(false);
    expect(listingPartInputSchema.safeParse({ numbers: [{ value: 'ab' }] }).success).toBe(false);
  });

  it('совместимость и номер — не атрибуты: в проверке атрибутов их нет', () => {
    const schema = attributesSchemaFor(attributesOf('transport-parts'));
    const parsed = schema.parse({
      partGroup: 'steering',
      partItem: 'steering_rack',
      compatBrand: 'toyota',
      partNumber: '90915-YZZD1',
    }) as Record<string, unknown>;
    expect(parsed.partGroup).toBe('steering');
    expect(parsed.compatBrand).toBeUndefined();
    expect(parsed.partNumber).toBeUndefined();
  });
});

describe('Подготовка слоя запчасти', () => {
  const input = (value: unknown) => listingPartInputSchema.parse(value);

  it('марка и модель — из справочников самой техники: «Тойота» → toyota, «суксид» → Succeed', () => {
    const part = preparePart(
      catalogue,
      'transport-parts',
      input({
        numbers: [{ value: '90915-YZZD1' }, { value: '90915 yzzd1', kind: 'catalog' }],
        compatibility: [
          { brand: 'Тойота', model: 'суксид', chassis: 'ncp165', yearFrom: 2015, yearTo: 2018 },
          { brand: 'Toyota', model: 'Probox' },
        ],
      }),
    )!;
    expect(part.equipmentType).toBe('passenger_car');
    expect(part.compatibility[0]).toMatchObject({
      brand: 'toyota',
      brandLabel: 'Toyota',
      model: 'succeed',
      modelLabel: 'Succeed',
      chassis: 'NCP165',
      yearFrom: 2015,
      yearTo: 2018,
      sortOrder: 0,
    });
    expect(part.compatibility[1]).toMatchObject({ model: 'probox', sortOrder: 1 });
    // один и тот же номер — один раз
    expect(part.numbers).toHaveLength(1);
    expect(part.numbers[0]).toMatchObject({ number: '90915-YZZD1', numberKey: '90915YZZD1' });
  });

  it('несуществующая марка — отказ; неизвестная модель известной марки — текстом', () => {
    expect(() =>
      preparePart(catalogue, 'transport-parts', input({ compatibility: [{ brand: 'Тойотаа' }] })),
    ).toThrow(/нет в справочнике/);
    const part = preparePart(
      catalogue,
      'transport-parts',
      input({ compatibility: [{ brand: 'toyota', model: 'Редкая Модель 2000' }] }),
    )!;
    expect(part.compatibility[0]).toMatchObject({
      brand: 'toyota',
      modelLabel: 'Редкая Модель 2000',
    });
  });

  it('телефон: марка и модель — из справочника телефонов', () => {
    const part = preparePart(
      catalogue,
      'electronics-phone-parts',
      input({ compatibility: [{ brand: 'apple', model: 'iPhone 13' }] }),
    )!;
    expect(part.equipmentType).toBe('phone');
    expect(part.compatibility[0]).toMatchObject({ brand: 'apple', model: 'iphone_13' });
  });

  it('телевизор: справочника моделей нет — модель текстом человека', () => {
    const part = preparePart(
      catalogue,
      'electronics-tv-parts',
      input({ compatibility: [{ brand: 'LG', model: '43UM7100' }] }),
    )!;
    expect(part.compatibility[0]).toMatchObject({ brand: 'lg', modelLabel: '43UM7100' });
  });

  it('не запчасть: пустой слой — нет слоя, непустой — отказ', () => {
    expect(preparePart(catalogue, 'transport-cars', undefined)).toBeNull();
    expect(preparePart(catalogue, 'transport-cars', input({}))).toBeNull();
    expect(() =>
      preparePart(catalogue, 'transport-cars', input({ numbers: [{ value: '90915-YZZD1' }] })),
    ).toThrow(/только у запчастей/);
  });

  it('запчасть без слоя — пустые списки, а не ошибка', () => {
    expect(preparePart(catalogue, 'transport-parts', undefined)).toEqual({
      equipmentType: 'passenger_car',
      compatibility: [],
      numbers: [],
    });
  });
});

describe('Ответ и карточка', () => {
  const rows = [
    {
      brand: 'toyota',
      brandLabel: 'Toyota',
      model: 'succeed',
      modelLabel: 'Succeed',
      chassis: 'NCP165',
      yearFrom: 2015,
      yearTo: 2018,
      engine: null,
      modification: null,
    },
    {
      brand: 'toyota',
      brandLabel: 'Toyota',
      model: 'probox',
      modelLabel: 'Probox',
      chassis: null,
      yearFrom: null,
      yearTo: null,
      engine: null,
      modification: null,
    },
  ];

  it('строка совместимости: марка, модель, кузов, годы', () => {
    expect(compatibilityText(rows[0]!)).toBe('Toyota Succeed NCP165 2015–2018');
    expect(compatibilityText(rows[1]!)).toBe('Toyota Probox');
  });

  it('карточка: к чему подходит (и сколько ещё), первый номер', () => {
    const facts = partCardFacts(rows, [{ kind: 'oem', number: '90915-YZZD1' }]);
    expect(facts.compatibility).toBe('Подходит: Toyota Succeed NCP165 2015–2018 +1');
    expect(facts.number).toBe('OEM 90915-YZZD1');
    expect(partCardFacts([], [])).toEqual({ compatibility: null, number: null });
  });

  it('DTO: только у запчастей', () => {
    expect(partDto('transport-cars', rows, [])).toBeNull();
    expect(partDto('transport-parts', rows, [{ kind: 'article', number: 'A-1' }])).toMatchObject({
      equipmentType: 'passenger_car',
      numbers: [{ kind: 'article', value: 'A-1' }],
    });
  });
});

describe('SQL фильтров слоя запчасти', () => {
  const attrs = attributesOf('transport-parts');

  it('марка, модель и год — одно условие по ОДНОЙ строке совместимости', () => {
    const [condition] = attributeSql(attrs, {
      compatBrand: 'toyota',
      compatModel: 'succeed',
      compatYear: 2016,
    });
    const text = renderSql(condition!);
    expect(text).toContain('FROM "listing_compatibility" k');
    expect(text).toMatch(/k\."brand" IN \('toyota'\) AND k\."model" IN \('succeed'\)/);
    expect(text).toContain('k."year_to" IS NULL OR k."year_to" >= 2016');
    expect(text).toContain('k."year_from" IS NULL OR k."year_from" <= 2016');
    // одно EXISTS, а не по одному на поле
    expect(text.match(/EXISTS/g)).toHaveLength(1);
  });

  it('кузов и двигатель — по началу, регистр не важен', () => {
    const [condition] = attributeSql(attrs, { compatChassis: 'ncp', compatEngine: '1nz' });
    const text = renderSql(condition!);
    expect(text).toContain(`k."chassis" ILIKE 'ncp%'`);
    expect(text).toContain(`k."engine" ILIKE '1nz%'`);
  });

  it('номер: по ключу, точно или по началу', () => {
    const [condition] = attributeSql(attrs, { partNumber: '90915-yzzd1' });
    expect(renderSql(condition!)).toContain(`n."number_key" LIKE '90915YZZD1%'`);
    expect(partNumberSql('ab')).toBeNull();
    expect(partNumberSql('')).toBeNull();
  });

  it('у телефонов нет полей кузова и двигателя — фильтр по ним игнорируется', () => {
    const phone = attributesOf('electronics-phone-parts');
    expect(attributeSql(phone, { compatChassis: 'ncp165', compatEngine: '1nz' })).toEqual([]);
    expect(attributeSql(phone, { compatBrand: 'apple' })).toHaveLength(1);
  });

  it('спецсимволы LIKE в кузове не превращаются в «всё»', () => {
    const [condition] = attributeSql(attrs, { compatChassis: '%' });
    expect(renderSql(condition!)).toContain(`ILIKE '\\%%'`);
  });

  it('категория детали и деталь — обычные атрибуты через таблицу значений', () => {
    const conditions = attributeSql(attrs, { partGroup: 'steering', partItem: 'steering_rack' });
    expect(conditions).toHaveLength(2);
    expect(renderSql(conditions[1]!)).toContain(`v."key" = 'partItem'`);
  });

  it('в ленте: фильтр попадает в запрос вместе с городом и статусом', () => {
    const sqlText = renderSql(
      feedWhere(
        listingListQuerySchema.parse({
          cityId: '3f6a1c8e-5d2b-4a91-9f0e-7c3b8d1a2f50',
          attributes: JSON.stringify({ compatBrand: 'toyota', partNumber: '90915' }),
        }),
        { categoryIds: [], attributes: attrs },
      ),
    );
    expect(sqlText).toContain('listing_compatibility');
    expect(sqlText).toContain('listing_part_numbers');
  });

  it('поиск по строке-номеру ищет и по номерам запчастей; по словам — нет', () => {
    expect(renderSql(searchSql('90915-YZZD1')!)).toContain('listing_part_numbers');
    expect(renderSql(searchSql('90915yzzd1')!)).toContain('listing_part_numbers');
    expect(renderSql(searchSql('рулевая рейка')!)).not.toContain('listing_part_numbers');
    expect(renderSql(searchSql('камри 2015')!)).not.toContain('listing_part_numbers');
  });
});

describe('Несколько совместимостей одной детали', () => {
  const input = (value: unknown) => listingPartInputSchema.parse(value);
  // Одна рейка, три применимости — пример из ТЗ
  const rack = () =>
    preparePart(
      catalogue,
      'transport-parts',
      input({
        compatibility: [
          {
            brand: 'toyota',
            model: 'succeed',
            chassis: 'NCP165',
            yearFrom: 2015,
            yearTo: 2020,
            engine: '1NZ-FE',
          },
          {
            brand: 'toyota',
            model: 'probox',
            chassis: 'NCP160',
            yearFrom: 2014,
            yearTo: 2020,
            engine: '1NZ-FE',
          },
          { brand: 'toyota', model: 'probox', chassis: 'NCP165', yearFrom: 2015, yearTo: 2020 },
        ],
      }),
    )!;

  it('одна деталь — три строки, каждая своя комбинация, без перемножения', () => {
    const part = rack();
    expect(part.compatibility).toHaveLength(3);
    expect(
      part.compatibility.map(
        (row) => `${row.model}/${row.chassis}/${row.yearFrom}-${row.yearTo}/${row.engine}`,
      ),
    ).toEqual([
      'succeed/NCP165/2015-2020/1NZ-FE',
      'probox/NCP160/2014-2020/1NZ-FE',
      'probox/NCP165/2015-2020/null',
    ]);
  });

  it('модификация хранится в строке и фильтруется в том же EXISTS', () => {
    const part = preparePart(
      catalogue,
      'transport-parts',
      input({ compatibility: [{ brand: 'toyota', model: 'succeed', modification: '1.5 4WD' }] }),
    )!;
    expect(part.compatibility[0]).toMatchObject({ modification: '1.5 4WD' });
    const [condition] = attributeSql(attributesOf('transport-parts'), {
      compatModel: 'succeed',
      compatChassis: 'NCP165',
      compatModification: '4wd',
    });
    const text = renderSql(condition!);
    expect(text).toContain(`k."modification" ILIKE '%4wd%'`);
    expect(text).toMatch(/k\."model" IN \('succeed'\) AND k\."chassis" ILIKE 'NCP165%'/);
    expect(text.match(/EXISTS/g)).toHaveLength(1);
  });

  it('у телевизора модификации в фильтре нет — условие не строится', () => {
    expect(attributeSql(attributesOf('electronics-tv-parts'), { compatModification: 'x' })).toEqual(
      [],
    );
  });
});

describe('Производитель, тип и состояние', () => {
  const attrs = attributesOf('transport-parts');

  it('три отдельных фильтра — три условия по таблице значений', () => {
    const conditions = attributeSql(attrs, {
      partManufacturer: 'kyb',
      partOriginality: 'analog',
      partCondition: 'restored',
    });
    expect(conditions).toHaveLength(3);
    const text = conditions.map((condition) => renderSql(condition)).join(' ');
    expect(text).toContain(`v."key" = 'partManufacturer'`);
    expect(text).toContain(`v."key" = 'partOriginality'`);
    expect(text).toContain(`v."key" = 'partCondition'`);
  });

  it.each([
    ['original', 'new'],
    ['original', 'used'],
    ['original', 'restored'],
    ['analog', 'new'],
    ['analog', 'used'],
    ['analog', 'restored'],
  ])('допустима комбинация %s + %s', (originality, condition) => {
    const parsed = attributesSchemaFor(attrs).safeParse({
      partGroup: 'steering',
      partOriginality: originality,
      partCondition: condition,
      partManufacturer: 'kyb',
    });
    expect(parsed.success).toBe(true);
  });

  it('«Контрактная» и «На запчасти» больше не значения состояния', () => {
    for (const value of ['contract', 'for_parts', 'for_restoration']) {
      expect(
        attributesSchemaFor(attrs).safeParse({ partGroup: 'steering', partCondition: value })
          .success,
      ).toBe(false);
    }
  });

  it('производитель — только из справочника: выдуманный не принимается', () => {
    const lookup = catalogue.lookup;
    expect(lookup('part_manufacturer', 'kyb')).toBe(true);
    expect(lookup('part_manufacturer', 'romashka')).toBe(false);
  });

  it('карточка: деталь, производитель и «Б/У оригинал» одной строкой', () => {
    const values = {
      partGroup: 'steering',
      partItem: 'steering_rack',
      partManufacturer: 'kyb',
      partCondition: 'used',
      partOriginality: 'original',
    };
    const labels = catalogue.labelsFor(attrs, values);
    expect(describeCardFacts('transport-parts', attrs, values, labels)).toBe(
      'Рулевая рейка · KYB · Б/У оригинал',
    );
    expect(
      describeCardFacts(
        'transport-parts',
        attrs,
        { ...values, partCondition: 'new', partOriginality: 'analog' },
        labels,
      ),
    ).toBe('Рулевая рейка · KYB · Новый аналог');
    const { partCondition: _drop, ...noCondition } = values;
    expect(describeCardFacts('transport-parts', attrs, noCondition, labels)).toBe(
      'Рулевая рейка · KYB · Оригинал',
    );
  });
});
