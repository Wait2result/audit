import { randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  SMART_SEARCH_DOMAINS,
  SMART_SEARCH_LIMITS,
  SMART_SEARCH_SCHEMA_VERSION,
  plural,
  type CityDto,
  type SmartSearchChoice,
  type SmartSearchClarification,
  type SmartSearchDomain,
  type SmartSearchHealthDto,
  type SmartSearchIntent,
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
import { TRACE_STORE, type TraceStore } from './feedback/search-trace-store.js';
import { buildMessages, buildSystemPrompt } from './intent/intent-prompt.js';
import { parseIntent, type IntentFailureCode } from './intent/intent-parser.js';
import { norm, sanitizeUserText } from './normalize/text.js';
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
  | IntentFailureCode
  | 'SMART_SEARCH_DISABLED'
  | 'INVALID_INTENT'
  | 'SEARCH_FAILED'
  | 'CHOICE_EXPIRED',
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
  CHOICE_EXPIRED: 'Этот вариант устарел. Напишите запрос ещё раз.',
};

class InvalidIntentError extends Error {}

/** Что запомнить в следе ответа (для «Искал не то?» и для нажатия вариантов). */
interface TraceDraft {
  intent: SmartSearchIntent | null;
  text: string;
}

/** Что исполнять: намерение, его фраза и как оно соотносится с прошлым поиском. */
interface Planned {
  intent: SmartSearchIntentCore;
  dropped: string[];
  subqueries: SmartSearchIntentCore[];
  /** Фраза, к которой относится намерение (у нажатого варианта — исходная) */
  phrase: string;
  /** Прошлый поиск, который продолжается (для счёта уточнений) */
  previous: SearchContextRecord | null;
  /** Новая фраза, а не уточнение и не нажатый вариант */
  fresh: boolean;
  refined: boolean;
  traceIntent: SmartSearchIntent;
  aiLatencyMs: number | null;
  confidence: number | null;
}

/**
 * Продолжение прошлого поиска или новый? Решается по самой фразе, а не по
 * слову модели: модель, видя прошлый поиск, называет «уточнением» почти всё.
 *   продолжение — «а автомат?», «до миллиона», «в Махачкале», «бензин»;
 *   новый поиск — «хочу …», «где поесть», «что посмотреть», длинная фраза.
 */
export function isFollowUp(text: string): boolean {
  const value = norm(text);
  if (!value) return false;
  if (FOLLOW_UP_START.test(value)) return true;
  if (NEW_SEARCH_WORDS.test(value)) return false;
  return value.split(' ').length <= 3;
}

const FOLLOW_UP_START =
  /^(а|и|ещ[её]|только|без|с|со|до|от|в|во|на|по|за|подешевле|дешевле|дороже|лучше|тоже|также)( |$)/u;
const NEW_SEARCH_WORDS =
  /(^| )(хочу|хотел|хотела|хотим|нужен|нужна|нужно|нужны|ищу|ищем|найди|найти|покажи|показать|подбери|предложи|посоветуй|где|что|какой|какая|какие|какое|сколько|куда|когда|давай|помоги|можно)( |$)/u;

/** Слова «просто хочу есть», которые не называют ни блюда, ни места. */
const VAGUE_FOOD_FILLER = new Set([
  'хочу',
  'хотим',
  'хотелось',
  'бы',
  'я',
  'мы',
  'очень',
  'сильно',
  'что',
  'нибудь',
  'чего',
  'сейчас',
  'вкусно',
  'поесть',
  'покушать',
  'кушать',
  'есть',
  'перекусить',
  'пообедать',
  'поужинать',
  'позавтракать',
  'голоден',
  'голодна',
  'еда',
  'еды',
  'еду',
]);

