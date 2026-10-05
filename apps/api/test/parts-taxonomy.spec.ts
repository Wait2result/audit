import {
  ATTRIBUTE_DEFINITIONS,
  DICTIONARY_SEEDS,
  FILTER_ONLY_ATTRIBUTES,
  PARTS_EQUIPMENT,
  PART_MANUFACTURERS,
  PART_MANUFACTURER_KIND,
  PartsEquipmentType,
  bindingsOf,
  flattenSeedCategories,
  norm,
  parseTaxonomy,
  partGroupKind,
  partItemKind,
  partsBindings,
  partsEquipmentBySlug,
  type PartsEquipment,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

/**
 * Запчасти и комплектующие: целостность реестра типов техники, таксономии,
 * справочников и привязок. Это не проверка поиска, а проверка данных:
 * опечатка в коде или повторный синоним ломают поиск тихо.
 */

const kinds = new Map(DICTIONARY_SEEDS.map((seed) => [seed.kind, seed]));
const categories = new Map(
  flattenSeedCategories().map(({ category }) => [category.slug, category]),
);

/** У этих типов техники одна и та же деталь («насос») есть у нескольких групп — это не ошибка. */
const GROUP_AMBIGUOUS: ReadonlySet<string> = new Set([
  PartsEquipmentType.HOME_APPLIANCE,
  PartsEquipmentType.CLIMATE_EQUIPMENT,
]);

describe('Реестр типов техники', () => {
  it('двенадцать типов техники из требований', () => {
    expect(PARTS_EQUIPMENT.map((item) => item.code).sort()).toEqual(
      [
        'climate_equipment',
        'computer',
        'home_appliance',
        'laptop',
        'moto',
        'other_equipment',
        'passenger_car',
        'phone',
        'special_equipment',
        'truck',
        'tv',
        'water_transport',
      ].sort(),
    );
  });

  it('у каждого типа своя подкатегория в дереве, ключ и справочники не повторяются', () => {
    expect(new Set(PARTS_EQUIPMENT.map((item) => item.slug)).size).toBe(PARTS_EQUIPMENT.length);
    expect(new Set(PARTS_EQUIPMENT.map((item) => item.key)).size).toBe(PARTS_EQUIPMENT.length);
    for (const equipment of PARTS_EQUIPMENT) {
      const leaf = categories.get(equipment.slug);
      expect(leaf, equipment.slug).toBeDefined();
      expect(leaf?.name).toBe(equipment.name);
      expect(leaf?.transactions).toEqual(['sale']);
      expect(partsEquipmentBySlug(equipment.slug)?.code).toBe(equipment.code);
    }
  });

  it('справочники марки и модели — существующие, без своих копий', () => {
    for (const equipment of PARTS_EQUIPMENT) {
      for (const kind of [equipment.brandKind, equipment.modelKind]) {
        if (kind) expect(kinds.has(kind), `${equipment.code}: нет справочника ${kind}`).toBe(true);
      }
      expect(equipment.modelKind && !equipment.brandKind).toBeFalsy();
    }
    // Копий справочников техники для запчастей нет
    expect([...kinds.keys()].filter((kind) => /^part_(car|phone|tv)_/.test(kind))).toEqual([]);
  });

  it('слова вида техники ведут на существующие варианты полей', () => {
    for (const equipment of PARTS_EQUIPMENT) {
      if (!equipment.kind) continue;
      const definition = ATTRIBUTE_DEFINITIONS[equipment.kind.attribute];
      expect(definition, equipment.kind.attribute).toBeDefined();
      const codes = new Set((definition?.options ?? []).map((option) => option.value));
      for (const code of Object.keys(equipment.kind.words)) {
        expect(codes.has(code), `${equipment.kind.attribute}: нет варианта ${code}`).toBe(true);
      }
    }
  });
});

describe('Таксономия деталей', () => {
  it('разбор формата: группы, детали, синонимы', () => {
    const groups = parseTaxonomy(`
      # steering | Рулевое | рулевое управление
      steering_rack | Рулевая рейка | рейка; рулевой механизм
      tie_rod | Рулевые тяги
    `);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ code: 'steering', label: 'Рулевое' });
    expect(groups[0]?.items.map((item) => item.code)).toEqual(['steering_rack', 'tie_rod']);
    expect(groups[0]?.items[0]?.aliases).toEqual(['рейка', 'рулевой механизм']);
    expect(() => parseTaxonomy('item_without_group | Название')).toThrow();
  });

  it.each(PARTS_EQUIPMENT.map((equipment) => [equipment.code, equipment] as const))(
    '%s: коды уникальны, у групп есть название, «прочее» на месте',
    (_code, equipment: PartsEquipment) => {
      const groupCodes = equipment.groups.map((group) => group.code);
      expect(new Set(groupCodes).size).toBe(groupCodes.length);
      const itemCodes = equipment.groups.flatMap((group) => group.items.map((item) => item.code));
      expect(new Set(itemCodes).size, 'коды деталей повторяются').toBe(itemCodes.length);
      for (const code of [...groupCodes, ...itemCodes]) {
        expect(code).toMatch(/^[a-z][a-z0-9_]{1,59}$/);
      }
      expect(equipment.groups.length).toBeGreaterThanOrEqual(3);
      expect(groupCodes.some((code) => code === 'other' || code.endsWith('_other'))).toBe(true);
    },
  );

  it.each(PARTS_EQUIPMENT.map((equipment) => [equipment.code, equipment] as const))(
    '%s: один синоним не называет две разные детали',
    (_code, equipment: PartsEquipment) => {
      const owners = new Map<string, string>();
      const clashes: string[] = [];
      const note = (alias: string, owner: string, group: string) => {
        const key = norm(alias);
        if (!key) return;
        const previous = owners.get(key);
        // Группа и её деталь могут называться одним словом («Двигатель»)
        if (previous !== undefined && previous !== owner) {
          const previousGroup = previous.split('/')[0];
          if (!(previousGroup === group && (previous.endsWith('/') || owner.endsWith('/'))))
            clashes.push(`«${key}»: ${previous} и ${owner}`);
        }
        owners.set(key, owner);
      };
      for (const group of equipment.groups) {
        for (const alias of [group.label, ...group.aliases])
          note(alias, `${group.code}/`, group.code);
        for (const item of group.items)
          for (const alias of [item.label, ...item.aliases])
            note(alias, `${group.code}/${item.code}`, group.code);
      }
      // У бытовой и климатической техники «насос» может быть у стиралки и у посудомойки
      // сразу — там совпадение между группами допустимо и разбирается вопросом
      expect(GROUP_AMBIGUOUS.has(equipment.code) ? [] : clashes).toEqual([]);
    },
  );

  it('синонимы не содержат латинских букв внутри русских слов', () => {
    const mixed: string[] = [];
    for (const equipment of PARTS_EQUIPMENT) {
      for (const group of equipment.groups) {
        for (const text of [group.label, ...group.aliases]) check(text, mixed);
        for (const item of group.items)
          for (const text of [item.label, ...item.aliases]) check(text, mixed);
      }
    }
    expect(mixed).toEqual([]);
  });

  it('размер таксономии: сотни деталей по всем типам техники', () => {
    const total = PARTS_EQUIPMENT.reduce(
      (sum, equipment) =>
        sum + equipment.groups.reduce((inner, group) => inner + group.items.length, 0),
      0,
    );
    expect(total).toBeGreaterThan(500);
    const cars = PARTS_EQUIPMENT.find((item) => item.code === 'passenger_car');
    expect(cars?.groups.length).toBeGreaterThanOrEqual(20);
  });
});

