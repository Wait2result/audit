import {
  ANY_DICTIONARY_PARENT,
  APPLIANCE_BRANDS,
  AUDIO_BRANDS,
  BIKE_BRANDS,
  BRAND_ALIASES,
  COMPUTER_BRANDS,
  DICTIONARY_SEEDS,
  DictionaryKind,
  LAPTOP_MODELS,
  MODEL_ALIASES,
  MOTO_BRANDS,
  MOTO_MODELS,
  OTHER_BRAND,
  PHONE_BRANDS,
  PHONE_MODELS,
  PHOTO_BRANDS,
  PHOTO_MODELS,
  SEED_LISTING_CATEGORIES,
  SPECIAL_BRANDS,
  SPECIAL_MODELS,
  TABLET_MODELS,
  TIRE_BRANDS,
  TOOL_BRANDS,
  TRUCK_BRANDS,
  TRUCK_MODELS,
  TV_BRANDS,
  WATCH_BRANDS,
  WATCH_MODELS,
  WATER_BRANDS,
  attributesSchemaFor,
  bindingsOf,
  classifyListingTitle,
  findSeedCategory,
  flattenSeedCategories,
  modelValue,
  resolveAttributes,
  russianModelAlias,
  withAttributeValue,
  type ListingAttribute,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { attributeSql, renderSql } from '../src/modules/listings/listing-query.js';

/**
 * Автоматический аудит всех справочников брендов и моделей.
 *
 * Справочник — данные, а данные портятся тихо: повтор названия, пустая
 * подпись, модель Samsung под брендом Apple, потерянная старая модель. Эти
 * проверки одинаково гоняют ВСЕ справочники (авто, мото, грузовики,
 * спецтехника, телефоны, планшеты, ноутбуки, часы, фото, ТВ, аудио,
 * техника, инструмент, шины, велосипеды, лодки), а не одну категорию.
 */

/** Значения, существовавшие до расширения: прежние объявления на них ссылаются. */
const LEGACY = {
  phones: [
    ['apple', 'iPhone 16 Pro Max'],
    ['apple', 'iPhone 16 Pro'],
    ['apple', 'iPhone 16 Plus'],
    ['apple', 'iPhone 16'],
    ['apple', 'iPhone 15 Pro Max'],
    ['apple', 'iPhone 15 Pro'],
    ['apple', 'iPhone 15 Plus'],
    ['apple', 'iPhone 15'],
    ['apple', 'iPhone 14 Pro Max'],
    ['apple', 'iPhone 14 Pro'],
    ['apple', 'iPhone 14 Plus'],
    ['apple', 'iPhone 14'],
    ['apple', 'iPhone 13 Pro Max'],
    ['apple', 'iPhone 13 Pro'],
    ['apple', 'iPhone 13'],
    ['apple', 'iPhone 13 mini'],
    ['apple', 'iPhone 12 Pro Max'],
    ['apple', 'iPhone 12 Pro'],
    ['apple', 'iPhone 12'],
    ['apple', 'iPhone 12 mini'],
    ['apple', 'iPhone 11 Pro Max'],
    ['apple', 'iPhone 11 Pro'],
    ['apple', 'iPhone 11'],
    ['apple', 'iPhone XS Max'],
    ['apple', 'iPhone XS'],
    ['apple', 'iPhone XR'],
    ['apple', 'iPhone X'],
    ['apple', 'iPhone SE (2022)'],
    ['apple', 'iPhone SE (2020)'],
    ['apple', 'iPhone 8 Plus'],
    ['apple', 'iPhone 8'],
    ['apple', 'iPhone 7 Plus'],
    ['apple', 'iPhone 7'],
    ['samsung', 'Galaxy S25 Ultra'],
    ['samsung', 'Galaxy S25'],
    ['samsung', 'Galaxy S24 Ultra'],
    ['samsung', 'Galaxy S24'],
    ['samsung', 'Galaxy S23 Ultra'],
    ['samsung', 'Galaxy S23'],
    ['samsung', 'Galaxy S22 Ultra'],
    ['samsung', 'Galaxy S22'],
    ['samsung', 'Galaxy S21'],
    ['samsung', 'Galaxy Z Fold 6'],
    ['samsung', 'Galaxy Z Flip 6'],
    ['samsung', 'Galaxy Z Fold 5'],
    ['samsung', 'Galaxy Z Flip 5'],
    ['samsung', 'Galaxy A55'],
    ['samsung', 'Galaxy A54'],
    ['samsung', 'Galaxy A35'],
    ['samsung', 'Galaxy A34'],
    ['samsung', 'Galaxy A25'],
    ['samsung', 'Galaxy A15'],
    ['samsung', 'Galaxy A14'],
    ['samsung', 'Galaxy M34'],
    ['samsung', 'Galaxy Note 20'],
    ['xiaomi', 'Xiaomi 14'],
    ['xiaomi', 'Xiaomi 14 Ultra'],
    ['xiaomi', 'Xiaomi 13'],
    ['xiaomi', 'Xiaomi 13T'],
    ['xiaomi', 'Xiaomi 12'],
    ['xiaomi', 'Xiaomi 11T'],
    ['xiaomi', 'Mi 11'],
    ['xiaomi', 'Mi 10'],
    ['redmi', 'Redmi Note 13 Pro'],
    ['redmi', 'Redmi Note 13'],
    ['redmi', 'Redmi Note 12 Pro'],
    ['redmi', 'Redmi Note 12'],
    ['redmi', 'Redmi Note 11'],
    ['redmi', 'Redmi Note 10'],
    ['redmi', 'Redmi 13C'],
    ['redmi', 'Redmi 12'],
    ['redmi', 'Redmi 10'],
    ['poco', 'POCO X6 Pro'],
    ['poco', 'POCO X6'],
    ['poco', 'POCO X5 Pro'],
    ['poco', 'POCO F6'],
    ['poco', 'POCO F5'],
    ['poco', 'POCO M6 Pro'],
    ['huawei', 'P60 Pro'],
    ['huawei', 'P50'],
    ['huawei', 'Mate 50'],
    ['huawei', 'Nova 12'],
    ['huawei', 'Nova 11'],
    ['huawei', 'Nova 10'],
    ['honor', 'Magic 6 Pro'],
    ['honor', 'Magic 5'],
    ['honor', '200'],
    ['honor', '90'],
    ['honor', 'X9b'],
    ['honor', 'X8b'],
    ['honor', 'X7b'],
    ['realme', '12 Pro'],
    ['realme', '11 Pro'],
    ['realme', 'GT 6'],
    ['realme', 'C67'],
    ['realme', 'C55'],
    ['realme', 'Note 50'],
    ['oppo', 'Reno 11'],
    ['oppo', 'Reno 10'],
    ['oppo', 'A78'],
    ['oppo', 'A58'],
    ['vivo', 'V30'],
    ['vivo', 'V29'],
    ['vivo', 'Y36'],
    ['vivo', 'Y27'],
    ['oneplus', '12'],
    ['oneplus', '12R'],
    ['oneplus', '11'],
    ['oneplus', 'Nord 4'],
    ['oneplus', 'Nord 3'],
    ['oneplus', 'Nord CE 4'],
    ['google', 'Pixel 9 Pro'],
    ['google', 'Pixel 9'],
    ['google', 'Pixel 8 Pro'],
    ['google', 'Pixel 8'],
    ['google', 'Pixel 7'],
    ['google', 'Pixel 6a'],
    ['tecno', 'Camon 30'],
    ['tecno', 'Camon 20'],
    ['tecno', 'Spark 20'],
    ['tecno', 'Pova 6'],
    ['infinix', 'Note 40'],
    ['infinix', 'Note 30'],
    ['infinix', 'Hot 40'],
    ['infinix', 'Smart 8'],
    ['nothing', 'Phone (2)'],
    ['nothing', 'Phone (2a)'],
    ['nothing', 'Phone (1)'],
    ['sony', 'Xperia 1 V'],
    ['sony', 'Xperia 5 V'],
    ['sony', 'Xperia 10 V'],
    ['motorola', 'Edge 50'],
    ['motorola', 'Edge 40'],
    ['motorola', 'Moto G84'],
    ['motorola', 'Moto G54'],
    ['nokia', 'G42'],
    ['nokia', 'G22'],
    ['nokia', 'C32'],
    ['nokia', '3310'],
  ],
  moto: [
    'honda',
    'yamaha',
    'kawasaki',
    'suzuki',
    'bmw',
    'ktm',
    'ducati',
    'harley_davidson',
    'triumph',
    'aprilia',
    'husqvarna',
    'royal_enfield',
    'benelli',
    'cfmoto',
    'voge',
    'zontes',
    'bajaj',
    'racer',
    'motoland',
    'stels',
    'irbis',
    'kayo',
    'bse',
    'avantis',
    'ural',
    'izh',
    'minsk',
    'dnepr',
    'vespa',
    'sym',
    'kymco',
    'other',
  ],
  truck: [
    'kamaz',
    'gaz',
    'maz',
    'ural',
    'zil',
    'kraz',
    'uaz',
    'lada',
    'hyundai',
    'isuzu',
    'mercedes',
    'man',
    'scania',
    'volvo',
    'daf',
    'iveco',
    'renault',
    'ford',
    'fiat',
    'peugeot',
    'citroen',
    'volkswagen',
    'toyota',
    'mitsubishi',
    'hino',
    'foton',
    'faw',
    'shacman',
    'howo',
    'sitrak',
    'dongfeng',
    'jac',
    'baw',
    'sollers',
    'paz',
    'nefaz',
    'liaz',
    'other',
  ],
  phoneBrands: [
    'apple',
    'samsung',
    'xiaomi',
    'redmi',
    'poco',
    'huawei',
    'honor',
    'realme',
    'oppo',
    'vivo',
    'oneplus',
    'google',
    'tecno',
    'infinix',
    'nokia',
    'sony',
    'motorola',
    'zte',
    'nothing',
    'lenovo',
    'other',
  ],
  computerBrands: [
    'apple',
    'asus',
    'acer',
    'lenovo',
    'hp',
    'dell',
    'msi',
    'huawei',
    'honor',
    'samsung',
    'xiaomi',
    'microsoft',
    'gigabyte',
    'custom',
    'other',
  ],
  electronics: [
    'samsung',
    'lg',
    'sony',
    'apple',
    'xiaomi',
    'philips',
    'panasonic',
    'bosch',
    'haier',
    'hisense',
    'tcl',
    'canon',
    'nikon',
    'fujifilm',
    'gopro',
    'dji',
    'jbl',
    'yamaha',
    'huawei',
    'honor',
    'garmin',
    'amazfit',
    'nintendo',
    'microsoft',
    'dyson',
    'electrolux',
    'indesit',
    'beko',
    'gorenje',
    'midea',
    'candy',
    'whirlpool',
    'atlant',
    'biryusa',
    'other',
  ],
};

const seedOf = (kind: string) => {
  const seed = DICTIONARY_SEEDS.find((item) => item.kind === kind);
  if (!seed) throw new Error(`Нет справочника ${kind}`);
  return seed.entries;
};

/** Пары «справочник брендов → справочник моделей» (марка → модель). */
const PAIRS: readonly (readonly [string, string])[] = [
  [DictionaryKind.CAR_BRAND, DictionaryKind.CAR_MODEL],
  [DictionaryKind.MOTO_BRAND, DictionaryKind.MOTO_MODEL],
  [DictionaryKind.TRUCK_BRAND, DictionaryKind.TRUCK_MODEL],
  [DictionaryKind.PHONE_BRAND, DictionaryKind.PHONE_MODEL],
  [DictionaryKind.TABLET_BRAND, DictionaryKind.TABLET_MODEL],
  [DictionaryKind.COMPUTER_BRAND, DictionaryKind.LAPTOP_MODEL],
  [DictionaryKind.WATCH_BRAND, DictionaryKind.WATCH_MODEL],
  [DictionaryKind.PHOTO_BRAND, DictionaryKind.PHOTO_MODEL],
  [DictionaryKind.SPECIAL_BRAND, DictionaryKind.SPECIAL_MODEL],
];

/** Справочники только брендов: модель там вводится текстом. */
const BRAND_ONLY = [
  DictionaryKind.TV_BRAND,
  DictionaryKind.AUDIO_BRAND,
  DictionaryKind.APPLIANCE_BRAND,
  DictionaryKind.TOOL_BRAND,
  DictionaryKind.TIRE_BRAND,
  DictionaryKind.BIKE_BRAND,
  DictionaryKind.WATER_BRAND,
];

describe('Аудит справочников: целостность записей', () => {
  it('справочников много, и каждый не пуст', () => {
    expect(DICTIONARY_SEEDS.length).toBeGreaterThanOrEqual(26);
    // Каталоги (марки, модели, детали) — длинные; типы товара направления короче:
    // у «Винтов» три вида, и дописывать выдуманные ради числа не нужно
    for (const seed of DICTIONARY_SEEDS) {
      expect(seed.entries.length, seed.kind).toBeGreaterThan(
        seed.kind.startsWith('goods_type_') ? 2 : 5,
      );
    }
  });

  it('виды справочников уникальны и помещаются в колонку', () => {
    const kinds = DICTIONARY_SEEDS.map((seed) => seed.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const kind of kinds) expect(kind.length).toBeLessThanOrEqual(40);
  });

  it('нет пустых значений и подписей, лишних пробелов и слишком длинных строк', () => {
    const problems: string[] = [];
    for (const seed of DICTIONARY_SEEDS) {
      for (const entry of seed.entries) {
        const where = `${seed.kind}: «${entry.label}»`;
        if (!entry.value || !entry.label.trim()) problems.push(`${where} — пусто`);
        if (entry.label !== entry.label.trim() || /\s{2}/.test(entry.label)) {
          problems.push(`${where} — лишние пробелы`);
        }
        if (entry.value.length > 80 || entry.label.length > 120) problems.push(`${where} — длинно`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('пара «родитель + значение» уникальна; подписи не повторяются с точностью до регистра', () => {
    const problems: string[] = [];
    for (const seed of DICTIONARY_SEEDS) {
      const keys = new Set<string>();
      const labels = new Set<string>();
      for (const entry of seed.entries) {
        const key = `${entry.parent ?? ''}/${entry.value}`;
        if (keys.has(key)) problems.push(`${seed.kind}: повтор значения ${key}`);
        keys.add(key);
        const label = `${entry.parent ?? ''}/${entry.label.toLowerCase()}`;
        if (labels.has(label)) problems.push(`${seed.kind}: повтор подписи ${label}`);
        labels.add(label);
      }
    }
    expect(problems).toEqual([]);
  });

  it('значение модели — всегда modelValue(подпись), а значения брендов — строчные без пробелов', () => {
    const problems: string[] = [];
    for (const [brandKind, modelKind] of PAIRS) {
      for (const entry of seedOf(modelKind)) {
        if (entry.value !== modelValue(entry.label)) problems.push(`${modelKind}: ${entry.label}`);
      }
      for (const entry of seedOf(brandKind)) {
        if (!/^[a-z0-9_]+$/.test(entry.value)) problems.push(`${brandKind}: ${entry.value}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('«+» в конце названия не теряется в значении («S9» и «S9+» — разные модели)', () => {
    const lost = PAIRS.flatMap(([, modelKind]) =>
      seedOf(modelKind)
        .filter((entry) => /\+$/.test(entry.label))
        .map((entry) => `${modelKind}: ${entry.label}`),
    );
    expect(lost).toEqual([]);
  });

  it('у брендов-справочников есть «Другой бренд», и он последний', () => {
    for (const kind of [...BRAND_ONLY, ...PAIRS.map(([brandKind]) => brandKind)]) {
      if (kind === DictionaryKind.CAR_BRAND) continue;
      const entries = seedOf(kind);
      expect(entries.at(-1)?.value, kind).toBe(OTHER_BRAND);
    }
  });
});

describe('Аудит справочников: модель принадлежит бренду', () => {
  it('у каждой модели есть бренд из справочника той же категории', () => {
    const orphans: string[] = [];
    for (const [brandKind, modelKind] of PAIRS) {
      const brands = new Set(seedOf(brandKind).map((entry) => entry.value));
      for (const entry of seedOf(modelKind)) {
        if (!entry.parent || !brands.has(entry.parent)) {
          orphans.push(`${modelKind}: ${entry.label} → ${entry.parent}`);
        }
      }
    }
    expect(orphans).toEqual([]);
  });

  it('у «Другого бренда» моделей нет — там модель пишется текстом', () => {
    for (const [, modelKind] of PAIRS) {
      expect(seedOf(modelKind).filter((entry) => entry.parent === OTHER_BRAND)).toEqual([]);
    }
  });

  it('фирменные слова не попадают под чужой бренд (Galaxy — только Samsung, iPhone — Apple …)', () => {
    const OWNER: Readonly<Record<string, readonly string[]>> = {
      iphone: ['apple'],
      ipad: ['apple'],
      macbook: ['apple'],
      galaxy: ['samsung'],
      pixel: ['google'],
      xperia: ['sony'],
      thinkpad: ['lenovo'],
      ideapad: ['lenovo'],
      zenbook: ['asus'],
      vivobook: ['asus'],
      matebook: ['huawei'],
      magicbook: ['honor'],
      surface: ['microsoft'],
      latitude: ['dell'],
      inspiron: ['dell'],
      pavilion: ['hp'],
      lumix: ['panasonic'],
      coolpix: ['nikon'],
      mavic: ['dji'],
      osmo: ['dji'],
      hayabusa: ['suzuki'],
      panigale: ['ducati'],
      sportster: ['harley_davidson'],
      actros: ['mercedes'],
      kodiak: ['yamaha'],
      lexion: ['claas'],
      ninja: ['kawasaki'],
      grizzly: ['yamaha'],
      fenix: ['garmin', 'baw'],
      forerunner: ['garmin'],
    };
    const wrong: string[] = [];
    // Справочник легковых — отдельно: Galaxy есть и у Ford, и у Geely, Latitude — у Renault
    for (const [, modelKind] of PAIRS.filter(([, kind]) => kind !== DictionaryKind.CAR_MODEL)) {
      for (const entry of seedOf(modelKind)) {
        for (const word of entry.label.toLowerCase().split(/[^a-z0-9]+/)) {
          const owners = OWNER[word];
          if (owners && !owners.includes(entry.parent ?? '')) {
            wrong.push(`${modelKind}: ${entry.label} под ${entry.parent}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('одинаковое название у разных брендов одной категории — редкость, а не ошибка копирования', () => {
    for (const [, modelKind] of PAIRS) {
      const entries = seedOf(modelKind);
      const owners = new Map<string, Set<string>>();
      for (const entry of entries) {
        const set = owners.get(entry.value) ?? new Set<string>();
        set.add(entry.parent ?? '');
        owners.set(entry.value, set);
      }
      const shared = [...owners.values()].filter((set) => set.size > 1).length;
      expect(shared / owners.size, modelKind).toBeLessThan(0.1);
    }
  });

  it('копия списка одного бренда под другим (кроме Doosan/Develon) не допускается', () => {
    const problems: string[] = [];
    for (const [, modelKind] of PAIRS) {
      const byBrand = new Map<string, Set<string>>();
      for (const entry of seedOf(modelKind)) {
        const set = byBrand.get(entry.parent ?? '') ?? new Set<string>();
        set.add(entry.value);
        byBrand.set(entry.parent ?? '', set);
      }
      const brands = [...byBrand];
      for (let i = 0; i < brands.length; i += 1) {
        for (let j = i + 1; j < brands.length; j += 1) {
          const [a, setA] = brands[i] as [string, Set<string>];
          const [b, setB] = brands[j] as [string, Set<string>];
          if (setA.size < 8 || setB.size < 8) continue;
          const common = [...setA].filter((value) => setB.has(value)).length;
          const pair = [a, b].sort().join('/');
          if (common / Math.min(setA.size, setB.size) > 0.5 && pair !== 'develon/doosan') {
            problems.push(`${modelKind}: ${a} и ${b} совпадают на ${common}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('Аудит справочников: исходные списки без повторов', () => {
  const MAPS: readonly (readonly [string, Readonly<Record<string, readonly string[]>>])[] = [
    ['moto', MOTO_MODELS],
    ['truck', TRUCK_MODELS],
    ['tablet', TABLET_MODELS],
    ['laptop', LAPTOP_MODELS],
    ['watch', WATCH_MODELS],
    ['photo', PHOTO_MODELS],
    ['special', SPECIAL_MODELS],
  ];

  it('в исходниках моделей нет повторов внутри бренда', () => {
    const dups: string[] = [];
    for (const [name, map] of MAPS) {
      for (const [brand, labels] of Object.entries(map)) {
        const seen = new Set<string>();
        for (const label of labels) {
          const value = modelValue(label);
          if (seen.has(value)) dups.push(`${name}/${brand}: ${label}`);
          seen.add(value);
        }
      }
    }
    expect(dups).toEqual([]);
  });

  it('в исходнике телефонов нет повторов внутри бренда', () => {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const model of PHONE_MODELS) {
      const key = `${model.brand}/${modelValue(model.label)}`;
      if (seen.has(key)) dups.push(model.label);
      seen.add(key);
    }
    expect(dups).toEqual([]);
  });

  it('повторов нет и в списках брендов', () => {
    for (const list of [
      MOTO_BRANDS,
      TRUCK_BRANDS,
      PHONE_BRANDS,
      COMPUTER_BRANDS,
      TV_BRANDS,
      AUDIO_BRANDS,
      APPLIANCE_BRANDS,
      PHOTO_BRANDS,
      WATCH_BRANDS,
      TIRE_BRANDS,
      TOOL_BRANDS,
      BIKE_BRANDS,
      WATER_BRANDS,
      SPECIAL_BRANDS,
    ]) {
      const values = list.map((brand) => brand.value);
      expect(new Set(values).size).toBe(values.length);
      const labels = list.map((brand) => brand.label.toLowerCase());
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe('Аудит справочников: старые значения не потеряны', () => {
  it('все прежние модели телефонов на месте', () => {
    const now = new Set(PHONE_MODELS.map((model) => `${model.brand}/${model.label}`));
    const lost = LEGACY.phones.filter(([brand, label]) => !now.has(`${brand}/${label}`));
    expect(lost).toEqual([]);
  });

  it('прежние бренды мото, грузовиков, телефонов и компьютеров сохранились', () => {
    const has = (kind: string) => new Set(seedOf(kind).map((entry) => entry.value));
    expect(LEGACY.moto.filter((value) => !has(DictionaryKind.MOTO_BRAND).has(value))).toEqual([]);
    expect(LEGACY.truck.filter((value) => !has(DictionaryKind.TRUCK_BRAND).has(value))).toEqual([]);
    expect(
      LEGACY.phoneBrands.filter((value) => !has(DictionaryKind.PHONE_BRAND).has(value)),
    ).toEqual([]);
    expect(
      LEGACY.computerBrands.filter((value) => !has(DictionaryKind.COMPUTER_BRAND).has(value)),
    ).toEqual([]);
  });

  it('прежний общий список остался справочником, а бренды категорий покрывают свои значения', () => {
    const legacyKind = new Set(
      seedOf(DictionaryKind.ELECTRONICS_BRAND).map((entry) => entry.value),
    );
    expect([...legacyKind].sort()).toEqual([...LEGACY.electronics].sort());
    const covers = (kind: string, values: readonly string[]) => {
      const have = new Set(seedOf(kind).map((entry) => entry.value));
      return values.filter((value) => !have.has(value));
    };
    expect(
      covers(DictionaryKind.TV_BRAND, [
        'samsung',
        'lg',
        'sony',
        'philips',
        'panasonic',
        'haier',
        'hisense',
        'tcl',
        'xiaomi',
        'huawei',
        'honor',
      ]),
    ).toEqual([]);
    expect(
      covers(DictionaryKind.AUDIO_BRAND, [
        'sony',
        'jbl',
        'yamaha',
        'apple',
        'samsung',
        'xiaomi',
        'huawei',
        'honor',
      ]),
    ).toEqual([]);
    expect(
      covers(DictionaryKind.PHOTO_BRAND, [
        'canon',
        'nikon',
        'sony',
        'fujifilm',
        'panasonic',
        'gopro',
        'dji',
        'samsung',
      ]),
    ).toEqual([]);
    expect(
      covers(DictionaryKind.WATCH_BRAND, [
        'apple',
        'samsung',
        'xiaomi',
        'huawei',
        'honor',
        'garmin',
        'amazfit',
      ]),
    ).toEqual([]);
    expect(
      covers(DictionaryKind.APPLIANCE_BRAND, [
        'bosch',
        'samsung',
        'lg',
        'haier',
        'hisense',
        'philips',
        'panasonic',
        'dyson',
        'electrolux',
        'indesit',
        'beko',
        'gorenje',
        'midea',
        'candy',
        'whirlpool',
        'atlant',
        'biryusa',
        'xiaomi',
      ]),
    ).toEqual([]);
  });
});

describe('Аудит справочников: написания для поиска', () => {
  it('написания — строчные, не пустые, без повторов', () => {
    const problems: string[] = [];
    for (const seed of DICTIONARY_SEEDS) {
      for (const entry of seed.entries) {
        const aliases = entry.aliases ?? [];
        if (new Set(aliases).size !== aliases.length)
          problems.push(`${seed.kind}: ${entry.label} — повтор`);
        for (const alias of aliases) {
          if (!alias.trim() || alias !== alias.toLowerCase() || alias !== alias.trim()) {
            problems.push(`${seed.kind}: ${entry.label} — «${alias}»`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('написания брендов относятся к существующим брендам, а моделей — к существующим моделям', () => {
    const brandValues = new Set<string>();
    const modelValues = new Set<string>();
    for (const seed of DICTIONARY_SEEDS) {
      for (const entry of seed.entries)
        (seed.kind.endsWith('_model') ? modelValues : brandValues).add(entry.value);
    }
    expect(Object.keys(BRAND_ALIASES).filter((key) => !brandValues.has(key))).toEqual([]);
    expect(Object.keys(MODEL_ALIASES).filter((key) => !modelValues.has(key))).toEqual([]);
  });

  it('русское написание собирается по словам и не создаётся без знакомых слов', () => {
    expect(russianModelAlias('iPhone 15 Pro Max')).toBe('айфон 15 про макс');
    expect(russianModelAlias('Galaxy S24 Ultra')).toBe('галакси s24 ультра');
    expect(russianModelAlias('Apple Watch Series 9')).toBe('эпл вотч серия 9');
    expect(russianModelAlias('XT660R')).toBeNull();
  });

  const entries = (kind: string, brand: string) =>
    seedOf(kind).filter((entry) => entry.parent === brand);
  /** Как ищет SearchableSelect: подпись или любое написание, без регистра. */
  const search = (kind: string, brand: string, needle: string) =>
    entries(kind, brand)
      .filter(
        (entry) =>
          entry.label.toLowerCase().includes(needle) ||
          (entry.aliases ?? []).some((alias) => alias.includes(needle)),
      )
      .map((entry) => entry.label);

  it('поиск по кириллице и латинице работает в разных категориях', () => {
    expect(search(DictionaryKind.PHONE_MODEL, 'apple', 'айфон 15 про')).toEqual(
      expect.arrayContaining(['iPhone 15 Pro', 'iPhone 15 Pro Max']),
    );
    expect(search(DictionaryKind.PHONE_MODEL, 'samsung', 'галакси a54')).toEqual(['Galaxy A54']);
    expect(search(DictionaryKind.LAPTOP_MODEL, 'apple', 'макбук')).toEqual(
      expect.arrayContaining(['MacBook Air', 'MacBook Pro']),
    );
    expect(search(DictionaryKind.LAPTOP_MODEL, 'lenovo', 'тинкпад')).toEqual(
      expect.arrayContaining(['ThinkPad T', 'ThinkPad X1 Carbon']),
    );
    expect(search(DictionaryKind.MOTO_MODEL, 'kawasaki', 'ниндзя 400')).toEqual(['Ninja 400']);
    expect(search(DictionaryKind.MOTO_MODEL, 'suzuki', 'хаябуса')).toEqual(
      expect.arrayContaining(['GSX1300R Hayabusa']),
    );
    expect(search(DictionaryKind.TRUCK_MODEL, 'mercedes', 'актрос')).toEqual(['Actros']);
    expect(search(DictionaryKind.PHOTO_MODEL, 'dji', 'мавик')).toEqual(
      expect.arrayContaining(['Mavic 3 Pro']),
    );
    expect(search(DictionaryKind.TABLET_MODEL, 'apple', 'айпад')).toEqual(
      expect.arrayContaining(['iPad Air', 'iPad mini']),
    );
    expect(search(DictionaryKind.SPECIAL_MODEL, 'caterpillar', '320')).toContain('320');
  });

  it('у брендов разных категорий есть русские написания', () => {
    for (const [kind, value, alias] of [
      [DictionaryKind.MOTO_BRAND, 'kawasaki', 'кавасаки'],
      [DictionaryKind.MOTO_BRAND, 'polaris', 'полярис'],
      [DictionaryKind.TRUCK_BRAND, 'scania', 'скания'],
      [DictionaryKind.PHONE_BRAND, 'xiaomi', 'сяоми'],
      [DictionaryKind.COMPUTER_BRAND, 'dell', 'делл'],
      [DictionaryKind.TV_BRAND, 'philips', 'филипс'],
      [DictionaryKind.AUDIO_BRAND, 'sennheiser', 'сенхайзер'],
      [DictionaryKind.APPLIANCE_BRAND, 'bosch', 'бош'],
      [DictionaryKind.SPECIAL_BRAND, 'komatsu', 'комацу'],
      [DictionaryKind.SPECIAL_BRAND, 'john_deere', 'джон дир'],
      [DictionaryKind.TOOL_BRAND, 'makita', 'макита'],
      [DictionaryKind.TIRE_BRAND, 'michelin', 'мишлен'],
    ] as const) {
      expect(
        seedOf(kind).find((entry) => entry.value === value)?.aliases,
        `${kind}/${value}`,
      ).toContain(alias);
    }
  });

  it('поиск по большому списку — доли миллисекунды на нажатие', () => {
    const largest = [...DICTIONARY_SEEDS].sort((a, b) => b.entries.length - a.entries.length)[0];
    expect(largest?.entries.length).toBeGreaterThan(1500);
    const subset = seedOf(DictionaryKind.MOTO_MODEL).filter((entry) => entry.parent === 'yamaha');
    expect(subset.length).toBeGreaterThan(100);
    const started = performance.now();
    for (let i = 0; i < 200; i += 1) {
      subset.filter(
        (entry) =>
          entry.label.toLowerCase().includes('xt') ||
          (entry.aliases ?? []).some((a) => a.includes('xt')),
      );
    }
    expect((performance.now() - started) / 200).toBeLessThan(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Категории: поля бренда и модели, создание, правка, фильтр, смена бренда
// ─────────────────────────────────────────────────────────────────────────────

/** Категория → справочники бренда и модели, как их должен видеть человек. */
const EXPECTED: readonly {
  slug: string;
  brand: string;
  model?: string;
  /** Пример: бренд, название модели, подпись */
  sample: readonly [string, string][];
}[] = [
  {
    slug: 'transport-cars',
    brand: DictionaryKind.CAR_BRAND,
    model: DictionaryKind.CAR_MODEL,
    sample: [
      ['toyota', 'Succeed'],
      ['nissan', 'Wingroad'],
    ],
  },
  {
    slug: 'transport-moto',
    brand: DictionaryKind.MOTO_BRAND,
    model: DictionaryKind.MOTO_MODEL,
    sample: [
      ['kawasaki', 'Ninja 400'],
      ['yamaha', 'MT-07'],
      ['honda', 'CB400 Super Four'],
      ['polaris', 'RZR 1000'],
      ['ski_doo', 'Summit'],
    ],
  },
  {
    slug: 'transport-trucks',
    brand: DictionaryKind.TRUCK_BRAND,
    model: DictionaryKind.TRUCK_MODEL,
    sample: [
      ['kamaz', '65115'],
      ['mercedes', 'Actros'],
      ['hyundai', 'HD78'],
      ['isuzu', 'Forward'],
    ],
  },
  {
    slug: 'transport-special',
    brand: DictionaryKind.SPECIAL_BRAND,
    model: DictionaryKind.SPECIAL_MODEL,
    sample: [
      ['caterpillar', '320'],
      ['komatsu', 'PC200'],
      ['jcb', '3CX'],
      ['bobcat', 'S650'],
    ],
  },
  {
    slug: 'business-agro',
    brand: DictionaryKind.SPECIAL_BRAND,
    model: DictionaryKind.SPECIAL_MODEL,
    sample: [
      ['john_deere', '6R'],
      ['belarus', '82'],
      ['kirovets', 'К-701'],
    ],
  },
  {
    slug: 'electronics-phones',
    brand: DictionaryKind.PHONE_BRAND,
    model: DictionaryKind.PHONE_MODEL,
    sample: [
      ['apple', 'iPhone 6s'],
      ['samsung', 'Galaxy S10e'],
      ['xiaomi', 'Mi 9T'],
      ['redmi', 'Redmi Note 8 Pro'],
    ],
  },
  {
    slug: 'electronics-tablets',
    brand: DictionaryKind.TABLET_BRAND,
    model: DictionaryKind.TABLET_MODEL,
    sample: [
      ['apple', 'iPad Pro 11'],
      ['samsung', 'Galaxy Tab S7 FE'],
      ['huawei', 'MatePad 11'],
    ],
  },
  {
    slug: 'electronics-laptops',
    brand: DictionaryKind.COMPUTER_BRAND,
    model: DictionaryKind.LAPTOP_MODEL,
    sample: [
      ['apple', 'MacBook Air'],
      ['lenovo', 'ThinkPad T'],
      ['asus', 'TUF Gaming F15'],
      ['hp', 'Omen'],
    ],
  },
  {
    slug: 'electronics-watches',
    brand: DictionaryKind.WATCH_BRAND,
    model: DictionaryKind.WATCH_MODEL,
    sample: [
      ['apple', 'Apple Watch Series 9'],
      ['garmin', 'Fenix 7'],
      ['amazfit', 'GTR 4'],
    ],
  },
  {
    slug: 'electronics-photo',
    brand: DictionaryKind.PHOTO_BRAND,
    model: DictionaryKind.PHOTO_MODEL,
    sample: [
      ['canon', 'EOS 5D Mark IV'],
      ['sony', 'a7 III'],
      ['dji', 'Mavic 3 Pro'],
      ['gopro', 'HERO 12 Black'],
    ],
  },
  { slug: 'electronics-tv', brand: DictionaryKind.TV_BRAND, sample: [] },
  { slug: 'electronics-audio', brand: DictionaryKind.AUDIO_BRAND, sample: [] },
  { slug: 'home-appliances', brand: DictionaryKind.APPLIANCE_BRAND, sample: [] },
  { slug: 'home-tools', brand: DictionaryKind.TOOL_BRAND, sample: [] },
  { slug: 'transport-tires', brand: DictionaryKind.TIRE_BRAND, sample: [] },
  { slug: 'hobby-bikes', brand: DictionaryKind.BIKE_BRAND, sample: [] },
  { slug: 'transport-water', brand: DictionaryKind.WATER_BRAND, sample: [] },
];

function attributesOf(slug: string): readonly ListingAttribute[] {
  const category = findSeedCategory(slug);
  if (!category) throw new Error(`Нет категории ${slug}`);
  return resolveAttributes(bindingsOf(category));
}

const lookup = (kind: string, value: string, parent?: string) =>
  seedOf(kind).some(
    (entry) =>
      entry.value === value &&
      (parent === ANY_DICTIONARY_PARENT || (entry.parent ?? '') === (parent ?? '')),
  );

/** Допустимые значения обязательных полей — чтобы проверять только марку и модель. */
function requiredValues(attributes: readonly ListingAttribute[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const attribute of attributes) {
    if (!attribute.required) continue;
    if (attribute.type === 'enum') values[attribute.key] = attribute.options?.[0]?.value;
    else if (attribute.type === 'number') values[attribute.key] = Math.max(attribute.min ?? 1, 1);
    else if (attribute.type === 'boolean') values[attribute.key] = true;
    else if (attribute.type === 'string') values[attribute.key] = 'Тест';
  }
  return values;
}

const labelValue = (kind: string, brand: string, label: string): string => {
  const entry = seedOf(kind).find((item) => item.parent === brand && item.label === label);
  if (!entry) throw new Error(`Нет модели «${label}» у ${brand} в ${kind}`);
  return entry.value;
};

describe('Аудит категорий: бренд и модель привязаны к своему справочнику', () => {
  it('поля бренда и модели берут справочник своей категории', () => {
    for (const expected of EXPECTED) {
      const attributes = attributesOf(expected.slug);
      const brand = attributes.find((attribute) => attribute.key === 'brand');
      expect(brand?.type, `${expected.slug}: brand`).toBe('brand');
      expect(brand?.dictionary, `${expected.slug}: brand`).toBe(expected.brand);
      if (expected.model) {
        const model = attributes.find((attribute) => attribute.key === 'model');
        expect(model?.type, `${expected.slug}: model`).toBe('model');
        expect(model?.parentKey, `${expected.slug}: model`).toBe('brand');
        expect(model?.dictionary, `${expected.slug}: model`).toBe(expected.model);
        expect(model?.filter).toBe('select');
      }
    }
  });

  it('бренд — фильтр «выбор», по нему можно искать', () => {
    for (const expected of EXPECTED) {
      const brand = attributesOf(expected.slug).find((attribute) => attribute.key === 'brand');
      expect(brand?.filter, expected.slug).toBe('select');
      expect(brand?.filterable, expected.slug).toBe(true);
    }
  });

  it('все справочники, на которые ссылаются категории, существуют', () => {
    const known = new Set(DICTIONARY_SEEDS.map((seed) => seed.kind));
    const missing: string[] = [];
    for (const { category } of flattenSeedCategories()) {
      for (const binding of bindingsOf(category)) {
        if (binding.dictionary && !known.has(binding.dictionary)) {
          missing.push(`${category.slug}: ${binding.key} → ${binding.dictionary}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(SEED_LISTING_CATEGORIES.length).toBeGreaterThan(5);
  });

  it('один и тот же бренд в разных категориях — разные списки моделей', () => {
    const models = (slug: string, brand: string) =>
      seedOf(EXPECTED.find((item) => item.slug === slug)?.model ?? '')
        .filter((entry) => entry.parent === brand)
        .map((entry) => entry.value);
    // Samsung: телефоны, планшеты, ноутбуки, часы — четыре разных каталога
    const sets = [
      models('electronics-phones', 'samsung'),
      models('electronics-tablets', 'samsung'),
      models('electronics-laptops', 'samsung'),
      models('electronics-watches', 'samsung'),
    ];
    for (const set of sets) expect(set.length).toBeGreaterThan(5);
    const joined = sets.flat();
    expect(new Set(joined).size).toBe(joined.length);
    // Honda: машины и мотоциклы
    const cars = models('transport-cars', 'honda');
    const motos = models('transport-moto', 'honda');
    expect(cars).toContain('civic');
    expect(motos).not.toContain('civic');
    expect(motos).toContain('cb400_super_four');
    expect(cars).not.toContain('cb400_super_four');
  });

  it('категории без каталога моделей оставляют модель текстом, а не пустым списком', () => {
    for (const slug of [
      'electronics-tv',
      'electronics-audio',
      'home-appliances',
      'transport-water',
    ]) {
      const model = attributesOf(slug).find((attribute) => attribute.key === 'modelName');
      expect(model?.type, slug).toBe('string');
      expect(model?.filter, slug).toBe('text');
    }
  });
});

describe('Аудит категорий: создание, правка, фильтр', () => {
  for (const expected of EXPECTED.filter((item) => item.model)) {
    describe(expected.slug, () => {
      const attributes = attributesOf(expected.slug);
      const schema = attributesSchemaFor(attributes, lookup);
      const base = { ...requiredValues(attributes), year: 2015 };
      const modelKind = expected.model as string;

      it('существующие модели проходят проверку при создании и правке', () => {
        for (const [brand, label] of expected.sample) {
          const model = labelValue(modelKind, brand, label);
          const result = schema.safeParse({ ...base, brand, model });
          expect(result.success, `${brand} ${label}`).toBe(true);
        }
      });

      it('модель чужого бренда отклоняется', () => {
        const [first, second] = expected.sample;
        if (!first || !second || first[0] === second[0]) return;
        const foreign = labelValue(modelKind, second[0], second[1]);
        const result = schema.safeParse({ ...base, brand: first[0], model: foreign });
        expect(result.success).toBe(false);
      });

      it('фильтр «бренд + модель» — два условия вместе', () => {
        const [brand, label] = expected.sample[0] as [string, string];
        const model = labelValue(modelKind, brand, label);
        const conditions = attributeSql(attributes, { brand, model }).map(renderSql);
        expect(conditions).toHaveLength(2);
        expect(conditions.join(' ')).toContain(`'${brand}'`);
        expect(conditions.join(' ')).toContain(`'${model}'`);
      });

      it('смена бренда очищает модель прежнего бренда', () => {
        const [first, second] = expected.sample;
        if (!first || !second || first[0] === second[0]) return;
        const chosen = { brand: first[0], model: labelValue(modelKind, first[0], first[1]) };
        expect(withAttributeValue(attributes, chosen, 'brand', second[0])).toEqual({
          brand: second[0],
        });
        expect(withAttributeValue(attributes, chosen, 'brand', first[0])).toEqual(chosen);
        expect(withAttributeValue(attributes, chosen, 'brand', undefined)).toEqual({});
      });
    });
  }

  for (const expected of EXPECTED.filter((item) => !item.model)) {
    it(`${expected.slug}: бренд из справочника проходит, чужой — нет, модель вводится текстом`, () => {
      const attributes = attributesOf(expected.slug);
      const schema = attributesSchemaFor(attributes, lookup);
      const first = seedOf(expected.brand)[0]?.value as string;
      const base = requiredValues(attributes);
      expect(
        schema.safeParse({ ...base, brand: first, modelName: 'Любая модель 5000' }).success,
      ).toBe(true);
      expect(schema.safeParse({ ...base, brand: 'нет_такого_бренда' }).success).toBe(false);
    });
  }

  it('«Другой бренд» принимается без модели из справочника', () => {
    for (const expected of EXPECTED.filter((item) => item.model)) {
      const attributes = attributesOf(expected.slug);
      const schema = attributesSchemaFor(attributes, lookup);
      const result = schema.safeParse({
        ...requiredValues(attributes),
        year: 2015,
        brand: OTHER_BRAND,
        model: 'Своя модель',
      });
      expect(result.success, expected.slug).toBe(true);
    }
  });
});

describe('Аудит: заголовок объявления и модели', () => {
  const guess = (title: string) => {
    const verdict = classifyListingTitle(title);
    return verdict.kind === 'guess' ? verdict.guess : undefined;
  };

  it('телефон узнаётся по модели, а «пробег 90 000» — не Honor 90', () => {
    expect(guess('iPhone 6s 64GB')?.attributes).toMatchObject({
      brand: 'apple',
      model: 'iphone_6s',
    });
    expect(guess('Samsung Galaxy A54 128GB')?.attributes).toMatchObject({
      brand: 'samsung',
      model: 'galaxy_a54',
    });
    expect(guess('Toyota Succeed 2015 пробег 90 000')?.attributes).toMatchObject({
      brand: 'toyota',
      model: 'succeed',
    });
    expect(guess('Toyota Succeed 2015 пробег 90 000')?.slug).toBe('transport-cars');
    expect(guess('Honor 90 256GB')?.attributes).toMatchObject({ brand: 'honor', model: '90' });
    expect(guess('Продам, пробег 90 000')?.slug).not.toBe('electronics-phones');
  });
});
