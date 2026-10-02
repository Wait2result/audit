import {
  DICTIONARY_SEEDS,
  attributesSchemaFor,
  bindingsOf,
  describeAttributes,
  findSeedCategory,
  resolveAttributes,
  type ListingAttribute,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

/**
 * Транспорт (фаза 4): у мотоциклов и грузовиков свои справочники марок,
 * у запчастей — марка и модель машины, у шин — диаметр и сезон.
 */

function attributesOf(slug: string): readonly ListingAttribute[] {
  const category = findSeedCategory(slug);
  if (!category) throw new Error(`Нет категории ${slug}`);
  return resolveAttributes(bindingsOf(category));
}

function keysOf(slug: string): string[] {
  return attributesOf(slug).map((attribute) => attribute.key);
}

function requiredOf(slug: string): string[] {
  return attributesOf(slug)
    .filter((attribute) => attribute.required)
    .map((attribute) => attribute.key);
}

describe('Наборы полей транспорта', () => {
  it('автомобиль: марка, год и пробег обязательны; есть объём, владельцы, руль', () => {
    expect(requiredOf('transport-cars')).toEqual(['brand', 'year', 'mileage']);
    expect(keysOf('transport-cars')).toEqual(
      expect.arrayContaining(['engineVolume', 'power', 'owners', 'steering', 'color', 'vin']),
    );
  });

  it('VIN не уходит в поиск', () => {
    const vin = attributesOf('transport-cars').find((a) => a.key === 'vin');
    expect(vin?.searchable).toBe(false);
    expect(vin?.filterable).toBe(false);
  });

  it('мотоцикл и грузовик берут марку из своих справочников', () => {
    expect(attributesOf('transport-moto').find((a) => a.key === 'brand')?.dictionary).toBe(
      'moto_brand',
    );
    expect(attributesOf('transport-trucks').find((a) => a.key === 'brand')?.dictionary).toBe(
      'truck_brand',
    );
    const kinds = DICTIONARY_SEEDS.map((seed) => seed.kind);
    expect(kinds).toEqual(expect.arrayContaining(['moto_brand', 'truck_brand']));
  });

  it('грузовик: тип обязателен, кузов легковушки не примешивается', () => {
    expect(requiredOf('transport-trucks')).toEqual(['brand', 'truckType', 'year']);
    expect(keysOf('transport-trucks')).not.toContain('bodyType');
    expect(keysOf('transport-trucks')).toContain('loadCapacity');
  });

  it('спецтехника и водный транспорт: тип и наработка', () => {
    expect(requiredOf('transport-special')).toEqual(['specialType']);
    expect(keysOf('transport-special')).toContain('hours');
    expect(requiredOf('transport-water')).toEqual(['waterType']);
    expect(keysOf('transport-water')).toEqual(expect.arrayContaining(['length', 'hullMaterial']));
  });

  it('запчасть привязана к марке и модели машины', () => {
    const attributes = attributesOf('transport-parts');
    expect(attributes.find((a) => a.key === 'partType')?.required).toBe(true);
    expect(attributes.find((a) => a.key === 'brand')?.dictionary).toBe('car_brand');
    expect(attributes.find((a) => a.key === 'brand')?.label).toBe('Марка авто');
    expect(attributes.find((a) => a.key === 'model')?.parentKey).toBe('brand');
  });

  it('шины: что продаётся и диаметр обязательны', () => {
    expect(requiredOf('transport-tires')).toEqual(['tireType', 'diameter']);
    expect(keysOf('transport-tires')).toEqual(
      expect.arrayContaining(['season', 'tireWidth', 'tireProfile', 'quantity']),
    );
  });

  it('объём двигателя хранится в десятых литра', () => {
    const schema = attributesSchemaFor(attributesOf('transport-cars'), () => true);
    const parsed = schema.parse({
      brand: 'toyota',
      year: 2019,
      mileage: 68_000,
      engineVolume: 2.5,
      color: 'black',
    });
    expect(parsed.engineVolume).toBe(25);
    expect(
      schema.safeParse({ brand: 'toyota', year: 2019, mileage: 1, color: 'чёрный' }).success,
    ).toBe(false);
  });

  it('строка карточки автомобиля: год, пробег, объём, коробка', () => {
    const text = describeAttributes(
      attributesOf('transport-cars'),
      {
        brand: 'toyota',
        model: 'camry',
        year: 2019,
        mileage: 68_000,
        engineVolume: 25,
        gearbox: 'auto',
      },
      { toyota: 'Toyota', camry: 'Camry' },
    );
    expect(text).toBe('Toyota · Camry · 2019 · 68 000 км · 2,5 л · Автомат');
  });
});
