import {
  SMART_SEARCH_DOMAINS,
  smartSearchIntentSchema,
  type SmartSearchDomain,
  type SmartSearchIntent,
  type SmartSearchStatus,
} from '@dagestan/shared';
import { z } from 'zod';

import type { RedisLike } from '../context/context-store.js';

/**
 * След ответа умного поиска — чтобы «Я имел в виду другое» знало, что
 * поняла модель, а приложению не нужно было бы это показывать.
 *
 * Приложение получает только номер ответа (`requestId`). Проверенное схемой
 * намерение и фраза живут на сервере полчаса: если человек за это время
 * пожалуется, они уйдут в разбор вместе с его исправлением; если нет —
 * исчезнут сами. Сырого ответа модели здесь нет — только то, что прошло
 * проверку схемой.
 */

export const TRACE_STORE = Symbol('SMART_SEARCH_TRACE_STORE');

/** Сколько живёт след: хватает, чтобы посмотреть выдачу и написать «не то». */
export const TRACE_TTL_SECONDS = 30 * 60;

/** Больше — след не сохраняется: жалоба тогда уйдёт без разбора модели. */
const MAX_TRACE_BYTES = 8192;

const STATUSES = ['results', 'clarification', 'no_results', 'unsupported', 'error'] as const;

const traceSchema = z.object({
  v: z.literal(1),
  text: z.string().max(400),
  status: z.enum(STATUSES),
  domain: z.enum(SMART_SEARCH_DOMAINS).nullable(),
  intent: smartSearchIntentSchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  createdAt: z.number(),
});

export interface SearchTrace {
  v: 1;
  text: string;
  status: SmartSearchStatus;
  domain: SmartSearchDomain | null;
  intent: SmartSearchIntent | null;
  confidence: number | null;
  createdAt: number;
}

export interface TraceStore {
  save(requestId: string, trace: SearchTrace): Promise<void>;
  load(requestId: string): Promise<SearchTrace | null>;
}

export function traceKey(requestId: string): string {
  return `smart-search:trace:${requestId}`;
}

function encode(trace: SearchTrace): string | null {
  const text = JSON.stringify(trace);
  return text.length <= MAX_TRACE_BYTES ? text : null;
}

function decode(raw: string | null): SearchTrace | null {
  if (!raw) return null;
  try {
    const parsed = traceSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export class RedisTraceStore implements TraceStore {
  constructor(private readonly redis: RedisLike) {}

  async save(requestId: string, trace: SearchTrace): Promise<void> {
    const encoded = encode(trace);
    if (encoded) await this.redis.set(traceKey(requestId), encoded, 'EX', TRACE_TTL_SECONDS);
  }

  async load(requestId: string): Promise<SearchTrace | null> {
    return decode(await this.redis.get(traceKey(requestId)));
  }
}

/** Хранилище в памяти — для тестов. */
export class MemoryTraceStore implements TraceStore {
  readonly items = new Map<string, string>();

  save(requestId: string, trace: SearchTrace): Promise<void> {
    const encoded = encode(trace);
    if (encoded) this.items.set(traceKey(requestId), encoded);
    return Promise.resolve();
  }

  load(requestId: string): Promise<SearchTrace | null> {
    return Promise.resolve(decode(this.items.get(traceKey(requestId)) ?? null));
  }
}
