import {
  attributesSchemaFor,
  bindingsOf,
  findSeedCategory,
  flattenSeedCategories,
  resolveAttributes,
  type ListingAttribute,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

/**
 * Вещи, дом, хобби, бизнес (фаза 6): у подкатегории есть свой тип вещи, а
 * общий набор «только состояние» остался у считанных категорий.
 */

function attributesOf(slug: string): readonly ListingAttribute[] {
  const category = findSeedCategory(slug);
  if (!category) throw new Error(`Нет категории ${slug}`);
  return resolveAttributes(bindingsOf(category));
}

function requiredOf(slug: string): string[] {
  return attributesOf(slug)
    .filter((attribute) => attribute.required)
    .map((attribute) => attribute.key);
}

describe('Наборы полей вещей', () => {
  it('«Получение» есть у вещей и нет у недвижимости, работы, услуг и живых животных', () => {
    const keysOf = (slug: string) => {
      const category = findSeedCategory(slug);
      if (!category) throw new Error(slug);
      return bindingsOf(category).map((binding) => binding.key);
    };
    for (const slug of [
      'electronics-phones',
      'home-furniture',
      'transport-parts',
      'animals-goods',
    ]) {
      expect(keysOf(slug), slug).toContain('delivery');
    }
    for (const slug of [
      'realty-flats',
      'job-vacancies',
      'services-repair',
      'animals-dogs',
      'transport-cars',
      'business-ready',
    ]) {
      expect(keysOf(slug), slug).not.toContain('delivery');
    }
    // Одно поле — один раз, даже если набор вызывают повторно
    expect(keysOf('home-furniture').filter((key) => key === 'delivery')).toHaveLength(1);
  });

  it('подкатегорий с одним лишь «состоянием» — считанные катч-оллы', () => {
    const leaves = flattenSeedCategories()
      .map((item) => item.category)
      .filter((category) => !category.children?.length && !category.shortcut);
    const bare = leaves.filter((category) => {
      // «Получение» — общее поле всех вещей, а не свойство самой вещи
      const keys = bindingsOf(category)
        .map((binding) => binding.key)
        .filter((key) => key !== 'delivery');
      return keys.length === 1 && keys[0] === 'condition';
    });
    // Автоаксессуары, посуда, декор, растения, «всё для дома», товары для
    // животных, коллекционирование, товары для бизнеса — у них честно
    // нечего спрашивать кроме состояния; остальным дан свой тип вещи
    expect(bare.map((category) => category.slug).sort()).toEqual(
      [
        'animals-goods',
        'business-goods',
        'home-decor',
        'home-dishes',
        'home-other',
        'home-plants',
        'hobby-collections',
        'transport-accessories',
      ].sort(),
    );
  });

  it('одежда: что это, кому и состояние обязательны', () => {
    expect(requiredOf('personal-clothes')).toEqual(['clothesType', 'gender', 'condition']);
  });

  it('обувь: размер числом с половинками, в фильтре — список', () => {
    const size = attributesOf('personal-shoes').find((a) => a.key === 'shoeSize');
    expect(size?.required).toBe(true);
    expect(size?.filter).toBe('multiselect');
    const schema = attributesSchemaFor(attributesOf('personal-shoes'));
    expect(schema.parse({ gender: 'male', shoeSize: 42.5, condition: 'used' }).shoeSize).toBe(425);
  });

  it('детские вещи и товары — по возрасту', () => {
    expect(requiredOf('personal-kids-clothes')).toContain('kidsAge');
    expect(requiredOf('personal-kids-goods')[0]).toBe('kidsGoodsType');
  });

  it('у дома и хобби первым обязательным идёт тип вещи', () => {
    for (const [slug, key] of [
      ['home-furniture', 'furnitureType'],
      ['home-light', 'lightType'],
      ['home-materials', 'materialType'],
      ['home-tools', 'toolType'],
      ['home-plumbing', 'plumbingType'],
      ['home-doors', 'doorsType'],
      ['hobby-bikes', 'bikeType'],
      ['hobby-music', 'instrumentType'],
      ['hobby-games', 'gamesType'],
      ['personal-jewelry', 'jewelryType'],
      ['business-equipment', 'equipmentType'],
    ] as const) {
      expect(requiredOf(slug)[0], slug).toBe(key);
    }
  });

  it('стройматериалы продаются и поштучно', () => {
    expect(findSeedCategory('home-materials')?.priceUnits).toEqual(['total', 'per_unit']);
  });

  it('готовый бизнес: сфера обязательна, есть оборот и сотрудники', () => {
    expect(requiredOf('business-ready')).toEqual(['businessSphere']);
    expect(attributesOf('business-ready').map((a) => a.key)).toEqual(
      expect.arrayContaining(['monthlyRevenue', 'staffCount', 'premises']),
    );
  });
});
