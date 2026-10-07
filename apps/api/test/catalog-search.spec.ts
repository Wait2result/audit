import { describe, expect, it } from 'vitest';

import {
  AiProviderError,
  type AiCompletionResult,
  type AiHealth,
  type AiProvider,
} from '../src/modules/smart-search/ai/ai-provider.js';
import { MAKHACHKALA, attributesOf, harness } from './helpers/smart-search-fixtures.js';

/**
 * Умный поиск по структуре «основной тип → направление» без модели: фраза
 * попадает в нужное направление, тип товара и «Подходит к»; неоднозначное —
 * вопрос с вариантами, а не догадка.
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

async function ask(text: string) {
  const ai = new ForbiddenAiProvider();
  const h = harness({ parser: 'local', ai });
  const response = await h.service.search({
    text,
    limit: 1,
    context: { cityId: MAKHACHKALA.id, screen: 'home' },
  });
  const query = h.calls.listings[0];
  return { response, query, attrs: attributesOf(query), ai, part: response.parts[0] };
}

const SUCCEED = { compatBrand: 'toyota', compatModel: 'succeed' };

describe('направления основных типов в умном поиске', () => {
  it.each<[string, string, Record<string, unknown>]>([
    ['детское кресло', 'transport-car-seats', { goodsType: 'car_seat' }],
    ['детское кресло в машину', 'transport-car-seats', { goodsType: 'car_seat' }],
    ['бустер', 'transport-car-seats', { goodsType: 'booster' }],
    ['коврики на суксид', 'transport-accessories', { ...SUCCEED, goodsType: 'floor_mats' }],
    ['магнитола на суксид', 'transport-car-electronics', { ...SUCCEED, goodsType: 'head_unit' }],
    [
      'зимняя резина на суксид',
      'transport-tires',
      { ...SUCCEED, tireType: 'tires', season: ['winter'] },
    ],
    ['рейка на суксид', 'transport-parts', { ...SUCCEED, partItem: 'steering_rack' }],
    ['видеорегистратор', 'transport-car-electronics', { goodsType: 'dashcam' }],
    ['фаркоп на прадо', 'transport-racks', { compatBrand: 'toyota', goodsType: 'towbar' }],
    ['масло 5w30', 'transport-car-chemicals', { goodsType: 'oils' }],
    ['аккумулятор на машину', 'transport-batteries', { goodsType: 'car' }],
    ['шлем для мотоцикла', 'transport-moto-gear', { goodsType: 'helmet' }],
    ['цепь на мотоцикл', 'transport-moto-parts', { partItem: 'moto_chain' }],
    ['ковш на экскаватор', 'transport-special-attachments', { goodsType: 'bucket' }],
    ['лодочный мотор', 'transport-water-outboards', { goodsType: 'outboard' }],
    ['чехол на айфон', 'electronics-phone-cases', { goodsType: 'back_case' }],
    [
      'чехол айфон 13',
      'electronics-phone-cases',
      { compatBrand: 'apple', compatModel: 'iphone_13', goodsType: 'back_case' },
    ],
    ['дисплей айфон 13', 'electronics-phone-parts', { partItem: 'phone_display' }],
    ['матрица ноутбука', 'electronics-laptop-parts', { partItem: 'laptop_matrix' }],
    ['зарядка для ноутбука', 'electronics-laptop-chargers', { goodsType: 'laptop_charger' }],
    ['пульт LG', 'electronics-tv-remotes', { compatBrand: 'lg', goodsType: 'original_remote' }],
    ['пульт от телевизора LG', 'electronics-tv-remotes', { compatBrand: 'lg' }],
    ['кронштейн для телевизора', 'electronics-tv-mounts', { goodsType: 'wall_mount' }],
    ['насос на стиралку', 'home-appliance-parts', { partItem: 'washer_pump' }],
    ['мешки для пылесоса', 'home-appliance-consumables', { goodsType: 'vacuum_bags' }],
  ])('«%s» → %s', async (text, category, attrs) => {
    const r = await ask(text);
    expect(r.response.status).toBe('results');
    expect(r.query?.category).toBe(category);
    expect(r.attrs).toMatchObject(attrs);
    expect(r.ai.calls).toBe(0);
  });

  it.each<[string, string]>([
    ['кондиционер', 'home-climate-ac'],
    ['обогреватель', 'home-climate-heaters'],
    ['автохимия', 'transport-car-chemicals'],
    ['экипировка', 'transport-moto-gear'],
    ['прицеп', 'transport-trailers'],
    ['хочу стиралку', 'home-appliances'],
  ])('«%s» — само направление: %s', async (text, category) => {
    const r = await ask(text);
    expect(r.query?.category).toBe(category);
  });

  it('путь в карточке ответа — основной тип и направление', async () => {
    const r = await ask('коврики на суксид');
    expect(r.part?.navigation?.path).toEqual(['Транспорт', 'Автомобили', 'Автоаксессуары']);
  });

  it('«аккумулятор» — вопрос: «Аккумуляторы», телефон, ноутбук…, без повторов', async () => {
    const r = await ask('аккумулятор');
    expect(r.response.status).toBe('clarification');
    const options = r.part!.clarification!.options;
    const values = options.map((option) => option.value);
    expect(values).toContain('transport-batteries');
    expect(values).toContain('electronics-phone-parts');
    expect(new Set(values).size).toBe(values.length);
    expect(options.find((option) => option.value === 'transport-batteries')?.label).toBe(
      'Аккумуляторы',
    );
  });

  it('тип товара не подменяет марку: «зимняя резина» без машины — без «Подходит к»', async () => {
    const r = await ask('зимняя резина');
    expect(r.query?.category).toBe('transport-tires');
    expect(r.attrs).not.toHaveProperty('compatBrand');
  });

  it('«куртка» — одежда, а не мотоэкипировка (название типа «Куртки» не синоним)', async () => {
    const r = await ask('куртка');
    expect(r.query?.category).not.toBe('transport-moto-gear');
  });

  it('в ответе нет «Купить» и «Снять»: тип объявления называется «Продажа» и «Аренда»', async () => {
    const r = await ask('снять квартиру в Махачкале');
    const deal = r.part?.query?.conditions.find((item) => item.field === 'transactionType');
    expect(deal?.display).toBe('Аренда');
  });
});
