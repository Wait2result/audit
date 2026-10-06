import {
  SMART_SEARCH_DOMAINS,
  smartSearchIntentCoreSchema,
  type SmartSearchDomain,
  type SmartSearchIntentCore,
} from '@dagestan/shared';
import { z } from 'zod';

/**
 * Контекст умного поиска — чтобы «а автомат?» уточняло прошлый поиск.
 *
 * Хранится ровно одно последнее намерение сессии (не история фраз и не
 * текст человека), с ограниченным сроком жизни и размером. Ключ — сессия
 * поиска и пользователь (или «аноним»): чужую сессию по одному её номеру
 * продолжить нельзя, если она начата под другим аккаунтом.
 */

export const CONTEXT_STORE = Symbol('SMART_SEARCH_CONTEXT_STORE');

/** Больше — контекст не сохраняется: что-то пошло не так, тащить это дальше незачем. */
export const MAX_CONTEXT_BYTES = 4096;

const recordSchema = z.object({
  v: z.literal(1),
  domain: z.enum(SMART_SEARCH_DOMAINS),
  intent: smartSearchIntentCoreSchema,
  updatedAt: z.number(),
  /** Сколько уточнений подряд — для журнала и предела */
  turns: z.number().int().min(1).max(1000),
  /**
   * Где искали: открытая категория объявлений ('' — без категории). Фраза из
   * другой категории — не уточнение этого поиска, а новый поиск. У записей
   * старого формата поля нет — такие считаются начатыми вне категории
   */
  scope: z.string().max(60).optional(),
});

export type SearchContextRecord = z.infer<typeof recordSchema>;

export interface ContextStore {
  load(key: string): Promise<SearchContextRecord | null>;
  save(key: string, record: SearchContextRecord, ttlSeconds: number): Promise<void>;
  clear(key: string): Promise<void>;
}

export function contextKey(sessionId: string, userId?: string): string {
  return `smart-search:ctx:${userId ?? 'anon'}:${sessionId}`;
}

/** Сохранённое тоже проверяется: из хранилища может прийти старая версия формата. */
export function decodeContext(raw: string | null): SearchContextRecord | null {
  if (!raw) return null;
  try {
    const parsed = recordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function encodeContext(record: SearchContextRecord): string | null {
  const text = JSON.stringify(record);
  return text.length <= MAX_CONTEXT_BYTES ? text : null;
}

export function newContext(
  domain: SmartSearchDomain,
  intent: SmartSearchIntentCore,
  previous: SearchContextRecord | null,
  now: number,
  scope = '',
): SearchContextRecord {
  // В контексте нет вопроса-уточнения и «неразобранных» слов: они относятся
  // к одной фразе, а не к поиску
  const clean: SmartSearchIntentCore = {
    ...intent,
    domain,
    clarification: { needed: false, question: null, options: [] },
    unresolved: [],
  };
  const sameSearch = previous?.domain === domain && intent.intent === 'refine';
  return {
    v: 1,
    domain,
    intent: clean,
    updatedAt: now,
    turns: sameSearch ? previous.turns + 1 : 1,
    scope,
  };
}

/**
 * Продолжает ли фраза поиск из этой записи по месту: только в той же
 * категории. «NCP165», набранное в «Запчастях», не уточняет «рейку» из
 * «Дома и ремонта» — открытая категория важнее прошлого поиска.
 */
export function sameScope(record: SearchContextRecord, scope: string | undefined): boolean {
  return (record.scope ?? '') === (scope ?? '');
}

/** Минимум клиента Redis, который нужен хранилищу. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export class RedisContextStore implements ContextStore {
  constructor(private readonly redis: RedisLike) {}

  async load(key: string): Promise<SearchContextRecord | null> {
    return decodeContext(await this.redis.get(key));
  }

  async save(key: string, record: SearchContextRecord, ttlSeconds: number): Promise<void> {
    const encoded = encodeContext(record);
    if (encoded) await this.redis.set(key, encoded, 'EX', ttlSeconds);
    else await this.redis.del(key);
  }

  async clear(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

/** Хранилище в памяти — для тестов: срок жизни считается по часам теста. */
export class MemoryContextStore implements ContextStore {
  private readonly items = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly clock: () => number = () => Date.now()) {}

  load(key: string): Promise<SearchContextRecord | null> {
    const item = this.items.get(key);
    if (!item || item.expiresAt <= this.clock()) {
      this.items.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(decodeContext(item.value));
  }

  save(key: string, record: SearchContextRecord, ttlSeconds: number): Promise<void> {
    const encoded = encodeContext(record);
    if (encoded)
      this.items.set(key, { value: encoded, expiresAt: this.clock() + ttlSeconds * 1000 });
    else this.items.delete(key);
    return Promise.resolve();
  }

  clear(key: string): Promise<void> {
    this.items.delete(key);
    return Promise.resolve();
  }
}
