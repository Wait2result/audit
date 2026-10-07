import { describe, expect, it } from 'vitest';

import {
  AiProviderError,
  type AiCompletionResult,
  type AiHealth,
  type AiProvider,
} from '../src/modules/smart-search/ai/ai-provider.js';
import type { UnrecognizedQuery } from '../src/modules/smart-search/feedback/smart-search-unrecognized.service.js';
import { MAKHACHKALA, attributesOf, harness } from './helpers/smart-search-fixtures.js';

/**
 * Запчасти и комплектующие в умном поиске: фраза → локальный разбор → адаптер
 * «Объявления» → существующий поиск. Модель не вызывается вовсе.
 */

class ForbiddenAiProvider implements AiProvider {
  readonly name = 'forbidden';
  readonly model = null;
  calls = 0;
  complete(): Promise<AiCompletionResult> {
    this.calls += 1;
    return Promise.reject(new AiProviderError('AI_UNAVAILABLE', 'Модель вызывать нельзя'));
  }
  health(): Promise<AiHealth> {
    this.calls += 1;
    return Promise.resolve({ status: 'unavailable', model: null, latencyMs: null, message: null });
  }
}

class MemoryUnrecognized {
  readonly records: UnrecognizedQuery[] = [];
  record(input: UnrecognizedQuery): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

async function ask(text: string) {
  const ai = new ForbiddenAiProvider();
  const unrecognized = new MemoryUnrecognized();
  const h = harness({ parser: 'local', ai, unrecognized: unrecognized as never });
  const response = await h.service.search({
    text,
    limit: 1,
    context: { cityId: MAKHACHKALA.id, screen: 'home' },
  });
  const query = h.calls.listings[0];
  return {
    response,
    query,
    attrs: attributesOf(query),
    clarification: response.parts[0]?.clarification,
    ai,
    unrecognized,
  };
}

type Expected = { category: string; attrs: Record<string, unknown> };

const RESOLVED: [string, Expected][] = [
  // легковые
  [
    'рейка на суксид',
    {
      category: 'transport-parts',
      attrs: {
        compatBrand: 'toyota',
        compatModel: 'succeed',
        partGroup: 'steering',
        partItem: 'steering_rack',
      },
    },
  ],
  [
    'граната на камри',
    {
      category: 'transport-parts',
      attrs: { compatModel: 'camry', partGroup: 'transmission', partItem: 'cv_joint' },
    },
  ],
  [
    'колодки на короллу',
    { category: 'transport-parts', attrs: { partGroup: 'brakes', partItem: 'brake_pads' } },
  ],
  [
    'генератор на тойоту',
    {
      category: 'transport-parts',
      attrs: { compatBrand: 'toyota', partGroup: 'electrics', partItem: 'alternator' },
    },
  ],
  [
    'вариатор на хонду',
    { category: 'transport-parts', attrs: { compatBrand: 'honda', partItem: 'cvt' } },
  ],
  [
    'двигатель 1NZ',
    { category: 'transport-parts', attrs: { partGroup: 'engine', compatEngine: '1NZ' } },
  ],
  [
    'Ищу рулевую рейку на Toyota Succeed NCP165',
    {
      category: 'transport-parts',
      attrs: { compatModel: 'succeed', compatChassis: 'NCP165', partItem: 'steering_rack' },
    },
  ],
  // мото
  ['цепь на мото', { category: 'transport-moto-parts', attrs: { partItem: 'moto_chain' } }],
  [
    'пластик на скутер',
    {
      category: 'transport-moto-parts',
      attrs: { motoType: ['scooter'], partItem: 'moto_plastic' },
    },
  ],
  // спецтехника
  [
    'гидронасос на экскаватор',
    {
      category: 'transport-special-parts',
      attrs: { specialType: ['excavator'], partItem: 'hydraulic_pump' },
    },
  ],
  ['зубья ковша', { category: 'transport-special-parts', attrs: { partItem: 'bucket_teeth' } }],
  // телефоны
  [
    'дисплей на айфон 13',
    {
      category: 'electronics-phone-parts',
      attrs: { compatBrand: 'apple', compatModel: 'iphone_13', partItem: 'phone_display' },
    },
  ],
  [
    'шлейф айфон',
    {
      category: 'electronics-phone-parts',
      attrs: { compatBrand: 'apple', partItem: 'phone_cable' },
    },
  ],
  // телевизоры
  [
    'нужна матрица на телевизор LG',
    { category: 'electronics-tv-parts', attrs: { compatBrand: 'lg', partItem: 'tv_matrix' } },
  ],
  ['плата телевизора', { category: 'electronics-tv-parts', attrs: { partItem: 'tv_mainboard' } }],
  // бытовая техника
  [
    'насос на стиралку',
    { category: 'home-appliance-parts', attrs: { partGroup: 'washer', partItem: 'washer_pump' } },
  ],
  [
    'тен на стиральную машину',
    { category: 'home-appliance-parts', attrs: { partItem: 'washer_heater' } },
  ],
  [
    'компрессор холодильника',
    { category: 'home-appliance-parts', attrs: { partItem: 'fridge_compressor' } },
  ],
  [
    'магнетрон микроволновки',
    { category: 'home-appliance-parts', attrs: { partItem: 'microwave_magnetron' } },
  ],
  // ноутбуки и компьютеры
  [
    'матрица lenovo',
    {
      category: 'electronics-laptop-parts',
      attrs: { compatBrand: 'lenovo', partItem: 'laptop_matrix' },
    },
  ],
  [
    'батарея macbook',
    {
      category: 'electronics-laptop-parts',
      attrs: { compatBrand: 'apple', partItem: 'laptop_battery' },
    },
  ],
  ['видеокарта', { category: 'electronics-components', attrs: { partItem: 'computer_gpu' } }],
];

const AMBIGUOUS = [
  'экран',
  'насос',
  'плата',
  'рейка',
  'камера',
  'аккумулятор',
  'дисплей',
  'двигатель',
  'блок питания',
  'блок питания lg',
  'матрица lg',
  'запчасти',
  'хочу дверь',
];

describe('поиск запчастей в умном поиске', () => {
  it.each(RESOLVED)('«%s» → нужный раздел, группа и деталь', async (text, expected) => {
    const r = await ask(text);
    expect(r.response.status).toBe('results');
    expect(r.query?.category).toBe(expected.category);
    expect(r.attrs).toMatchObject(expected.attrs);
    expect(r.ai.calls).toBe(0);
  });

  it.each(AMBIGUOUS)('«%s» — неоднозначно: вопрос, а не угадывание', async (text) => {
    const r = await ask(text);
    expect(r.response.status).toBe('clarification');
    expect(r.clarification!.options.length).toBeGreaterThanOrEqual(2);
    expect(r.ai.calls).toBe(0);
  });

  it('«аккумулятор самсунг» предлагает несколько видов техники', async () => {
    const r = await ask('аккумулятор самсунг');
    const labels = r.clarification!.options.map((option) => option.label);
    expect(labels).toEqual(expect.arrayContaining(['Телефон', 'Ноутбук']));
  });

  it('«хочу дверь» предлагает ещё и обычную категорию', async () => {
    const r = await ask('хочу дверь');
    const labels = r.clarification!.options.map((option) => option.label);
    expect(labels).toContain('Двери и окна');
  });

  it('номер детали — поиск по номеру без названия', async () => {
    const r = await ask('90915-YZZD1');
    expect(r.response.status).toBe('results');
    expect(r.query?.search).toBe('90915-YZZD1');
    expect(r.ai.calls).toBe(0);
  });

  it('«OEM 12345» — номер находится по метке', async () => {
    const r = await ask('OEM 12345');
    expect(r.query?.search).toBe('12345');
  });

  it('стиралка без слова «запчасти» остаётся обычной категорией', async () => {
    const r = await ask('хочу стиралку');
    expect(r.query?.category).toBe('home-appliances');
  });

  it('«запчасти на экскаватор» — раздел спецтехники без выдуманной детали', async () => {
    const r = await ask('запчасти на экскаватор');
    expect(r.query?.category).toBe('transport-special-parts');
    expect(r.attrs).not.toHaveProperty('partItem');
  });

  it('незнакомое слово не придумывает деталь', async () => {
    const r = await ask('жужик на камри');
    expect(r.attrs).not.toHaveProperty('partItem');
  });
});

describe('производитель, тип и состояние в умном поиске', () => {
  const RACK = { partGroup: 'steering', partItem: 'steering_rack' };
  it.each([
    ['рейка ncp165 kyb', { ...RACK, compatChassis: 'NCP165', partManufacturer: 'kyb' }],
    [
      'б/у оригинал рейка ncp165',
      { ...RACK, compatChassis: 'NCP165', partCondition: ['used'], partOriginality: 'original' },
    ],
    ['новая denso', { partCondition: ['new'], partManufacturer: 'denso' }],
    ['рейка probox ncp160', { ...RACK, compatModel: 'probox', compatChassis: 'NCP160' }],
    [
      'оригинальная рейка succeed',
      { ...RACK, compatModel: 'succeed', partOriginality: 'original' },
    ],
    ['аналог рейки succeed', { ...RACK, compatModel: 'succeed', partOriginality: 'analog' }],
    ['рейка суксид KYB', { ...RACK, compatModel: 'succeed', partManufacturer: 'kyb' }],
    [
      'рейка Toyota Succeed CTR',
      { ...RACK, compatBrand: 'toyota', compatModel: 'succeed', partManufacturer: 'ctr' },
    ],
    [
      'фильтр Toyota Denso',
      { partGroup: 'filters', compatBrand: 'toyota', partManufacturer: 'denso' },
    ],
    [
      'колодки Bosch на NCP165',
      { partItem: 'brake_pads', compatChassis: 'NCP165', partManufacturer: 'bosch' },
    ],
    ['новая рейка суксид', { ...RACK, compatModel: 'succeed', partCondition: ['new'] }],
    [
      'рейка Succeed 2015',
      { ...RACK, compatModel: 'succeed', compatYear: { from: 2015, to: 2015 } },
    ],
    ['рейка Probox 2018', { ...RACK, compatModel: 'probox', compatYear: { from: 2018, to: 2018 } }],
    [
      'новая оригинальная рейка Succeed',
      { ...RACK, partCondition: ['new'], partOriginality: 'original' },
    ],
    ['новая KYB рейка', { ...RACK, partCondition: ['new'], partManufacturer: 'kyb' }],
    ['рейка NCP165', { ...RACK, compatChassis: 'NCP165' }],
    ['контрактная рейка суксид', { ...RACK, partCondition: ['used'], partOriginality: 'original' }],
    ['Denso 123456', { partNumber: '123456', partManufacturer: 'denso' }],
    [
      'восстановленная оригинальная рейка суксид',
      { ...RACK, partCondition: ['restored'], partOriginality: 'original' },
    ],
  ])('«%s»', async (text, attrs) => {
    const r = await ask(text);
    expect(r.response.status).toBe('results');
    expect(r.query?.category).toBe('transport-parts');
    expect(r.attrs).toMatchObject(attrs);
    expect(r.ai.calls).toBe(0);
  });

  it.each([
    'восстановленная рейка Toyota',
    'восстановленная KYB рейка',
    'восстановленная рейка суксид',
  ])('«%s» — тип детали не угадывается: «Уточните тип детали»', async (text) => {
    const r = await ask(text);
    expect(r.response.status).toBe('clarification');
    expect(r.clarification!.question).toBe('Уточните тип детали');
    expect(r.clarification!.options.map((option) => option.label)).toEqual(['Оригинал', 'Аналог']);
    expect(r.ai.calls).toBe(0);
  });

  it('«восстановленная рейка» — сначала техника, потом тип', async () => {
    const r = await ask('восстановленная рейка');
    expect(r.clarification!.reason).toBe('ambiguous_equipment');
  });

  it('«рейка Toyota» — Toyota это машина, а не производитель детали', async () => {
    const r = await ask('рейка Toyota');
    expect(r.attrs).toMatchObject({ compatBrand: 'toyota' });
    expect(r.attrs).not.toHaveProperty('partManufacturer');
  });

  it('«оригинальная рейка» не делает производителем Toyota', async () => {
    const r = await ask('оригинальная рейка succeed');
    expect(r.attrs).not.toHaveProperty('partManufacturer');
  });

  it('незнакомое слово не становится производителем', async () => {
    const r = await ask('рейка суксид ромашка');
    expect(r.attrs).not.toHaveProperty('partManufacturer');
  });

  it('номер без названия не превращается в деталь', async () => {
    const r = await ask('XZ-99999-Q');
    expect(r.query?.search).toBe('XZ-99999-Q');
    expect(r.attrs).not.toHaveProperty('partItem');
    expect(r.attrs).not.toHaveProperty('partGroup');
  });

  it('«насос стиралки bosch» — у стиралки Bosch это марка техники', async () => {
    const r = await ask('насос стиралки bosch');
    expect(r.query?.category).toBe('home-appliance-parts');
    expect(r.attrs).toMatchObject({ compatBrand: 'bosch', partItem: 'washer_pump' });
    expect(r.attrs).not.toHaveProperty('partManufacturer');
  });

  it('«дрель bosch» — не запчасть', async () => {
    const r = await ask('дрель bosch');
    expect(r.query?.category).not.toMatch(/parts/);
  });

  it('«новый iphone 13» — состояние телефона, а не детали', async () => {
    const r = await ask('новый iphone 13');
    expect(r.query?.category).toBe('electronics-phones');
    expect(r.attrs).toMatchObject({ condition: 'new' });
  });

  it('«тойота 2015» — год машины, а не номер детали', async () => {
    const r = await ask('тойота 2015');
    expect(r.query?.category).toBe('transport-cars');
  });
});
