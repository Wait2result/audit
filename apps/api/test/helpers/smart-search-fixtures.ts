import {
  DICTIONARY_SEEDS,
  SMART_SEARCH_SCHEMA_VERSION,
  bindingsOf,
  flattenSeedCategories,
  resolveAttributes,
  type CinemaScheduleDto,
  type CityDto,
  type ListingAttribute,
  type ListingDto,
  type ListingListQuery,
  type NewsSummaryDto,
  type PaginatedResponse,
  type PlaceCategoryDto,
  type PlaceDto,
  type PlaceListQuery,
  type SmartSearchIntent,
  type SmartSearchIntentCore,
} from '@dagestan/shared';

import type {
  AiCompletionRequest,
  AiProvider,
} from '../../src/modules/smart-search/ai/ai-provider.js';
import { AiProviderError } from '../../src/modules/smart-search/ai/ai-provider.js';
import { MemoryContextStore } from '../../src/modules/smart-search/context/context-store.js';
import { CinemaSearchAdapter } from '../../src/modules/smart-search/domains/cinema.adapter.js';
import { DeliverySearchAdapter } from '../../src/modules/smart-search/domains/delivery.adapter.js';
import {
  DomainRegistry,
  type DomainRequestContext,
} from '../../src/modules/smart-search/domains/domain-adapter.js';
import { ListingsSearchAdapter } from '../../src/modules/smart-search/domains/listings.adapter.js';
import { NewsSearchAdapter } from '../../src/modules/smart-search/domains/news.adapter.js';
import type { TraceStore } from '../../src/modules/smart-search/feedback/search-trace-store.js';
import { SmartSearchService } from '../../src/modules/smart-search/smart-search.service.js';
import {
  ListingCatalogue,
  type CategoryRecord,
  type DictionaryRecord,
} from '../../src/modules/listings/listing-categories.service.js';

/**
 * Окружение умного поиска для тестов: каталог объявлений из тех же сидов,
 * что заполняют базу, города, расписание кино, лента новостей, заведения и
 * «модель», отвечающая заранее заданным JSON. Настоящая модель не нужна:
 * проверяется маршрутизация, нормализация и проверки сервера, а не
 * качество генерации.
 */

/** «Сейчас» тестов: 3 октября 2026, 12:00 по Москве. */
export const NOW = new Date('2026-10-03T09:00:00Z');

export const CITIES: CityDto[] = [
  city('11111111-1111-4111-8111-111111111111', 'Махачкала', 'makhachkala', 42.9849, 47.5047),
  city('22222222-2222-4222-8222-222222222222', 'Каспийск', 'kaspiysk', 42.8816, 47.638),
  city('33333333-3333-4333-8333-333333333333', 'Дербент', 'derbent', 42.0573, 48.2894),
  city('44444444-4444-4444-8444-444444444444', 'Буйнакск', 'buynaksk', 42.8217, 47.1167),
  city('55555555-5555-4555-8555-555555555555', 'Избербаш', 'izberbash', 42.5652, 47.8719),
];

function city(
  id: string,
  name: string,
  slug: string,
  latitude: number,
  longitude: number,
): CityDto {
  return {
    id,
    name,
    slug,
    latitude,
    longitude,
    timezone: 'Europe/Moscow',
    isActive: true,
    sortOrder: 0,
  };
}

export const MAKHACHKALA = CITIES[0]!;
export const KASPIYSK = CITIES[1]!;

// ─────────────────────────────────────────────────────────────────────────────
//  Каталог объявлений из сидов
// ─────────────────────────────────────────────────────────────────────────────

let catalogue: ListingCatalogue | null = null;

export function seedCatalogue(): ListingCatalogue {
  if (catalogue) return catalogue;
  const records: CategoryRecord[] = [];
  const attributes = new Map<string, readonly ListingAttribute[]>();
  for (const { category, parentSlug } of flattenSeedCategories()) {
    records.push({
      id: category.slug,
      parentId: parentSlug,
      slug: category.slug,
      name: category.name,
      itemLabel: category.itemLabel ?? null,
      imageMediaId: null,
      iconKey: category.iconKey ?? null,
      allowedTransactions: [...(category.transactions ?? [])],
      defaultTransaction: category.defaultTransaction ?? null,
      defaultRentPeriod: category.defaultRentPeriod ?? null,
      allowedPriceUnits: [...(category.priceUnits ?? ['total'])],
      defaultPriceUnit: category.defaultPriceUnit ?? 'total',
      cardLayout: category.cardLayout ?? 'grid',
      shortcut: category.shortcut ?? null,
      deprecatedToId: category.deprecatedTo ?? null,
      isLeaf: (category.children?.length ?? 0) === 0,
      sortOrder: 0,
      isActive: !category.deprecatedTo,
    });
    attributes.set(category.slug, resolveAttributes(bindingsOf(category)));
  }
  const dictionaries = new Map<string, DictionaryRecord[]>();
  for (const seed of DICTIONARY_SEEDS) {
    dictionaries.set(
      seed.kind,
      seed.entries.map((entry) => ({
        value: entry.value,
        label: entry.label,
        parentValue: entry.parent ?? '',
        aliases: entry.aliases ?? [],
      })),
    );
  }
  catalogue = new ListingCatalogue(records, attributes, dictionaries);
  return catalogue;
}

