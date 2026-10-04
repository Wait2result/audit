import { randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  SMART_SEARCH_LIMITS,
  plural,
  type CityDto,
  type SmartSearchClarification,
  type SmartSearchDomain,
  type SmartSearchHealthDto,
  type SmartSearchIntentCore,
  type SmartSearchPart,
  type SmartSearchRequest,
  type SmartSearchResponse,
  type SmartSearchResults,
} from '@dagestan/shared';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { CitiesService } from '../cities/cities.service.js';
import { AI_PROVIDER, type AiProvider } from './ai/ai-provider.js';
import {
  CONTEXT_STORE,
  contextKey,
  newContext,
  type ContextStore,
  type SearchContextRecord,
} from './context/context-store.js';
import {
  DOMAIN_ADAPTERS_REGISTRY,
  type DomainRegistry,
  type DomainRequestContext,
} from './domains/domain-adapter.js';
import { priceClarification } from './domains/listings.normalizer.js';
import { buildMessages, buildSystemPrompt } from './intent/intent-prompt.js';
import { parseIntent, type IntentFailureCode } from './intent/intent-parser.js';
import { sanitizeUserText } from './normalize/text.js';
import { todayIn } from './normalize/time.js';
import {
  groundIntent,
  mergeWithContext,
  splitParts,
  unknownFilterKeys,
} from './planner/query-planner.js';

/** Часы поиска: в тестах подставляются, чтобы «сегодня» было предсказуемым. */
export const SMART_SEARCH_CLOCK = Symbol('SMART_SEARCH_CLOCK');

/** Настройки, которые нужны поиску (подмножество общей конфигурации). */
export type SmartSearchSettings = Pick<
  AppConfig,
  'SMART_SEARCH_ENABLED' | 'SMART_SEARCH_CONTEXT_TTL_SECONDS' | 'AI_DEBUG_LOG'
>;

/** Подсказка с описанием разделов собирается из каталога — не чаще раза в пять минут. */
const PROMPT_TTL_MS = 5 * 60_000;

const FAILURE_MESSAGES: Record<
  IntentFailureCode | 'SMART_SEARCH_DISABLED' | 'INVALID_INTENT' | 'SEARCH_FAILED',
  string
> = {
  SMART_SEARCH_DISABLED: 'Умный поиск выключен. Воспользуйтесь обычным поиском.',
  AI_DISABLED: 'Умный поиск сейчас недоступен. Воспользуйтесь обычным поиском.',
  AI_UNAVAILABLE: 'Умный поиск сейчас недоступен. Воспользуйтесь обычным поиском.',
  AI_TIMEOUT:
    'Умный поиск не успел ответить. Попробуйте ещё раз или воспользуйтесь обычным поиском.',
  AI_BAD_RESPONSE: 'Не удалось разобрать запрос. Попробуйте сформулировать иначе.',
  AI_RESPONSE_TOO_LARGE: 'Не удалось разобрать запрос. Попробуйте сформулировать иначе.',
  INVALID_AI_OUTPUT: 'Не удалось разобрать запрос. Попробуйте сформулировать иначе.',
  INVALID_INTENT: 'Не удалось разобрать запрос. Попробуйте сформулировать иначе.',
  SEARCH_FAILED: 'Поиск временно не удался. Попробуйте ещё раз.',
};

class InvalidIntentError extends Error {}

/**
 * Умный поиск: фраза → намерение (модель) → проверка схемой → раздел →
 * нормализация по справочникам раздела → существующий поиск раздела → ответ.
 *
 * Модель здесь — только переводчик фразы в структуру. Каждое её значение
 * проверяется, данные берёт существующий сервис раздела, а ответ человеку
 * строится из найденного, а не из слов модели.
 */
