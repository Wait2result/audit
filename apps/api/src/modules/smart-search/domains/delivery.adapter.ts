import { Injectable } from '@nestjs/common';
import {
  PLACE_TYPE_LABELS,
  placeListQuerySchema,
  type PlaceCategoryDto,
  type PlaceListQuery,
  type PlaceType,
  type SmartSearchIntentCore,
  type SmartSearchNavigation,
  type SmartSearchNormalizedQuery,
} from '@dagestan/shared';

import { CategoriesService } from '../../places/categories.service.js';
import { PlacesService } from '../../places/places.service.js';
import { resolvePlace, cityOptions } from '../normalize/location.js';
import { matchCity, norm, sameStem } from '../normalize/text.js';
import type {
  DomainAdapter,
  DomainRequestContext,
  ExecuteOutcome,
  NormalizeOutcome,
} from './domain-adapter.js';
import { emptyQuery, namedCityId } from './domain-adapter.js';

/**
 * Доставка — это витрина заведений с доставкой (`GET /places`): поиск по
 * названию и блюдам меню, кухня, плитка категории, вид заведения, «открыто
 * сейчас», «привезут за N минут» и порядок. Оформить заказ, оплатить или
 * отследить курьера поиск не умеет — такие фразы получают ответ
 * «не поддерживается», а не выдуманный результат.
 */
export const DELIVERY_FILTER_KEYS = [
  'dish',
  'place',
  'cuisine',
  'category',
  'placeType',
  'openNow',
  'maxMinutes',
] as const;

export interface DeliveryPlan {
  query: PlaceListQuery;
}

export interface DeliveryCatalogue {
  categories: readonly PlaceCategoryDto[];
  cuisines: readonly string[];
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Код вида заведения → его подпись: модель может вернуть «restaurant» вместо «ресторан». */
function typeLabels(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).map(
    (item) => PLACE_TYPE_LABELS[String(item) as PlaceType] ?? String(item),
  );
}

/** Слова, которые описывают желание поесть, а не блюдо или заведение. */
const GENERIC_FOOD_WORDS = new Set([
  'где',
  'хочу',
  'поесть',
  'покушать',
  'кушать',
  'есть',
  'еда',
  'еду',
  'еды',
  'перекусить',
  'пообедать',
  'поужинать',
  'позавтракать',
  'заказать',
  'закажи',
  'доставка',
  'доставку',
  'доставкой',
  'с',
  'в',
  'на',
  'можно',
  'вкусно',
  'рядом',
]);

/** Значение (или каждое из значений) встречается во фразе с точностью до падежа. */
function namedInText(value: unknown, text: string): boolean {
  const items = (Array.isArray(value) ? value : [value]).map(String);
  const phrase = norm(text).split(' ');
  return items.every((item) =>
    norm(item)
      .split(' ')
      .every((part) =>
        phrase.some((word) => sameStem(word, part) || word.startsWith(part.slice(0, 5))),
      ),
  );
}

/**
 * Намерение → запрос витрины заведений. Режим «доставка» добавляет условие
 * «с доставкой»; режим «заведения» — тот же поиск без него («где поесть»).
 */
