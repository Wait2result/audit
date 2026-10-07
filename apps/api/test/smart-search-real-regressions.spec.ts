import type { SmartSearchResponse } from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { filterSchedule } from '../src/modules/smart-search/domains/cinema.adapter.js';
import { cleanTopic } from '../src/modules/smart-search/domains/news.adapter.js';
import { groundIntent } from '../src/modules/smart-search/planner/query-planner.js';
import {
  CITIES,
  KASPIYSK,
  MAKHACHKALA,
  SCHEDULE,
  attributesOf,
  core,
  harness,
} from './helpers/smart-search-fixtures.js';

/**
 * Регрессии по НАСТОЯЩИМ ответам Qwen3 8B из реального прогона
 * (docs/smart-search-real-evaluation.md). Сырой JSON модели взят из журнала
 * записывающего прокси и подаётся «модели» теста дословно — так ошибки
 * модели воспроизводятся без Ollama, и проверяется, что сервер их страхует.
 */

/** Фраза → сырой ответ Qwen3 (как он пришёл из Ollama). */
const REAL: Record<string, { text: string; raw: string }> = {
  L04: {
    text: 'Камри до 2 миллионов',
    raw: '{"intent":"search","domain":"listings","query":null,"filters":{"price":{"max":2000000}},"preferences":{},"location":null,"time":null,"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  L05: {
    text: 'айфон 15 про от 256 гигов',
    raw: '{"intent":"search","domain":"listings","query":null,"filters":{"category":"electronics-phones","model":"15 про","price":{"min":2560000000}},"preferences":{},"location":null,"time":null,"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.95,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  L06: {
    text: 'iPhone 15 Pro 256 ГБ',
    raw: '{"intent":"search","domain":"listings","query":null,"filters":{"category":"electronics-phones","brand":"iPhone","model":"15 Pro","price":{"min":0,"max":1000000}},"preferences":{},"location":null,"time":null,"sort":"relevance","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":["256 ГБ"],"schemaVersion":"1","subqueries":[]}',
  },
  L08: {
    text: 'ноутбук Lenovo 16 ГБ оперативки',
    raw: '{"intent":"search","domain":"listings","query":"ноутбук","filters":{"brand":"Lenovo","model":"16 ГБ оперативки"},"preferences":{},"location":null,"time":null,"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  L10: {
    text: 'двушка до 7 млн в Махачкале',
    raw: '{"intent":"search","domain":"listings","query":null,"filters":{"price":{"max":7000000},"category":"realty-flats"},"preferences":{},"location":{"city":"Махачкале","nearMe":false,"preferred":false},"time":null,"sort":"relevance","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  L13: {
    text: 'участок ИЖС в Махачкале',
    raw: '{"intent":"search","domain":"listings","query":null,"filters":{"category":"realty-land"},"preferences":{},"location":{"city":"Махачкале","nearMe":false,"preferred":false},"time":null,"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  L14: {
    text: 'машину автомат бензин до 1 млн',
    raw: '{"intent":"search","domain":"listings","query":null,"filters":{"transactionType":"rent","price":{"max":1000000},"fuel":"бензин","gearbox":"автомат"},"preferences":{},"location":null,"time":null,"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  L18: {
    text: 'ноутбук с SSD 1 ТБ',
    raw: '{"intent":"search","domain":"listings","query":null,"filters":{"category":"electronics-laptops","storage":{"min":1000}},"preferences":{},"location":null,"time":null,"sort":"relevance","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.95,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  L19: {
    text: 'автомобиль дизель полный привод',
    raw: '{"intent":"search","domain":"listings","query":null,"filters":{"category":"transport-cars","fuel":"дизель","drive":"полный привод"},"preferences":{},"location":null,"time":null,"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  C21: {
    text: 'Где сегодня вечером посмотреть Форсаж в Махачкале?',
    raw: '{"intent":"search","domain":"cinema","query":"Форсаж","filters":{"time":{"min":"18:00"}},"preferences":{},"location":{"city":"Махачкала","nearMe":false,"preferred":true},"time":{"date":"today","from":"18:00","to":"23:59","period":"evening"},"sort":"newest","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.95,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  C25: {
    text: 'кино после 19 часов в Махачкале',
    raw: '{"intent":"search","domain":"cinema","query":null,"filters":{"time":{"min":"19:00"}},"preferences":{},"location":{"city":"Махачкале","nearMe":false,"preferred":false},"time":{"date":"today","from":"19:00","to":null,"period":null},"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.95,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  C26: {
    text: 'фильмы сегодня',
    raw: '{"intent":"search","domain":"cinema","query":null,"filters":{"date":"today"},"preferences":{},"location":null,"time":{"date":"today","from":null,"to":null,"period":null},"sort":"newest","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  C27: {
    text: 'что идет завтра вечером',
    raw: '{"intent":"search","domain":"cinema","query":null,"filters":{"time":{"min":1800}},"preferences":{},"location":null,"time":{"date":"tomorrow","from":"18:00","to":null,"period":"evening"},"sort":"newest","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  N30: {
    text: 'Новости Махачкалы сегодня',
    raw: '{"intent":"search","domain":"news","query":null,"filters":{"topic":"Новости","scope":"city"},"preferences":{},"location":null,"time":{"date":"today","from":null,"to":null,"period":null},"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  N33: {
    text: 'Новости мира',
    raw: '{"intent":"search","domain":"news","query":null,"filters":{"topic":"мир"},"preferences":{},"location":null,"time":{"date":"today","from":null,"to":null,"period":null},"sort":"relevance","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  N34: {
    text: 'Новости Дербента',
    raw: '{"intent":"search","domain":"news","query":null,"filters":{"topic":"Новости","scope":"city"},"preferences":{},"location":null,"time":null,"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  D38: {
    text: 'пицца в Каспийске',
    raw: '{"intent":"search","domain":"delivery","query":"пицца","filters":{"placeType":"ресторан","place":"Каспийск"},"preferences":{},"location":{"city":"Каспийск","nearMe":false,"preferred":false},"time":{"date":"today","from":null,"to":null,"period":null},"sort":"relevance","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.95,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  D41: {
    text: 'доставка пиццы рядом',
    raw: '{"intent":"search","domain":"delivery","query":"пиццы","filters":{"location":{"max":1000}},"preferences":{},"location":{"city":"рядом","nearMe":true,"preferred":false},"time":{"date":"today","from":null,"to":null,"period":null},"sort":"relevance","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  D42: {
    text: 'что можно заказать сегодня',
    raw: '{"intent":"search","domain":"delivery","query":null,"filters":{"date":"today"},"preferences":{},"location":{"city":null,"nearMe":false,"preferred":false},"time":{"date":"today","from":null,"to":null,"period":null},"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  D43: {
    text: 'пицца до 1000 рублей',
    raw: '{"intent":"search","domain":"delivery","query":"пицца","filters":{"price":{"max":1000}},"preferences":{},"location":null,"time":null,"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  X3: {
    text: 'автомат',
    raw: '{"intent":"refine","domain":"listings","query":null,"filters":{"transactionType":"rent","rentPeriod":"daily"},"preferences":{},"location":{"city":"Махачкале","nearMe":false,"preferred":false},"time":null,"sort":"relevance","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":["автомат"],"schemaVersion":"1","subqueries":[]}',
  },
  X4: {
    text: 'а бензиновые?',
    raw: '{"intent":"refine","domain":"listings","query":null,"filters":{"fuel":"бензиновые"},"preferences":{},"location":{"city":"Махачкале","nearMe":false,"preferred":false},"time":null,"sort":"relevance","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  X6: {
    text: 'а посуточно?',
    raw: '{"intent":"refine","domain":"listings","query":null,"filters":{"rentPeriod":"daily"},"preferences":{},"location":{"city":"Махачкале","nearMe":false,"preferred":false},"time":null,"sort":"relevance","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  AM1: {
    text: 'Форсаж',
    raw: '{"intent":"search","domain":"cinema","query":"Форсаж","filters":{},"preferences":{},"location":null,"time":{"date":"today","from":null,"to":null,"period":null},"sort":"newest","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  AM7: {
    text: 'дёшево',
    raw: '{"intent":"search","domain":"listings","query":null,"filters":{},"preferences":{},"location":null,"time":null,"sort":null,"clarification":{"needed":true,"question":"Ищете товары или услуги по низкой цене?","options":["Товары","Услуги"]},"confidence":0.3,"unresolved":["дёшево"],"schemaVersion":"1","subqueries":[]}',
  },
  AM9: {
    text: 'рядом',
    raw: '{"intent":"search","domain":"listings","query":null,"filters":{},"preferences":{},"location":{"city":null,"nearMe":true,"preferred":false},"time":null,"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  X1: {
    text: 'машины в Махачкале',
    raw: '{"intent":"search","domain":"listings","query":"машины","filters":{"category":"transport-cars"},"preferences":{},"location":{"city":"Махачкале","nearMe":false,"preferred":false},"time":null,"sort":"relevance","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  X2: {
    text: 'до миллиона',
    raw: '{"intent":"refine","domain":"listings","query":null,"filters":{"price":{"max":1000000}},"preferences":{},"location":{"city":"Махачкале","nearMe":false,"preferred":false},"time":null,"sort":"relevance","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  X5: {
    text: 'квартиры в Махачкале',
    raw: '{"intent":"search","domain":"listings","query":null,"filters":{"category":"realty-flats"},"preferences":{},"location":{"city":"Махачкале","nearMe":false,"preferred":false},"time":null,"sort":"relevance","clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
};

/** Ответы Qwen3 из второго прогона (после первых исправлений). */
const REAL_ROUND_2: Record<string, { text: string; raw: string }> = {
  AM3: {
    text: 'Макбук',
    raw: '{"intent":"search","domain":"listings","query":null,"filters":{"category":"electronics-laptops","brand":"Mac","model":"Book"},"preferences":{},"location":null,"time":null,"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.9,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  C22: {
    text: 'Какие фильмы сегодня вечером в Махачкале?',
    raw: '{"intent":"search","domain":"cinema","query":null,"filters":{"movie":"фильмы"},"preferences":{},"location":{"city":"Махачкала","nearMe":false,"preferred":false},"time":{"date":"today","from":null,"to":null,"period":"evening"},"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.95,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
  L06: {
    text: 'iPhone 15 Pro 256 ГБ',
    raw: '{"intent":"search","domain":"listings","query":null,"filters":{"category":"electronics-phones","brand":"iPhone","model":"15 Pro","memory":{"min":256}},"preferences":{},"location":null,"time":null,"sort":null,"clarification":{"needed":false,"question":null,"options":[]},"confidence":0.95,"unresolved":[],"schemaVersion":"1","subqueries":[]}',
  },
};

const DERBENT = CITIES[2]!;

async function ask(id: string, h = harness(), sessionId?: string): Promise<SmartSearchResponse> {
  const item = REAL[id]!;
  h.ai.on(item.text, item.raw);
  return h.service.search({
    text: item.text,
    limit: 10,
    context: { cityId: MAKHACHKALA.id },
    ...(sessionId ? { sessionId } : {}),
  });
}

describe('Реальные ответы Qwen3: поля не на своём месте не роняют запрос', () => {
  it('C25 «кино после 19 часов» — filters.time: кино ищется, окно с 19:00', async () => {
    const h = harness();
    const response = await ask('C25', h);
    expect(response.status).toBe('results');
    expect(response.parts[0]?.query?.time?.from).toBe('19:00');
    expect(response.parts[0]?.query?.ignored).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'time' })]),
    );
  });

  it('C26 «фильмы сегодня» — filters.date: не ошибка', async () => {
    expect((await ask('C26')).status).toBe('results');
  });

  it('C21 «Форсаж в Махачкале вечером» — время 18:00, которого нет во фразе, не применено; фильм из query', async () => {
    const response = await ask('C21');
    expect(response.status).toBe('clarification');
    expect(response.parts[0]?.clarification?.reason).toBe('ambiguous_movie');
  });

  it('C27 «что идёт завтра вечером» — выдуманное «с 18:00» убрано, вечер — с 17:00', async () => {
    const response = await ask('C27');
    expect(response.parts[0]?.query?.time).toMatchObject({ from: '17:00' });
  });

  it('D42 «что можно заказать сегодня» — filters.date в доставке: не ошибка', async () => {
    expect((await ask('D42')).status).not.toBe('error');
  });

  it('D43 «пицца до 1000 рублей» — цены в витрине нет: условие помечено, поиск идёт', async () => {
    const h = harness();
    const response = await ask('D43', h);
    expect(response.status).toBe('results');
    expect(h.calls.places[0]?.search).toBe('пицца');
    expect(response.parts[0]?.query?.ignored).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'price' })]),
    );
  });
});

