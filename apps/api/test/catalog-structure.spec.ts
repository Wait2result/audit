import {
  CATEGORY_RELOCATIONS,
  DICTIONARY_SEEDS,
  GOODS_DIRECTIONS,
  MAIN_TYPES,
  PARTS_EQUIPMENT,
  SEED_LISTING_CATEGORIES,
  bindingsOf,
  catalogLayer,
  findSeedCategory,
  flattenSeedCategories,
  goodsTypeKind,
  norm,
  type SeedListingCategory,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

/**
 * Структура «раздел → основной тип → направление» (docs/ADR/0013-основные-типы.md).
 * Это проверка данных: опечатка в реестре или забытая подкатегория молча
 * ломает навигацию, форму подачи и поиск.
 */

const childNames = (slug: string) => (findSeedCategory(slug)?.children ?? []).map((c) => c.name);
const childSlugs = (slug: string) => (findSeedCategory(slug)?.children ?? []).map((c) => c.slug);

describe('Основные типы и их направления', () => {
  it.each([
    [
      'cars',
      'transport',
      [
        'Автомобили',
        'Запчасти',
        'Шины и диски',
        'Автоаксессуары',
        'Детские автокресла',
        'Автоэлектроника и мультимедиа',
        'Автохимия и уход',
        'Аккумуляторы',
        'Багажники, фаркопы и крепления',
        'Инструменты и оборудование',
        'Тюнинг и дополнительное оборудование',
        'Другое',
      ],
    ],
    [
      'motorcycles',
      'transport',
      [
        'Мотоциклы',
        'Запчасти',
        'Шины и диски',
        'Аксессуары',
        'Экипировка',
        'Электроника',
        'Тюнинг',
        'Другое',
      ],
    ],
    [
      'trucks',
      'transport',
      [
        'Грузовики',
        'Запчасти',
        'Шины и диски',
        'Аксессуары',
        'Навесное оборудование',
        'Прицепы и полуприцепы',
        'Другое',
      ],
    ],
    [
      'special-equipment',
      'transport',
      [
        'Спецтехника',
        'Запчасти',
        'Навесное оборудование',
        'Рабочее оборудование',
        'Шины и гусеницы',
        'Аксессуары',
        'Другое',
      ],
    ],
    [
      'water-transport',
      'transport',
      [
        'Водный транспорт',
        'Запчасти',
        'Двигатели',
        'Лодочные моторы',
        'Винты',
        'Электроника',
        'Аксессуары и экипировка',
        'Другое',
      ],
    ],
    [
      'phones',
      'electronics',
      [
        'Телефоны',
        'Запчасти',
        'Аксессуары',
        'Чехлы',
        'Защитные стёкла',
        'Зарядные устройства',
        'Другое',
      ],
    ],
    [
      'laptops',
      'electronics',
      ['Ноутбуки', 'Запчасти', 'Аксессуары', 'Зарядные устройства', 'Другое'],
    ],
    [
      'computers',
      'electronics',
      ['Компьютеры', 'Комплектующие', 'Периферия', 'Мониторы', 'Аксессуары', 'Другое'],
    ],
    [
      'tv',
      'electronics',
      ['Телевизоры', 'Запчасти', 'Пульты', 'Крепления', 'Аксессуары', 'Другое'],
    ],
    ['appliances', 'home', ['Бытовая техника', 'Запчасти', 'Аксессуары', 'Расходники', 'Другое']],
    [
      'climate',
      'home',
      [
        'Кондиционеры',
        'Обогреватели',
        'Вентиляторы',
        'Увлажнители',
        'Очистители воздуха',
        'Запчасти',
        'Аксессуары',
        'Расходники',
        'Другое',
      ],
    ],
  ])('%s (раздел %s): направления по порядку', (slug, section, names) => {
    expect(childSlugs(section)).toContain(slug);
    expect(childNames(slug)).toEqual(names);
  });

  it('направления — только свои: у телефонов нет шин, у автомобилей нет экипировки мотоциклиста', () => {
    expect(childNames('phones')).not.toContain('Шины и диски');
    expect(childNames('cars')).not.toContain('Экипировка');
    expect(childNames('tv')).not.toContain('Детские автокресла');
  });

  it('в разделе нет плоского списка «Автозапчасти, Мотозапчасти…»: запчасти внутри типов', () => {
    for (const equipment of PARTS_EQUIPMENT) {
      if (equipment.code === 'other_equipment') continue;
      const section = SEED_LISTING_CATEGORIES.find((root) =>
        flattenLeaves(root).includes(equipment.slug),
      )!;
      expect(childSlugs(section.slug), equipment.slug).not.toContain(equipment.slug);
    }
    expect(
      flattenSeedCategories().some(({ category }) => /все запчасти/i.test(category.name)),
    ).toBe(false);
  });

  it('каждая подкатегория в дереве ровно один раз; глубже трёх уровней дерево не уходит', () => {
    const slugs = flattenSeedCategories().map(({ category }) => category.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const root of SEED_LISTING_CATEGORIES) {
      for (const child of root.children ?? []) {
        for (const leaf of child.children ?? []) expect(leaf.children ?? [], leaf.slug).toEqual([]);
      }
    }
  });

  it('узел основного типа — не место для объявления: своих полей и сделок у него нет', () => {
    for (const type of MAIN_TYPES) {
      const node = findSeedCategory(type.slug)!;
      expect(node.children?.length, type.slug).toBeGreaterThan(1);
      expect(node.attributes ?? []).toEqual([]);
      expect(node.transactions ?? []).toEqual([]);
    }
  });

  it('«Продать», «Купить», «Сдать», «Снять» — не категории', () => {
    const names = flattenSeedCategories().map(({ category }) => norm(category.name));
    for (const word of ['продать', 'купить', 'сдать', 'снять', 'продам', 'куплю']) {
      expect(
        names.some((name) => name.split(' ').includes(word)),
        word,
      ).toBe(false);
    }
  });
});

describe('Направления: тип товара, поля, «Подходит к»', () => {
  it('у направления с типом товара — обязательное поле и свой справочник типов', () => {
    for (const direction of GOODS_DIRECTIONS) {
      const leaf = findSeedCategory(direction.slug)!;
      const bindings = bindingsOf(leaf);
      if (direction.typeKey === 'goodsType') {
        expect(bindings[0], direction.slug).toMatchObject({
          key: 'goodsType',
          required: true,
          dictionary: goodsTypeKind(direction),
        });
        const seed = DICTIONARY_SEEDS.find((item) => item.kind === goodsTypeKind(direction));
        expect(seed?.entries.map((entry) => entry.value)).toEqual(
          direction.types.map((type) => type.code),
        );
        expect(goodsTypeKind(direction).length, direction.slug).toBeLessThanOrEqual(40);
      } else if (direction.typeKey) {
        expect(
          bindings.map((binding) => binding.key),
          direction.slug,
        ).toContain(direction.typeKey);
      }
    }
  });

  it('«Подходит к»: у ковриков, магнитол, багажников и чехлов есть, у автохимии и автокресел — нет', () => {
    for (const slug of [
      'transport-accessories',
      'transport-car-electronics',
      'transport-racks',
      'transport-tuning',
      'transport-tires',
      'electronics-phone-cases',
      'electronics-tv-remotes',
    ]) {
      expect(catalogLayer(slug), slug).not.toBeNull();
      expect(
        bindingsOf(findSeedCategory(slug)!).map((b) => b.key),
        slug,
      ).toContain('compatBrand');
    }
    for (const slug of ['transport-car-chemicals', 'transport-car-seats', 'transport-batteries']) {
      expect(catalogLayer(slug), slug).toBeNull();
    }
    // Номера детали — только у запчастей
    expect(catalogLayer('transport-accessories')?.numbers).toBe(false);
    expect(catalogLayer('transport-parts')?.numbers).toBe(true);
  });

  it('кузов — только у автомобильных направлений, у чехлов телефона его нет', () => {
    expect(catalogLayer('transport-accessories')?.compat.chassis).toBe(true);
    expect(catalogLayer('electronics-phone-cases')?.compat.chassis).toBe(false);
    expect(catalogLayer('electronics-phone-cases')?.compat.engine).toBe(false);
  });

  it('поля автокресел, аккумуляторов и дисков — на своих местах', () => {
    const keys = (slug: string) => bindingsOf(findSeedCategory(slug)!).map((b) => b.key);
    expect(keys('transport-car-seats')).toEqual(
      expect.arrayContaining([
        'childAge',
        'childWeight',
        'seatGroup',
        'childHeight',
        'isofix',
        'seatInstallation',
      ]),
    );
    expect(keys('transport-batteries')).toEqual(
      expect.arrayContaining([
        'batteryVoltage',
        'batteryCapacity',
        'batteryCurrent',
        'batteryPolarity',
        'batterySize',
        'batteryChemistry',
      ]),
    );
    expect(keys('transport-tires')).toEqual(
      expect.arrayContaining([
        'season',
        'loadIndex',
        'speedIndex',
        'pcd',
        'rimEt',
        'rimDia',
        'rimMaterial',
        'rimWidth',
      ]),
    );
  });

  it('синоним типа товара не повторяется внутри основного типа (и не спорит с деталью)', () => {
    for (const type of MAIN_TYPES) {
      const owner = new Map<string, string>();
      const parts = PARTS_EQUIPMENT.find((item) => item.code === type.equipment);
      for (const group of parts?.groups ?? []) {
        for (const item of group.items) {
          for (const alias of [item.label, ...item.aliases])
            owner.set(norm(alias), `деталь ${item.code}`);
        }
      }
      for (const direction of GOODS_DIRECTIONS.filter(
        (item) => item.equipment === type.equipment,
      )) {
        for (const goods of direction.types) {
          for (const alias of goods.aliases) {
            const key = norm(alias);
            const seen = owner.get(key);
            const self = `${direction.slug}/${goods.code}`;
            expect(
              seen === undefined || seen === self,
              `${type.slug}: «${alias}» — ${seen} и ${goods.code}`,
            ).toBe(true);
            owner.set(key, self);
          }
        }
      }
    }
  });
});

describe('Переезд объявлений в новые направления', () => {
  it('каждое правило ведёт в существующую подкатегорию и в существующий тип товара', () => {
    for (const rule of CATEGORY_RELOCATIONS) {
      expect(findSeedCategory(rule.from), rule.from).not.toBeNull();
      const target = findSeedCategory(rule.to);
      expect(target, rule.to).not.toBeNull();
      expect(target?.children ?? [], rule.to).toEqual([]);
      const type = rule.set?.goodsType;
      if (type) {
        const direction = GOODS_DIRECTIONS.find((item) => item.slug === rule.to);
        expect(
          direction?.types.map((item) => item.code),
          rule.to,
        ).toContain(type);
      }
    }
  });

  it('то, что переехало, из таксономии запчастей убрано — дублей нет', () => {
    const items = new Set(
      PARTS_EQUIPMENT.flatMap((equipment) =>
        equipment.groups.flatMap((group) =>
          group.items.map((item) => `${equipment.slug}/${item.code}`),
        ),
      ),
    );
    for (const rule of CATEGORY_RELOCATIONS.filter((item) => item.when.key === 'partItem')) {
      for (const value of rule.when.values)
        expect(items.has(`${rule.from}/${value}`), value).toBe(false);
    }
  });
});

function flattenLeaves(node: SeedListingCategory): string[] {
  return node.children?.length ? node.children.flatMap(flattenLeaves) : [node.slug];
}
