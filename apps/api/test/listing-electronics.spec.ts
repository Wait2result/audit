import {
  DICTIONARY_SEEDS,
  attributesSchemaFor,
  bindingsOf,
  findSeedCategory,
  isAttributeVisible,
  resolveAttributes,
  type ListingAttribute,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

/**
 * Электроника (фаза 5): модели телефонов из справочника, Face ID только у
 * Apple, у каждой техники свой набор.
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

describe('Наборы полей электроники', () => {
  it('телефон: бренд и состояние обязательны, модель — из справочника', () => {
    expect(requiredOf('electronics-phones')).toEqual(['brand', 'condition']);
    const model = attributesOf('electronics-phones').find((a) => a.key === 'model');
    expect(model?.dictionary).toBe('phone_model');
    expect(model?.parentKey).toBe('brand');
  });

  it('справочник моделей: у iPhone 15 есть Face ID, у SE — нет', () => {
    const seed = DICTIONARY_SEEDS.find((item) => item.kind === 'phone_model');
    const iphone15 = seed?.entries.find((entry) => entry.label === 'iPhone 15');
    const se = seed?.entries.find((entry) => entry.label === 'iPhone SE (2022)');
    expect(iphone15?.parent).toBe('apple');
    expect(iphone15?.meta).toEqual({ faceId: true });
    expect(se?.meta).toEqual({ faceId: false });
    expect(seed?.entries.some((entry) => entry.parent === 'samsung')).toBe(true);
  });

  it('Face ID показывается только у Apple', () => {
    const faceId = attributesOf('electronics-phones').find((a) => a.key === 'faceId');
    if (!faceId) throw new Error('Нет поля faceId');
    expect(isAttributeVisible(faceId, { brand: 'apple' })).toBe(true);
    expect(isAttributeVisible(faceId, { brand: 'samsung' })).toBe(false);
    expect(isAttributeVisible(faceId, {})).toBe(false);
  });

  it('скрытое значение не сохраняется', () => {
    const schema = attributesSchemaFor(attributesOf('electronics-phones'), () => true);
    const parsed = schema.parse({ brand: 'samsung', condition: 'used', faceId: true });
    expect(parsed).not.toHaveProperty('faceId');
    const apple = schema.parse({ brand: 'apple', condition: 'used', faceId: true });
    expect(apple.faceId).toBe(true);
  });

  it('ноутбук и компьютер: накопитель, видеокарта, система', () => {
    expect(keysOf('electronics-laptops')).toEqual(
      expect.arrayContaining(['screenSize', 'cpu', 'ram', 'gpu', 'storageSize', 'os']),
    );
    expect(keysOf('electronics-computers')).toEqual(expect.arrayContaining(['gpu', 'os']));
    expect(keysOf('electronics-computers')).not.toContain('screenSize');
  });

  it('телевизор: диагональ обязательна, есть разрешение и Smart TV', () => {
    expect(requiredOf('electronics-tv')).toEqual(['screenSize', 'condition']);
    expect(keysOf('electronics-tv')).toEqual(expect.arrayContaining(['resolution', 'smartTv']));
  });

  it('у каждой техники свой тип первым обязательным полем', () => {
    // Комплектующие — запчасти для компьютера: первым обязательным полем стала категория детали
    expect(requiredOf('electronics-components')[0]).toBe('partGroup');
    expect(requiredOf('electronics-photo')[0]).toBe('photoType');
    expect(requiredOf('electronics-console')[0]).toBe('consoleType');
    expect(requiredOf('electronics-audio')[0]).toBe('audioType');
    expect(requiredOf('electronics-accessories')[0]).toBe('accessoryType');
    expect(requiredOf('home-appliances')[0]).toBe('applianceType');
  });

  it('диагональ хранится в десятых дюйма', () => {
    const schema = attributesSchemaFor(attributesOf('electronics-tv'));
    expect(schema.parse({ screenSize: 55, condition: 'new' }).screenSize).toBe(550);
    // Запятую в дробном приводит к точке форма; серверу приходит число
    expect(schema.parse({ screenSize: '10.9', condition: 'new' }).screenSize).toBe(109);
  });
});