function check(text: string, bad: string[]): void {
  for (const word of text.split(/[\s;,/()-]+/)) {
    if (/[а-яё]/i.test(word) && /[a-z]/i.test(word)) bad.push(text);
  }
}

describe('Справочники и привязки', () => {
  it('для каждого типа техники есть справочники групп и деталей, имена до 40 знаков', () => {
    for (const equipment of PARTS_EQUIPMENT) {
      for (const kind of [partGroupKind(equipment), partItemKind(equipment)]) {
        expect(kinds.has(kind), kind).toBe(true);
        expect(kind.length).toBeLessThanOrEqual(40);
      }
      const items = kinds.get(partItemKind(equipment))!.entries;
      const groups = new Set(kinds.get(partGroupKind(equipment))!.entries.map((e) => e.value));
      for (const entry of items) {
        expect(groups.has(entry.parent ?? ''), `${entry.value}: нет группы ${entry.parent}`).toBe(
          true,
        );
        expect(entry.value.length).toBeLessThanOrEqual(80);
        expect(entry.label.length).toBeLessThanOrEqual(120);
      }
    }
  });

  it('производители деталей: уникальные коды, есть «другой»', () => {
    const codes = PART_MANUFACTURERS.map((item) => item.value);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('other');
    expect(kinds.get(PART_MANUFACTURER_KIND)?.entries.length).toBe(codes.length);
  });

  it('привязки: обязательна только категория детали, справочники существуют', () => {
    for (const equipment of PARTS_EQUIPMENT) {
      const bindings = bindingsOf(categories.get(equipment.slug)!);
      const required = bindings.filter((binding) => binding.required).map((binding) => binding.key);
      expect(required).toEqual(['partGroup']);
      for (const binding of bindings) {
        expect(ATTRIBUTE_DEFINITIONS[binding.key], binding.key).toBeDefined();
        if (binding.dictionary)
          expect(kinds.has(binding.dictionary), binding.dictionary).toBe(true);
      }
      // «Получение» добавляется всем вещам, и запчастям тоже
      expect(bindings.some((binding) => binding.key === 'delivery')).toBe(true);
      expect(partsBindings(equipment).some((binding) => binding.key === 'partNumber')).toBe(true);
    }
  });

  it('марка техники в совместимости — справочник самой техники, а не копия', () => {
    const car = bindingsOf(categories.get('transport-parts')!);
    expect(car.find((b) => b.key === 'compatBrand')?.dictionary).toBe('car_brand');
    expect(car.find((b) => b.key === 'compatModel')?.dictionary).toBe('car_model');
    const phone = bindingsOf(categories.get('electronics-phone-parts')!);
    expect(phone.find((b) => b.key === 'compatBrand')?.dictionary).toBe('phone_brand');
    expect(phone.find((b) => b.key === 'compatModel')?.dictionary).toBe('phone_model');
    // У телевизоров и бытовой техники справочника моделей нет — модель свободным текстом
    const tv = bindingsOf(categories.get('electronics-tv-parts')!);
    expect(tv.some((b) => b.key === 'compatModelText')).toBe(true);
    expect(tv.some((b) => b.key === 'compatModel')).toBe(false);
  });

  it('поля совместимости и номер — только для фильтра', () => {
    for (const key of FILTER_ONLY_ATTRIBUTES) expect(ATTRIBUTE_DEFINITIONS[key], key).toBeDefined();
    for (const key of FILTER_ONLY_ATTRIBUTES) {
      expect(ATTRIBUTE_DEFINITIONS[key]?.searchable).toBe(false);
      expect(ATTRIBUTE_DEFINITIONS[key]?.showInDetails).toBe(false);
    }
  });

  it('состояние, тип и производитель — три разных поля', () => {
    const condition = ATTRIBUTE_DEFINITIONS.partCondition!;
    const originality = ATTRIBUTE_DEFINITIONS.partOriginality!;
    // «Контрактная» — это «Оригинал» + «Б/У»; «Восстановленная» — состояние, а не тип
    expect(condition.options?.map((o) => o.value)).toEqual(['new', 'used', 'restored']);
    expect(condition.options?.map((o) => o.label)).toEqual(['Новая', 'Б/У', 'Восстановленная']);
    expect(originality.options?.map((o) => o.value)).toEqual(['original', 'analog']);
    expect(originality.label).toBe('Тип детали');
    expect(ATTRIBUTE_DEFINITIONS.partManufacturer?.type).toBe('brand');
    // У «Восстановленной» — подсказка про описание, а не обязательное поле
    expect(condition.options?.find((o) => o.value === 'restored')?.hint).toMatch(/описании/);
  });

  it('у фильтра совместимости модификация — только там, где у моделей бывают версии', () => {
    const keysOf = (code: string) =>
      partsBindings(PARTS_EQUIPMENT.find((item) => item.code === code)!).map((b) => b.key);
    expect(keysOf('passenger_car')).toEqual(
      expect.arrayContaining(['compatChassis', 'compatYear', 'compatEngine', 'compatModification']),
    );
    expect(keysOf('phone')).not.toContain('compatChassis');
    expect(keysOf('phone')).not.toContain('compatEngine');
    expect(keysOf('home_appliance')).not.toContain('compatEngine');
    expect(keysOf('tv')).not.toContain('compatModification');
    expect(FILTER_ONLY_ATTRIBUTES.has('compatModification')).toBe(true);
  });
});