@Injectable()
export class SmartSearchService {
  private readonly logger = new Logger(SmartSearchService.name);
  private prompt: { text: string; builtAt: number } | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: SmartSearchSettings,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(DOMAIN_ADAPTERS_REGISTRY) private readonly registry: DomainRegistry,
    @Inject(CONTEXT_STORE) private readonly contexts: ContextStore,
    private readonly cities: CitiesService,
    @Optional() @Inject(SMART_SEARCH_CLOCK) clock?: () => Date,
  ) {
    this.clock = clock ?? (() => new Date());
  }

  private readonly clock: () => Date;

  async search(request: SmartSearchRequest, userId?: string): Promise<SmartSearchResponse> {
    const started = Date.now();
    const sessionId = request.sessionId ?? randomBytes(16).toString('base64url');
    const text = sanitizeUserText(request.text, SMART_SEARCH_LIMITS.maxTextLength);

    if (!this.config.SMART_SEARCH_ENABLED)
      return this.failure(sessionId, text, 'SMART_SEARCH_DISABLED');

    const key = contextKey(sessionId, userId);
    const previous = request.reset ? null : await this.loadContext(key);
    if (request.reset) await this.contexts.clear(key).catch(() => undefined);

    const cities = await this.cities.listActive();
    const now = this.clock();
    const system = await this.systemPrompt(cities, now);

    const parsed = await parseIntent(
      this.ai,
      system,
      buildMessages(text, previous?.intent ?? null),
    );
    if (!parsed.ok) {
      this.log('error', { code: parsed.code, latencyMs: Date.now() - started });
      if (this.config.AI_DEBUG_LOG) this.logger.debug(`Разбор не удался: ${parsed.detail}`);
      return this.failure(sessionId, text, parsed.code);
    }

    const context: DomainRequestContext = {
      text,
      now,
      cities,
      limit: request.limit,
      ...(userId ? { userId } : {}),
      ...(request.context?.cityId ? { cityId: request.context.cityId } : {}),
      ...(request.context?.latitude !== undefined ? { latitude: request.context.latitude } : {}),
      ...(request.context?.longitude !== undefined ? { longitude: request.context.longitude } : {}),
      ...(request.context?.listingCategory
        ? { listingCategory: request.context.listingCategory }
        : {}),
    };

    try {
      const { primary, subqueries } = splitParts(parsed.intent);
      const grounded = groundIntent(primary, text);
      const merged = mergeWithContext(grounded.intent, previous);
      const domain = merged.intent.domain ?? screenDomain(request.context?.screen);
      const effective: SmartSearchIntentCore = { ...merged.intent, domain };

      // Сначала проверяются ВСЕ части: невалидный подзапрос не даёт исполнить и остальные
      const parts = [
        { intent: effective, dropped: grounded.dropped },
        ...subqueries.map((part) => groundIntent(part, text)),
      ].map((part) => withoutUnsupported(part.intent, part.dropped));
      for (const part of parts) await this.assertKnownFilters(part.intent);

      const results: SmartSearchPart[] = [];
      for (const part of parts)
        results.push(await this.runPart(part.intent, part.dropped, context));

      const first = results[0]!;
      if (effective.domain && first.status !== 'unsupported') {
        await this.saveContext(
          key,
          newContext(
            effective.domain,
            withResolvedCategory(effective, first),
            previous,
            now.getTime(),
          ),
        );
      }

      const status = results.some((part) => part.status === 'results') ? 'results' : first.status;
      this.log(status, {
        domains: results.map((part) => part.domain).join(','),
        refined: merged.refined,
        aiLatencyMs: parsed.latencyMs,
        latencyMs: Date.now() - started,
      });
      return {
        schemaVersion: 1,
        sessionId,
        status,
        message: first.message,
        parts: results,
        error: null,
        fallback: null,
      };
    } catch (error) {
      if (error instanceof InvalidIntentError) {
        this.log('error', { code: 'INVALID_INTENT', latencyMs: Date.now() - started });
        if (this.config.AI_DEBUG_LOG) this.logger.debug(error.message);
        return this.failure(sessionId, text, 'INVALID_INTENT');
      }
      this.logger.error(
        `Умный поиск: ошибка раздела — ${error instanceof Error ? error.message : 'неизвестно'}`,
      );
      return this.failure(sessionId, text, 'SEARCH_FAILED');
    }
  }

  async health(): Promise<SmartSearchHealthDto> {
    const ai = await this.ai.health();
    return {
      enabled: this.config.SMART_SEARCH_ENABLED,
      aiEnabled: this.ai.name !== 'disabled',
      provider: this.ai.name,
      model: ai.model,
      status: this.config.SMART_SEARCH_ENABLED ? ai.status : 'disabled',
      latencyMs: ai.latencyMs,
      message: ai.message,
    };
  }

  // ── Части запроса ─────────────────────────────────────────────────────────

  private async assertKnownFilters(intent: SmartSearchIntentCore): Promise<void> {
    const hasFilters =
      Object.keys(intent.filters).length + Object.keys(intent.preferences).length > 0;
    if (!intent.domain) {
      if (hasFilters) throw new InvalidIntentError('Фильтры без раздела');
      return;
    }
    const adapter = this.registry.get(intent.domain);
    if (!adapter) throw new InvalidIntentError(`Нет адаптера раздела ${intent.domain}`);
    const unknown = unknownFilterKeys(intent, await adapter.allowedFilterKeys());
    if (unknown.length > 0) {
      throw new InvalidIntentError(
        `Неизвестные фильтры раздела ${intent.domain}: ${unknown.join(', ')}`,
      );
    }
  }

  private async runPart(
    intent: SmartSearchIntentCore,
    dropped: readonly string[],
    context: DomainRequestContext,
  ): Promise<SmartSearchPart> {
    if (intent.intent === 'action') {
      return {
        status: 'unsupported',
        domain: intent.domain,
        query: null,
        results: null,
        clarification: null,
        message: 'Умный поиск только находит. Оформить заказ или покупку можно на экране раздела.',
      };
    }
    if (!intent.domain || intent.intent === 'unknown') {
      return this.clarificationPart(null, this.domainClarification());
    }

    const adapter = this.registry.get(intent.domain);
    if (!adapter) {
      return {
        status: 'unsupported',
        domain: intent.domain,
        query: null,
        results: null,
        clarification: null,
        message: 'Этот раздел пока не поддерживает умный поиск.',
      };
    }

    // Цену назвали словом («недорого») — модель могла её досочинить: спросить.
    // Без такого слова неподтверждённая цена просто не применяется (пометка ниже)
    if (
      intent.domain === 'listings' &&
      dropped.includes('price') &&
      !intent.filters.price &&
      VAGUE_PRICE.test(context.text.toLowerCase())
    ) {
      return this.clarificationPart(intent.domain, priceClarification());
    }

    const outcome = await adapter.normalize(intent, context);
    if (outcome.kind === 'clarify')
      return this.clarificationPart(intent.domain, outcome.clarification, outcome.query);
    if (outcome.kind === 'unsupported') {
      return {
        status: 'unsupported',
        domain: intent.domain,
        query: outcome.query,
        results: null,
        clarification: null,
        message: outcome.message,
      };
    }

    for (const field of dropped) outcome.query.ignored.push(droppedNote(field));

    const executed = await adapter.execute(outcome.plan, context);
    if (executed.kind === 'clarify')
      return this.clarificationPart(intent.domain, executed.clarification, outcome.query);

    return {
      status: executed.count > 0 ? 'results' : 'no_results',
      domain: intent.domain,
      query: outcome.query,
      results: executed.results,
      clarification: null,
      message: resultMessage(executed.results, executed.count, executed.total),
    };
  }

  private clarificationPart(
    domain: SmartSearchDomain | null,
    clarification: SmartSearchClarification,
    query: SmartSearchPart['query'] = null,
  ): SmartSearchPart {
    return {
      status: 'clarification',
      domain,
      query,
      results: null,
      clarification,
      message: clarification.question,
    };
  }

  private domainClarification(): SmartSearchClarification {
    return {
      reason: 'unknown_domain',
      question: 'Где искать?',
      options: this.registry
        .all()
        .map((adapter) => ({ label: adapter.label, value: adapter.domain, kind: 'domain' })),
    };
  }

  // ── Служебное ─────────────────────────────────────────────────────────────

  private async systemPrompt(cities: readonly CityDto[], now: Date): Promise<string> {
    const today = todayIn(cities[0]?.timezone ?? 'Europe/Moscow', now);
    if (
      this.prompt &&
      now.getTime() - this.prompt.builtAt < PROMPT_TTL_MS &&
      this.prompt.text.includes(today)
    ) {
      return this.prompt.text;
    }
    const sections = await Promise.all(
      this.registry.all().map((adapter) => adapter.promptSection()),
    );
    const text = buildSystemPrompt(sections, today);
    this.prompt = { text, builtAt: now.getTime() };
    return text;
  }

  private async loadContext(key: string): Promise<SearchContextRecord | null> {
    try {
      return await this.contexts.load(key);
    } catch {
      // Хранилище контекста недоступно — поиск работает, просто без уточнений
      return null;
    }
  }

  private async saveContext(key: string, record: SearchContextRecord): Promise<void> {
    try {
      await this.contexts.save(key, record, this.config.SMART_SEARCH_CONTEXT_TTL_SECONDS);
    } catch {
      this.logger.warn('Умный поиск: контекст не сохранён');
    }
  }

  private failure(
    sessionId: string,
    text: string,
    code: keyof typeof FAILURE_MESSAGES,
  ): SmartSearchResponse {
    const message = FAILURE_MESSAGES[code];
    return {
      schemaVersion: 1,
      sessionId,
      status: 'error',
      message,
      parts: [],
      error: { code, message },
      // Обычный поиск продолжает работать: приложение может отправить ту же фразу в него
      fallback: { kind: 'text_search', text },
    };
  }

  /** В журнал — исход, разделы и время. Текст человека — только при AI_DEBUG_LOG. */
  private log(status: string, details: Record<string, unknown>): void {
    this.logger.log({ event: 'smart_search', status, provider: this.ai.name, ...details });
  }
}

