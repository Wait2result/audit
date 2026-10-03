import { smartSearchIntentSchema, type SmartSearchIntent } from '@dagestan/shared';
import { z } from 'zod';

import type { AiFailureCode, AiProvider } from '../ai/ai-provider.js';
import { AiProviderError } from '../ai/ai-provider.js';
import type { AiMessage } from '../ai/ai-provider.js';

export type IntentFailureCode = AiFailureCode | 'INVALID_AI_OUTPUT';

export type IntentParseResult =
  | { ok: true; intent: SmartSearchIntent; latencyMs: number }
  | { ok: false; code: IntentFailureCode; detail: string };

/**
 * JSON из текста модели. Qwen3 может обернуть ответ в «```json» или в блок
 * рассуждений `<think>` — они срезаются. Всё остальное — дело схемы: здесь
 * только достаётся объект, без исправления содержимого.
 */
export function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    return undefined;
  }
}

/** Проверка ответа модели схемой. Невалидное не исполняется — никогда. */
export function validateIntent(text: string): IntentParseResult {
  const json = extractJson(text);
  if (json === undefined) {
    return { ok: false, code: 'INVALID_AI_OUTPUT', detail: 'Ответ модели — не JSON' };
  }
  const parsed = smartSearchIntentSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      code: 'INVALID_AI_OUTPUT',
      detail:
        `Ответ модели не по схеме: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
    };
  }
  return { ok: true, intent: parsed.data, latencyMs: 0 };
}

let cachedJsonSchema: Record<string, unknown> | undefined;

/**
 * JSON Schema намерения для поставщиков, которые умеют ограничивать ответ
 * схемой. Собирается из той же схемы Zod, которой ответ потом проверяется.
 */
export function intentJsonSchema(): Record<string, unknown> | undefined {
  if (cachedJsonSchema) return cachedJsonSchema;
  try {
    cachedJsonSchema = z.toJSONSchema(smartSearchIntentSchema, { unrepresentable: 'any' });
  } catch {
    cachedJsonSchema = undefined;
  }
  return cachedJsonSchema;
}

/** Фраза → намерение: подсказка, вызов модели, проверка схемой. */
export async function parseIntent(
  provider: AiProvider,
  system: string,
  messages: readonly AiMessage[],
): Promise<IntentParseResult> {
  try {
    const jsonSchema = intentJsonSchema();
    const result = await provider.complete({
      system,
      messages,
      ...(jsonSchema ? { jsonSchema } : {}),
    });
    const validated = validateIntent(result.text);
    return validated.ok ? { ...validated, latencyMs: result.latencyMs } : validated;
  } catch (error) {
    if (error instanceof AiProviderError)
      return { ok: false, code: error.code, detail: error.message };
    return { ok: false, code: 'AI_UNAVAILABLE', detail: 'Модель не ответила' };
  }
}
