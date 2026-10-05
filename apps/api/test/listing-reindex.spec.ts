import {
  attributesSchemaFor,
  bindingsOf,
  findSeedCategory,
  resolveAttributes,
  storedToInput,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { planReindex, type ReindexSource } from '../src/modules/listings/listing-reindex.js';
import { seedCatalogue } from './helpers/smart-search-fixtures.js';

/**
 * Переиндексация не теряет характеристики (регрессия 2026-10-07: «Дача обмен
 * №99552» осталась без характеристик). Раньше одно неверное поле обнуляло
 * все остальные, а числа с масштабом умножались на 10 при каждом прогоне.
 */

const catalogue = seedCatalogue();

function source(
  slug: string,
  attributes: Record<string, unknown>,
  extra: Partial<ReindexSource> = {},
) {
  const category = catalogue.findBySlug(slug)!;
  const row: ReindexSource = {
    id: '00000000-0000-0000-0000-000000000001',
    categoryId: category.id,
    attributes,
    transactionType: 'sale',
    rentPeriod: null,
    priceUnit: 'total',
    price: 5_000_000_00,
    rooms: null,
    areaTotal: null,
    floor: null,
    floorsTotal: null,
    year: null,
    mileage: null,
    condition: null,
    city: { name: 'Махачкала' },
    district: null,
    ...extra,
  };
  return { row, category };
}

const jsonOf = (plan: ReturnType<typeof planReindex>) =>
  plan.data.attributes as Record<string, unknown>;

describe('Переиндексация: значения не теряются', () => {
  it('одно неверное поле не обнуляет остальные — и само сохраняется как есть', () => {
    const { row, category } = source('realty-houses', {
      sellerType: 'owner',
      wallMaterial: 'old_value_from_removed_option',
      heating: 'gas',
      gas: true,
    });
    const plan = planReindex(row, category, catalogue);
    expect(jsonOf(plan)).toMatchObject({
      sellerType: 'owner',
      heating: 'gas',
      gas: true,
      wallMaterial: 'old_value_from_removed_option',
    });
    expect(plan.changes).toEqual([expect.objectContaining({ key: 'wallMaterial', kind: 'kept' })]);
    expect(plan.changed).toBe(false);
  });

  it('поле, которого нет у категории, тоже сохраняется', () => {
    const { row, category } = source('realty-houses', { sellerType: 'owner', legacyField: 'x' });
    const plan = planReindex(row, category, catalogue);
    expect(jsonOf(plan)).toMatchObject({ sellerType: 'owner', legacyField: 'x' });
    expect(plan.changes[0]).toMatchObject({
      key: 'legacyField',
      kind: 'kept',
      reason: 'поля нет у категории',
    });
  });

  it('удаление — только с флагом dropInvalid, и план называет каждое значение', () => {
    const { row, category } = source('realty-houses', {
      sellerType: 'owner',
      wallMaterial: 'bad',
      legacyField: 'x',
    });
    const plan = planReindex(row, category, catalogue, { dropInvalid: true });
    expect(jsonOf(plan)).toEqual({ sellerType: 'owner' });
    expect(plan.changes.map((change) => [change.key, change.kind])).toEqual([
      ['wallMaterial', 'removed'],
      ['legacyField', 'removed'],
    ]);
    expect(plan.changed).toBe(true);
  });

  it('число с масштабом не умножается при повторном прогоне (6,5 сотки остаются 6,5)', () => {
    // Хранится в десятых: 6,5 сотки → 65
    const { row, category } = source('realty-houses', { sellerType: 'owner', landArea: 65 });
    const first = planReindex(row, category, catalogue);
    expect(jsonOf(first).landArea).toBe(65);
    const second = planReindex({ ...row, attributes: jsonOf(first) }, category, catalogue);
    expect(jsonOf(second).landArea).toBe(65);
    expect(first.changes).toEqual([]);
    expect(first.unchanged).toBe(2);
  });

  it('большое значение у предела не превращается в «неверное» после прогона', () => {
    // 9 000 соток — в пределах (до 10 000); раньше прогон делал 900 000 и обнулял всё
    const { row, category } = source('realty-houses', { sellerType: 'owner', landArea: 90_000 });
    const plan = planReindex(row, category, catalogue);
    expect(jsonOf(plan)).toEqual({ sellerType: 'owner', landArea: 90_000 });
  });

  it('подпись вместо кода приводится к справочнику — это преобразование, не удаление', () => {
    const { row, category } = source('transport-cars', { brand: 'Toyota', model: 'Camry' });
    const plan = planReindex(row, category, catalogue);
    expect(jsonOf(plan)).toMatchObject({ brand: 'toyota', model: 'camry' });
    expect(plan.changes.map((change) => [change.key, change.kind])).toEqual([
      ['brand', 'converted'],
      ['model', 'converted'],
    ]);
  });

  it('скрытое условием поле (Face ID не у Apple) не пропадает', () => {
    const { row, category } = source('electronics-phones', { brand: 'samsung', faceId: true });
    const plan = planReindex(row, category, catalogue);
    expect(jsonOf(plan)).toMatchObject({ brand: 'samsung', faceId: true });
    expect(plan.changes[0]).toMatchObject({ key: 'faceId', kind: 'kept' });
  });

  it('колоночное поле не теряется, а колонка не перезаписывается', () => {
    const { row, category } = source(
      'realty-houses',
      { sellerType: 'owner' },
      { areaTotal: 8000, year: 1996 },
    );
    const plan = planReindex(row, category, catalogue);
    expect(plan.data).not.toHaveProperty('areaTotal');
    expect(plan.data).not.toHaveProperty('year');
  });
});

describe('Хранимое значение → единицы ввода (правка объявления)', () => {
  const attributes = resolveAttributes(bindingsOf(findSeedCategory('realty-houses')!));

  it('54,5 м² и 6,5 сотки: хранятся 545 и 65, в форму возвращаются 54,5 и 6,5', () => {
    expect(storedToInput(attributes, { areaTotal: 545, landArea: 65, rooms: 3 })).toEqual({
      areaTotal: 54.5,
      landArea: 6.5,
      rooms: 3,
    });
  });

  it('«сохранить без изменений» оставляет те же числа (раньше ×10 при каждой правке)', () => {
    const stored = { sellerType: 'owner', areaTotal: 545, landArea: 65 };
    const again = attributesSchemaFor(attributes).safeParse(storedToInput(attributes, stored));
    expect(again.success).toBe(true);
    expect(again.data).toMatchObject({ areaTotal: 545, landArea: 65 });
  });
});