describe('Реальные ответы Qwen3: пропущенное моделью берётся из справочников', () => {
  it('L04 «Камри до 2 миллионов» — модель вернула только цену: Toyota Camry по написанию «камри»', async () => {
    const h = harness();
    await ask('L04', h);
    expect(h.calls.listings[0]).toMatchObject({ category: 'transport-cars', priceTo: 200_000_000 });
    expect(attributesOf(h.calls.listings[0])).toMatchObject({ brand: 'toyota', model: 'camry' });
  });

  it('L05 «айфон 15 про от 256 гигов» — «15 про» → iPhone 15 Pro; память, ставшая ценой, не превращается в вопрос о цене', async () => {
    const h = harness();
    const response = await ask('L05', h);
    expect(response.status).toBe('results');
    expect(attributesOf(h.calls.listings[0])).toMatchObject({
      brand: 'apple',
      model: 'iphone_15_pro',
    });
    expect(h.calls.listings[0]?.priceFrom).toBeUndefined();
  });

  it('L06 «iPhone 15 Pro 256 ГБ» — «15 Pro» → iPhone 15 Pro, память 256, без «от 0 ₽»', async () => {
    const h = harness();
    await ask('L06', h);
    expect(attributesOf(h.calls.listings[0])).toMatchObject({
      brand: 'apple',
      model: 'iphone_15_pro',
      memory: ['256'],
    });
    expect(h.calls.listings[0]?.priceFrom).toBeUndefined();
  });

  it('L08 «Lenovo 16 ГБ оперативки» — объём памяти из фразы, а не модель «16 ГБ оперативки»', async () => {
    const h = harness();
    await ask('L08', h);
    expect(attributesOf(h.calls.listings[0])).toMatchObject({ brand: 'lenovo', ram: ['16'] });
  });

  it('L10 «двушка до 7 млн» — две комнаты по классификатору объявлений', async () => {
    const h = harness();
    await ask('L10', h);
    expect(attributesOf(h.calls.listings[0])).toMatchObject({ rooms: [2] });
  });

  it('L13 «участок ИЖС» — назначение земли из слова фразы', async () => {
    const h = harness();
    await ask('L13', h);
    expect(attributesOf(h.calls.listings[0])).toMatchObject({ landPurpose: ['igs'] });
  });

  it('L14 «машину автомат бензин до 1 млн» — выдуманная аренда убрана, категория по слову «машину»', async () => {
    const h = harness();
    await ask('L14', h);
    const query = h.calls.listings[0];
    expect(query).toMatchObject({ category: 'transport-cars', priceTo: 100_000_000 });
    expect(query?.transactionType).toBeUndefined();
    expect(attributesOf(query)).toMatchObject({ gearbox: ['auto'], fuel: ['petrol'] });
  });

  it('L18 «SSD 1 ТБ» — тип и объём накопителя из фразы', async () => {
    const h = harness();
    await ask('L18', h);
    expect(attributesOf(h.calls.listings[0])).toMatchObject({
      storage: ['ssd'],
      storageSize: ['1024'],
    });
  });

  it('L19 «полный привод» — вариант «Полный» по началу слова', async () => {
    const h = harness();
    await ask('L19', h);
    expect(attributesOf(h.calls.listings[0])).toMatchObject({ fuel: ['diesel'], drive: ['full'] });
  });
});

