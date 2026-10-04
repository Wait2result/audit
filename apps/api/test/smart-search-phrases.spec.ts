import type {
  SmartSearchDomain,
  SmartSearchIntent,
  SmartSearchResponse,
  SmartSearchStatus,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import {
  CITIES,
  KASPIYSK,
  MAKHACHKALA,
  attributesOf,
  core,
  harness,
  intent,
  place,
  when,
  type Calls,
} from './helpers/smart-search-fixtures.js';

/**
 * Таблица естественных фраз по четырём разделам: короткие, разговорные,
 * неоднозначные и составные. Для каждой задан ответ «модели» — такой, какой
 * правдоподобно вернула бы Qwen (разговорные слова как есть: «саксид»,
 * «айфон», «двушка» → rooms 2), — и проверяется то, за что отвечает сервер:
 * раздел, нормализация по справочникам, проверки и вызов существующего
 * сервиса. Качество самой модели здесь не проверяется — для него есть
 * отдельный ручной прогон (scripts/smart-search-eval.ts).
 */

interface PhraseCase {
  text: string;
  ai: SmartSearchIntent;
  status: SmartSearchStatus;
  domain: SmartSearchDomain | null;
  check?: (calls: Calls, response: SmartSearchResponse) => void;
  screen?: string;
}

const DERBENT = CITIES[2]!;

const cinemaTitles = (response: SmartSearchResponse) => {
  const results = response.parts[0]?.results;
  return results?.domain === 'cinema' ? results.schedule.map((item) => item.movie.title) : [];
};
const newsIds = (response: SmartSearchResponse) => {
  const results = response.parts[0]?.results;
  return results?.domain === 'news' ? results.items.map((item) => item.id) : [];
};
const reason = (response: SmartSearchResponse) => response.parts[0]?.clarification?.reason;

const CASES: PhraseCase[] = [
  // ── Объявления ─────────────────────────────────────────────────────────────
  {
    text: 'Toyota Succeed до 1.2 миллиона, автомат, бензин',
    ai: intent({
      domain: 'listings',
      filters: {
        brand: 'Toyota',
        model: 'Succeed',
        price: { max: 1_200_000 },
        gearbox: 'автомат',
        fuel: 'бензин',
      },
    }),
    status: 'results',
    domain: 'listings',
    check: (calls) => {
      expect(calls.listings[0]).toMatchObject({ category: 'transport-cars', priceTo: 120_000_000 });
      expect(attributesOf(calls.listings[0])).toEqual({
        brand: 'toyota',
        model: 'succeed',
        gearbox: 'auto',
        fuel: 'petrol',
      });
    },
  },
  {
    text: 'двушка в Каспийске до 40 тысяч',
    ai: intent({
      domain: 'listings',
      filters: {
        category: 'realty-flats',
        rooms: 2,
        transactionType: 'rent',
        rentPeriod: 'monthly',
        price: { max: 40_000 },
      },
      location: place('Каспийске'),
    }),
    status: 'results',
    domain: 'listings',
    check: (calls) => {
      expect(calls.listings[0]).toMatchObject({
        category: 'realty-flats',
        transactionType: 'rent',
        rentPeriod: 'monthly',
        priceTo: 4_000_000,
        latitude: KASPIYSK.latitude,
      });
      expect(attributesOf(calls.listings[0])).toEqual({ rooms: [2] });
    },
  },
  {
    text: 'Айфон 15 или новее до 70 тысяч, 256 гигов',
    ai: intent({
      domain: 'listings',
      filters: {
        brand: 'айфон',
        model: { min: 'iPhone 15' },
        price: { max: 70_000 },
        memory: { min: 256 },
      },
    }),
    status: 'results',
    domain: 'listings',
    check: (calls) => {
      expect(calls.listings[0]).toMatchObject({
        category: 'electronics-phones',
        priceTo: 7_000_000,
      });
      const values = attributesOf(calls.listings[0]);
      expect(values).toMatchObject({ brand: 'apple', memory: ['256', '512', '1024'] });
      expect(values.model).toEqual(expect.arrayContaining(['iphone_15', 'iphone_16_pro']));
      expect(values.model).not.toContain('iphone_14');
    },
  },
  {
    text: 'саксид до миллиона',
    ai: intent({ domain: 'listings', filters: { model: 'саксид', price: { max: 1_000_000 } } }),
    status: 'results',
    domain: 'listings',
    check: (calls) =>
      expect(attributesOf(calls.listings[0])).toEqual({ brand: 'toyota', model: 'succeed' }),
  },
  {
    text: 'филдер 2012 года',
    ai: intent({ domain: 'listings', filters: { model: 'филдер', year: 2012 } }),
    status: 'results',
    domain: 'listings',
    check: (calls) =>
      expect(attributesOf(calls.listings[0])).toEqual({
        brand: 'toyota',
        model: 'corolla_fielder',
        year: { from: 2012, to: 2012 },
      }),
  },
  {
    text: 'камри до миллиона',
    ai: intent({ domain: 'listings', filters: { model: 'камри', price: { max: 1_000_000 } } }),
    status: 'results',
    domain: 'listings',
    check: (calls) => expect(calls.listings[0]?.category).toBe('transport-cars'),
  },
  {
    text: 'Хонда до 300 тысяч',
    ai: intent({ domain: 'listings', filters: { brand: 'Хонда', price: { max: 300_000 } } }),
    status: 'clarification',
    domain: 'listings',
    check: (calls, response) => {
      expect(reason(response)).toBe('ambiguous_category');
      expect(calls.listings).toHaveLength(0);
    },
  },
  {
    text: 'макбук',
    ai: intent({ domain: 'listings', filters: { model: 'макбук' } }),
    status: 'results',
    domain: 'listings',
    check: (calls) => expect(calls.listings[0]?.category).toBe('electronics-laptops'),
  },
  {
    text: 'самсунг галакси s24 ультра',
    ai: intent({ domain: 'listings', filters: { brand: 'самсунг', model: 'галакси s24 ультра' } }),
    status: 'results',
    domain: 'listings',
    check: (calls) => {
      expect(calls.listings[0]?.category).toBe('electronics-phones');
      expect(attributesOf(calls.listings[0])).toEqual({
        brand: 'samsung',
        model: 'galaxy_s24_ultra',
      });
    },
  },
  {
    text: 'Kawasaki Ninja 400',
    ai: intent({ domain: 'listings', filters: { brand: 'Kawasaki', model: 'Ninja 400' } }),
    status: 'results',
    domain: 'listings',
    check: (calls) => {
      expect(calls.listings[0]?.category).toBe('transport-moto');
      expect(attributesOf(calls.listings[0])).toEqual({ brand: 'kawasaki', model: 'ninja_400' });
    },
  },
  {
    text: 'квартира посуточно в Махачкале',
    ai: intent({
      domain: 'listings',
      filters: { category: 'квартиры', transactionType: 'rent', rentPeriod: 'daily' },
      location: place('Махачкале'),
    }),
    status: 'results',
    domain: 'listings',
    check: (calls) =>
      expect(calls.listings[0]).toMatchObject({
        category: 'realty-flats',
        transactionType: 'rent',
        rentPeriod: 'daily',
        latitude: MAKHACHKALA.latitude,
      }),
  },
  {
    text: 'Мерседес Актрос',
    ai: intent({ domain: 'listings', filters: { brand: 'мерседес', model: 'актрос' } }),
    status: 'results',
    domain: 'listings',
    check: (calls) => {
      expect(calls.listings[0]?.category).toBe('transport-trucks');
      expect(attributesOf(calls.listings[0])).toEqual({ brand: 'mercedes', model: 'actros' });
    },
  },
  {
    text: 'экскаватор Caterpillar 320',
    ai: intent({
      domain: 'listings',
      filters: { brand: 'Caterpillar', model: '320', specialType: 'экскаватор' },
    }),
    status: 'results',
    domain: 'listings',
    check: (calls) => {
      expect(calls.listings[0]?.category).toBe('transport-special');
      expect(attributesOf(calls.listings[0])).toMatchObject({ brand: 'caterpillar', model: '320' });
    },
  },
  {
    text: 'Айфон недорого',
    ai: intent({
      domain: 'listings',
      filters: { brand: 'айфон', price: { max: 25_000 } },
      unresolved: ['недорого'],
    }),
    status: 'clarification',
    domain: 'listings',
    check: (calls, response) => {
      expect(reason(response)).toBe('price_not_grounded');
      expect(calls.listings).toHaveLength(0);
    },
  },
  {
    text: 'Тойота с правым рулём, желательно полный привод',
    ai: intent({
      domain: 'listings',
      filters: { brand: 'Тойота', steering: 'правый' },
      preferences: { drive: 'полный' },
    }),
    status: 'results',
    domain: 'listings',
    check: (calls, response) => {
      expect(attributesOf(calls.listings[0])).toEqual({ brand: 'toyota', steering: 'right' });
      expect(response.parts[0]?.query?.preferences).toEqual([
        expect.objectContaining({ field: 'drive', applied: false }),
      ]);
    },
  },
  {
    text: 'ноутбук Lenovo ThinkPad до 50 тысяч',
    ai: intent({
      domain: 'listings',
      filters: {
        category: 'electronics-laptops',
        brand: 'Lenovo',
        model: 'ThinkPad',
        price: { max: 50_000 },
      },
    }),
    status: 'results',
    domain: 'listings',
    check: (calls) =>
      expect(attributesOf(calls.listings[0]).model).toEqual(
        expect.arrayContaining(['thinkpad_t', 'thinkpad_x1_carbon']),
      ),
  },
  {
    text: 'BMW X5, желательно в Каспийске',
    ai: intent({
      domain: 'listings',
      filters: { brand: 'BMW', model: 'X5' },
      location: place('Каспийске', true),
    }),
    status: 'results',
    domain: 'listings',
    check: (calls) =>
      expect(calls.listings[0]).toMatchObject({
        category: 'transport-cars',
        regionWide: true,
        sort: 'distance',
        latitude: KASPIYSK.latitude,
      }),
  },
  {
    text: 'гараж в Дербенте',
    ai: intent({
      domain: 'listings',
      filters: { category: 'realty-garages' },
      location: place('Дербенте'),
    }),
    status: 'results',
    domain: 'listings',
    check: (calls) =>
      expect(calls.listings[0]).toMatchObject({
        category: 'realty-garages',
        latitude: DERBENT.latitude,
        radiusKm: 25,
      }),
  },

  // ── Кино ───────────────────────────────────────────────────────────────────
  {
    text: 'Что сегодня идёт в Каспийске?',
    ai: intent({ domain: 'cinema', location: place('Каспийске'), time: when('today') }),
    status: 'results',
    domain: 'cinema',
    check: (calls, response) => {
      expect(calls.cinema).toEqual([{ cityId: KASPIYSK.id, date: '2026-10-03' }]);
      expect(cinemaTitles(response)).toHaveLength(4);
    },
  },
  {
    text: 'Какие фильмы сегодня вечером в Махачкале?',
    ai: intent({
      domain: 'cinema',
      location: place('Махачкале'),
      time: when('today', { period: 'evening' }),
    }),
    status: 'results',
    domain: 'cinema',
    check: (_calls, response) => expect(cinemaTitles(response)).not.toContain('Головоломка 2'),
  },
  {
    text: 'Где сегодня показывают Дюну?',
    ai: intent({ domain: 'cinema', filters: { movie: 'Дюну' }, time: when('today') }),
    status: 'results',
    domain: 'cinema',
    check: (_calls, response) => expect(cinemaTitles(response)).toEqual(['Дюна: Часть вторая']),
  },
  {
    text: 'Покажи сеансы завтра после 19:00',
    ai: intent({ domain: 'cinema', time: when('tomorrow', { from: '19:00' }) }),
    status: 'results',
    domain: 'cinema',
    check: (calls, response) => {
      expect(calls.cinema[0]?.date).toBe('2026-10-04');
      expect(cinemaTitles(response)).toEqual([
        'Дюна: Часть вторая',
        'Форсаж 10',
        'Форсаж: Хоббс и Шоу',
      ]);
    },
  },
  {
    text: 'посмотреть Форсаж',
    ai: intent({ domain: 'cinema', filters: { movie: 'Форсаж' } }),
    status: 'clarification',
    domain: 'cinema',
    check: (_calls, response) => expect(reason(response)).toBe('ambiguous_movie'),
  },
  {
    text: 'мультики сегодня',
    ai: intent({ domain: 'cinema', filters: { genre: 'мультфильм' }, time: when('today') }),
    status: 'results',
    domain: 'cinema',
    check: (_calls, response) => expect(cinemaTitles(response)).toEqual(['Головоломка 2']),
  },
  {
    text: 'кино в Москве',
    ai: intent({ domain: 'cinema', location: place('Москве') }),
    status: 'clarification',
    domain: 'cinema',
    check: (calls, response) => {
      expect(reason(response)).toBe('unknown_city');
      expect(calls.cinema).toHaveLength(0);
    },
  },
  {
    text: 'боевики завтра вечером',
    ai: intent({
      domain: 'cinema',
      filters: { genre: 'боевик' },
      time: when('tomorrow', { period: 'evening' }),
    }),
    status: 'results',
    domain: 'cinema',
    check: (_calls, response) =>
      expect(cinemaTitles(response)).toEqual(['Форсаж 10', 'Форсаж: Хоббс и Шоу']),
  },
  {
    text: 'что идёт в Синема Холле',
    ai: intent({ domain: 'cinema', filters: { cinema: 'Синема Холл' } }),
    status: 'results',
    domain: 'cinema',
    check: (_calls, response) => {
      const results = response.parts[0]?.results;
      const names =
        results?.domain === 'cinema'
          ? results.schedule.flatMap((item) => item.showtimes.map((s) => s.cinemaName))
          : [];
      expect(new Set(names)).toEqual(new Set(['Синема Холл']));
    },
  },

  // ── Новости ────────────────────────────────────────────────────────────────
  {
    text: 'Что сегодня нового в Дагестане?',
    ai: intent({ domain: 'news', location: place('Дагестане'), time: when('today') }),
    status: 'results',
    domain: 'news',
    check: (calls, response) => {
      expect(calls.news[0]?.scope).toBe('dagestan');
      expect(newsIds(response)).toEqual(['n3']);
    },
  },
  {
    text: 'Новости Махачкалы за сегодня',
    ai: intent({ domain: 'news', location: place('Махачкалы'), time: when('today') }),
    status: 'results',
    domain: 'news',
    check: (calls, response) => {
      expect(calls.news[0]).toEqual({ cityId: MAKHACHKALA.id, scope: 'city' });
      expect(newsIds(response)).toEqual(['n1']);
    },
  },
  {
    text: 'Покажи новости про дороги',
    ai: intent({ domain: 'news', filters: { topic: 'дороги' } }),
    status: 'results',
    domain: 'news',
    check: (_calls, response) => expect(newsIds(response)).toEqual(['n5']),
  },
  {
    text: 'что вчера было в Дагестане',
    ai: intent({ domain: 'news', location: place('Дагестане'), time: when('yesterday') }),
    status: 'results',
    domain: 'news',
    check: (_calls, response) => expect(newsIds(response)).toEqual(['n4']),
  },
  {
    text: 'новости Каспийска',
    ai: intent({ domain: 'news', location: place('Каспийска') }),
    status: 'results',
    domain: 'news',
    check: (calls, response) => {
      expect(calls.news[0]).toEqual({ cityId: KASPIYSK.id, scope: 'city' });
      expect(newsIds(response)).toEqual(['n2']);
    },
  },
  {
    text: 'новости про футбол',
    ai: intent({ domain: 'news', filters: { topic: 'футбол' } }),
    status: 'results',
    domain: 'news',
    check: (_calls, response) => expect(newsIds(response)).toEqual(['n4']),
  },
  {
    text: 'мировые новости',
    ai: intent({ domain: 'news', filters: { scope: 'world' } }),
    status: 'no_results',
    domain: 'news',
    check: (calls) => expect(calls.news[0]?.scope).toBe('world'),
  },
  {
    text: 'новости про космос',
    ai: intent({ domain: 'news', filters: { topic: 'космос' } }),
    status: 'no_results',
    domain: 'news',
  },

  // ── Доставка ───────────────────────────────────────────────────────────────
  {
    text: 'пицца с доставкой',
    ai: intent({ domain: 'delivery', filters: { dish: 'пицца' } }),
    status: 'results',
    domain: 'delivery',
    check: (calls) =>
      expect(calls.places[0]).toMatchObject({
        cityId: MAKHACHKALA.id,
        hasDelivery: true,
        search: 'пицца',
      }),
  },
  {
    text: 'хинкал на дом за 40 минут',
    ai: intent({ domain: 'delivery', filters: { dish: 'хинкал', maxMinutes: 40 } }),
    status: 'results',
    domain: 'delivery',
    check: (calls) => expect(calls.places[0]).toMatchObject({ search: 'хинкал', maxMinutes: 40 }),
  },
  {
    text: 'японская кухня с доставкой',
    ai: intent({ domain: 'delivery', filters: { cuisine: 'японская' } }),
    status: 'results',
    domain: 'delivery',
    check: (calls) => expect(calls.places[0]?.cuisine).toBe('Японская'),
  },
  {
    text: 'шашлык, открыто сейчас',
    ai: intent({ domain: 'delivery', filters: { category: 'шашлык', openNow: true } }),
    status: 'results',
    domain: 'delivery',
    check: (calls) =>
      expect(calls.places[0]).toMatchObject({ category: 'shashlik', openNow: true }),
  },
  {
    text: 'ресторан с доставкой в Каспийске, сначала с высоким рейтингом',
    ai: intent({
      domain: 'delivery',
      filters: { placeType: 'ресторан' },
      location: place('Каспийске'),
      sort: 'rating',
    }),
    status: 'results',
    domain: 'delivery',
    check: (calls) =>
      expect(calls.places[0]).toMatchObject({
        cityId: KASPIYSK.id,
        types: 'restaurant',
        sort: 'rating',
      }),
  },
  {
    text: 'закажи шаурму',
    ai: intent({ intent: 'action', domain: 'delivery', filters: { dish: 'шаурма' } }),
    // «Заказать» — найти, где заказать: поиск доставки шаурмы, сам заказ — в карточке
    status: 'results',
    domain: 'delivery',
    check: (calls) =>
      expect(calls.places[0]).toMatchObject({ hasDelivery: true, search: 'шаурма' }),
  },
  {
    text: 'где мой курьер?',
    ai: intent({ intent: 'action', domain: 'delivery' }),
    status: 'unsupported',
    domain: 'delivery',
  },
  {
    text: 'бургеры, кухня марсианская',
    ai: intent({ domain: 'delivery', filters: { dish: 'бургер', cuisine: 'марсианская' } }),
    status: 'results',
    domain: 'delivery',
    check: (calls, response) => {
      expect(calls.places[0]?.cuisine).toBeUndefined();
      expect(response.parts[0]?.query?.ignored).toEqual([
        expect.objectContaining({ field: 'cuisine' }),
      ]);
    },
  },

  // ── Неоднозначные и составные ──────────────────────────────────────────────
  {
    text: 'что посоветуешь?',
    ai: intent({
      intent: 'unknown',
      confidence: 0.1,
      clarification: { needed: true, question: 'Что ищете?', options: [] },
    }),
    status: 'clarification',
    domain: null,
    check: (_calls, response) => expect(reason(response)).toBe('unknown_domain'),
  },
  {
    text: 'Завтра вечером кино в Махачкале и новости Дагестана',
    ai: intent({
      domain: 'cinema',
      location: place('Махачкале'),
      time: when('tomorrow', { period: 'evening' }),
      subqueries: [core({ domain: 'news', location: place('Дагестана') })],
    }),
    status: 'results',
    domain: 'cinema',
    check: (calls, response) => {
      expect(response.parts.map((part) => part.domain)).toEqual(['cinema', 'news']);
      expect(calls.cinema[0]).toEqual({ cityId: MAKHACHKALA.id, date: '2026-10-04' });
      expect(calls.news[0]?.scope).toBe('dagestan');
    },
  },
  {
    text: 'а на завтра?',
    ai: intent({ intent: 'refine', time: when('tomorrow') }),
    screen: 'cinema',
    status: 'results',
    domain: 'cinema',
    check: (calls) => expect(calls.cinema[0]?.date).toBe('2026-10-04'),
  },
];

describe(`Таблица фраз: ${CASES.length} запросов по четырём разделам`, () => {
  it('в таблице не меньше 40 фраз и все четыре раздела', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
    const domains = new Set(CASES.map((item) => item.domain));
    for (const domain of ['listings', 'cinema', 'news', 'delivery'])
      expect(domains.has(domain as SmartSearchDomain)).toBe(true);
  });

  for (const item of CASES) {
    it(`«${item.text}» → ${item.domain ?? 'без раздела'} / ${item.status}`, async () => {
      const h = harness();
      h.ai.on(item.text, item.ai);
      const response = await h.service.search({
        text: item.text,
        limit: 10,
        context: { cityId: MAKHACHKALA.id, ...(item.screen ? { screen: item.screen } : {}) },
      } as never);
      expect(response.status).toBe(item.status);
      expect(response.parts[0]?.domain ?? null).toBe(item.domain);
      item.check?.(h.calls, response);
    });
  }
});
