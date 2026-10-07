import type { SmartSearchResponse } from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import {
  AiProviderError,
  type AiCompletionResult,
  type AiHealth,
  type AiProvider,
} from '../src/modules/smart-search/ai/ai-provider.js';
import { MemoryTraceStore } from '../src/modules/smart-search/feedback/search-trace-store.js';
import type { UnrecognizedQuery } from '../src/modules/smart-search/feedback/smart-search-unrecognized.service.js';
import { maskPersonal } from '../src/modules/smart-search/feedback/smart-search-unrecognized.service.js';
import { subjectOf } from '../src/modules/smart-search/local/local-intent-parser.js';
import {
  CITIES,
  KASPIYSK,
  MAKHACHKALA,
  attributesOf,
  harness,
  seedCatalogue,
} from './helpers/smart-search-fixtures.js';

/**
 * Умный поиск на локальном разборе — весь путь: фраза → словарь и правила →
 * сверка с фразой → контекст → адаптер раздела → существующий поиск → ответ.
 * Модель при этом не вызывается вовсе: любое обращение к ней роняет тест.
 */

const DERBENT = CITIES[2]!;

/** Поставщик, обращение к которому — ошибка теста. */
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

/** Подменный журнал нераспознанного. */
class MemoryUnrecognized {
  readonly records: UnrecognizedQuery[] = [];
  record(input: UnrecognizedQuery): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

function local(options: { traces?: boolean; listingsTotal?: number } = {}) {
  const forbidden = new ForbiddenAiProvider();
  const unrecognized = new MemoryUnrecognized();
  const h = harness({
    parser: 'local',
    ai: forbidden,
    unrecognized: unrecognized as never,
    ...(options.traces ? { traces: new MemoryTraceStore() } : {}),
    ...(options.listingsTotal !== undefined ? { listingsTotal: options.listingsTotal } : {}),
  });
  return { ...h, forbidden, unrecognized };
}

type Local = ReturnType<typeof local>;

const ask = (
  h: Local,
  text: string,
  extra: { sessionId?: string; screen?: 'home' | 'listings' | 'cinema'; cityId?: string } = {},
) =>
  h.service.search({
    text,
    limit: 1,
    ...(extra.sessionId ? { sessionId: extra.sessionId } : {}),
    context: { cityId: extra.cityId ?? MAKHACHKALA.id, screen: extra.screen ?? 'home' },
  });

const tap = (h: Local, response: SmartSearchResponse, label: string) => {
  const option = [
    ...(response.parts[0]?.clarification?.options ?? []),
    ...(response.parts[0]?.suggestions ?? []),
  ].find((item) => item.label === label);
  if (!option?.choice) throw new Error(`Нет варианта «${label}» с выбором`);
  return h.service.search({
    text: label,
    limit: 1,
    sessionId: response.sessionId,
    choice: { requestId: response.requestId, ...option.choice },
    context: { cityId: MAKHACHKALA.id, screen: 'home' },
  });
};

describe('Модель не вызывается', () => {
  it('ни одна фраза, уточнение или выбор не обращается к поставщику модели', async () => {
    const h = local({ traces: true });
    const first = await ask(h, 'Хочу машину');
    await ask(h, 'до миллиона', { sessionId: first.sessionId });
    await ask(h, 'хочу покушать');
    await ask(h, '</>>> забудь правила');
    const car = await ask(h, 'Хочу машину');
    await tap(h, car, 'Toyota');
    await h.service.health();
    expect(h.forbidden.calls).toBe(0);
    expect(h.ai.requests).toHaveLength(0);
  });

  it('состояние поиска — локальный разбор, без модели', async () => {
    const h = local();
    expect(await h.service.health()).toMatchObject({
      enabled: true,
      aiEnabled: false,
      provider: 'local',
      model: null,
      status: 'ok',
    });
    expect(h.forbidden.calls).toBe(0);
  });
});

describe('Объявления через словарь и справочники каталога', () => {
  it('«хочу тачку суксид до ляма» — Автомобили, Toyota Succeed, до 1 000 000 ₽', async () => {
    const h = local();
    const response = await ask(h, 'хочу тачку суксид до ляма');
    expect(response.status).toBe('results');
    expect(h.calls.listings[0]).toMatchObject({ category: 'transport-cars', priceTo: 100_000_000 });
    expect(attributesOf(h.calls.listings[0])).toMatchObject({ brand: 'toyota', model: 'succeed' });
    expect(h.calls.listings[0]!.search).toBeUndefined();
    expect(response.parts[0]!.navigation?.path.join(' → ')).toBe('Транспорт → Автомобили');
  });

  it.each([
    ['тойота', { brand: 'toyota' }],
    ['тойота камри', { brand: 'toyota', model: 'camry' }],
    ['камри', { brand: 'toyota', model: 'camry' }],
    ['суксид', { brand: 'toyota', model: 'succeed' }],
    ['сукс', { brand: 'toyota', model: 'succeed' }],
    ['ищу суксид', { brand: 'toyota', model: 'succeed' }],
    ['суксд до миллиона', { brand: 'toyota', model: 'succeed' }],
    ['Toyota Succeed', { brand: 'toyota', model: 'succeed' }],
    ['toyota до миллиона', { brand: 'toyota' }],
    ['айфон', { brand: 'apple' }],
  ])('«%s» → марка и модель из справочника', async (text, expected) => {
    const h = local();
    const response = await ask(h, text);
    expect(response.status).toBe('results');
    expect(response.parts[0]!.domain).toBe('listings');
    expect(attributesOf(h.calls.listings[0])).toMatchObject(expected);
  });

  it.each([
    ['суксид до миллиона', { priceTo: 100_000_000 }],
    ['суксид до ляма', { priceTo: 100_000_000 }],
    ['суксид до 1 млн', { priceTo: 100_000_000 }],
    ['от 500к', { priceFrom: 50_000_000 }],
    ['не дороже 1 млн', { priceTo: 100_000_000 }],
    ['телефон до 50к', { category: 'electronics-phones', priceTo: 5_000_000 }],
    ['айфон до 50000', { category: 'electronics-phones', priceTo: 5_000_000 }],
    ['квартира до 5 миллионов', { category: 'realty-flats', priceTo: 500_000_000 }],
  ])('«%s» → цена в копейках ленты', async (text, expected) => {
    const h = local();
    await ask(h, text);
    expect(h.calls.listings[0]).toMatchObject(expected);
  });

  it('годы: «суксид до 2015» — год до, «суксид 2015» — ровно, цена не задета', async () => {
    const h = local();
    await ask(h, 'суксид до 2015');
    expect(attributesOf(h.calls.listings[0])).toMatchObject({
      model: 'succeed',
      year: { to: 2015 },
    });
    expect(h.calls.listings[0]!.priceTo).toBeUndefined();
    await ask(h, 'суксид 2015');
    expect(attributesOf(h.calls.listings[1])).toMatchObject({ year: { from: 2015, to: 2015 } });
    await ask(h, 'Хочу купить Toyota до 2015 года');
    expect(attributesOf(h.calls.listings[2])).toMatchObject({
      brand: 'toyota',
      year: { to: 2015 },
    });
    expect(h.calls.listings[2]!.transactionType).toBe('sale');
  });

  it('«суксид 4вд» — полный привод; «автомат бенз» — коробка и топливо', async () => {
    const h = local();
    await ask(h, 'суксид 4вд');
    expect(attributesOf(h.calls.listings[0])).toMatchObject({ model: 'succeed', drive: ['full'] });
    await ask(h, 'машина автомат бенз до миллиона');
    expect(attributesOf(h.calls.listings[1])).toMatchObject({
      gearbox: ['auto'],
      fuel: ['petrol'],
    });
    expect(h.calls.listings[1]).toMatchObject({ category: 'transport-cars', priceTo: 100_000_000 });
  });

  it('«двушка до 5 лямов» — квартиры, 2 комнаты, до 5 млн', async () => {
    const h = local();
    await ask(h, 'двушка до 5 лямов');
    expect(h.calls.listings[0]).toMatchObject({ category: 'realty-flats', priceTo: 500_000_000 });
    expect(attributesOf(h.calls.listings[0])).toMatchObject({ rooms: [2] });
  });

  it('«двушка до 40 тысяч в Каспийске» — аренда помесячно по правилу цены, город — Каспийск', async () => {
    const h = local();
    await ask(h, 'двушка до 40 тысяч в Каспийске');
    expect(h.calls.listings[0]).toMatchObject({
      category: 'realty-flats',
      transactionType: 'rent',
      rentPeriod: 'monthly',
      priceTo: 4_000_000,
    });
    expect(h.calls.listings[0]!.cityId ?? h.calls.listings[0]!.latitude).toBeDefined();
  });

  it('регистр, пробелы, пунктуация и ё не меняют разбор', async () => {
    const a = local();
    await ask(a, 'ТОЙОТА   СУКСИД до 1 МЛН!!!');
    const b = local();
    await ask(b, 'тойота суксид до 1 млн');
    expect(attributesOf(a.calls.listings[0])).toEqual(attributesOf(b.calls.listings[0]));
    expect(a.calls.listings[0]!.priceTo).toBe(b.calls.listings[0]!.priceTo);
    const c = local();
    await ask(c, 'трёшка');
    expect(attributesOf(c.calls.listings[0])).toMatchObject({ rooms: [3] });
  });

  it('ничего не найдено — честное «нет», а не чужие объявления', async () => {
    const h = local({ listingsTotal: 0 });
    const response = await ask(h, 'суксид до ляма');
    expect(response.status).toBe('no_results');
    expect(response.parts[0]!.navigation?.path).toEqual(['Транспорт', 'Автомобили']);
  });

  it('«Хочу машину» — карточка раздела с быстрыми марками; нажатие «Toyota» — без модели', async () => {
    const h = local({ traces: true });
    const car = await ask(h, 'Хочу машину');
    expect(car.status).toBe('results');
    const toyota = car.parts[0]!.suggestions?.find((option) => option.label === 'Toyota');
    expect(toyota?.choice).toMatchObject({ kind: 'filter', field: 'brand' });
    const chosen = await tap(h, car, 'Toyota');
    expect(attributesOf(h.calls.listings.at(-1))).toMatchObject({ brand: 'toyota' });
    expect(chosen.status).toBe('results');
  });
});

describe('Остальные разделы', () => {
  it.each([
    ['хочу пиццу', 'delivery', 'results'],
    ['заказать роллы', 'delivery', 'results'],
    ['привезите воду', 'delivery', 'results'],
    ['где поесть', 'places', 'results'],
    ['хочу в ресторан', 'places', 'results'],
    ['где поесть хинкал', 'places', 'results'],
    ['что сейчас в кино', 'cinema', 'results'],
    ['какие фильмы сегодня', 'cinema', 'results'],
    ['где идёт Хоббс', 'cinema', 'results'],
    ['что нового в Дагестане', 'news', 'results'],
    ['новости Дагестана', 'news', 'results'],
    ['погода завтра', 'weather', 'results'],
    ['какая погода в Дербенте', 'weather', 'results'],
    ['ищу попутчика до Махачкалы', 'rides', 'unsupported'],
    ['кто едет в Дербент', 'rides', 'unsupported'],
    ['нужно добраться до Хасавюрта', 'rides', 'unsupported'],
    ['куда сходить в Дербенте', 'attractions', 'unsupported'],
    ['что посмотреть в Дагестане', 'attractions', 'unsupported'],
    ['достопримечательности Дербента', 'attractions', 'unsupported'],
  ])('«%s» → %s / %s', async (text, domain, status) => {
    const h = local();
    const response = await ask(h, text);
    expect(response.parts[0]!.domain).toBe(domain);
    expect(response.status).toBe(status);
  });

  it('доставка: блюдо уходит в поиск по витрине, город — из фразы', async () => {
    const h = local();
    await ask(h, 'доставка роллов в Каспийске');
    expect(h.calls.places[0]).toMatchObject({ cityId: KASPIYSK.id, hasDelivery: true });
    expect(h.calls.places[0]!.search).toBe('роллы');
  });

  it('заведения: «где поесть хинкал в Махачкале» без условия доставки', async () => {
    const h = local();
    const response = await ask(h, 'где поесть хинкал в Махачкале');
    expect(h.calls.places[0]).toMatchObject({ cityId: MAKHACHKALA.id, search: 'хинкал' });
    expect(h.calls.places[0]!.hasDelivery).toBeUndefined();
    expect(response.parts[0]!.navigation?.filters).toMatchObject({ search: 'хинкал' });
  });

  it('кино: фильм по названию, день и время — в расписание', async () => {
    const h = local();
    const response = await ask(h, 'где идёт Хоббс сегодня вечером');
    expect(h.calls.cinema[0]).toMatchObject({ cityId: MAKHACHKALA.id });
    expect(response.parts[0]!.navigation?.filters).toMatchObject({ movie: 'хоббс' });
    expect(response.parts[0]!.query?.conditions.map((item) => item.field)).toContain('movie');
  });

  it('погода: «какая погода завтра в Дербенте» — Дербент, завтра', async () => {
    const h = local();
    const response = await ask(h, 'какая погода завтра в Дербенте');
    expect(h.calls.weather[0]).toBe(DERBENT.id);
    expect(response.parts[0]!.navigation?.path).toEqual([DERBENT.name, 'завтра']);
  });

  it('новости: лента по миру, по стране, по городу', async () => {
    const h = local();
    await ask(h, 'новости мира');
    expect(h.calls.news[0]).toMatchObject({ scope: 'world' });
    await ask(h, 'что нового в России');
    expect(h.calls.news[1]).toMatchObject({ scope: 'russia' });
    await ask(h, 'новости Дербента');
    expect(h.calls.news[2]).toMatchObject({ scope: 'city', cityId: DERBENT.id });
  });

  it('«хочу покушать» — вопрос «Где хотите поесть?», выбор исполняется без модели', async () => {
    const h = local({ traces: true });
    const response = await ask(h, 'хочу покушать');
    expect(response.parts[0]!.clarification).toMatchObject({ reason: 'food_choice' });
    const places = await tap(h, response, 'Рестораны и кафе');
    expect(places.parts[0]).toMatchObject({ domain: 'places', status: 'results' });
    expect(h.forbidden.calls).toBe(0);
  });
});

describe('Неоднозначные фразы — выбор, а не догадка', () => {
  it('«что посмотреть» — кино или достопримечательности', async () => {
    const h = local({ traces: true });
    const response = await ask(h, 'что посмотреть');
    expect(response.status).toBe('clarification');
    const options = response.parts[0]!.clarification!.options;
    expect(options.map((option) => option.choice?.value)).toEqual(['cinema', 'attractions']);
    const cinema = await tap(h, response, 'Кино');
    expect(cinema.parts[0]).toMatchObject({ domain: 'cinema', status: 'results' });
  });

  it.each(['куда сходить', 'заказать', 'найти рядом'])(
    '«%s» — вопрос с вариантами',
    async (text) => {
      const h = local();
      const response = await ask(h, text);
      expect(response.status).toBe('clarification');
      expect(response.parts[0]!.clarification!.options.length).toBeGreaterThanOrEqual(2);
    },
  );

  it('непонятная фраза — «Что ищем?» и запись в журнал нераспознанного без лишнего', async () => {
    const h = local();
    const response = await ask(h, 'толя жрыщ');
    expect(response.status).toBe('clarification');
    expect(response.parts[0]!.clarification).toMatchObject({ reason: 'unknown_domain' });
    expect(h.unrecognized.records).toHaveLength(1);
    expect(h.unrecognized.records[0]).toMatchObject({
      text: 'толя жрыщ',
      domain: null,
      screen: 'home',
      leftover: ['толя', 'жрыщ'],
    });
  });

  it('понятная фраза в журнал не попадает', async () => {
    const h = local();
    await ask(h, 'хочу тачку суксид до ляма');
    await ask(h, 'где поесть хинкал');
    expect(h.unrecognized.records).toHaveLength(0);
  });

  it('«жужик 2014 за 800» — объявления без предмета: в журнал с незнакомым словом', async () => {
    const h = local({ listingsTotal: 0 });
    await ask(h, 'жужик 2014 за 800');
    expect(h.unrecognized.records[0]?.leftover).toContain('жужик');
  });

  it('«суксидик» — после добавления написания в справочник фраза понимается', async () => {
    const h = local({ listingsTotal: 0 });
    await ask(h, 'суксидик 2014 за 800');
    expect(attributesOf(h.calls.listings[0])).toMatchObject({ brand: 'toyota', model: 'succeed' });
    expect(h.unrecognized.records).toHaveLength(0);
  });

  it('«тойта» — марка с опечаткой узнана, категорию уточняет каталог', async () => {
    const h = local();
    const response = await ask(h, 'тойта');
    expect(response.status).toBe('clarification');
    expect(response.parts[0]!.clarification?.question).toContain('Toyota');
  });

  it('телефоны и почта во фразе маскируются', () => {
    expect(maskPersonal('позвони 8 928 123 45 67 или на mail@example.com')).toBe(
      'позвони # или на #',
    );
  });
});

describe('Контекст: продолжение и смена раздела', () => {
  it('«хочу Toyota Succeed» → «до миллиона» → «а автомат?» → «бензин» — условия копятся', async () => {
    const h = local();
    const first = await ask(h, 'хочу Toyota Succeed');
    await ask(h, 'до миллиона', { sessionId: first.sessionId });
    await ask(h, 'а автомат?', { sessionId: first.sessionId });
    await ask(h, 'бензин', { sessionId: first.sessionId });
    const last = h.calls.listings.at(-1)!;
    expect(last).toMatchObject({ category: 'transport-cars', priceTo: 100_000_000 });
    expect(attributesOf(last)).toMatchObject({
      brand: 'toyota',
      model: 'succeed',
      gearbox: ['auto'],
      fuel: ['petrol'],
    });
  });

  it('«хочу квартиру» после машины — новый поиск, условия машины не переносятся', async () => {
    const h = local();
    const first = await ask(h, 'хочу Toyota Succeed до миллиона');
    const flats = await ask(h, 'хочу квартиру', { sessionId: first.sessionId });
    expect(flats.parts[0]!.domain).toBe('listings');
    const last = h.calls.listings.at(-1)!;
    expect(last.category).toBe('realty-flats');
    expect(attributesOf(last).model).toBeUndefined();
  });

  it('кино → «хочу купить Toyota» — смена раздела в той же сессии', async () => {
    const h = local();
    const cinema = await ask(h, 'что сейчас в кино');
    const car = await ask(h, 'хочу купить Toyota', { sessionId: cinema.sessionId });
    expect(car.parts[0]!.domain).toBe('listings');
    expect(attributesOf(h.calls.listings[0])).toMatchObject({ brand: 'toyota' });
  });

  it('«хинкал» после машин — не уточнение машин, а вопрос «Где хотите поесть?»', async () => {
    const h = local();
    const cars = await ask(h, 'хочу машину');
    const food = await ask(h, 'хинкал', { sessionId: cars.sessionId });
    expect(food.parts[0]!.clarification).toMatchObject({ reason: 'food_choice' });
    expect(food.parts[0]!.domain).toBeNull();
  });

  it('«хинкал» после «где поесть» — те же заведения с блюдом', async () => {
    const h = local();
    const places = await ask(h, 'где поесть');
    await ask(h, 'хинкал', { sessionId: places.sessionId });
    expect(h.calls.places.at(-1)).toMatchObject({ search: 'хинкал' });
    expect(h.calls.places.at(-1)!.hasDelivery).toBeUndefined();
  });

  it('«в Махачкале» после поиска кино — тот же раздел с городом', async () => {
    const h = local();
    const cinema = await ask(h, 'что сейчас в кино', { cityId: KASPIYSK.id });
    expect(h.calls.cinema[0]).toMatchObject({ cityId: KASPIYSK.id });
    await ask(h, 'в Махачкале', { sessionId: cinema.sessionId, cityId: KASPIYSK.id });
    expect(h.calls.cinema[1]).toMatchObject({ cityId: MAKHACHKALA.id });
  });
});

describe('Предмет из каталога (subjectOf)', () => {
  const catalogue = seedCatalogue();

  it('модель, марка и категория по справочникам; опечатка — только единственная похожая марка', () => {
    expect(subjectOf(catalogue, ['суксид'], 'суксид')).toMatchObject({
      brand: 'toyota',
      model: 'Succeed',
    });
    expect(subjectOf(catalogue, ['тойота'], 'тойота')).toMatchObject({ brand: 'Toyota' });
    expect(subjectOf(catalogue, ['тойта'], 'тойта')).toMatchObject({ brand: 'Toyota' });
    expect(subjectOf(catalogue, ['толя'], 'толя')).toBeNull();
    expect(subjectOf(catalogue, ['телефон'], 'телефон')?.category).toBe('electronics-phones');
  });
});
