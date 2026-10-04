import { Injectable } from '@nestjs/common';
import type {
  SmartSearchIntentCore,
  SmartSearchNavigation,
  SmartSearchNormalizedQuery,
} from '@dagestan/shared';

import { ListingCategoriesService } from '../../listings/listing-categories.service.js';
import { ListingsService } from '../../listings/listings.service.js';
import type {
  DomainAdapter,
  DomainRequestContext,
  ExecuteOutcome,
  NormalizeOutcome,
} from './domain-adapter.js';
import {
  LISTING_BASE_KEYS,
  listingFilterKeys,
  normalizeListings,
  searchableCategories,
  type ListingPlan,
} from './listings.normalizer.js';

/**
 * Объявления в умном поиске: каталог — `ListingCategoriesService`, поиск —
 * `ListingsService.list`, тот же, что у ленты объявлений в приложении.
 */
@Injectable()
export class ListingsSearchAdapter implements DomainAdapter<ListingPlan> {
  readonly domain = 'listings' as const;
  readonly label = 'Объявления';

  constructor(
    private readonly categories: ListingCategoriesService,
    private readonly listings: ListingsService,
  ) {}

  async promptSection(): Promise<string> {
    const catalogue = await this.categories.catalogue();
    const leaves = searchableCategories(catalogue).filter((category) => category.isLeaf);
    const fields = new Map<string, string>();
    for (const category of leaves) {
      for (const attribute of catalogue.attributesOf(category.id)) {
        if (attribute.filterable && !fields.has(attribute.key))
          fields.set(attribute.key, attribute.label);
      }
    }
    return [
      'listings — доска объявлений: транспорт, недвижимость, электроника, вещи, услуги, работа, животные.',
      `  Общие фильтры: ${LISTING_BASE_KEYS.join(', ')}.`,
      '  category — код подкатегории из списка ниже; brand и model — как написал человек (сервер сверит со справочником);',
      '  price — {"min": число, "max": число} в рублях; transactionType — "sale" (купить) или "rent" (снять/арендовать);',
      '  rentPeriod — "daily" или "monthly"; модели «X или новее» — model: {"min": "X"}; память «от 256» — memory: {"min": 256}.',
      `  Подкатегории (код — название): ${leaves.map((category) => `${category.slug} — ${category.name}`).join('; ')}.`,
      `  Характеристики (ключ — название): ${[...fields].map(([key, label]) => `${key} — ${label}`).join('; ')}.`,
      '  Значения характеристик — словами человека («автомат», «бензин», «2» комнаты): сервер найдёт вариант сам.',
    ].join('\n');
  }

  async allowedFilterKeys(): Promise<ReadonlySet<string>> {
    return listingFilterKeys(await this.categories.catalogue());
  }

  async normalize(
    intent: SmartSearchIntentCore,
    context: DomainRequestContext,
  ): Promise<NormalizeOutcome<ListingPlan>> {
    return normalizeListings(intent, await this.categories.catalogue(), context);
  }

  async execute(plan: ListingPlan, context: DomainRequestContext): Promise<ExecuteOutcome> {
    const page = await this.listings.list(plan.query, context.userId);
    return {
      kind: 'results',
      results: { domain: 'listings', page },
      count: page.items.length,
      ...(page.total !== undefined ? { total: page.total } : {}),
    };
  }

  /**
   * Путь раздела по каталогу: «Транспорт → Автомобили». Условия экрана у
   * объявлений — `query.params` (их принимает лента), здесь не дублируются.
   */
  async navigation(query: SmartSearchNormalizedQuery): Promise<SmartSearchNavigation> {
    const slug = typeof query.params.category === 'string' ? query.params.category : null;
    const catalogue = await this.categories.catalogue();
    const path: string[] = [];
    let current = slug ? catalogue.findBySlug(slug) : null;
    for (let depth = 0; current && depth < 5; depth += 1) {
      path.unshift(current.name);
      current = current.parentId ? catalogue.findById(current.parentId) : null;
    }
    return { section: 'listings', path: path.length > 0 ? path : ['Все объявления'], filters: {} };
  }
}