/** Слова «цены словом»: только с ними неподтверждённая цена — повод переспросить. */
const VAGUE_PRICE = /недорог|дешев|дешёв|бюджетн|подешевле|недорогой|копейки/u;

/**
 * Поля, которые модель вправе назвать, но раздел их не умеет: цены блюд нет
 * в витрине заведений, цены билета — в поиске сеансов. Такое поле — не повод
 * отклонить весь ответ: оно не применяется, и человек видит почему.
 */
const UNSUPPORTED_BY_DOMAIN: Readonly<Partial<Record<SmartSearchDomain, Record<string, string>>>> =
  {
    delivery: { price: 'Цен блюд в поиске заведений нет — условие не применено' },
    cinema: { price: 'Цен билетов в поиске сеансов нет — условие не применено' },
    news: { price: 'У новостей нет цены' },
  };

function withoutUnsupported(
  intent: SmartSearchIntentCore,
  dropped: readonly string[],
): { intent: SmartSearchIntentCore; dropped: string[] } {
  const unsupported = intent.domain ? UNSUPPORTED_BY_DOMAIN[intent.domain] : undefined;
  if (!unsupported) return { intent, dropped: [...dropped] };
  const removed: string[] = [];
  const strip = (record: SmartSearchIntentCore['filters']) =>
    Object.fromEntries(
      Object.entries(record).filter(([key]) => {
        if (!(key in unsupported)) return true;
        removed.push(`unsupported:${intent.domain}:${key}`);
        return false;
      }),
    );
  return {
    intent: { ...intent, filters: strip(intent.filters), preferences: strip(intent.preferences) },
    dropped: [...dropped, ...removed],
  };
}

