import {
  compactRubles,
  listingPartOf,
  smartListingFilters,
  smartSearchFeedbackSchema,
  smartSearchOutcome,
  understoodSummary,
  type SmartSearchIntent,
  type SmartSearchResponse,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { AiProviderError } from '../src/modules/smart-search/ai/ai-provider.js';
import {
  RecurringWordAnalyzer,
  lostWord,
  type FeedbackRecord,
} from '../src/modules/smart-search/feedback/feedback-analyzer.js';
import { MemoryTraceStore } from '../src/modules/smart-search/feedback/search-trace-store.js';
import { SmartSearchFeedbackService } from '../src/modules/smart-search/feedback/smart-search-feedback.service.js';
import { KASPIYSK, MAKHACHKALA, attributesOf, harness } from './helpers/smart-search-fixtures.js';
import { REAL_MOBILE } from './helpers/smart-search-real-mobile.js';

/**
 * Мобильный умный поиск целиком: фраза → настоящий ответ Qwen3 (снятый с
 * живого API) → сервер (проверка, нормализация, существующий сервис раздела)
 * → ответ приложению → то, что из него делает приложение (`smartListingFilters`,
 * `understoodSummary`, `smartSearchOutcome` — тот же код, что на телефоне).
 */

type Harness = ReturnType<typeof harness>;

const real = (h: Harness, text: string) => {
  const answer = REAL_MOBILE[text];
  if (!answer) throw new Error(`Нет снятого ответа модели для «${text}»`);
  h.ai.on(text, answer);
};

const ask = (
  h: Harness,
  text: string,
  options: { screen?: 'home' | 'listings'; sessionId?: string } = {},
) =>
  h.service.search({
    text,
    limit: 10,
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    context: { cityId: MAKHACHKALA.id, screen: options.screen ?? 'home' },
  });

/** Фильтры, которые приложение разложит по экрану объявлений. */
function screenFilters(response: SmartSearchResponse) {
  const part = listingPartOf(response);
  expect(part, 'ответ должен открываться лентой объявлений').not.toBeNull();
  return smartListingFilters(part!.query!);
}

describe('Объявления: фраза становится фильтрами, а не словами для поиска', () => {
  it('«Хочу тойота суксид» → Автомобили, Toyota, Succeed', async () => {
    const h = harness();
    real(h, 'Хочу тойота суксид');
    const response = await ask(h, 'Хочу тойота суксид', { screen: 'listings' });

    expect(response.requestId).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(response.parts[0]?.domain).toBe('listings');
    const filters = screenFilters(response);
    expect(filters).toMatchObject({
      category: 'transport-cars',
      attributes: { brand: 'toyota', model: 'succeed' },
      area: { kind: 'keep' },
    });
    // Фраза не ушла поиском по буквам ни на сервере, ни в приложении
    expect(filters.search).toBeUndefined();
    expect(h.calls.listings[0]?.search).toBeUndefined();
    expect(understoodSummary(listingPartOf(response)!.query!)).toBe('Toyota Succeed');
  });

  it('«…до 1.2 млн автомат бензин» — все условия сохраняются', async () => {
    const h = harness();
    const text = 'Хочу тойота суксид до 1.2 млн автомат бензин';
    real(h, text);
    const response = await ask(h, text, { screen: 'listings' });

    expect(h.calls.listings[0]).toMatchObject({
      category: 'transport-cars',
      priceTo: 120_000_000,
    });
    expect(attributesOf(h.calls.listings[0])).toEqual({
      brand: 'toyota',
      model: 'succeed',
      gearbox: ['auto'],
      fuel: ['petrol'],
    });
    const filters = screenFilters(response);
    // Копейки сервера → рубли экрана
    expect(filters.priceTo).toBe(1_200_000);
    expect(filters.attributes).toEqual({
      brand: 'toyota',
      model: 'succeed',
      gearbox: ['auto'],
      fuel: ['petrol'],
    });
    expect(understoodSummary(listingPartOf(response)!.query!)).toBe(
      'Toyota Succeed · до 1,2 млн ₽ · автомат · бензин',
    );
  });

  it('разговорное «нужен суксид на автомате до миллиона» — модель по написанию', async () => {
    // Qwen3 вернула марку «Suksid»: сервер нашёл модель по написанию из справочника
    const h = harness();
    const text = 'нужен суксид на автомате до миллиона';
    real(h, text);
    const response = await ask(h, text, { screen: 'listings' });
    const filters = screenFilters(response);
    expect(filters).toMatchObject({
      category: 'transport-cars',
      priceTo: 1_000_000,
      attributes: { brand: 'toyota', model: 'succeed', gearbox: ['auto'] },
    });
    expect(filters.search).toBeUndefined();
  });

  it('«Хочу квартиру посуточно в Махачкале» — сделка, срок и город', async () => {
    const h = harness();
    const text = 'Хочу квартиру посуточно в Махачкале';
    real(h, text);
    const filters = screenFilters(await ask(h, text));
    expect(filters).toMatchObject({
      category: 'realty-flats',
      transactionType: 'rent',
      rentPeriod: 'daily',
      area: { kind: 'city', label: 'Махачкала', radiusKm: 25 },
    });
  });

  it('ничего не нашлось — понятые условия остаются, всей доски нет', async () => {
    const h = harness({ listingsTotal: 0 });
    real(h, 'Хочу тойота суксид');
    const response = await ask(h, 'Хочу тойота суксид', { screen: 'listings' });
    expect(response.status).toBe('no_results');
    const part = listingPartOf(response);
    expect(part?.status).toBe('no_results');
    expect(smartListingFilters(part!.query!).attributes).toEqual({
      brand: 'toyota',
      model: 'succeed',
    });
  });
});

describe('Другие разделы — их существующие сервисы', () => {
  it('«Что сегодня посмотреть в кино в Махачкале?» → расписание кино', async () => {
    const h = harness();
    const text = 'Что сегодня посмотреть в кино в Махачкале?';
    real(h, text);
    const response = await ask(h, text);
    expect(response.status).toBe('results');
    expect(response.parts[0]?.results?.domain).toBe('cinema');
    expect(h.calls.cinema).toEqual([{ cityId: MAKHACHKALA.id, date: '2026-10-03' }]);
    expect(h.calls.listings).toHaveLength(0);
    expect(listingPartOf(response)).toBeNull();
  });

  it('«Что сегодня нового в Дагестане?» → лента новостей Дагестана', async () => {
    const h = harness();
    const text = 'Что сегодня нового в Дагестане?';
    real(h, text);
    const response = await ask(h, text);
    expect(response.parts[0]?.results?.domain).toBe('news');
    expect(h.calls.news[0]).toMatchObject({ scope: 'dagestan' });
  });

  it('«Хочу заказать пиццу в Каспийске» → поиск доставки пиццы, без оформления заказа', async () => {
    const h = harness();
    const text = 'Хочу заказать пиццу в Каспийске';
    real(h, text);
    const response = await ask(h, text);
    expect(response.parts[0]).toMatchObject({ domain: 'delivery', status: 'results' });
    expect(h.calls.places[0]).toMatchObject({
      cityId: KASPIYSK.id,
      hasDelivery: true,
      search: 'пицца',
    });
    expect(response.parts[0]!.navigation).toMatchObject({
      section: 'delivery',
      filters: { cityId: KASPIYSK.id, search: 'пицца', hasDelivery: true },
    });
  });

  it('«Где поесть хинкал в Каспийске?» → заведения Каспийска с доставкой', async () => {
    const h = harness();
    const text = 'Где поесть хинкал в Каспийске?';
    real(h, text);
    const response = await ask(h, text);
    expect(response.parts[0]?.results?.domain).toBe('delivery');
    expect(h.calls.places[0]).toMatchObject({
      cityId: KASPIYSK.id,
      hasDelivery: true,
      search: 'хинкал',
    });
  });
});

describe('Карточка раздела вместо лишнего вопроса (D15)', () => {
  it('«Хочу машину» → Транспорт → Автомобили, кнопка «Открыть», марки — быстрыми значениями', async () => {
    const h = harness({ traces: new MemoryTraceStore() });
    real(h, 'Хочу машину');
    const response = await ask(h, 'Хочу машину');
    expect(response.status).toBe('results');
    const part = response.parts[0]!;
    expect(part.navigation).toEqual({
      section: 'listings',
      path: ['Транспорт', 'Автомобили'],
      filters: {},
    });
    expect(part.suggestions?.map((option) => option.label)).toEqual([
      'Toyota',
      'LADA',
      'KIA',
      'Hyundai',
    ]);
    expect(part.suggestions?.[0]?.choice).toEqual({
      kind: 'filter',
      field: 'brand',
      value: 'toyota',
    });

    // Нажатие «Toyota» — без модели: тот же поиск плюс марка
    const before = h.ai.requests.length;
    const next = await h.service.search({
      text: 'Toyota',
      limit: 10,
      sessionId: response.sessionId,
      choice: { requestId: response.requestId, ...part.suggestions![0]!.choice! },
      context: { cityId: MAKHACHKALA.id, screen: 'home' },
    });
    expect(h.ai.requests.length).toBe(before);
    expect(screenFilters(next)).toMatchObject({
      category: 'transport-cars',
      attributes: { brand: 'toyota' },
    });
    // Марка уже выбрана — марки больше не предлагаются
    expect(next.parts[0]!.suggestions).toBeUndefined();
  });

  it('«Хочу квартиру» → квартиры, быстрые значения «Купить / Снять надолго / Посуточно»', async () => {
    const h = harness({ traces: new MemoryTraceStore() });
    real(h, 'Хочу квартиру');
    const response = await ask(h, 'Хочу квартиру');
    expect(response.status).toBe('results');
    expect(response.parts[0]!.navigation?.path).toEqual(['Недвижимость', 'Квартиры']);
    expect(response.parts[0]!.suggestions?.map((option) => option.choice)).toEqual([
      { kind: 'filter', field: 'transactionType', value: 'sale' },
      { kind: 'filter', field: 'rentPeriod', value: 'monthly' },
      { kind: 'filter', field: 'rentPeriod', value: 'daily' },
    ]);
    const daily = await h.service.search({
      text: 'Посуточно',
      limit: 10,
      sessionId: response.sessionId,
      choice: {
        requestId: response.requestId,
        kind: 'filter',
        field: 'rentPeriod',
        value: 'daily',
      },
      context: { cityId: MAKHACHKALA.id, screen: 'home' },
    });
    expect(screenFilters(daily)).toMatchObject({
      category: 'realty-flats',
      transactionType: 'rent',
      rentPeriod: 'daily',
    });
  });

  it('«машины в Каспийске» — с местом это уже поиск, а не общий вопрос', async () => {
    const h = harness();
    h.ai.on('машины в Каспийске', {
      ...REAL_MOBILE['Хочу машину']!,
      location: { city: 'Каспийске', nearMe: false, preferred: false },
      unresolved: [],
    });
    const response = await ask(h, 'машины в Каспийске');
    expect(response.status).toBe('results');
  });

  it('«Хочу что-нибудь недорогое» — уточнение без выдуманной цены', async () => {
    const h = harness();
    real(h, 'Хочу что-нибудь недорогое');
    const response = await ask(h, 'Хочу что-нибудь недорогое');
    expect(response.status).toBe('clarification');
    expect(response.parts[0]?.query).toBeNull();
    expect(JSON.stringify(response)).not.toMatch(/priceTo|priceFrom|"price"/);
    expect(h.calls.listings).toHaveLength(0);
  });
});

describe('Контекст: следующая фраза уточняет прошлую', () => {
  it('«Хочу Succeed» → «до миллиона» → «а автомат?» → «И во Владивостоке»', async () => {
    const h = harness();
    for (const text of ['Хочу Succeed', 'до миллиона', 'а автомат?', 'И во Владивостоке'])
      real(h, text);

    const first = await ask(h, 'Хочу Succeed', { screen: 'listings' });
    expect(screenFilters(first).attributes).toEqual({ brand: 'toyota', model: 'succeed' });

    const second = await ask(h, 'до миллиона', {
      screen: 'listings',
      sessionId: first.sessionId,
    });
    expect(screenFilters(second)).toMatchObject({
      priceTo: 1_000_000,
      attributes: { brand: 'toyota', model: 'succeed' },
    });

    const third = await ask(h, 'а автомат?', { screen: 'listings', sessionId: first.sessionId });
    expect(screenFilters(third)).toMatchObject({
      category: 'transport-cars',
      priceTo: 1_000_000,
      attributes: { brand: 'toyota', model: 'succeed', gearbox: ['auto'] },
    });

    // Города нет в приложении — уточнение «где искать», а прежние условия не теряются
    const fourth = await ask(h, 'И во Владивостоке', {
      screen: 'listings',
      sessionId: first.sessionId,
    });
    expect(fourth.status).toBe('clarification');
    expect(fourth.parts[0]!.clarification!.reason).toBe('unknown_city');
    expect(fourth.parts[0]!.clarification!.options.map((option) => option.label)).toContain(
      'Махачкала',
    );
    const conditions = fourth.parts[0]!.query!.conditions.map((item) => item.field);
    expect(conditions).toEqual(expect.arrayContaining(['brand', 'model', 'price', 'gearbox']));
  });
});

describe('Запасной путь: умный поиск не сработал — обычный поиск по фразе', () => {
  const failing: [string, Error | string | SmartSearchIntent | null, string][] = [
    ['модель не успела', new AiProviderError('AI_TIMEOUT', 'timeout'), 'AI_TIMEOUT'],
    ['модель недоступна', new AiProviderError('AI_UNAVAILABLE', 'down'), 'AI_UNAVAILABLE'],
    ['ответ не JSON', 'вот что я нашёл: камри', 'INVALID_AI_OUTPUT'],
    [
      'раздел, которого нет (магазины)',
      JSON.stringify({ ...REAL_MOBILE['Хочу тойота суксид'], domain: 'shops' }),
      'INVALID_AI_OUTPUT',
    ],
  ];

  for (const [name, script, code] of failing) {
    it(name, async () => {
      const h = harness();
      h.ai.on('хочу камри', script as never);
      const response = await ask(h, 'хочу камри');
      expect(response.status).toBe('error');
      expect(response.requestId).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
      const outcome = smartSearchOutcome(response);
      expect(outcome).toMatchObject({ kind: 'fallback', text: 'хочу камри', code });
      expect(outcome.kind === 'fallback' && outcome.message).not.toMatch(
        /qwen|ollama|json|intent|adapter|api/i,
      );
      expect(h.calls.listings).toHaveLength(0);
    });
  }

  it('умный поиск выключен — тоже обычный поиск', async () => {
    const h = harness({ enabled: false });
    const response = await ask(h, 'хочу камри');
    expect(smartSearchOutcome(response)).toMatchObject({ kind: 'fallback', text: 'хочу камри' });
  });
});

describe('«Я имел в виду другое»', () => {
  function fakePrisma() {
    const created: Record<string, unknown>[] = [];
    return {
      created,
      prisma: {
        smartSearchFeedback: {
          create: ({ data }: { data: Record<string, unknown> }) => {
            created.push(data);
            return Promise.resolve({ id: 'feedback-1' });
          },
        },
      },
    };
  }

  it('исправление сохраняется рядом с разбором модели; ничего не меняется само', async () => {
    const traces = new MemoryTraceStore();
    const h = harness({ traces });
    const text = 'Хочу тойота суксид до 1.2 млн автомат бензин';
    real(h, text);
    const response = await ask(h, text);

    // В ответе приложению — только номер, разбора модели нет
    expect(JSON.stringify(response)).not.toContain('"confidence"');
    const trace = await traces.load(response.requestId);
    expect(trace).toMatchObject({
      text,
      status: 'results',
      domain: 'listings',
      confidence: REAL_MOBILE[text]!.confidence,
    });
    expect(trace?.intent).toEqual(REAL_MOBILE[text]);

    const { prisma, created } = fakePrisma();
    const feedback = new SmartSearchFeedbackService(prisma as never, traces);
    const result = await feedback.submit({
      requestId: response.requestId,
      originalQuery: text,
      failureType: 'missing_conditions',
      userCorrection: 'Я имел в виду Toyota Succeed, а не просто Toyota',
      screen: 'listings',
    });
    expect(result).toEqual({ id: 'feedback-1', status: 'received' });
    expect(created[0]).toMatchObject({
      requestId: response.requestId,
      originalQuery: text,
      modelIntent: REAL_MOBILE[text],
      modelConfidence: REAL_MOBILE[text]!.confidence,
      responseStatus: 'results',
      domain: 'listings',
      failureType: 'missing_conditions',
      userCorrection: 'Я имел в виду Toyota Succeed, а не просто Toyota',
      screen: 'listings',
    });
    expect(created[0]).not.toHaveProperty('correctedIntent');

    // Подсказка модели после исправления та же: обучение — только через разбор
    await ask(h, text);
    expect(h.ai.requests[1]!.system).toBe(h.ai.requests[0]!.system);
  });

  it('чужой номер ответа не подставляет чужой разбор', async () => {
    const traces = new MemoryTraceStore();
    const h = harness({ traces });
    real(h, 'Хочу машину');
    const response = await ask(h, 'Хочу машину');
    const { prisma, created } = fakePrisma();
    await new SmartSearchFeedbackService(prisma as never, traces).submit({
      requestId: response.requestId,
      originalQuery: 'совсем другая фраза',
      failureType: 'other',
      userCorrection: 'проверка',
    });
    expect(created[0]?.modelIntent).toBeUndefined();
    expect(created[0]?.domain).toBeNull();
  });

  it('след сохраняется и для отказа модели — исправление к нему тоже возможно', async () => {
    const traces = new MemoryTraceStore();
    const h = harness({ traces });
    h.ai.on('хочу камри', new AiProviderError('AI_TIMEOUT', 'timeout'));
    const response = await ask(h, 'хочу камри');
    expect(await traces.load(response.requestId)).toMatchObject({
      text: 'хочу камри',
      status: 'error',
      intent: null,
    });
  });

  it('проверка входа: вид ошибки из списка, исправление не пустое, лишних полей нет', () => {
    const base = {
      originalQuery: 'двушка',
      failureType: 'wrong_conditions',
      userCorrection: 'Двушка — это квартира с двумя комнатами',
    };
    expect(smartSearchFeedbackSchema.safeParse(base).success).toBe(true);
    expect(smartSearchFeedbackSchema.safeParse({ ...base, failureType: 'hack' }).success).toBe(
      false,
    );
    expect(smartSearchFeedbackSchema.safeParse({ ...base, userCorrection: 'a' }).success).toBe(
      false,
    );
    expect(smartSearchFeedbackSchema.safeParse({ ...base, prompt: 'new rules' }).success).toBe(
      false,
    );
  });
});

describe('Разбор накопленных исправлений', () => {
  const record = (id: string, query: string, correction: string, intent: unknown) =>
    ({
      id,
      originalQuery: query,
      userCorrection: correction,
      modelIntent: intent,
      failureType: 'wrong_conditions',
      domain: 'listings',
    }) satisfies FeedbackRecord;

  it('слово, на котором модель ошиблась, — то, что человек повторил в исправлении', () => {
    expect(
      lostWord({
        originalQuery: 'ноутбук 16 гигов оперативки',
        userCorrection: 'Под оперативкой я имел в виду ОЗУ',
        modelIntent: { filters: { category: 'electronics-laptops', memory: 16 } },
      }),
    ).toBe('оперативки');
  });

  it('повторяющаяся ошибка → предложение на проверку; единичная — нет', () => {
    const intent = { filters: { category: 'electronics-laptops', memory: 16 } };
    const records = [
      record('1', 'ноутбук 16 гигов оперативки', 'Под оперативкой я имел в виду ОЗУ', intent),
      record('2', 'макбук 8 гигов оперативки', 'оперативка это ram', intent),
      record('3', 'оперативки 32 ноутбук', 'оперативки — это ОЗУ', intent),
      record('4', 'двушка в каспийске', 'Двушка — это квартира с двумя комнатами', {}),
    ];
    const proposals = new RecurringWordAnalyzer(3).analyze(records);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      word: 'оперативки',
      occurrences: 3,
      status: 'needs_review',
      feedbackIds: ['1', '2', '3'],
    });
    expect(proposals[0]!.fixes).toEqual(
      expect.arrayContaining(['dictionary_rule', 'normalization_rule', 'regression_test']),
    );
  });
});

describe('Строка «Понял запрос»', () => {
  it('суммы — коротко, по-русски', () => {
    expect(compactRubles(1_200_000)).toBe('1,2 млн ₽');
    expect(compactRubles(40_000)).toBe('40 тыс ₽');
    expect(compactRubles(900)).toBe('900 ₽');
  });

  it('аббревиатуры не превращаются в строчные, место из контекста не повторяется', () => {
    const summary = understoodSummary({
      domain: 'listings',
      intent: 'search',
      text: null,
      conditions: [
        { field: 'category', label: 'Категория', value: 'realty-land', display: 'Участки' },
        { field: 'landPurpose', label: 'Назначение', value: 'izhs', display: 'ИЖС' },
        { field: 'price', label: 'Цена', value: { min: 500_000, max: 2_000_000 }, display: '' },
        { field: 'location', label: 'Место', value: 'x', display: 'Каспийск · 25 км' },
      ],
      preferences: [],
      ignored: [],
      unresolved: [],
      location: { cityId: 'x', cityName: 'Каспийск', mode: 'exact' },
      time: null,
      sort: null,
      params: {},
    });
    expect(summary).toBe('Участки · ИЖС · 500 тыс – 2 млн ₽ · Каспийск · 25 км');
  });
});
