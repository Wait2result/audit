import {
  DICTIONARY_SEEDS,
  bindingsOf,
  findSeedCategory,
  modelValue,
  resolveAttributes,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import {
  ListingCatalogue,
  type DictionaryRecord,
} from '../src/modules/listings/listing-categories.service.js';
import { prepareAttributes } from '../src/modules/listings/listing-attribute-store.js';

/**
 * Справочники и их написания. Покупатель набирает «тойота», а в справочнике
 * Toyota: если написания не попадают в поисковый текст, поиск кириллицей по
 * марке пуст при сотнях объявлений.
 */

function seedEntries(kind: string): DictionaryRecord[] {
  const seed = DICTIONARY_SEEDS.find((item) => item.kind === kind);
  if (!seed) throw new Error(`Нет справочника ${kind}`);
  return seed.entries.map((entry) => ({
    value: entry.value,
    label: entry.label,
    parentValue: entry.parent ?? '',
    aliases: entry.aliases ?? [],
  }));
}

function catalogueWithCars(): ListingCatalogue {
  const category = findSeedCategory('transport-cars');
  if (!category) throw new Error('Нет категории transport-cars');
  const attributes = resolveAttributes(bindingsOf(category));
  return new ListingCatalogue(
    [],
    new Map([['cars', attributes]]),
    new Map([
      ['car_brand', seedEntries('car_brand')],
      ['car_model', seedEntries('car_model')],
    ]),
  );
}

describe('Написания справочников', () => {
  it('у ходовых марок есть русское написание', () => {
    const brands = seedEntries('car_brand');
    for (const [value, alias] of [
      ['toyota', 'тойота'],
      ['bmw', 'бмв'],
      ['lada', 'ваз'],
      ['hyundai', 'хендай'],
    ]) {
      expect(brands.find((entry) => entry.value === value)?.aliases).toContain(alias);
    }
    expect(seedEntries('phone_brand').find((e) => e.value === 'apple')?.aliases).toContain('айфон');
  });

  it('модели получают написание по своему значению', () => {
    const models = seedEntries('car_model');
    const camry = models.find((entry) => entry.value === modelValue('Camry'));
    expect(camry?.parentValue).toBe('toyota');
    expect(camry?.aliases).toContain('камри');
  });

  it('написания уходят в поисковый текст объявления', () => {
    const catalogue = catalogueWithCars();
    const attributes = catalogue.attributesOf('cars');
    const values = { brand: 'toyota', model: 'camry', gearbox: 'auto' };

    const words = catalogue.aliasesFor(attributes, values);
    expect(words).toContain('тойота');
    expect(words).toContain('камри');

    const prepared = prepareAttributes(
      attributes,
      values,
      catalogue.labelsFor(attributes, values),
      words,
    );
    expect(prepared.searchText).toContain('Toyota');
    expect(prepared.searchText).toContain('тойота');
    expect(prepared.searchText).toContain('Автомат');
  });

  it('значение вне справочника написаний не даёт', () => {
    const catalogue = catalogueWithCars();
    const attributes = catalogue.attributesOf('cars');
    expect(catalogue.aliasesFor(attributes, { brand: 'other', model: 'Самоделка' })).toEqual([]);
  });
});