export function requestContext(
  overrides: Partial<DomainRequestContext> = {},
): DomainRequestContext {
  return { text: '', now: NOW, cities: CITIES, limit: 10, cityId: MAKHACHKALA.id, ...overrides };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Намерения
// ─────────────────────────────────────────────────────────────────────────────

/** Намерение с умолчаниями — как его вернула бы модель. */
export function intent(
  partial: Partial<SmartSearchIntentCore> & { subqueries?: SmartSearchIntentCore[] } = {},
): SmartSearchIntent {
  const { subqueries = [], ...rest } = partial;
  return { schemaVersion: SMART_SEARCH_SCHEMA_VERSION, ...core(rest), subqueries };
}

export function core(partial: Partial<SmartSearchIntentCore> = {}): SmartSearchIntentCore {
  return {
    intent: 'search',
    domain: null,
    query: null,
    filters: {},
    preferences: {},
    location: null,
    time: null,
    sort: null,
    clarification: { needed: false, question: null, options: [] },
    confidence: 0.9,
    unresolved: [],
    ...partial,
  };
}

export function place(cityName: string, preferred = false) {
  return { city: cityName, nearMe: false, preferred };
}

export function when(
  date: string | null,
  extra: Partial<NonNullable<SmartSearchIntentCore['time']>> = {},
) {
  return {
    date: date,
    from: null,
    to: null,
    period: null,
    ...extra,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Модель
// ─────────────────────────────────────────────────────────────────────────────

type Script =
  SmartSearchIntent | string | Error | ((request: AiCompletionRequest) => Promise<string>);

/**
 * «Модель» с заранее заданными ответами: на каждую фразу — свой JSON,
 * сырая строка (проверка разбора) или ошибка (недоступность, таймаут).
 */
export class ScriptedAiProvider implements AiProvider {
  readonly name = 'scripted';
  readonly model = 'test-model';
  readonly requests: AiCompletionRequest[] = [];
  private readonly scripts = new Map<string, Script>();

  on(text: string, script: Script): this {
    this.scripts.set(text, script);
    return this;
  }

  async complete(request: AiCompletionRequest) {
    this.requests.push(request);
    const last = request.messages[request.messages.length - 1]?.content ?? '';
    const text = /<<<\n([\s\S]*?)\n>>>/.exec(last)?.[1] ?? '';
    const script = this.scripts.get(text);
    if (script === undefined)
      throw new AiProviderError('AI_BAD_RESPONSE', `Нет сценария для «${text}»`);
    if (script instanceof Error) throw script;
    if (typeof script === 'function') return { text: await script(request), latencyMs: 1 };
    return { text: typeof script === 'string' ? script : JSON.stringify(script), latencyMs: 1 };
  }

  health() {
    return Promise.resolve({
      status: 'ok' as const,
      model: this.model,
      latencyMs: 1,
      message: null,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Существующие сервисы разделов — подделки с записью вызовов
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEDULE: CinemaScheduleDto = [
  movie(
    1,
    'Дюна: Часть вторая',
    ['фантастика'],
    ['2026-10-03T13:00:00+03:00', '2026-10-03T19:30:00+03:00'],
  ),
  movie(2, 'Форсаж 10', ['боевик'], ['2026-10-03T18:00:00+03:00', '2026-10-03T21:00:00+03:00']),
  movie(3, 'Форсаж: Хоббс и Шоу', ['боевик'], ['2026-10-03T20:15:00+03:00']),
  movie(
    4,
    'Головоломка 2',
    ['мультфильм'],
    ['2026-10-03T10:00:00+03:00', '2026-10-03T16:00:00+03:00'],
  ),
];

function movie(id: number, title: string, genres: string[], times: string[]) {
  return {
    movie: { id, title, posterUrl: null, ageRating: '12+', genres, durationMinutes: 120 },
    showtimes: times.map((startTime, index) => ({
      id: `${id}-${index}`,
      cinemaId: 'c1',
      cinemaName: index % 2 === 0 ? 'Синема Холл' : 'Москва',
      startTime,
      hallLabel: 'Зал 1',
      hallFeature: null,
      format: index % 2 === 0 ? '2D' : '3D',
      priceMin: 300,
      priceMax: 500,
      buyUrl: 'https://example.test/ticket',
    })),
  };
}

export const NEWS: NewsSummaryDto[] = [
  news('n1', 'В Махачкале открыли новый парк', '2026-10-03T10:00:00+03:00', 'city', MAKHACHKALA.id),
  news(
    'n2',
    'Ремонт дорог в Каспийске завершат к зиме',
    '2026-10-03T08:00:00+03:00',
    'city',
    KASPIYSK.id,
  ),
  news(
    'n3',
    'В Дагестане стартовал сезон сбора винограда',
    '2026-10-03T07:00:00+03:00',
    'dagestan',
    null,
  ),
  news(
    'n4',
    'Футбольный клуб «Динамо» Махачкала выиграл матч',
    '2026-10-02T21:00:00+03:00',
    'dagestan',
    null,
  ),
  news('n5', 'Дороги Дагестана: итоги ремонта', '2026-10-01T12:00:00+03:00', 'dagestan', null),
];

function news(
  id: string,
  title: string,
  publishedAt: string,
  scope: NewsSummaryDto['scope'],
  cityId: string | null,
): NewsSummaryDto {
  return {
    id,
    title,
    lead: null,
    imageUrl: null,
    publishedAt,
    scope,
    cityId,
    sourceName: 'РИА Дагестан',
    sourceCategory: null,
    url: 'https://example.test',
  };
}

export const PLACE_CATEGORIES: PlaceCategoryDto[] = [
  { id: 'pc1', slug: 'pizza', name: 'Пицца', image: null },
  { id: 'pc2', slug: 'shashlik', name: 'Шашлык', image: null },
];

export interface Calls {
  listings: ListingListQuery[];
  cinema: { cityId: string; date?: string }[];
  news: { cityId: string; scope: string }[];
  places: PlaceListQuery[];
}

export function fakeServices(options: { listingsTotal?: number; placesFound?: number } = {}) {
  const calls: Calls = { listings: [], cinema: [], news: [], places: [] };
  const listingsTotal = options.listingsTotal ?? 3;
  const placesFound = options.placesFound ?? 2;

  const listings = {
    list: (query: ListingListQuery): Promise<PaginatedResponse<ListingDto>> => {
      calls.listings.push(query);
      const items = Array.from(
        { length: Math.min(listingsTotal, query.limit) },
        (_, index) => ({ id: `l${index}`, title: 'Объявление' }) as unknown as ListingDto,
      );
      return Promise.resolve({ items, nextCursor: null, hasMore: false, total: listingsTotal });
    },
  };
  const categories = { catalogue: () => Promise.resolve(seedCatalogue()) };
  const cinema = {
    getSchedule: (cityId: string, date?: string) => {
      calls.cinema.push({ cityId, ...(date ? { date } : {}) });
      return Promise.resolve(SCHEDULE);
    },
  };
  const newsService = {
    getFeed: (cityId: string, scope: string) => {
      calls.news.push({ cityId, scope });
      const items = NEWS.filter(
        (item) => item.scope === scope && (scope !== 'city' || item.cityId === cityId),
      );
      return Promise.resolve({ items, nextCursor: null, hasMore: false });
    },
  };
  const places = {
    list: (query: PlaceListQuery): Promise<PaginatedResponse<PlaceDto>> => {
      calls.places.push(query);
      const items = Array.from(
        { length: placesFound },
        (_, index) => ({ id: `p${index}`, name: 'Заведение' }) as unknown as PlaceDto,
      );
      return Promise.resolve({ items, nextCursor: null, hasMore: false });
    },
    cuisines: () => Promise.resolve(['Дагестанская', 'Европейская', 'Японская']),
  };
  const placeCategories = { list: () => Promise.resolve(PLACE_CATEGORIES) };

  const adapters = [
    new ListingsSearchAdapter(categories as never, listings as never),
    new CinemaSearchAdapter(cinema as never),
    new NewsSearchAdapter(newsService as never),
    new DeliverySearchAdapter(places as never, placeCategories as never),
  ];
  return { calls, registry: new DomainRegistry(adapters), adapters };
}

export interface Harness {
  service: SmartSearchService;
  ai: ScriptedAiProvider;
  calls: Calls;
  store: MemoryContextStore;
  clock: { now: number };
}

export function harness(
  options: {
    enabled?: boolean;
    ai?: AiProvider;
    listingsTotal?: number;
    placesFound?: number;
    /** След ответов для «Я имел в виду другое» */
    traces?: TraceStore;
  } = {},
): Harness {
  const ai = new ScriptedAiProvider();
  const { calls, registry } = fakeServices(options);
  const clock = { now: NOW.getTime() };
  const store = new MemoryContextStore(() => clock.now);
  const cities = { listActive: () => Promise.resolve(CITIES) };
  const service = new SmartSearchService(
    {
      SMART_SEARCH_ENABLED: options.enabled ?? true,
      SMART_SEARCH_CONTEXT_TTL_SECONDS: 1200,
      AI_DEBUG_LOG: false,
    },
    options.ai ?? ai,
    registry,
    store,
    cities as never,
    () => new Date(clock.now),
    options.traces,
  );
  return { service, ai, calls, store, clock };
}

/** Характеристики, ушедшие в запрос ленты: `attributes` — строка JSON. */
export function attributesOf(query: ListingListQuery | undefined): Record<string, unknown> {
  return query?.attributes ? (JSON.parse(query.attributes) as Record<string, unknown>) : {};
}