describe('Реальные ответы Qwen3: новости и доставка', () => {
  it('N30 «Новости Махачкалы сегодня» — тема «Новости» не тема', async () => {
    const response = await ask('N30');
    expect(response.parts[0]?.query?.text).toBeNull();
    expect(response.parts[0]?.query?.params).toMatchObject({
      scope: 'city',
      cityId: MAKHACHKALA.id,
    });
  });

  it('N33 «Новости мира» — лента «Мир», а не «Дагестан»', async () => {
    const h = harness();
    await ask('N33', h);
    expect(h.calls.news[0]?.scope).toBe('world');
  });

  it('N34 «Новости Дербента» — город из фразы, хотя модель его не вернула', async () => {
    const h = harness();
    await ask('N34', h);
    expect(h.calls.news[0]).toEqual({ cityId: DERBENT.id, scope: 'city' });
  });

  it('D38 «пицца в Каспийске» — город не уходит в поиск блюд, выдуманный «ресторан» не применён', async () => {
    const h = harness();
    await ask('D38', h);
    expect(h.calls.places[0]).toMatchObject({ cityId: KASPIYSK.id, search: 'пицца' });
    expect(h.calls.places[0]?.types).toBeUndefined();
  });

  it('D41 «доставка пиццы рядом» — «рядом» не город', async () => {
    const h = harness();
    const response = await ask('D41', h);
    expect(response.parts[0]?.clarification?.reason).not.toBe('unknown_city');
    expect(h.calls.places[0]).toMatchObject({ cityId: MAKHACHKALA.id });
  });
});

