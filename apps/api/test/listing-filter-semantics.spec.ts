import {
  ATTRIBUTE_DEFINITIONS,
  SEED_LISTING_CATEGORIES,
  bindingsOf,
  findSeedCategory,
  resolveAttributes,
  visibleValues,
  withAttributeValue,
  type ListingAttribute,
  type SeedListingCategory,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { attributeSql, feedWhere, renderSql } from '../src/modules/listings/listing-query.js';

/**
 * Смысл фильтров (аудит фильтров и выдачи): одно значение, несколько
 * альтернатив, диапазон, флажок, зависимый выбор. Внутри одного фильтра —
 * ИЛИ, между фильтрами — И. Скрытое условие в запрос не уходит.
 */

function attributesOf(slug: string): ListingAttribute[] {
  const category = findSeedCategory(slug);
  if (!category) throw new Error(`Нет категории ${slug}`);
  return resolveAttributes(bindingsOf(category)).map((field) => ({ ...field, required: false }));
}
const field = (slug: string, key: string) => attributesOf(slug).find((item) => item.key === key)!;

describe('марка → модель: каждый уровень снимается отдельно', () => {
  const fields = attributesOf('transport-cars');
  const chosen = { brand: 'lada', model: 'granta', fuel: ['petrol'], mileage: { to: 150_000 } };

  it('LADA → Granta → очистить модель: LADA и остальные фильтры остаются', () => {
    expect(withAttributeValue(fields, chosen, 'model', undefined)).toEqual({
      brand: 'lada',
      fuel: ['petrol'],
      mileage: { to: 150_000 },
    });
  });

  it('LADA → Granta → очистить марку: модель снимается вместе с ней, остальное остаётся', () => {
    expect(withAttributeValue(fields, chosen, 'brand', undefined)).toEqual({
      fuel: ['petrol'],
      mileage: { to: 150_000 },
    });
  });

  it('LADA → Granta → сменить марку на Toyota: Granta снимается', () => {
    const next = withAttributeValue(fields, chosen, 'brand', 'toyota');
    expect(next.brand).toBe('toyota');
    expect(next.model).toBeUndefined();
    expect(next.fuel).toEqual(['petrol']);
  });

  it('несколько моделей одной марки — модель A или модель B', () => {
    const next = withAttributeValue(fields, { brand: 'lada' }, 'model', ['granta', 'vesta']);
    const sql = renderSql(attributeSql(fields, next)[1]!);
    expect(sql).toContain("IN ('granta','vesta')");
  });
});

describe('альтернативы — несколько значений, ИЛИ внутри и И между фильтрами', () => {
  it('у автомобиля кузов, КПП, топливо и привод — мультивыбор; марка — одна', () => {
    const kinds = Object.fromEntries(
      attributesOf('transport-cars').map((item) => [item.key, item.filter]),
    );
    expect(kinds).toMatchObject({
      bodyType: 'multiselect',
      gearbox: 'multiselect',
      fuel: 'multiselect',
      drive: 'multiselect',
      owners: 'multiselect',
      brand: 'select',
      steering: 'select',
      year: 'range',
      mileage: 'range',
      engineVolume: 'range',
      customs: 'toggle',
    });
  });

  it('шины: сезон и диаметр — несколько, тип шины/диска — один (от него зависят поля)', () => {
    expect(field('transport-tires', 'season').filter).toBe('multiselect');
    expect(field('transport-tires', 'diameter').filter).toBe('multiselect');
    expect(field('transport-tires', 'tireType').filter).toBe('select');
    expect(field('transport-tires', 'rimEt').filter).toBe('range');
  });

  it('(Седан или Хэтчбек) И (Бензин или Газ) И пробег до 150 000', () => {
    const fields = attributesOf('transport-cars');
    const parts = attributeSql(fields, {
      brand: 'lada',
      bodyType: ['sedan', 'hatchback'],
      fuel: ['petrol', 'gas'],
      mileage: { to: 150_000 },
    }).map(renderSql);
    expect(parts).toHaveLength(4);
    expect(parts.find((part) => part.includes("'bodyType'"))).toContain("IN ('sedan','hatchback')");
    expect(parts.find((part) => part.includes("'fuel'"))).toContain("IN ('petrol','gas')");
    expect(parts.find((part) => part.includes('mileage'))).toContain('<= 150000');
  });

  it('снять одно значение — остальные значения и фильтры остаются', () => {
    const fields = attributesOf('transport-cars');
    const before = { brand: 'lada', bodyType: ['sedan', 'hatchback'], fuel: ['petrol'] };
    const after = withAttributeValue(fields, before, 'bodyType', ['sedan']);
    expect(after).toEqual({ brand: 'lada', bodyType: ['sedan'], fuel: ['petrol'] });
  });

  it('одиночный выбор остаётся только там, где он по смыслу один (163 подкатегории)', () => {
    const single = new Set([
      'brand',
      'model',
      'steering',
      'partGroup',
      'partItem',
      'compatBrand',
      'compatModel',
      'partManufacturer',
      'partOriginality',
      'partAvailability',
      'tireType',
      'speedIndex',
      'condition',
      'goodsType',
      'batteryPolarity',
      'sellerType',
      'experience',
      'education',
      'sex',
    ]);
    const leaves: SeedListingCategory[] = [];
    const walk = (node: SeedListingCategory) =>
      node.children?.length ? node.children.forEach(walk) : leaves.push(node);
    SEED_LISTING_CATEGORIES.forEach(walk);
    const unexpected = new Set<string>();
    for (const leaf of leaves.filter((item) => !item.shortcut)) {
      for (const item of resolveAttributes(bindingsOf(leaf))) {
        if (item.filter === 'select' && !single.has(item.key)) unexpected.add(item.key);
      }
    }
    expect([...unexpected]).toEqual([]);
    expect(leaves.filter((item) => !item.shortcut)).toHaveLength(163);
  });
});

describe('скрытое условие не уходит в запрос', () => {
  it('«Снять» → «Купить»: «можно с животными» снимается из фильтра', () => {
    const fields = attributesOf('realty-flats');
    const values = { rooms: [2], petsAllowed: true, childrenAllowed: true };
    expect(visibleValues(fields, values, { transactionType: 'sale' })).toEqual({ rooms: [2] });
    expect(visibleValues(fields, values, { transactionType: 'rent' })).toEqual(values);
    expect(visibleValues(fields, values)).toEqual(values);
  });

  it('«Диски» → «Шины»: ширина диска снимается, сезон появляется', () => {
    const fields = attributesOf('transport-tires');
    expect(
      visibleValues(fields, { tireType: 'tires', rimWidth: { from: 6 }, season: ['winter'] }),
    ).toEqual({ tireType: 'tires', season: ['winter'] });
  });

  it('сервер: у «Купить» условие аренды не влияет на выдачу', () => {
    const attributes = attributesOf('realty-flats');
    const context = { categoryIds: [], attributes };
    const filter = JSON.stringify({ petsAllowed: true });
    const sale = renderSql(
      feedWhere({ limit: 20, transactionType: 'sale', attributes: filter } as never, context),
    );
    const rent = renderSql(
      feedWhere({ limit: 20, transactionType: 'rent', attributes: filter } as never, context),
    );
    expect(sale).not.toContain("'petsAllowed'");
    expect(rent).toContain("'petsAllowed'");
  });
});

describe('определения полей: вид фильтра у альтернатив', () => {
  it('ремонт, тип дома, занятость, график, тип техники — несколько значений', () => {
    for (const key of [
      'renovation',
      'buildingType',
      'employment',
      'schedule',
      'specialType',
      'furnitureType',
      'gender',
    ]) {
      expect(ATTRIBUTE_DEFINITIONS[key]?.filter, key).toBe('multiselect');
    }
  });
});
