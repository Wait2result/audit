import {
  ANY_DICTIONARY_PARENT,
  BRAND_ALIASES,
  CAR_BRANDS,
  DICTIONARY_SEEDS,
  DictionaryKind,
  MODEL_ALIASES,
  OTHER_BRAND,
  attributesSchemaFor,
  bindingsOf,
  classifyListingTitle,
  findSeedCategory,
  modelValue,
  modelsForBrand,
  resolveAttributes,
  withAttributeValue,
  type ListingAttribute,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { attributeSql, renderSql } from '../src/modules/listings/listing-query.js';

/**
 * Справочник автомобильных марок и моделей: полнота и целостность.
 *
 * Модель — отдельное название («Succeed», «Corolla Fielder»), а не поколение
 * и не комплектация. Значение модели — `modelValue(подпись)` — лежит в
 * объявлениях, поэтому уже существовавшие модели обязаны остаться.
 */

/** Модели, которые были в справочнике до расширения: все должны сохраниться. */
const LEGACY: Readonly<Record<string, readonly string[]>> = {
  lada: [
    'Granta',
    'Vesta',
    'Largus',
    'Niva Legend',
    'Niva Travel',
    'XRAY',
    'Kalina',
    'Priora',
    '2107',
    '2109',
    '2110',
    '2114',
    '2115',
    '4x4 (Нива)',
  ],
  uaz: ['Patriot', 'Hunter', 'Pickup', '469', 'Buhanka (3909)'],
  gaz: ['Volga Siber', '3110 Волга', '31105 Волга', 'Соболь', 'Газель'],
  moskvich: ['3', '6', '8', '412'],
  toyota: [
    'Camry',
    'Corolla',
    'RAV4',
    'Land Cruiser 200',
    'Land Cruiser 300',
    'Land Cruiser Prado',
    'Hilux',
    'Highlander',
    'Avensis',
    'Yaris',
    'Auris',
    'C-HR',
    'Fortuner',
    'Venza',
    'Alphard',
    'Sienna',
    'Prius',
  ],
  nissan: [
    'Qashqai',
    'X-Trail',
    'Almera',
    'Teana',
    'Murano',
    'Juke',
    'Note',
    'Sentra',
    'Pathfinder',
    'Patrol',
    'Navara',
    'Terrano',
    'Primera',
  ],
  datsun: ['on-DO', 'mi-DO'],
  honda: ['Civic', 'Accord', 'CR-V', 'Fit (Jazz)', 'Pilot', 'HR-V', 'Odyssey', 'Freed'],
  mazda: ['3', '6', 'CX-5', 'CX-9', 'CX-3', 'CX-30', 'MX-5', 'Demio'],
  mitsubishi: [
    'Outlander',
    'ASX',
    'Lancer',
    'Pajero',
    'Pajero Sport',
    'L200',
    'Colt',
    'Eclipse Cross',
  ],
  suzuki: ['Vitara', 'SX4', 'Jimny', 'Swift', 'Grand Vitara'],
  subaru: ['Forester', 'Outback', 'Impreza', 'Legacy', 'XV'],
  lexus: ['RX', 'NX', 'ES', 'LX', 'GX', 'IS', 'LS', 'UX'],
  infiniti: ['QX50', 'QX60', 'QX70', 'Q50', 'FX', 'G37'],
  hyundai: [
    'Solaris',
    'Creta',
    'Tucson',
    'Santa Fe',
    'Elantra',
    'Sonata',
    'ix35',
    'Accent',
    'Getz',
    'Palisade',
    'Staria',
    'Porter',
  ],
  kia: [
    'Rio',
    'Sportage',
    'Sorento',
    'Ceed',
    'Optima',
    'Cerato',
    'Soul',
    'K5',
    'Seltos',
    'Picanto',
    'Mohave',
    'Carnival',
  ],
  ssangyong: ['Rexton', 'Kyron', 'Actyon', 'Tivoli', 'Musso'],
  daewoo: ['Nexia', 'Matiz', 'Gentra', 'Lanos'],
  volkswagen: [
    'Polo',
    'Tiguan',
    'Passat',
    'Golf',
    'Jetta',
    'Touareg',
    'Multivan',
    'Caddy',
    'Transporter',
    'Amarok',
    'Teramont',
  ],
  skoda: ['Octavia', 'Rapid', 'Kodiaq', 'Karoq', 'Superb', 'Fabia', 'Yeti'],
  audi: ['A3', 'A4', 'A6', 'A8', 'Q3', 'Q5', 'Q7', 'Q8', 'A5', 'TT'],
  bmw: [
    '1 серия',
    '3 серия',
    '5 серия',
    '7 серия',
    'X1',
    'X3',
    'X5',
    'X6',
    'X7',
    '4 серия',
    '6 серия',
    'Z4',
  ],
  mercedes: [
    'A-класс',
    'C-класс',
    'E-класс',
    'S-класс',
    'GLA',
    'GLC',
    'GLE',
    'GLS',
    'Vito',
    'Sprinter',
    'ML',
    'G-класс',
  ],
  opel: ['Astra', 'Corsa', 'Insignia', 'Zafira', 'Mokka', 'Vectra'],
  renault: ['Logan', 'Duster', 'Sandero', 'Arkana', 'Kaptur', 'Megane', 'Fluence', 'Symbol'],
  peugeot: ['308', '408', '3008', '5008', '206', '207', '4008'],
  citroen: ['C4', 'C5', 'C3', 'Berlingo', 'Jumper'],
  ford: ['Focus', 'Mondeo', 'Kuga', 'Explorer', 'Fiesta', 'EcoSport', 'Transit'],
  chevrolet: ['Niva', 'Cruze', 'Lacetti', 'Aveo', 'Captiva', 'Cobalt', 'Trailblazer'],
  volvo: ['XC60', 'XC90', 'S60', 'S90', 'XC40', 'V60'],
  fiat: ['Albea', 'Ducato', 'Doblo', '500'],
  mini: ['Cooper', 'Countryman', 'Clubman'],
  porsche: ['Cayenne', 'Macan', 'Panamera', '911', 'Taycan'],
  land_rover: ['Range Rover', 'Range Rover Sport', 'Discovery', 'Defender', 'Evoque'],
  jaguar: ['XF', 'XE', 'F-Pace', 'E-Pace'],
  chery: ['Tiggo 4', 'Tiggo 7', 'Tiggo 8', 'Arrizo 5', 'Tiggo 2', 'Bonus'],
  geely: ['Coolray', 'Atlas', 'Emgrand', 'Tugella', 'Monjaro'],
  haval: ['Jolion', 'F7', 'Dargo', 'M6', 'H9', 'F7x'],
  changan: ['CS35 Plus', 'CS55 Plus', 'CS75', 'Uni-K', 'Alsvin'],
  great_wall: ['Poer', 'Hover'],
  jac: ['S3', 'S4', 'JS4'],
  exeed: ['TXL', 'LX', 'VX'],
  omoda: ['C5', 'S5'],
  tank: ['300', '500'],
  voyah: ['Free', 'Dream'],
  zeekr: ['001', '009', 'X'],
  gac: ['GS4', 'GS8', 'Empow'],
  faw: ['Bestune T77', 'Besturn X40'],
  byd: ['Song Plus', 'Han', 'Tang', 'Yuan Plus', 'Seal'],
  seat: ['Leon', 'Ibiza', 'Ateca'],
  acura: ['MDX', 'RDX', 'TLX'],
  cadillac: ['Escalade', 'CTS', 'SRX'],
  jeep: ['Grand Cherokee', 'Wrangler', 'Compass', 'Cherokee'],
  dodge: ['Charger', 'Journey', 'Caravan'],
  chrysler: ['300C', 'Pacifica', 'Voyager'],
  lincoln: ['Navigator', 'MKC', 'Aviator'],
  saab: ['9-3', '9-5'],
  genesis: ['G70', 'G80', 'GV70', 'GV80'],
  zaz: ['Sens', 'Chance', 'Vida'],
};

/** Выборка редких и снятых с производства моделей по разным маркам. */
const SAMPLES: Readonly<Record<string, readonly string[]>> = {
  toyota: [
    'Camry',
    'Succeed',
    'Probox',
    'Corolla Fielder',
    'Corolla Axio',
    'Premio',
    'Allion',
    'Mark X',
    'Mark II',
    'Chaser',
    'Cresta',
    'Altezza',
    'Aristo',
    'Celsior',
    'Crown',
    'Crown Majesta',
    'Vitz',
    'Aqua',
    'Wish',
    'Noah',
    'Voxy',
    'Estima',
    'Vellfire',
    'Hiace',
    'FJ Cruiser',
    'Rush',
    'Harrier',
    'Land Cruiser',
    'Land Cruiser Prado',
  ],
  nissan: [
    'Wingroad',
    'Elgrand',
    'Serena',
    'Skyline',
    'Bluebird Sylphy',
    'Cube',
    'Tiida',
    'Stagea',
  ],
  honda: ['Stepwgn', 'Airwave', 'Freed', 'Odyssey', 'Vezel', 'Inspire', 'Legend', 'N-Box'],
  mazda: ['Atenza', 'Axela', 'Premacy', 'Bongo', 'RX-8', 'CX-7'],
  mitsubishi: ['Delica', 'Chariot Grandis', 'Legnum', 'Galant', 'Pajero Mini', 'Lancer Evolution'],
  subaru: ['Levorg', 'Exiga', 'Legacy B4', 'Tribeca', 'WRX', 'Sambar'],
  suzuki: ['Escudo', 'Wagon R', 'Alto', 'Hustler', 'Kizashi'],
  daihatsu: ['Mira', 'Tanto', 'Terios', 'Hijet'],
  isuzu: ['Bighorn', 'Wizard', 'D-Max', 'Trooper'],
  lexus: ['GS', 'LC', 'CT', 'RC', 'LM'],
  infiniti: ['QX80', 'Q60', 'M', 'EX'],
  hyundai: ['Grandeur', 'Starex', 'Veloster', 'Ioniq 5', 'Galloper'],
  kia: ['K7', 'Stinger', 'Carens', 'Pride', 'EV6', 'Telluride'],
  volkswagen: ['Passat CC', 'Scirocco', 'Sharan', 'ID.4', 'T-Roc', 'Phaeton'],
  skoda: ['Enyaq', 'Kamiq', 'Felicia', 'Favorit'],
  audi: ['A1', 'A7', 'Q2', 'R8', 'e-tron', '100', '80'],
  bmw: ['X4', 'i3', 'M3', '8 серия', 'Z3'],
  mercedes: ['CLS', 'GLK', 'B-класс', 'EQS', 'SLK'],
  opel: ['Antara', 'Omega', 'Meriva', 'Frontera'],
  renault: ['Clio', 'Espace', 'Koleos', 'Safrane', 'Zoe'],
  peugeot: ['206', '308', '508', 'Partner', '4007'],
  citroen: ['Xsara Picasso', 'C-Crosser', 'Jumpy', 'Saxo'],
  ford: ['Mustang', 'Scorpio', 'Ranger', 'Galaxy', 'S-Max', 'Fusion'],
  chevrolet: ['Camaro', 'Tahoe', 'Orlando', 'Spark', 'Lanos'],
  fiat: ['Panda', 'Punto', 'Bravo', 'Fiorino', 'Tipo'],
  porsche: ['Boxster', 'Cayman', '928', '944'],
  volvo: ['XC70', 'V50', 'S40', '850', '940'],
  chery: ['Tiggo 7 Pro', 'Amulet', 'Fora', 'Tiggo 5', 'Arrizo 8'],
  geely: ['Atlas Pro', 'Emgrand X7', 'Okavango', 'Preface'],
  haval: ['H6', 'H3', 'Dargo X', 'F5'],
  byd: ['Atto 3', 'Dolphin', 'Seal U', 'Qin Plus'],
  gac: ['GS5', 'GA6', 'Aion Y'],
  jeep: ['Renegade', 'Gladiator', 'Liberty', 'Commander'],
  dodge: ['Challenger', 'Durango', 'Caliber', 'Nitro'],
  cadillac: ['CT5', 'XT5', 'DeVille', 'Lyriq'],
  lada: ['Granta', 'Samara', '2106', '2105', 'Iskra', 'Aura'],
  uaz: ['Patriot', '3151', 'Profi', 'Simbir'],
  gaz: ['Газель Next', 'Победа', '21 Волга'],
  zaz: ['Tavria', 'Slavuta', '965', 'Forza'],
};

const brandSeed = DICTIONARY_SEEDS.find((seed) => seed.kind === DictionaryKind.CAR_BRAND);
const modelSeed = DICTIONARY_SEEDS.find((seed) => seed.kind === DictionaryKind.CAR_MODEL);

const realBrands = CAR_BRANDS.filter((brand) => brand.value !== OTHER_BRAND);
const totalModels = CAR_BRANDS.reduce((sum, brand) => sum + brand.models.length, 0);

describe('Автомобили: справочник марок и моделей', () => {
  it('все прежние марки сохранились, их значения не изменились', () => {
    const values = new Set(CAR_BRANDS.map((brand) => brand.value));
    for (const value of Object.keys(LEGACY)) expect(values.has(value), value).toBe(true);
    expect(values.has(OTHER_BRAND)).toBe(true);
  });

  it('все прежние модели на месте — и по подписи, и по значению для фильтра', () => {
    const missing: string[] = [];
    for (const [brandValue, models] of Object.entries(LEGACY)) {
      const now = CAR_BRANDS.find((brand) => brand.value === brandValue)?.models ?? [];
      const nowValues = new Set(now.map(modelValue));
      for (const model of models) {
        if (!now.includes(model) || !nowValues.has(modelValue(model))) {
          missing.push(`${brandValue}: ${model}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('у каждой марки есть модели; «Другая марка» — без списка', () => {
    for (const brand of realBrands) expect(brand.models.length, brand.value).toBeGreaterThan(1);
    expect(CAR_BRANDS.find((brand) => brand.value === OTHER_BRAND)?.models).toEqual([]);
    expect(modelsForBrand(OTHER_BRAND)).toEqual([]);
    expect(modelsForBrand(undefined)).toEqual([]);
  });

  it('марки не повторяются', () => {
    const values = CAR_BRANDS.map((brand) => brand.value);
    expect(new Set(values).size).toBe(values.length);
    const labels = CAR_BRANDS.map((brand) => brand.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('нет пустых названий и дублей внутри марки (регистр, пробелы, дефисы)', () => {
    const problems: string[] = [];
    for (const brand of CAR_BRANDS) {
      const seen = new Map<string, string>();
      for (const model of brand.models) {
        const value = modelValue(model);
        if (!model.trim() || model !== model.trim() || /\s{2,}/.test(model) || !value) {
          problems.push(`${brand.value}: «${model}» — пустое или с лишними пробелами`);
        }
        const twin = seen.get(value);
        if (twin !== undefined) problems.push(`${brand.value}: «${model}» повторяет «${twin}»`);
        seen.set(value, model);
        if (model.length > 120 || value.length > 80)
          problems.push(`${brand.value}: «${model}» длинное`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('в подписях нет годов, объёмов двигателя и слов «рестайлинг»/«поколение»', () => {
    const problems: string[] = [];
    for (const brand of CAR_BRANDS) {
      for (const model of brand.models) {
        const numeric = /^\d+$/.test(model);
        if (!numeric && /\b(19[5-9]\d|20[0-4]\d)\b/.test(model) && model !== '2008') {
          problems.push(`${brand.value}: ${model}`);
        }
        if (/\d\.\d/.test(model) && !/^ID\./.test(model)) problems.push(`${brand.value}: ${model}`);
        if (/рестайл|поколен|restyl|facelift|generation/i.test(model)) problems.push(model);
      }
    }
    expect(problems).toEqual([]);
  });

  it('марка в подписи модели не повторяется (кроме принятых названий)', () => {
    const allowed = new Set(['Mini']);
    const problems: string[] = [];
    for (const brand of realBrands) {
      const own = modelValue(brand.label);
      for (const model of brand.models) {
        if (modelValue(model) === own && !allowed.has(model))
          problems.push(`${brand.value}: ${model}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('справочник велик: не «десять моделей на марку»', () => {
    expect(realBrands.length).toBeGreaterThanOrEqual(60);
    expect(totalModels).toBeGreaterThan(1500);
    const size = (value: string) =>
      CAR_BRANDS.find((brand) => brand.value === value)?.models.length ?? 0;
    expect(size('toyota')).toBeGreaterThan(150);
    expect(size('nissan')).toBeGreaterThan(90);
    expect(size('honda')).toBeGreaterThan(60);
    for (const value of ['mazda', 'mitsubishi', 'suzuki', 'ford', 'chevrolet', 'hyundai']) {
      expect(size(value), value).toBeGreaterThan(40);
    }
  });

  it('редкие и снятые с производства модели есть у разных марок', () => {
    const missing: string[] = [];
    for (const [brandValue, models] of Object.entries(SAMPLES)) {
      const brand = CAR_BRANDS.find((item) => item.value === brandValue);
      if (!brand) {
        missing.push(`нет марки ${brandValue}`);
        continue;
      }
      for (const model of models)
        if (!brand.models.includes(model)) missing.push(`${brandValue}: ${model}`);
    }
    expect(missing).toEqual([]);
    expect(Object.keys(SAMPLES).length).toBeGreaterThanOrEqual(35);
  });

  it('Land Cruiser 200/300 и Prado остались, общий Land Cruiser добавлен', () => {
    const toyota = modelsForBrand('toyota');
    for (const model of [
      'Land Cruiser',
      'Land Cruiser 200',
      'Land Cruiser 300',
      'Land Cruiser Prado',
    ]) {
      expect(toyota).toContain(model);
    }
  });
});

describe('Автомобили: записи справочника в базе', () => {
  it('марки в сиде совпадают со справочником', () => {
    expect(brandSeed?.entries.map((entry) => entry.value)).toEqual(CAR_BRANDS.map((b) => b.value));
  });

  it('каждая модель принадлежит ровно одной марке — своей', () => {
    const entries = modelSeed?.entries ?? [];
    expect(entries.length).toBe(totalModels);
    const brandValues = new Set(CAR_BRANDS.map((brand) => brand.value));
    for (const brand of CAR_BRANDS) {
      const own = entries.filter((entry) => entry.parent === brand.value);
      expect(
        own.map((entry) => entry.label),
        brand.value,
      ).toEqual([...brand.models]);
    }
    expect(entries.filter((entry) => !brandValues.has(entry.parent ?? ''))).toEqual([]);
  });

  it('пара «марка + значение модели» уникальна — иначе запись не запишется в базу', () => {
    const keys = (modelSeed?.entries ?? []).map((entry) => `${entry.parent}/${entry.value}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('значения модели проходят ограничения колонки', () => {
    for (const entry of modelSeed?.entries ?? []) {
      expect(entry.value.length).toBeGreaterThan(0);
      expect(entry.value.length).toBeLessThanOrEqual(80);
      expect(entry.label.length).toBeLessThanOrEqual(120);
      expect(entry.value).toBe(modelValue(entry.label));
    }
  });
});

describe('Автомобили: написания для поиска', () => {
  const aliasesOf = (brandValue: string, label: string) => [
    ...(MODEL_ALIASES[modelValue(label)] ?? []),
    ...(BRAND_ALIASES[brandValue] ?? []),
  ];
  /** Как ищет SearchableSelect: подпись или любое написание, без регистра. */
  const search = (brandValue: string, needle: string) =>
    modelsForBrand(brandValue).filter(
      (label) =>
        label.toLowerCase().includes(needle.toLowerCase()) ||
        (MODEL_ALIASES[modelValue(label)] ?? []).some((alias) =>
          alias.includes(needle.toLowerCase()),
        ),
    );

  it('у ходовых японских моделей есть русское написание', () => {
    for (const [brand, model, alias] of [
      ['toyota', 'Succeed', 'саксид'],
      ['toyota', 'Corolla Fielder', 'филдер'],
      ['toyota', 'Mark X', 'марк икс'],
      ['toyota', 'Premio', 'премио'],
      ['nissan', 'Wingroad', 'вингроад'],
      ['honda', 'Stepwgn', 'степвагон'],
      ['mazda', 'MX-5', 'миата'],
      ['subaru', 'Levorg', 'леворг'],
      ['suzuki', 'Escudo', 'эскудо'],
      ['daihatsu', 'Tanto', 'танто'],
    ] as const) {
      expect(aliasesOf(brand, model), `${brand} ${model}`).toContain(alias);
    }
    expect(BRAND_ALIASES.daihatsu).toContain('дайхатсу');
  });

  it('поиск по большому списку находит модель латиницей и кириллицей', () => {
    expect(search('toyota', 'fiel')).toContain('Corolla Fielder');
    expect(search('toyota', 'succ')).toEqual(['Succeed']);
    expect(search('toyota', 'саксид')).toEqual(['Succeed']);
    expect(search('toyota', 'камри')).toEqual(['Camry']);
    expect(search('toyota', 'марк икс')).toEqual(expect.arrayContaining(['Mark X', 'Mark X ZiO']));
    expect(search('nissan', 'скайлайн')).toContain('Skyline');
    expect(search('chery', 'tiggo 7')).toEqual(
      expect.arrayContaining(['Tiggo 7', 'Tiggo 7 Pro', 'Tiggo 7 Pro Max']),
    );
  });

  it('все ключи написаний — это существующие модели (нет «висящих» записей)', () => {
    const known = new Set([
      ...CAR_BRANDS.flatMap((brand) => brand.models.map(modelValue)),
      ...(
        DICTIONARY_SEEDS.find((seed) => seed.kind === DictionaryKind.PHONE_MODEL)?.entries ?? []
      ).map((entry) => entry.value),
    ]);
    const orphans = Object.keys(MODEL_ALIASES).filter((key) => !known.has(key));
    expect(orphans).toEqual([]);
  });

  it('поиск по списку из нескольких сотен моделей — доли миллисекунды на нажатие', () => {
    const toyota = modelsForBrand('toyota');
    expect(toyota.length).toBeGreaterThan(150);
    const started = performance.now();
    for (let i = 0; i < 200; i += 1) search('toyota', 'cor');
    const perKeystroke = (performance.now() - started) / 200;
    expect(perKeystroke).toBeLessThan(5);
  });
});

describe('Автомобили: марка → модель', () => {
  const category = findSeedCategory('transport-cars');
  if (!category) throw new Error('Нет категории transport-cars');
  const fields: readonly ListingAttribute[] = resolveAttributes(bindingsOf(category));
  const lookup = (kind: string, value: string, parent?: string) =>
    (DICTIONARY_SEEDS.find((seed) => seed.kind === kind)?.entries ?? []).some(
      (entry) =>
        entry.value === value &&
        (parent === ANY_DICTIONARY_PARENT || (entry.parent ?? '') === (parent ?? '')),
    );
  const schema = attributesSchemaFor(fields, lookup);
  const base = { year: 2015, mileage: 90_000 };

  it('список моделей марки не содержит чужих', () => {
    const toyota = new Set(modelsForBrand('toyota'));
    const chery = modelsForBrand('chery');
    expect(toyota.has('Succeed')).toBe(true);
    expect(chery.some((model) => toyota.has(model))).toBe(false);
    for (const brand of realBrands) {
      const parents = new Set(
        (modelSeed?.entries ?? [])
          .filter((entry) => brand.models.includes(entry.label))
          .map((entry) => entry.parent),
      );
      expect(parents.has(brand.value), brand.value).toBe(true);
    }
  });

  it('создание и редактирование: новая модель своей марки проходит проверку', () => {
    for (const [brand, models] of Object.entries(SAMPLES)) {
      for (const model of models) {
        const result = schema.safeParse({ ...base, brand, model: modelValue(model) });
        expect(result.success, `${brand} ${model}`).toBe(true);
      }
    }
  });

  it('модель чужой марки — ошибка выбора, а не молчаливый пропуск', () => {
    for (const [brand, model] of [
      ['chery', 'Succeed'],
      ['honda', 'Corolla Fielder'],
      ['nissan', 'Premio'],
      ['toyota', 'Wingroad'],
      ['bmw', 'Mark X'],
    ]) {
      const result = schema.safeParse({ ...base, brand, model: modelValue(model as string) });
      expect(result.success, `${brand} ${model}`).toBe(false);
    }
  });

  it('фильтр «марка + модель» с новой моделью — оба условия вместе', () => {
    const texts = attributeSql(fields, {
      brand: 'toyota',
      model: modelValue('Corolla Fielder'),
    }).map(renderSql);
    const joined = texts.join(' ');
    expect(texts).toHaveLength(2);
    expect(joined).toContain(`v."text_value" = 'toyota'`);
    expect(joined).toContain(`v."text_value" = 'corolla_fielder'`);
  });

  it('смена марки очищает модель прежней марки', () => {
    const chosen = { brand: 'toyota', model: 'succeed', year: 2015 };
    const switched = withAttributeValue(fields, chosen, 'brand', 'honda');
    expect(switched).toEqual({ brand: 'honda', year: 2015 });
    // та же марка — модель остаётся
    expect(withAttributeValue(fields, chosen, 'brand', 'toyota')).toEqual(chosen);
    // «любая марка» убирает и марку, и модель
    expect(withAttributeValue(fields, chosen, 'brand', undefined)).toEqual({ year: 2015 });
    // выбор модели ничего не сбрасывает
    expect(withAttributeValue(fields, { brand: 'toyota' }, 'model', 'premio')).toEqual({
      brand: 'toyota',
      model: 'premio',
    });
    // не затрагивает значения, не зависящие от марки
    expect(withAttributeValue(fields, chosen, 'year', 2018)).toEqual({ ...chosen, year: 2018 });
  });

  it('порядок выбора: сначала марка, потом модель — как в форме', () => {
    let values: Record<string, unknown> = {};
    values = withAttributeValue(fields, values, 'brand', 'toyota');
    values = withAttributeValue(fields, values, 'model', modelValue('Probox'));
    expect(schema.safeParse({ ...base, ...values }).success).toBe(true);
    values = withAttributeValue(fields, values, 'brand', 'chery');
    expect(values.model).toBeUndefined();
    values = withAttributeValue(fields, values, 'model', modelValue('Tiggo 7 Pro'));
    expect(schema.safeParse({ ...base, ...values }).success).toBe(true);
  });

  it('цепочка зависимостей длиннее двух звеньев очищается целиком', () => {
    const chain = [
      { key: 'a', parentKey: undefined },
      { key: 'b', parentKey: 'a' },
      { key: 'c', parentKey: 'b' },
    ];
    expect(withAttributeValue(chain, { a: '1', b: '2', c: '3' }, 'a', '9')).toEqual({ a: '9' });
  });
});

describe('Автомобили: определение марки и модели по заголовку', () => {
  const guess = (title: string) => {
    const verdict = classifyListingTitle(title);
    return verdict.kind === 'guess' ? verdict.guess : undefined;
  };

  it('редкая модель находится по названию', () => {
    expect(guess('Toyota Succeed 2015 правый руль')?.attributes).toMatchObject({
      brand: 'toyota',
      model: 'succeed',
      year: 2015,
    });
    expect(guess('Тойота Corolla Fielder 2012')?.attributes).toMatchObject({
      brand: 'toyota',
      model: 'corolla_fielder',
    });
    expect(guess('Nissan Wingroad 2008 правый руль')?.attributes).toMatchObject({
      brand: 'nissan',
      model: 'wingroad',
    });
  });

  it('более длинное название побеждает: Land Cruiser Prado, а не Land Cruiser', () => {
    expect(guess('Toyota Land Cruiser Prado 2014')?.attributes).toMatchObject({
      model: 'land_cruiser_prado',
    });
  });

  it('короткое название модели — только сразу после марки', () => {
    expect(guess('Mazda 3 2015 седан')?.attributes).toMatchObject({ brand: 'mazda', model: '3' });
    // «2.0» — объём двигателя, а не Mazda 2
    expect(guess('Mazda atenza 2.0 бензин')?.attributes?.model).toBe('atenza');
    expect(guess('Mazda 2.0 бензин')?.attributes?.model).toBeUndefined();
    // «e» и «z» — не модели из любого слова
    expect(guess('Honda купить e срочно')?.attributes?.model).toBeUndefined();
  });
});