describe('Реальные ответы Qwen3: контекст', () => {
  it('X1 → X2 → X3 «автомат» → X4 «а бензиновые?»: выдуманная посуточная аренда не применена, коробка и топливо добавлены', async () => {
    const h = harness();
    const first = await ask('X1', h);
    await ask('X2', h, first.sessionId);
    await ask('X3', h, first.sessionId);
    const third = h.calls.listings.at(-1);
    expect(third?.transactionType).toBeUndefined();
    expect(third?.rentPeriod).toBeUndefined();
    expect(third?.priceTo).toBe(100_000_000);
    expect(attributesOf(third)).toMatchObject({ gearbox: ['auto'] });
    expect(third?.search).toBeUndefined();

    await ask('X4', h, first.sessionId);
    expect(attributesOf(h.calls.listings.at(-1))).toMatchObject({
      gearbox: ['auto'],
      fuel: ['petrol'],
    });
  });

  it('X5 → X6 «а посуточно?» — срок без слова «снять» включает аренду', async () => {
    const h = harness();
    const first = await ask('X5', h);
    await ask('X6', h, first.sessionId);
    expect(h.calls.listings.at(-1)).toMatchObject({
      category: 'realty-flats',
      transactionType: 'rent',
      rentPeriod: 'daily',
    });
  });
});