describe('Справочник производителей деталей', () => {
  const required = [
    'Toyota',
    'Denso',
    'Bosch',
    'KYB',
    'CTR',
    'Masuma',
    'NGK',
    'Sachs',
    'TRW',
    'ATE',
    'Brembo',
    'SKF',
    'NSK',
    'NTN',
    'Gates',
    'INA',
    'Valeo',
    'AISIN',
    'Exedy',
    'Tokico',
    'Febi',
    'Lemförder',
    'Mando',
    'GMB',
  ];

  it('стартовый список из ТЗ есть целиком', () => {
    const labels = PART_MANUFACTURERS.map((item) => item.label);
    for (const label of required) expect(labels, label).toContain(label);
  });

  it('одно название — один производитель: Denso, DENSO и «денсо» не плодят записей', () => {
    const owner = new Map<string, string>();
    for (const item of PART_MANUFACTURERS) {
      for (const name of [item.label, item.value.replace(/_/g, ' '), ...(item.aliases ?? [])]) {
        const key = norm(name);
        const seen = owner.get(key);
        expect(
          seen === undefined || seen === item.value,
          `«${name}»: ${seen} и ${item.value}`,
        ).toBe(true);
        owner.set(key, item.value);
      }
    }
    expect(new Set(PART_MANUFACTURERS.map((item) => item.value)).size).toBe(
      PART_MANUFACTURERS.length,
    );
  });

  it('марки машин не прячутся в написаниях производителя (Hyundai, Kia, Audi — это техника)', () => {
    const carBrands = new Set(
      DICTIONARY_SEEDS.find((seed) => seed.kind === 'car_brand')!.entries.map((entry) =>
        norm(entry.label),
      ),
    );
    for (const item of PART_MANUFACTURERS) {
      if (item.machineBrand) continue;
      for (const alias of item.aliases ?? []) {
        expect(carBrands.has(norm(alias)), `${item.value}: «${alias}»`).toBe(false);
      }
    }
  });

  it('производители привязаны к типам техники из реестра; справочник сеется с ними', () => {
    const codes = new Set(PARTS_EQUIPMENT.map((item) => item.code));
    for (const item of PART_MANUFACTURERS) {
      for (const code of item.equipment ?? [])
        expect(codes.has(code), `${item.value}: ${code}`).toBe(true);
    }
    const seed = DICTIONARY_SEEDS.find((entry) => entry.kind === PART_MANUFACTURER_KIND)!;
    expect(seed.entries.find((entry) => entry.value === 'kyb')?.meta).toMatchObject({
      equipment: 'passenger_car,truck,moto',
    });
    expect(seed.entries.find((entry) => entry.value === 'toyota')?.meta).toMatchObject({
      machineBrand: true,
    });
    expect(seed.entries.find((entry) => entry.value === 'other')?.meta).toBeUndefined();
  });

  it('производитель техники и производитель детали — разные справочники', () => {
    expect(PART_MANUFACTURER_KIND).not.toBe('car_brand');
    expect(ATTRIBUTE_DEFINITIONS.partManufacturer?.key).not.toBe(
      ATTRIBUTE_DEFINITIONS.compatBrand?.key,
    );
  });
});
