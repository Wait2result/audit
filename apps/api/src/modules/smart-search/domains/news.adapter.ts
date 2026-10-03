import { Injectable } from '@nestjs/common';
import type { NewsScope, NewsSummaryDto, SmartSearchIntentCore } from '@dagestan/shared';

import { NewsService } from '../../news/news.service.js';
import { resolvePlace, cityOptions } from '../normalize/location.js';
import { containsAllStems, norm } from '../normalize/text.js';
import { resolveDay } from '../normalize/time.js';
import type {
  DomainAdapter,
  DomainRequestContext,
  ExecuteOutcome,
  NormalizeOutcome,
} from './domain-adapter.js';
import { emptyQuery } from './domain-adapter.js';

export const NEWS_FILTER_KEYS = ['topic', 'scope'] as const;

const SCOPES: readonly NewsScope[] = ['city', 'dagestan', 'russia', 'world'];

const SCOPE_WORDS: Readonly<Record<string, NewsScope>> = {
  город: 'city',
  city: 'city',
  дагестан: 'dagestan',
  dagestan: 'dagestan',
  россия: 'russia',
  russia: 'russia',
  мир: 'world',
  world: 'world',
};

const SCOPE_LABELS: Record<NewsScope, string> = {
  city: 'Город',
  dagestan: 'Дагестан',
  russia: 'Россия',
  world: 'Мир',
};

/**
 * Сколько страниц ленты просматривать при отборе по теме и дате. У ленты
 * новостей нет поиска по словам — отбор идёт по свежим страницам, а не по
 * всему архиву (ограничение зафиксировано в ADR-0011).
 */
const MAX_PAGES = 3;
const PAGE_SIZE = 50;

export interface NewsPlan {
  cityId: string;
  scope: NewsScope;
  date: string | null;
  topic: string | null;
}

/** Намерение «новости» → вкладка ленты, город, день и тема. */
export function normalizeNews(
  intent: SmartSearchIntentCore,
  context: DomainRequestContext,
): NormalizeOutcome<NewsPlan> {
  const query = emptyQuery('news', intent);

  const place = resolvePlace(intent, context, { allowRegion: true });
  if (place.kind === 'clarify')
    return { kind: 'clarify', query, clarification: place.clarification };

  const scopeRaw = typeof intent.filters.scope === 'string' ? norm(intent.filters.scope) : null;
  let scope: NewsScope | null = scopeRaw ? (SCOPE_WORDS[scopeRaw] ?? null) : null;
  if (scopeRaw && !scope)
    query.ignored.push({ field: 'scope', reason: 'Нет такой ленты новостей' });

  // Город из фразы — лента города; «Дагестан» — общая лента
  const named = intent.location?.city ? place : null;
  if (!scope) scope = named?.kind === 'city' ? 'city' : 'dagestan';

  const city =
    place.kind === 'city'
      ? place.city
      : (context.cities.find((item) => item.id === context.cityId) ?? context.cities[0]);
  if (!city) {
    return {
      kind: 'clarify',
      query,
      clarification: {
        reason: 'city_required',
        question: 'Новости какого города?',
        options: cityOptions(context.cities),
      },
    };
  }
  if (!SCOPES.includes(scope)) scope = 'dagestan';

  const date = resolveDay(intent.time?.date ?? null, city.timezone, context.now);
  const topicRaw = intent.filters.topic ?? intent.query;
  const topic =
    typeof topicRaw === 'string' && topicRaw.trim() ? topicRaw.trim().slice(0, 80) : null;

  query.location =
    scope === 'city'
      ? {
          cityId: city.id,
          cityName: city.name,
          mode: place.kind === 'city' ? place.mode : 'context',
        }
      : null;
  query.conditions.push({
    field: 'scope',
    label: 'Лента',
    value: scope,
    display: scope === 'city' ? city.name : SCOPE_LABELS[scope],
  });
  if (date) {
    query.time = { date, from: null, to: null };
    query.conditions.push({ field: 'date', label: 'Дата', value: date, display: date });
  }
  if (topic) {
    query.text = topic;
    query.conditions.push({ field: 'topic', label: 'Тема', value: topic, display: topic });
  }
  query.params = { cityId: city.id, scope };
  return { kind: 'ready', plan: { cityId: city.id, scope, date, topic }, query };
}

/** Отбор из реальной ленты: дата публикации (в поясе города) и тема в заголовке или лиде. */
export function matchesNews(item: NewsSummaryDto, plan: Pick<NewsPlan, 'date' | 'topic'>): boolean {
  if (plan.date && !item.publishedAt.startsWith(plan.date)) return false;
  if (plan.topic && !containsAllStems(`${item.title} ${item.lead ?? ''}`, plan.topic)) return false;
  return true;
}

/** Новости: лента — `NewsService.getFeed`, та же, что у экрана «Новости». */
@Injectable()
export class NewsSearchAdapter implements DomainAdapter<NewsPlan> {
  readonly domain = 'news' as const;
  readonly label = 'Новости';

  constructor(private readonly news: NewsService) {}

  promptSection(): Promise<string> {
    return Promise.resolve(
      [
        'news — лента новостей: города, всего Дагестана, России и мира. Новости не сочиняются — только поиск по ленте.',
        `  Фильтры: ${NEWS_FILTER_KEYS.join(', ')}. topic — тема словами человека; scope — "city", "dagestan", "russia" или "world".`,
        '  «За сегодня», «вчера» — time.date.',
      ].join('\n'),
    );
  }

  allowedFilterKeys(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(NEWS_FILTER_KEYS));
  }

  normalize(
    intent: SmartSearchIntentCore,
    context: DomainRequestContext,
  ): Promise<NormalizeOutcome<NewsPlan>> {
    return Promise.resolve(normalizeNews(intent, context));
  }

  async execute(plan: NewsPlan, context: DomainRequestContext): Promise<ExecuteOutcome> {
    const items: NewsSummaryDto[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES && items.length < context.limit; page += 1) {
      const feed = await this.news.getFeed(plan.cityId, plan.scope, {
        limit: PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      });
      items.push(...feed.items.filter((item) => matchesNews(item, plan)));
      // Лента идёт от новых к старым: страница целиком старше нужного дня — дальше смотреть незачем
      const oldest = feed.items[feed.items.length - 1];
      if (
        !feed.hasMore ||
        !feed.nextCursor ||
        (plan.date && oldest && oldest.publishedAt.slice(0, 10) < plan.date)
      ) {
        break;
      }
      cursor = feed.nextCursor;
      if (!plan.date && !plan.topic) break;
    }
    const limited = items.slice(0, context.limit);
    return { kind: 'results', results: { domain: 'news', items: limited }, count: limited.length };
  }
}