describe('Реальные ответы Qwen3: пустое и неоднозначное', () => {
  it('AM7 «дёшево» — не вся доска, а уточнение', async () => {
    const h = harness();
    const response = await ask('AM7', h);
    expect(response.status).toBe('clarification');
    expect(h.calls.listings).toHaveLength(0);
  });

  it('AM9 «рядом» — уточнение', async () => {
    expect((await ask('AM9')).status).toBe('clarification');
  });

  it('AM1 «Форсаж» — название из query, а не всё расписание', async () => {
    const response = await ask('AM1');
    expect(response.status).toBe('clarification');
    expect(response.parts[0]?.clarification?.reason).toBe('ambiguous_movie');
  });
});

describe('Сверка с фразой: сделка, срок, время, город', () => {
  it('сделка и срок без слов во фразе убираются', () => {
    const { intent, dropped } = groundIntent(
      core({
        domain: 'listings',
        filters: { transactionType: 'rent', rentPeriod: 'daily', gearbox: 'автомат' },
      }),
      'автомат',
    );
    expect(intent.filters).toEqual({ gearbox: 'автомат' });
    expect(dropped).toEqual(expect.arrayContaining(['transactionType', 'rentPeriod']));
  });

  it('«снять посуточно» — остаётся', () => {
    const { intent } = groundIntent(
      core({ domain: 'listings', filters: { transactionType: 'rent', rentPeriod: 'daily' } }),
      'снять квартиру посуточно',
    );
    expect(intent.filters).toEqual({ transactionType: 'rent', rentPeriod: 'daily' });
  });

  it('жильё до 200 тысяч без слов о сделке — помесячная аренда (правило сервера)', () => {
    const { intent } = groundIntent(
      core({
        domain: 'listings',
        filters: {
          category: 'realty-flats',
          rooms: 2,
          transactionType: 'rent',
          rentPeriod: 'monthly',
          price: { max: 40_000 },
        },
      }),
      'двушка в Каспийске до 40 тысяч',
    );
    expect(intent.filters).toMatchObject({ transactionType: 'rent', rentPeriod: 'monthly' });
    const sale = groundIntent(
      core({
        domain: 'listings',
        filters: { category: 'transport-cars', transactionType: 'rent', price: { max: 40_000 } },
      }),
      'машина до 40 тысяч',
    );
    expect(sale.intent.filters.transactionType).toBeUndefined();
  });

  it('день и час — только названные; город — только из фразы', () => {
    const { intent, dropped } = groundIntent(
      core({
        domain: 'cinema',
        time: { date: 'today', from: '18:00', to: null, period: 'evening' },
        location: { city: 'Дагестан', nearMe: false, preferred: false },
      }),
      'что идёт вечером',
    );
    expect(intent.time).toEqual({ date: null, from: null, to: null, period: 'evening' });
    expect(intent.location).toBeNull();
    expect(dropped).toEqual(expect.arrayContaining(['time.date', 'time.from', 'location.city']));
  });

  it('«после 7 вечера» — 19:00 засчитывается', () => {
    const { intent } = groundIntent(
      core({ domain: 'cinema', time: { date: null, from: '19:00', to: null, period: null } }),
      'кино после 7 вечера',
    );
    expect(intent.time?.from).toBe('19:00');
  });
});

