import {
  attributesSchemaFor,
  bindingsOf,
  describeAttributes,
  findSeedCategory,
  resolveAttributes,
  type ListingAttribute,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

/**
 * Недвижимость (фаза 3): у каждой подкатегории свой набор полей, а
 * «Посуточная» и «Долгосрочная» — ярлыки в квартиры, а не отдельные доски.
 */

function attributesOf(slug: string): readonly ListingAttribute[] {
  const category = findSeedCategory(slug);
  if (!category) throw new Error(`Нет категории ${slug}`);
  return resolveAttributes(bindingsOf(category));
}

function keysOf(slug: string): string[] {
  return attributesOf(slug).map((attribute) => attribute.key);
}

const OWNER = { sellerType: 'owner' } as const;

describe('Наборы полей недвижимости', () => {
  it('«Кто разместил» обязательно у всей недвижимости и фильтруется', () => {
    for (const slug of [
      'realty-flats',
      'realty-rooms',
      'realty-houses',
      'realty-land',
      'realty-commercial',
      'realty-garages',
    ]) {
      const field = attributesOf(slug).find((a) => a.key === 'sellerType');
      expect(field?.required, slug).toBe(true);
      expect(field?.filterable, slug).toBe(true);
    }
    const schema = attributesSchemaFor(attributesOf('realty-flats'));
    expect(schema.safeParse({ rooms: 2, areaTotal: 54.5 }).success).toBe(false);
    expect(schema.safeParse({ sellerType: 'agency', rooms: 2, areaTotal: 54.5 }).success).toBe(
      true,
    );
    expect(schema.safeParse({ sellerType: 'broker', rooms: 2, areaTotal: 54.5 }).success).toBe(
      false,
    );
  });

  it('квартира: комнаты и площадь обязательны, есть санузел и условия аренды', () => {
    const attributes = attributesOf('realty-flats');
    const required = attributes.filter((a) => a.required).map((a) => a.key);
    expect(required).toEqual(['sellerType', 'rooms', 'areaTotal']);
    expect(keysOf('realty-flats')).toEqual(
      expect.arrayContaining(['bathroom', 'newBuilding', 'petsAllowed', 'utilitiesIncluded']),
    );
  });

  it('комната: площадь комнаты и «комнат в квартире», а не «комнат»', () => {
    const attributes = attributesOf('realty-rooms');
    expect(attributes.find((a) => a.key === 'areaTotal')?.label).toBe('Площадь комнаты');
    expect(attributes.find((a) => a.key === 'roomsInFlat')?.required).toBe(true);
    expect(keysOf('realty-rooms')).not.toContain('rooms');
  });

  it('дом: участок обязателен, есть отопление и коммуникации', () => {
    const attributes = attributesOf('realty-houses');
    expect(attributes.find((a) => a.key === 'landArea')?.required).toBe(true);
    expect(keysOf('realty-houses')).toEqual(
      expect.arrayContaining(['heating', 'gas', 'water', 'sewerage', 'electricity']),
    );
    expect(attributes.find((a) => a.key === 'year')?.label).toBe('Год постройки');
  });

  it('участок: назначение обязательно, есть подъезд', () => {
    const attributes = attributesOf('realty-land');
    expect(attributes.find((a) => a.key === 'landPurpose')?.required).toBe(true);
    expect(keysOf('realty-land')).toContain('road');
  });

  it('гараж: тип обязателен, поля квартиры не примешиваются', () => {
    const attributes = attributesOf('realty-garages');
    expect(attributes.find((a) => a.key === 'garageType')?.required).toBe(true);
    expect(keysOf('realty-garages')).not.toContain('rooms');
    expect(keysOf('realty-garages')).not.toContain('commercialType');
  });

  it('коммерция: назначение и площадь обязательны', () => {
    const required = attributesOf('realty-commercial')
      .filter((a) => a.required)
      .map((a) => a.key);
    expect(required).toEqual(['sellerType', 'commercialType', 'areaTotal']);
  });

  it('чужое поле в квартире не сохраняется, своё — проверяется', () => {
    const schema = attributesSchemaFor(attributesOf('realty-flats'));
    // Лишний ключ (остался от прошлой категории в форме) молча отбрасывается:
    // это не ошибка человека, а след смены категории
    const stale = schema.safeParse({ ...OWNER, rooms: 2, areaTotal: 54.5, garageType: 'box' });
    expect(stale.success).toBe(true);
    if (stale.success) expect(stale.data).not.toHaveProperty('garageType');

    expect(
      schema.safeParse({ ...OWNER, rooms: 2, areaTotal: 54.5, bathroom: 'separate' }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...OWNER, rooms: 2, areaTotal: 54.5, bathroom: 'golden' }).success,
    ).toBe(false);
  });

  it('строка карточки квартиры: комнаты, площадь, этаж', () => {
    const text = describeAttributes(attributesOf('realty-flats'), {
      rooms: 2,
      areaTotal: 545,
      floor: 3,
      floorsTotal: 9,
      bathroom: 'separate',
      newBuilding: true,
    });
    expect(text).toBe('2 комн. · 54,5 м² · 3/9 эт.');
  });

  it('в карточке видно, от кого: «от собственника» или «от агентства»', () => {
    const flat = attributesOf('realty-flats');
    expect(describeAttributes(flat, { sellerType: 'owner', rooms: 1, areaTotal: 380 })).toBe(
      'от собственника · 1 комн. · 38 м²',
    );
    expect(describeAttributes(flat, { sellerType: 'agency', rooms: 3, areaTotal: 800 })).toBe(
      'от агентства · 3 комн. · 80 м²',
    );
    // В форме и фильтре — короткие подписи
    const field = flat.find((attribute) => attribute.key === 'sellerType');
    expect(field?.options?.map((option) => option.label)).toEqual(['Собственник', 'Агентство']);
    expect(attributesOf('realty-houses').find((a) => a.key === 'sellerType')?.showInCard).toBe(
      true,
    );
  });
});

describe('Ярлыки аренды', () => {
  it('«Посуточная» и «Долгосрочная» ведут в квартиры с готовой сделкой', () => {
    expect(findSeedCategory('realty-daily')?.shortcut).toEqual({
      category: 'realty-flats',
      transactionType: 'rent',
      rentPeriod: 'daily',
    });
    expect(findSeedCategory('realty-long')?.shortcut).toEqual({
      category: 'realty-flats',
      transactionType: 'rent',
      rentPeriod: 'monthly',
    });
  });

  it('у ярлыка нет своих полей — размещать в него нечего', () => {
    expect(keysOf('realty-daily')).toEqual([]);
    expect(keysOf('realty-long')).toEqual([]);
  });
});