/** «Хочу покушать», «очень хочу есть» — желание без блюда, места и «где». */
export function isVagueFood(text: string): boolean {
  const list = norm(text).split(' ').filter(Boolean);
  // «Есть» многозначно («есть что-нибудь?»): едой оно считается только рядом с «хочу»
  const wantsToEat = list.includes('есть') && (list.includes('хочу') || list.includes('хотим'));
  return (
    (FOOD_WORDS.test(list.join(' ')) || wantsToEat) &&
    !list.includes('где') &&
    list.every((word) => VAGUE_FOOD_FILLER.has(word))
  );
}

/** Пустое намерение — если след ответа без разбора (модель тогда не ответила). */
function emptyIntent(): SmartSearchIntentCore {
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
    confidence: 0,
    unresolved: [],
  };
}

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
    @Optional() @Inject(TRACE_STORE) private readonly traces?: TraceStore,
  ) {
    this.clock = clock ?? (() => new Date());
  }

  private readonly clock: () => Date;

  async search(request: SmartSearchRequest, userId?: string): Promise<SmartSearchResponse> {
    const requestId = randomBytes(12).toString('base64url');
    const text = sanitizeUserText(request.text, SMART_SEARCH_LIMITS.maxTextLength);
    const trace: TraceDraft = { intent: null, text };
    const response = await this.answer(request, text, requestId, trace, userId);
    // В следе — исходная фраза: у нажатого варианта это фраза, к которой он относился
    await this.saveTrace(requestId, trace.text, response, trace.intent);
    return response;
  }

  private async answer(
    request: SmartSearchRequest,
    text: string,
    requestId: string,
    trace: TraceDraft,
    userId?: string,
  ): Promise<SmartSearchResponse> {
    const started = Date.now();
    const sessionId = request.sessionId ?? randomBytes(16).toString('base64url');

    if (!this.config.SMART_SEARCH_ENABLED)
      return this.failure(requestId, sessionId, text, 'SMART_SEARCH_DISABLED');

    const key = contextKey(sessionId, userId);
    const loaded = request.reset ? null : await this.loadContext(key);
    if (request.reset) await this.contexts.clear(key).catch(() => undefined);

    const cities = await this.cities.listActive();
    const now = this.clock();

    let plan: Planned;
    if (request.choice) {
      // Нажатый вариант: выбор человека исполняется без модели и важнее прошлого контекста
      const chosen = await this.fromChoice(request.choice, loaded);
      if (!chosen) {
        this.log('error', { requestId, code: 'CHOICE_EXPIRED', latencyMs: Date.now() - started });
        return this.failure(requestId, sessionId, text, 'CHOICE_EXPIRED');
      }
      plan = chosen;
    } else {
      // Продолжение или новый поиск — по самой фразе, до модели: новой фразе
      // прошлый поиск не показывается вовсе, и «хочу машину» после кино не
      // становится уточнением кино
      const continuing = loaded !== null && isFollowUp(text);
      const system = await this.systemPrompt(cities, now);
      const parsed = await parseIntent(
        this.ai,
        system,
        buildMessages(text, continuing ? loaded.intent : null),
      );
      if (!parsed.ok) {
        this.log('error', {
          requestId,
          code: parsed.code,
          fallback: true,
          latencyMs: Date.now() - started,
        });
        if (this.config.AI_DEBUG_LOG) this.logger.debug(`Разбор не удался: ${parsed.detail}`);
        return this.failure(requestId, sessionId, text, parsed.code);
      }
      const { primary, subqueries } = splitParts(parsed.intent);
      const grounded = groundIntent(primary, text);
      const sameSection =
        continuing && (grounded.intent.domain === null || grounded.intent.domain === loaded.domain);
      const merged = continuing
        ? mergeWithContext(
            // Короткая фраза к тому же разделу — уточнение, как бы модель её ни назвала
            sameSection ? { ...grounded.intent, intent: 'refine' } : grounded.intent,
            loaded,
          )
        : {
            intent:
              grounded.intent.intent === 'refine'
                ? { ...grounded.intent, intent: 'search' as const }
                : grounded.intent,
            refined: false,
          };
      // «Хочу покушать» без блюда и без «где»: в заведении или с доставкой — решает человек
      // (модель угадывает то так, то эдак); «где поесть», «хочу пиццу» — без вопроса
      const domain = isVagueFood(text)
        ? null
        : (merged.intent.domain ?? screenDomain(request.context?.screen));
      plan = {
        intent: { ...merged.intent, domain },
        dropped: [...grounded.dropped, ...parsed.stripped.map((field) => `unknown:${field}`)],
        subqueries,
        phrase: text,
        previous: continuing ? loaded : null,
        fresh: !continuing,
        refined: merged.refined,
        traceIntent: parsed.intent,
        aiLatencyMs: parsed.latencyMs,
        confidence: parsed.intent.confidence,
      };
    }
    trace.intent = plan.traceIntent;
    trace.text = plan.phrase;

    const context: DomainRequestContext = {
      text: plan.phrase,
      now,
      cities,
      limit: request.limit,
      ...(plan.fresh ? { fresh: true } : {}),
      ...(userId ? { userId } : {}),
      ...(request.context?.cityId ? { cityId: request.context.cityId } : {}),
      ...(request.context?.latitude !== undefined ? { latitude: request.context.latitude } : {}),
      ...(request.context?.longitude !== undefined ? { longitude: request.context.longitude } : {}),
      ...(request.context?.listingCategory
        ? { listingCategory: request.context.listingCategory }
        : {}),
    };

    try {
      const prepared = [
        { intent: plan.intent, dropped: plan.dropped },
        ...plan.subqueries.map((part) => groundIntent(part, plan.phrase)),
      ].map((part) => withoutUnsupported(part.intent, part.dropped));
      const parts: { intent: SmartSearchIntentCore; dropped: string[] }[] = [];
      for (const part of prepared) parts.push(await this.withoutUnknownFilters(part));

      const results: SmartSearchPart[] = [];
      for (const part of parts)
        results.push(await this.runPart(part.intent, part.dropped, context));

      const first = results[0]!;
      const main = parts[0]!.intent;
      if (main.domain && first.status !== 'unsupported') {
        await this.saveContext(
          key,
          newContext(main.domain, withResolvedCategory(main, first), plan.previous, now.getTime()),
        );
      }

      const status = results.some((part) => part.status === 'results') ? 'results' : first.status;
      this.log(status, {
        requestId,
        domains: results.map((part) => part.domain).join(','),
        confidence: plan.confidence,
        clarification: results.some((part) => part.status === 'clarification'),
        choice: request.choice ? request.choice.kind : null,
        fallback: false,
        refined: plan.refined,
        aiLatencyMs: plan.aiLatencyMs,
        latencyMs: Date.now() - started,
      });
      return {
        schemaVersion: 1,
        requestId,
        sessionId,
        status,
        message: first.message,
        parts: results,
        error: null,
        fallback: null,
      };
    } catch (error) {
      if (error instanceof InvalidIntentError) {
        this.log('error', {
          requestId,
          code: 'INVALID_INTENT',
          fallback: true,
          latencyMs: Date.now() - started,
        });
        if (this.config.AI_DEBUG_LOG) this.logger.debug(error.message);
        return this.failure(requestId, sessionId, text, 'INVALID_INTENT');
      }
      this.logger.error(
        `Умный поиск: ошибка раздела — ${error instanceof Error ? error.message : 'неизвестно'}`,
      );
      return this.failure(requestId, sessionId, text, 'SEARCH_FAILED');
    }
  }

  /**
   * Нажатый вариант → намерение без модели. Исходная фраза и разбор берутся
   * из следа ответа, в котором был вариант (`requestId`):
   *   domain — тот же разбор в выбранном разделе (выбор важнее прошлого контекста);
   *   filter — прошлый поиск (контекст сессии) плюс выбранное условие.
   */
  private async fromChoice(
    choice: SmartSearchChoice,
    loaded: SearchContextRecord | null,
  ): Promise<Planned | null> {
    const source = this.traces ? await this.traces.load(choice.requestId).catch(() => null) : null;
    if (!source) return null;
    const base = source.intent ? splitParts(source.intent).primary : emptyIntent();
    const grounded = groundIntent(base, source.text).intent;

    let intent: SmartSearchIntentCore;
    let previous: SearchContextRecord | null = null;
    if (choice.kind === 'domain') {
      const domain = SMART_SEARCH_DOMAINS.find((item) => item === choice.value);
      const adapter = domain ? this.registry.get(domain) : null;
      if (!domain || !adapter) return null;
      // Условия другого раздела не переносятся: «хочу покушать» → заведения как есть
      const allowed = await adapter.allowedFilterKeys();
      const keep = (record: SmartSearchIntentCore['filters']) =>
        Object.fromEntries(Object.entries(record).filter(([key]) => allowed.has(key)));
      intent = {
        ...grounded,
        intent: 'search',
        domain,
        filters: keep(grounded.filters),
        preferences: keep(grounded.preferences),
        clarification: { needed: false, question: null, options: [] },
      };
    } else {
      const from = loaded?.intent ?? grounded;
      if (!from.domain || !choice.field) return null;
      intent = {
        ...from,
        intent: 'search',
        filters: { ...from.filters, [choice.field]: choice.value },
        clarification: { needed: false, question: null, options: [] },
      };
      previous = loaded;
    }
    return {
      intent,
      dropped: [],
      subqueries: [],
      phrase: source.text,
      previous,
      fresh: false,
      refined: choice.kind === 'filter',
      traceIntent: { schemaVersion: SMART_SEARCH_SCHEMA_VERSION, ...intent, subqueries: [] },
      aiLatencyMs: null,
      confidence: source.confidence,
    };
  }

  /**
   * Условия, которых у раздела нет, не применяются и становятся пометками —
   * весь ответ из-за одного лишнего поля больше не отклоняется (решение D11).
   * Неизвестный раздел по-прежнему отклоняется: его не пропускает схема.
   */
  private async withoutUnknownFilters(part: {
    intent: SmartSearchIntentCore;
    dropped: string[];
  }): Promise<{ intent: SmartSearchIntentCore; dropped: string[] }> {
    const { intent } = part;
    let allowed: ReadonlySet<string> = new Set<string>();
    if (intent.domain) {
      const adapter = this.registry.get(intent.domain);
      if (!adapter) throw new InvalidIntentError(`Нет адаптера раздела ${intent.domain}`);
      allowed = await adapter.allowedFilterKeys();
    }
    const unknown = unknownFilterKeys(intent, allowed);
    if (unknown.length === 0) return part;
    const strip = (record: SmartSearchIntentCore['filters']) =>
      Object.fromEntries(Object.entries(record).filter(([key]) => allowed.has(key)));
    return {
      intent: { ...intent, filters: strip(intent.filters), preferences: strip(intent.preferences) },
      dropped: [...part.dropped, ...unknown.map((key) => `unknown:${key}`)],
    };
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

  private async runPart(
    original: SmartSearchIntentCore,
    dropped: readonly string[],
    context: DomainRequestContext,
  ): Promise<SmartSearchPart> {
    let intent = original;
    // «Купить», «заказать пиццу» — тоже поиск: найти, где купить или заказать.
    // Действием остаются оплата, бронь, отслеживание — их поиск не выполняет
    // Только если назван предмет: «где мой курьер?» — не поиск, а отслеживание заказа
    const hasSubject =
      Object.keys(intent.filters).length > 0 || Boolean(intent.query && intent.query.trim());
    if (
      intent.intent === 'action' &&
      intent.domain &&
      SEARCHABLE_ACTIONS.has(intent.domain) &&
      hasSubject
    ) {
      intent = { ...intent, intent: 'search' };
    }
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
    // Раздел неизвестен — вопрос со смысловыми вариантами. Раздел известен (в том
    // числе по экрану, с которого спросили) — ищем в нём, даже если модель не поняла слов
    if (!intent.domain) {
      return this.clarificationPart(null, this.domainClarification(context.text));
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

    const navigation = adapter.navigation
      ? await adapter.navigation(outcome.query, context)
      : { section: intent.domain, path: [adapter.label], filters: {} };
    return {
      status: executed.count > 0 ? 'results' : 'no_results',
      domain: intent.domain,
      query: outcome.query,
      results: executed.results,
      clarification: null,
      message: resultMessage(executed.results, executed.count, executed.total),
      navigation,
      ...(outcome.suggestions ? { suggestions: outcome.suggestions } : {}),
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

  /**
   * Раздел не определён. Варианты — по смыслу фразы, а не весь реестр: на
   * «хочу покушать» — заведения или доставка. Нажатие — выбор кодом, без модели.
   */
  private domainClarification(text: string): SmartSearchClarification {
    const option = (domain: SmartSearchDomain, label: string, hint: string) => ({
      label,
      value: domain,
      kind: 'domain' as const,
      hint,
      choice: { kind: 'domain' as const, value: domain },
    });
    if (FOOD_WORDS.test(norm(text)) || isVagueFood(text)) {
      return {
        reason: 'food_choice',
        question: 'Где хотите поесть?',
        options: [
          option('places', 'Рестораны и кафе', 'Поесть в заведении'),
          option('delivery', 'Доставка еды', 'Заказать домой'),
        ],
      };
    }
    return {
      reason: 'unknown_domain',
      question: 'Что ищем?',
      options: DOMAIN_CHOICES.filter(([domain]) => this.registry.get(domain)).map(
        ([domain, label, hint]) => option(domain, label, hint),
      ),
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

  /** След ответа — для «Я имел в виду другое». Не сохранился — поиск от этого не страдает. */
  private async saveTrace(
    requestId: string,
    text: string,
    response: SmartSearchResponse,
    intent: SmartSearchIntent | null,
  ): Promise<void> {
    if (!this.traces) return;
    try {
      await this.traces.save(requestId, {
        v: 1,
        text,
        status: response.status,
        domain: response.parts[0]?.domain ?? intent?.domain ?? null,
        intent,
        confidence: intent?.confidence ?? null,
        createdAt: this.clock().getTime(),
      });
    } catch {
      this.logger.warn('Умный поиск: след ответа не сохранён');
    }
  }

  private failure(
    requestId: string,
    sessionId: string,
    text: string,
    code: keyof typeof FAILURE_MESSAGES,
  ): SmartSearchResponse {
    const message = FAILURE_MESSAGES[code];
    return {
      schemaVersion: 1,
      requestId,
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

/** Разделы, где «купить» и «заказать» — это найти, где купить или заказать. */
const SEARCHABLE_ACTIONS: ReadonlySet<SmartSearchDomain> = new Set([
  'listings',
  'delivery',
  'places',
]);

/** «Хочу покушать», «где поесть» — вопрос «где»: в заведении или с доставкой. */
const FOOD_WORDS =
  /(^| )(поесть|покушать|кушать|пообедать|поужинать|позавтракать|перекусить|голоден|голодна|еда|еды|еду|покушаем|поедим)( |$)/u;

/** Разделы для вопроса «Что ищем?» — в порядке частоты, без раздела «скоро». */
const DOMAIN_CHOICES: readonly [SmartSearchDomain, string, string][] = [
  ['listings', 'Объявления', 'Купить, продать, снять'],
  ['places', 'Рестораны и кафе', 'Где поесть'],
  ['delivery', 'Доставка еды', 'Заказать домой'],
  ['cinema', 'Кино', 'Сеансы в городе'],
  ['news', 'Новости', 'Что происходит'],
  ['weather', 'Погода', 'Прогноз на неделю'],
];

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
  if (code.startsWith('unknown:')) {
    const field = code.slice('unknown:'.length);
    return {
      field: field === 'unknown' ? 'условие' : field,
      reason: 'Такого условия в разделе нет — не применено',
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
  places: 'places',
  weather: 'weather',
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
    case 'places':
      return `${n} ${plural(n, 'заведение', 'заведения', 'заведений')}`;
    case 'weather':
      return `Прогноз: ${results.cityName}`;
  }
}