export function normalizeDelivery(
  intent: SmartSearchIntentCore,
  context: DomainRequestContext,
  catalogue: DeliveryCatalogue,
  mode: 'delivery' | 'places' = 'delivery',
): NormalizeOutcome<DeliveryPlan> {
  const query = emptyQuery(mode, intent);

  const place = resolvePlace(intent, context, { allowRegion: false });
  if (place.kind === 'clarify')
    return { kind: 'clarify', query, clarification: place.clarification };
  if (place.kind !== 'city') {
    return {
      kind: 'clarify',
      query,
      clarification: {
        reason: 'city_required',
        question: mode === 'delivery' ? 'В какой город доставить?' : 'В каком городе искать?',
        options: cityOptions(context.cities),
      },
    };
  }
  query.location = { cityId: place.city.id, cityName: place.city.name, mode: place.mode };

  const raw: Record<string, unknown> = { cityId: place.city.id, limit: context.limit };
  if (mode === 'delivery') {
    raw.hasDelivery = true;
    query.conditions.push({
      field: 'hasDelivery',
      label: 'Доставка',
      value: true,
      display: 'с доставкой',
    });
  }

  // Город в поле «заведение» («пицца в Каспийске» → place «Каспийск») — это место, а не что искать
  // Город в поле «блюдо» — это место; общие слова («где поесть», «хочу покушать») —
  // не то, что искать: иначе пустая выдача по названию «где поесть»
  const notCity = (value: string | null) => {
    if (!value || matchCity(value, context.cities).kind !== 'unknown') return null;
    const rest = value
      .split(/\s+/)
      .filter((word) => !GENERIC_FOOD_WORDS.has(norm(word)))
      .join(' ')
      .trim();
    return rest || null;
  };
  const search =
    notCity(asText(intent.filters.dish)) ??
    notCity(asText(intent.query)) ??
    notCity(asText(intent.filters.place));
  if (search) {
    raw.search = search.slice(0, 120);
    query.text = raw.search as string;
    query.conditions.push({
      field: 'search',
      label: 'Что ищем',
      value: raw.search,
      display: raw.search as string,
    });
  }

  const cuisineRaw = asText(intent.filters.cuisine);
  if (cuisineRaw) {
    const cuisine = catalogue.cuisines.find(
      (item) => norm(item) === norm(cuisineRaw) || sameStem(item, cuisineRaw),
    );
    if (cuisine) {
      raw.cuisine = cuisine;
      query.conditions.push({ field: 'cuisine', label: 'Кухня', value: cuisine, display: cuisine });
    } else {
      query.ignored.push({ field: 'cuisine', reason: `Кухни «${cuisineRaw}» в городе нет` });
    }
  }

  const categoryRaw = asText(intent.filters.category);
  if (categoryRaw) {
    const category = catalogue.categories.find(
      (item) =>
        item.slug === categoryRaw ||
        norm(item.name) === norm(categoryRaw) ||
        sameStem(item.name, categoryRaw),
    );
    if (category) {
      raw.category = category.slug;
      query.conditions.push({
        field: 'category',
        label: 'Категория',
        value: category.slug,
        display: category.name,
      });
    } else if (!raw.search && notCity(categoryRaw)) {
      // Модель кладёт блюдо в плитку витрины («пицца»), а плиток в городе нет —
      // это то, что ищут: поиск по названию и меню, а не «всё подряд»
      raw.search = categoryRaw.slice(0, 120);
      query.text = raw.search as string;
      query.conditions.push({
        field: 'search',
        label: 'Что ищем',
        value: raw.search,
        display: raw.search as string,
      });
    } else {
      query.ignored.push({ field: 'category', reason: `Категории «${categoryRaw}» нет` });
    }
  }

  // Вид заведения — только если он назван: к «пицце в Каспийске» модель дописывала «ресторан»
  const typeRaw = intent.filters.placeType;
  if (typeRaw !== undefined && !namedInText(typeLabels(typeRaw), context.text)) {
    query.ignored.push({
      field: 'placeType',
      reason: 'Вид заведения не назван во фразе — не применён',
    });
  } else if (typeRaw !== undefined) {
    const items = (Array.isArray(typeRaw) ? typeRaw : [typeRaw]).map(String);
    const types = items
      .map(
        (item) =>
          (Object.entries(PLACE_TYPE_LABELS) as [PlaceType, string][]).find(
            ([code, label]) => code === item || norm(label) === norm(item) || sameStem(label, item),
          )?.[0],
      )
      .filter((item): item is PlaceType => Boolean(item));
    if (types.length > 0) {
      raw.types = types.join(',');
      query.conditions.push({
        field: 'placeType',
        label: 'Вид заведения',
        value: types,
        display: types.map((type) => PLACE_TYPE_LABELS[type]).join(', '),
      });
    } else {
      query.ignored.push({ field: 'placeType', reason: 'Нет такого вида заведения' });
    }
  }

  if (intent.filters.openNow === true) {
    raw.openNow = true;
    query.conditions.push({
      field: 'openNow',
      label: 'Сейчас',
      value: true,
      display: 'открыто сейчас',
    });
  }

  const minutes = intent.filters.maxMinutes;
  if (minutes !== undefined) {
    const value =
      typeof minutes === 'number'
        ? minutes
        : typeof minutes === 'object' && !Array.isArray(minutes)
          ? Number(minutes.max)
          : NaN;
    if (Number.isInteger(value) && value >= 5 && value <= 600) {
      raw.maxMinutes = value;
      query.conditions.push({
        field: 'maxMinutes',
        label: 'Время доставки',
        value,
        display: `до ${value} мин`,
      });
    } else {
      query.ignored.push({ field: 'maxMinutes', reason: 'Непонятное время доставки' });
    }
  }

  for (const key of Object.keys(intent.preferences)) {
    query.ignored.push({ field: key, reason: 'Пожелание не сужает список заведений' });
  }

  const sortMap: Partial<
    Record<NonNullable<SmartSearchIntentCore['sort']>, PlaceListQuery['sort']>
  > = {
    relevance: 'default',
    rating: 'rating',
    fastest: 'fast',
    price_asc: 'cheap',
  };
  if (intent.sort) {
    const sort = sortMap[intent.sort];
    if (sort) raw.sort = sort;
    else query.ignored.push({ field: 'sort', reason: 'Такого порядка у заведений нет' });
  }

  const parsed = placeListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Собранный запрос заведений не прошёл проверку: ${parsed.error.issues[0]?.message}`,
    );
  }
  query.params = raw;
  return { kind: 'ready', plan: { query: parsed.data }, query };
}

@Injectable()
export class DeliverySearchAdapter implements DomainAdapter<DeliveryPlan> {
  readonly domain = 'delivery' as const;
  readonly label = 'Доставка еды';

  constructor(
    private readonly places: PlacesService,
    private readonly categories: CategoriesService,
  ) {}

  promptSection(): Promise<string> {
    return Promise.resolve(
      [
        'delivery — доставка еды: заведения города, которые привезут блюдо. Только поиск, без оформления заказа.',
        `  Фильтры: ${DELIVERY_FILTER_KEYS.join(', ')}. dish — блюдо или товар; place — название заведения; cuisine — кухня;`,
        '  category — плитка витрины (шашлык, пицца …); placeType — ресторан, кафе, фастфуд, пекарня, магазин, супермаркет;',
        '  openNow — true; maxMinutes — «привезут за N минут». «Хочу пиццу», «закажи суши», «доставка шашлыка» — search в delivery',
        '  (блюдо — в dish). «Оплати», «где курьер», «оформи заказ» — intent "action".',
      ].join('\n'),
    );
  }

  allowedFilterKeys(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(DELIVERY_FILTER_KEYS));
  }

  async normalize(
    intent: SmartSearchIntentCore,
    context: DomainRequestContext,
  ): Promise<NormalizeOutcome<DeliveryPlan>> {
    // Кухни — того города, где будут искать, а не выбранного в приложении
    const place = resolvePlace(intent, context, { allowRegion: false });
    const city = place.kind === 'city' ? place.city.id : undefined;
    const [categories, cuisines] = await Promise.all([
      this.categories.list(),
      city ? this.places.cuisines(city) : Promise.resolve([]),
    ]);
    return normalizeDelivery(intent, context, { categories, cuisines });
  }

  async execute(plan: DeliveryPlan, context: DomainRequestContext): Promise<ExecuteOutcome> {
    const page = await this.places.list(plan.query, context.userId);
    return { kind: 'results', results: { domain: 'delivery', page }, count: page.items.length };
  }

  navigation(query: SmartSearchNormalizedQuery): SmartSearchNavigation {
    return placesNavigation('delivery', query);
  }
}

/** Путь и условия экрана заведений: тот же экран для доставки и для «поесть на месте». */
export function placesNavigation(
  section: 'delivery' | 'places',
  query: SmartSearchNormalizedQuery,
): SmartSearchNavigation {
  const params = query.params;
  const filters: SmartSearchNavigation['filters'] = {};
  const cityId = namedCityId(query);
  if (cityId) filters.cityId = cityId;
  for (const key of ['search', 'category', 'openNow', 'maxMinutes', 'hasDelivery'] as const) {
    const value = params[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      filters[key] = value;
  }
  return {
    section,
    path: [query.location?.cityName ?? (section === 'delivery' ? 'Доставка' : 'Заведения')],
    filters,
  };
}

/**
 * Заведения — «где поесть», «ресторан», «кафе»: та же витрина `GET /places`
 * и тот же разбор, но без условия «с доставкой».
 */
@Injectable()
export class PlacesSearchAdapter implements DomainAdapter<DeliveryPlan> {
  readonly domain = 'places' as const;
  readonly label = 'Рестораны и кафе';

  constructor(
    private readonly places: PlacesService,
    private readonly categories: CategoriesService,
  ) {}

  promptSection(): Promise<string> {
    return Promise.resolve(
      [
        'places — рестораны, кафе, столовые города: где поесть, поужинать, пообедать, конкретное блюдо в заведении.',
        `  Фильтры: ${DELIVERY_FILTER_KEYS.join(', ')} — те же, что у delivery. Доставку не подразумевать:`,
        '  «где поесть хинкал» → places, dish «хинкал»; «закажи / привезите / доставка» → это delivery.',
      ].join('\n'),
    );
  }

  allowedFilterKeys(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(DELIVERY_FILTER_KEYS));
  }

  async normalize(
    intent: SmartSearchIntentCore,
    context: DomainRequestContext,
  ): Promise<NormalizeOutcome<DeliveryPlan>> {
    const place = resolvePlace(intent, context, { allowRegion: false });
    const city = place.kind === 'city' ? place.city.id : undefined;
    const [categories, cuisines] = await Promise.all([
      this.categories.list(),
      city ? this.places.cuisines(city) : Promise.resolve([]),
    ]);
    return normalizeDelivery(intent, context, { categories, cuisines }, 'places');
  }

  async execute(plan: DeliveryPlan, context: DomainRequestContext): Promise<ExecuteOutcome> {
    const page = await this.places.list(plan.query, context.userId);
    return { kind: 'results', results: { domain: 'places', page }, count: page.items.length };
  }

  navigation(query: SmartSearchNormalizedQuery): SmartSearchNavigation {
    return placesNavigation('places', query);
  }
}