describe('Кино: ночные сеансы', () => {
  it('сеанс в 00:10 следующих суток входит в «после 20:00» и в «вечер», но не в «с 10 до 12»', () => {
    const night = [
      {
        ...SCHEDULE[0]!,
        showtimes: [
          { ...SCHEDULE[0]!.showtimes[0]!, id: 'late', startTime: '2026-10-04T00:10:00+03:00' },
          { ...SCHEDULE[0]!.showtimes[0]!, id: 'early', startTime: '2026-10-03T11:00:00+03:00' },
        ],
      },
    ];
    const plan = {
      cityId: 'c',
      date: '2026-10-03',
      movie: null,
      genre: null,
      cinema: null,
      format: null,
    };
    const after = filterSchedule(night, { ...plan, window: { from: '20:00', to: '23:59' } });
    expect('schedule' in after && after.schedule[0]?.showtimes.map((item) => item.id)).toEqual([
      'late',
    ]);
    const morning = filterSchedule(night, { ...plan, window: { from: '10:00', to: '12:00' } });
    expect('schedule' in morning && morning.schedule[0]?.showtimes.map((item) => item.id)).toEqual([
      'early',
    ]);
  });
});

describe('Новости: тема без служебных слов', () => {
  it('«Новости», «что нового», названия городов и лент — не тема', () => {
    const names = CITIES.map((item) => item.name);
    expect(cleanTopic('Новости', names)).toBeNull();
    expect(cleanTopic('что нового в Махачкале', names)).toBeNull();
    expect(cleanTopic('мир', names)).toBeNull();
    expect(cleanTopic('новости про дороги', names)).toBe('дороги');
  });
});

describe('Реальные ответы Qwen3, второй прогон', () => {
  it('C22 «Какие фильмы сегодня вечером» — movie «фильмы» не название фильма: вечернее расписание целиком', async () => {
    const h = harness();
    const item = REAL_ROUND_2.C22!;
    h.ai.on(item.text, item.raw);
    const response = await h.service.search({
      text: item.text,
      limit: 10,
      context: { cityId: MAKHACHKALA.id },
    });
    expect(response.status).toBe('results');
    expect(response.parts[0]?.query?.conditions.map((condition) => condition.field)).not.toContain(
      'movie',
    );
  });

  it('L06 «iPhone 15 Pro 256 ГБ» — memory {min: 256} без слова «от» — ровно 256', async () => {
    const h = harness();
    const item = REAL_ROUND_2.L06!;
    h.ai.on(item.text, item.raw);
    await h.service.search({
      text: item.text,
      limit: 10,
      context: { cityId: MAKHACHKALA.id },
    });
    expect(attributesOf(h.calls.listings[0])).toMatchObject({
      model: 'iphone_15_pro',
      memory: ['256'],
    });
  });

  it('AM3 «Макбук» — марка «Mac» и модель «Book» не из справочника: MacBook по слову фразы', async () => {
    const h = harness();
    const item = REAL_ROUND_2.AM3!;
    h.ai.on(item.text, item.raw);
    await h.service.search({
      text: item.text,
      limit: 10,
      context: { cityId: MAKHACHKALA.id },
    });
    expect(attributesOf(h.calls.listings[0])).toMatchObject({ brand: 'apple', model: 'macbook' });
  });

  it('граница остаётся, когда она названа: «от 256 гигов», «до 1.2 млн»', () => {
    const { intent } = groundIntent(
      core({ domain: 'listings', filters: { memory: { min: 256 }, year: { max: 2015 } } }),
      'айфон от 256 гигов, 2015 года',
    );
    expect(intent.filters).toEqual({ memory: { min: 256 }, year: 2015 });
  });
});
