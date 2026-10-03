import { Injectable } from '@nestjs/common';
import {
  PLACE_TYPE_LABELS,
  placeListQuerySchema,
  type PlaceCategoryDto,
  type PlaceListQuery,
  type PlaceType,
  type SmartSearchIntentCore,
} from '@dagestan/shared';

import { CategoriesService } from '../../places/categories.service.js';
import { PlacesService } from '../../places/places.service.js';
import { resolvePlace, cityOptions } from '../normalize/location.js';
import { norm, sameStem } from '../normalize/text.js';
import type {
  DomainAdapter,
  DomainRequestContext,
  ExecuteOutcome,
  NormalizeOutcome,
} from './domain-adapter.js';
import { emptyQuery } from './domain-adapter.js';

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

/** Намерение «доставка» → запрос витрины заведений с доставкой. */
export function normalizeDelivery(
  intent: SmartSearchIntentCore,
  context: DomainRequestContext,
  catalogue: DeliveryCatalogue,
): NormalizeOutcome<DeliveryPlan> {
  const query = emptyQuery('delivery', intent);

  const place = resolvePlace(intent, context, { allowRegion: false });
  if (place.kind === 'clarify')
    return { kind: 'clarify', query, clarification: place.clarification };
  if (place.kind !== 'city') {
    return {
      kind: 'clarify',
      query,
      clarification: {
        reason: 'city_required',
        question: 'В какой город доставить?',
        options: cityOptions(context.cities),
      },
    };
  }
  query.location = { cityId: place.city.id, cityName: place.city.name, mode: place.mode };

  const raw: Record<string, unknown> = {
    cityId: place.city.id,
    hasDelivery: true,
    limit: context.limit,
  };
  query.conditions.push({
    field: 'hasDelivery',
    label: 'Доставка',
    value: true,
    display: 'с доставкой',
  });

  const search =
    asText(intent.filters.dish) ?? asText(intent.filters.place) ?? asText(intent.query);
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
    } else {
      query.ignored.push({ field: 'category', reason: `Категории «${categoryRaw}» нет` });
    }
  }

  const typeRaw = intent.filters.placeType;
  if (typeRaw !== undefined) {
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
        'delivery — заведения города с доставкой: рестораны, кафе, магазины и их блюда. Только поиск, без оформления заказа.',
        `  Фильтры: ${DELIVERY_FILTER_KEYS.join(', ')}. dish — блюдо или товар; place — название заведения; cuisine — кухня;`,
        '  category — плитка витрины (шашлык, пицца …); placeType — ресторан, кафе, фастфуд, пекарня, магазин, супермаркет;',
        '  openNow — true; maxMinutes — «привезут за N минут». «Закажи», «оплати», «где курьер» — intent "action".',
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
}