/** Почему условие из ответа модели не применено — для поля ignored. */
function droppedNote(code: string): { field: string; reason: string } {
  if (code.startsWith('structural:')) {
    const field = code.slice('structural:'.length);
    return {
      field,
      reason: 'Поле не на своём месте (место и время задаются отдельно) — не применено',
    };
  }
  if (code.startsWith('unsupported:')) {
    const [, domain, field] = code.split(':') as [string, SmartSearchDomain, string];
    return {
      field,
      reason: UNSUPPORTED_BY_DOMAIN[domain]?.[field] ?? 'Раздел это поле не поддерживает',
    };
  }
  switch (code) {
    case 'time.date':
      return { field: 'date', reason: 'Дня нет во фразе — взят день по умолчанию' };
    case 'time.from':
    case 'time.to':
      return { field: 'time', reason: 'Такого времени нет во фразе — не применено' };
    case 'location.city':
      return { field: 'location', reason: 'Этого города нет во фразе — не применён' };
    case 'transactionType':
    case 'rentPeriod':
      return { field: code, reason: 'Во фразе нет такой сделки — условие не применено' };
    default:
      return { field: code, reason: 'Такого числа нет в запросе — условие не применено' };
  }
}

export const DOMAIN_SCREENS: Readonly<Record<string, SmartSearchDomain>> = {
  listings: 'listings',
  cinema: 'cinema',
  news: 'news',
  delivery: 'delivery',
};

