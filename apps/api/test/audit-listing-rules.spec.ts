import {
  attributesSchemaFor,
  carryAttributes,
  attributeInputLabel,
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

describe('смена категории в форме: сбрасывается только неподходящее (п. 39)', () => {
  it('квартира → дом: площадь остаётся, «этаж» и «лифт» сбрасываются и называются', () => {
    const { kept, dropped } = carryAttributes(
      attributesOf('realty-flats'),
      attributesOf('realty-houses'),
      { areaTotal: 54, floor: 3, lift: true },
    );
    expect(kept.areaTotal).toBe(54);
    expect(kept.floor).toBeUndefined();
    expect(dropped).toEqual(expect.arrayContaining(['Этаж', 'Лифт']));
  });

  it('автомобиль → телефон: марка Toyota не переносится в «Бренд» телефона', () => {
    const { kept, dropped } = carryAttributes(
      attributesOf('transport-cars'),
      attributesOf('electronics-phones'),
      { brand: 'toyota' },
    );
    expect(kept.brand).toBeUndefined();
    expect(dropped.length).toBe(1);
  });

  it('вариант, которого нет у новой категории, сбрасывается', () => {
    const flats = attributesOf('realty-flats');
    const rooms = flats.find((field) => field.key === 'bathroom');
    expect(rooms).toBeTruthy();
    const { kept } = carryAttributes(flats, flats, { bathroom: 'nonexistent' });
    expect(kept.bathroom).toBeUndefined();
  });
});

describe('связка поле → хранение → фильтр → показ (аудит цепочки)', () => {
  const field = (slug: string, key: string) => attributesOf(slug).find((item) => item.key === key)!;

  it('мультивыбор числа с масштабом: размер обуви 43 хранится как 430 — фильтр ищет 430', () => {
    const size = field('personal-shoes', 'shoeSize');
    expect(attributesSchemaFor([size]).parse({ shoeSize: 43 }).shoeSize).toBe(430);
    const sql = renderSql(attributeSql([size], { shoeSize: [42, 43] })[0]!);
    expect(sql).toContain('IN (420,430)');
  });

  it('мультивыбор без масштаба не меняется: комнаты «4+» — от четырёх', () => {
    const sql = renderSql(attributeSql([field('realty-flats', 'rooms')], { rooms: [2, 4] })[0]!);
    expect(sql).toContain('IN (2)');
    expect(sql).toContain('>= 4');
  });

  it('страница объявления: ровно 4 комнаты — «4», а не «4+» из фильтра', () => {
    const rooms = field('realty-flats', 'rooms');
    expect(attributeValueLabel(rooms, 4)).toBe('4');
    expect(attributeValueLabel(rooms, 0)).toBe('Студия');
  });

  it('маркировка диска — с точкой, как в карточке (6.5J); дюймы — с запятой', () => {
    const width = field('transport-tires', 'rimWidth');
    const stored = attributesSchemaFor(attributesOf('transport-tires')).parse({
      tireType: 'rims',
      rimWidth: 6.5,
    }).rimWidth;
    expect(stored).toBe(65);
    expect(attributeValueLabel(width, stored)).toBe('6.5J');
    expect(attributeValueLabel(field('electronics-tv', 'screenSize'), 155)).toBe('15,5″');
  });

  it('свёрнутый шаг формы: значение ввода — с той же единицей, без двойной и без масштаба', () => {
    expect(attributeInputLabel(field('transport-tires', 'diameter'), '17')).toBe('R17');
    expect(attributeInputLabel(field('transport-tires', 'rimWidth'), '7')).toBe('7J');
    expect(attributeInputLabel(field('electronics-laptops', 'screenSize'), '15.6')).toBe('15,6″');
    expect(attributeInputLabel(field('realty-flats', 'areaTotal'), '54,5')).toBe('54,5 м²');
    expect(attributeInputLabel(field('realty-flats', 'areaTotal'), 54.5)).toBe('54,5 м²');
    expect(attributeInputLabel(field('transport-cars', 'mileage'), '125000')).toBe('125 000 км');
  });
});
