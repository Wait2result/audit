import {
  attributesSchemaFor,
  attributeValueLabel,
  bindingsOf,
  fieldsForValues,
  findSeedCategory,
  isAttributeVisible,
  manufacturerFitsOriginality,
  partMakerReset,
  resolveAttributes,
  withAttributeValue,
  type ListingAttribute,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { renderSql } from '../src/modules/listings/listing-query.js';
import { attributeSql } from '../src/modules/listings/listing-query.js';

/**
 * Правила объявлений из аудита: условия аренды только у аренды (п. 36),
 * санузел «В доме + На улице» (п. 37), производитель детали зависит от
 * оригинальности (п. 29).
 */

function attributesOf(slug: string): readonly ListingAttribute[] {
  const category = findSeedCategory(slug);
  if (!category) throw new Error(`Нет категории ${slug}`);
  // Обязательность здесь ни при чём: проверяются только правила полей
  return resolveAttributes(bindingsOf(category)).map((field) => ({ ...field, required: false }));
}

const OWNER = { sellerType: 'owner' } as const;
const RENT_TERMS = ['petsAllowed', 'childrenAllowed', 'utilitiesIncluded'];

describe('условия аренды — только у аренды', () => {
  for (const slug of ['realty-flats', 'realty-rooms', 'realty-houses']) {
    const fields = attributesOf(slug);

    it(`${slug}: у продажи полей «с животными / с детьми» нет`, () => {
      for (const key of RENT_TERMS) {
        const field = fields.find((item) => item.key === key)!;
        expect(isAttributeVisible(field, {}, { transactionType: 'sale' }), key).toBe(false);
        expect(isAttributeVisible(field, {}, { transactionType: 'rent' }), key).toBe(true);
      }
    });

    it(`${slug}: при продаже значения не сохраняются, при аренде — сохраняются`, () => {
      const raw = { ...OWNER, rooms: 2, areaTotal: 40, petsAllowed: true, childrenAllowed: true };
      const sale = attributesSchemaFor(fields, undefined, { transactionType: 'sale' }).parse(raw);
      expect(sale.petsAllowed).toBeUndefined();
      expect(sale.childrenAllowed).toBeUndefined();
      const rent = attributesSchemaFor(fields, undefined, { transactionType: 'rent' }).parse(raw);
      expect(rent.petsAllowed).toBe(true);
      expect(rent.childrenAllowed).toBe(true);
    });
  }

  it('фильтры без выбранной сделки показывают условия аренды', () => {
    const field = attributesOf('realty-flats').find((item) => item.key === 'petsAllowed')!;
    expect(isAttributeVisible(field, {})).toBe(true);
  });
});

describe('санузел дома: «В доме» и «На улице» сразу', () => {
  const fields = attributesOf('realty-houses');
  const bathroom = fields.find((item) => item.key === 'bathroomLocation')!;

  it('поле — выбор нескольких значений, фильтр — тоже', () => {
    expect(bathroom.type).toBe('multiEnum');
    expect(bathroom.filter).toBe('multiselect');
  });

  it.each([
    [['inside'], 'В доме'],
    [['outside'], 'На улице'],
    [['inside', 'outside'], 'В доме, На улице'],
  ])('%j сохраняется и подписывается «%s»', (value, label) => {
    const parsed = attributesSchemaFor(fields).parse({ ...OWNER, bathroomLocation: value });
    expect(parsed.bathroomLocation).toEqual(value);
    expect(attributeValueLabel(bathroom, parsed.bathroomLocation!, {})).toBe(label);
  });

  it('старое одиночное значение принимается как список', () => {
    const parsed = attributesSchemaFor(fields).parse({ ...OWNER, bathroomLocation: 'inside' });
    expect(parsed.bathroomLocation).toEqual(['inside']);
  });

  it('фильтр «В доме» находит и дома с санузлом в доме и на улице (любое из значений)', () => {
    const sql = renderSql(attributeSql(fields, { bathroomLocation: ['inside'] })[0]!);
    expect(sql).toContain(`v."key" = 'bathroomLocation'`);
    expect(sql).toContain(`v."text_value" IN ('inside')`);
  });
});

describe('производитель детали зависит от оригинальности', () => {
  it('оригинал — производители техники, аналог — производители запчастей', () => {
    expect(manufacturerFitsOriginality('toyota', 'original')).toBe(true);
    expect(manufacturerFitsOriginality('kyb', 'original')).toBe(false);
    expect(manufacturerFitsOriginality('kyb', 'analog')).toBe(true);
    expect(manufacturerFitsOriginality('toyota', 'analog')).toBe(false);
    // Не выбрано — подходят все
    expect(manufacturerFitsOriginality('kyb', undefined)).toBe(true);
  });

  it('список производителей в форме меняется вместе с оригинальностью', () => {
    const fields = attributesOf('transport-parts').map((field) =>
      field.key === 'partManufacturer'
        ? {
            ...field,
            options: [
              { value: 'toyota', label: 'Toyota' },
              { value: 'kyb', label: 'KYB' },
              { value: 'denso', label: 'Denso' },
            ],
          }
        : field,
    );
    const makers = (values: Record<string, unknown>) =>
      fieldsForValues(fields, values)
        .find((field) => field.key === 'partManufacturer')!
        .options!.map((option) => option.value);
    expect(makers({})).toEqual(['toyota', 'kyb', 'denso']);
    expect(makers({ partOriginality: 'original' })).toEqual(['toyota']);
    expect(makers({ partOriginality: 'analog' })).toEqual(['kyb', 'denso']);
  });

  it('смена «Оригинал → Аналог» сбрасывает неподходящего производителя и объясняет почему', () => {
    const fields = attributesOf('transport-parts');
    const before = { partOriginality: 'original', partManufacturer: 'toyota' };
    const after = withAttributeValue(fields, before, 'partOriginality', 'analog');
    expect(after.partManufacturer).toBeUndefined();
    expect(partMakerReset(before, after)).toContain('аналог');
  });

  it('подходящий производитель при смене не сбрасывается', () => {
    const fields = attributesOf('transport-parts');
    const before = { partManufacturer: 'kyb' };
    const after = withAttributeValue(fields, before, 'partOriginality', 'analog');
    expect(after.partManufacturer).toBe('kyb');
    expect(partMakerReset(before, after)).toBeNull();
  });
});