/**
 * Контекст запоминает итог нормализации, а не только слова модели: категорию,
 * которую сервер вывел сам («а Nissan?» после «Toyota Succeed» остаётся в
 * легковых), и значения, найденные во фразе («автомат», которого модель не
 * разложила, не теряется на следующей фразе «а бензиновые?»). Значения
 * хранятся кодами справочников — нормализатор принимает их так же, как слова.
 */
function withResolvedCategory(
  intent: SmartSearchIntentCore,
  part: SmartSearchPart,
): SmartSearchIntentCore {
  if (part.query?.domain !== 'listings') return intent;
  const params = part.query.params;
  const filters = { ...intent.filters };
  const free = (key: string) => filters[key] === undefined && intent.preferences[key] === undefined;

  if (typeof params.category === 'string' && free('category')) filters.category = params.category;
  for (const key of ['transactionType', 'rentPeriod'] as const) {
    if (typeof params[key] === 'string' && free(key)) filters[key] = params[key];
  }
  if (typeof params.attributes === 'string') {
    for (const [key, value] of Object.entries(
      JSON.parse(params.attributes) as Record<string, unknown>,
    )) {
      if (!free(key)) continue;
      const stored = toFilterValue(value);
      if (stored !== null) filters[key] = stored;
    }
  }
  return { ...intent, filters };
}

/** Значение фильтра ленты → значение намерения: «{from, to}» → «{min, max}». */
function toFilterValue(value: unknown): SmartSearchIntentCore['filters'][string] | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string | number => typeof item === 'string' || typeof item === 'number',
    );
    return items.length > 0 ? items.slice(0, 12) : null;
  }
  if (value && typeof value === 'object') {
    const range = value as { from?: unknown; to?: unknown };
    const min = typeof range.from === 'number' ? range.from : undefined;
    const max = typeof range.to === 'number' ? range.to : undefined;
    if (min === undefined && max === undefined) return null;
    return { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
  }
  return null;
}

/** Экран, с которого спрашивают, подсказывает раздел для коротких фраз («а на завтра?»). */
function screenDomain(screen: string | undefined): SmartSearchDomain | null {
  return screen ? (DOMAIN_SCREENS[screen] ?? null) : null;
}

function resultMessage(results: SmartSearchResults, count: number, total?: number): string {
  const n = total ?? count;
  if (count === 0) return 'Ничего не нашлось. Попробуйте смягчить условия.';
  switch (results.domain) {
    case 'listings':
      return `Нашлось ${n} ${plural(n, 'объявление', 'объявления', 'объявлений')}`;
    case 'cinema':
      return `${n} ${plural(n, 'фильм', 'фильма', 'фильмов')} в расписании`;
    case 'news':
      return `${n} ${plural(n, 'новость', 'новости', 'новостей')}`;
    case 'delivery':
      return `${n} ${plural(n, 'заведение', 'заведения', 'заведений')} с доставкой`;
  }
}
