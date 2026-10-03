import type {
  CityDto,
  SmartSearchClarification,
  SmartSearchDomain,
  SmartSearchIntentCore,
  SmartSearchNormalizedQuery,
  SmartSearchResults,
} from '@dagestan/shared';

/**
 * Адаптер раздела — единственное место, где умный поиск знает о разделе.
 *
 * Каждый адаптер:
 *   • описывает модели свои поля (`promptSection`) и белый список фильтров;
 *   • переводит проверенное намерение в запрос СУЩЕСТВУЮЩЕГО сервиса раздела,
 *     сверяя каждое значение со справочниками (`normalize`);
 *   • вызывает этот сервис (`execute`) — свой поиск адаптер не пишет.
 *
 * Новый раздел (погода, магазины) — новый класс в реестре; маршрутизатор и
 * разбор фраз не меняются.
 */

/** То, что известно о запросе помимо намерения: без персональных данных. */
export interface DomainRequestContext {
  /** Фраза человека — для сверки чисел и слов, но не для отправки куда-либо */
  text: string;
  cityId?: string;
  latitude?: number;
  longitude?: number;
  listingCategory?: string;
  userId?: string;
  limit: number;
  now: Date;
  /** Активные города приложения */
  cities: readonly CityDto[];
}

export type NormalizeOutcome<TPlan> =
  | { kind: 'ready'; plan: TPlan; query: SmartSearchNormalizedQuery }
  | {
      kind: 'clarify';
      clarification: SmartSearchClarification;
      query: SmartSearchNormalizedQuery | null;
    }
  | { kind: 'unsupported'; message: string; query: SmartSearchNormalizedQuery | null };

export type ExecuteOutcome =
  | { kind: 'results'; results: SmartSearchResults; count: number; total?: number }
  | { kind: 'clarify'; clarification: SmartSearchClarification };

export interface DomainAdapter<TPlan = unknown> {
  readonly domain: SmartSearchDomain;
  /** Подпись раздела для уточнения «Где искать?» */
  readonly label: string;
  /** Описание полей раздела для подсказки модели */
  promptSection(): Promise<string>;
  /** Белый список имён фильтров: всё остальное — недоверенный ответ модели */
  allowedFilterKeys(): Promise<ReadonlySet<string>>;
  normalize(
    intent: SmartSearchIntentCore,
    context: DomainRequestContext,
  ): Promise<NormalizeOutcome<TPlan>>;
  execute(plan: TPlan, context: DomainRequestContext): Promise<ExecuteOutcome>;
}

export const DOMAIN_ADAPTERS_REGISTRY = Symbol('SMART_SEARCH_DOMAIN_REGISTRY');

/**
 * Реестр разделов. Только он решает, какие адаптеры вообще существуют:
 * модель не может назвать раздел, которого здесь нет, — схема намерения его
 * не пропустит, а реестр не найдёт.
 */
export class DomainRegistry {
  private readonly byDomain = new Map<SmartSearchDomain, DomainAdapter>();

  constructor(adapters: readonly DomainAdapter[]) {
    for (const adapter of adapters) {
      if (this.byDomain.has(adapter.domain)) {
        throw new Error(`Адаптер раздела ${adapter.domain} зарегистрирован дважды`);
      }
      this.byDomain.set(adapter.domain, adapter);
    }
  }

  get(domain: SmartSearchDomain): DomainAdapter | null {
    return this.byDomain.get(domain) ?? null;
  }

  all(): DomainAdapter[] {
    return [...this.byDomain.values()];
  }
}

/** Пустой нормализованный запрос раздела — заготовка для адаптеров. */
export function emptyQuery(
  domain: SmartSearchDomain,
  intent: SmartSearchIntentCore,
): SmartSearchNormalizedQuery {
  return {
    domain,
    intent: intent.intent,
    text: null,
    conditions: [],
    preferences: [],
    ignored: [],
    unresolved: [...intent.unresolved],
    location: null,
    time: null,
    sort: intent.sort,
    params: {},
  };
}

/** Найти фильтр сначала среди условий, затем среди пожеланий. */
export function filterOf(
  intent: SmartSearchIntentCore,
  key: string,
): { value: SmartSearchIntentCore['filters'][string]; preferred: boolean } | null {
  if (key in intent.filters) return { value: intent.filters[key]!, preferred: false };
  if (key in intent.preferences) return { value: intent.preferences[key]!, preferred: true };
  return null;
}
