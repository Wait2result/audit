import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiHealth,
  AiProvider,
} from './ai-provider.js';
import { AiProviderError } from './ai-provider.js';

export interface OllamaSettings {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxResponseChars: number;
  contextTokens: number;
}

/** Только то, чем пользуется поставщик: в тестах подставляется подделка. */
export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Ollama — локальный сервер моделей (по умолчанию Qwen3 8B).
 *
 * Запрос — `POST /api/chat` без потока: ответ нужен целиком, чтобы проверить
 * его схемой. Ollama умеет ограничивать вывод JSON Schema (`format`) — так
 * модель физически не может вернуть поле, которого нет в схеме; сервер всё
 * равно проверяет ответ сам. `think: false` выключает «рассуждения» Qwen3:
 * они не нужны для разбора фразы и в разы замедляют ответ.
 *
 * Ничего, кроме подсказки и фразы человека, в модель не уходит: ни токенов,
 * ни заголовков авторизации, ни адресов других сервисов.
 */
export class OllamaProvider implements AiProvider {
  readonly name = 'ollama';

  constructor(
    private readonly settings: OllamaSettings,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    if (!/^https?:\/\//.test(settings.baseUrl)) {
      throw new Error('OLLAMA_BASE_URL должен начинаться с http:// или https://');
    }
  }

  get model(): string {
    return this.settings.model;
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    try {
      return await this.chat(request, request.jsonSchema ?? 'json');
    } catch (error) {
      // Старая Ollama или сложная схема: формат JSON без схемы — ответ всё
      // равно проверит сервер
      if (error instanceof AiProviderError && error.httpStatus === 400 && request.jsonSchema) {
        return this.chat(request, 'json');
      }
      throw error;
    }
  }

  private async chat(
    request: AiCompletionRequest,
    format: Record<string, unknown> | 'json',
  ): Promise<AiCompletionResult> {
    const started = Date.now();
    const body = JSON.stringify({
      model: this.settings.model,
      stream: false,
      think: false,
      // Модель остаётся в памяти полчаса после фразы: по умолчанию Ollama выгружает
      // её через 5 минут, и следующая фраза ждёт загрузки ~15 с (аудит, SS-10)
      keep_alive: '30m',
      format,
      // Разбор фразы — не творчество: одинаковый вход должен давать одинаковый ответ
      options: { temperature: 0, num_ctx: this.settings.contextTokens, num_predict: 1024 },
      messages: [{ role: 'system', content: request.system }, ...request.messages],
    });

    const text = await this.call('/api/chat', { method: 'POST', body });
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AiProviderError('AI_BAD_RESPONSE', 'Ollama вернула не JSON');
    }
    const content = (parsed as { message?: { content?: unknown } }).message?.content;
    if (typeof content !== 'string') {
      throw new AiProviderError('AI_BAD_RESPONSE', 'В ответе Ollama нет текста сообщения');
    }
    return { text: content, latencyMs: Date.now() - started };
  }

  async health(): Promise<AiHealth> {
    const started = Date.now();
    try {
      const text = await this.call('/api/tags', { method: 'GET' });
      const models = (JSON.parse(text) as { models?: { name?: string; model?: string }[] }).models;
      const names = (models ?? []).flatMap((item) => [item.name, item.model]).filter(Boolean);
      const wanted = this.settings.model;
      const installed = names.some((name) => name === wanted || name === `${wanted}:latest`);
      return {
        status: installed ? 'ok' : 'unavailable',
        model: wanted,
        latencyMs: Date.now() - started,
        message: installed ? null : `Модель ${wanted} не скачана: ollama pull ${wanted}`,
      };
    } catch (error) {
      return {
        status: 'unavailable',
        model: this.settings.model,
        latencyMs: null,
        message: error instanceof AiProviderError ? error.message : 'Ollama не отвечает',
      };
    }
  }

  /** Запрос к Ollama с пределом по времени и по размеру ответа. */
  private async call(path: string, init: { method: string; body?: string }): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.settings.baseUrl.replace(/\/$/, '')}${path}`, {
        method: init.method,
        headers: { 'Content-Type': 'application/json' },
        ...(init.body ? { body: init.body } : {}),
        signal: controller.signal,
      });
      const text = await response.text();
      if (text.length > this.settings.maxResponseChars) {
        throw new AiProviderError('AI_RESPONSE_TOO_LARGE', 'Ответ модели слишком большой');
      }
      if (!response.ok) {
        throw new AiProviderError(
          'AI_UNAVAILABLE',
          `Ollama ответила статусом ${response.status}`,
          response.status,
        );
      }
      return text;
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (controller.signal.aborted) {
        throw new AiProviderError('AI_TIMEOUT', 'Модель не ответила вовремя');
      }
      throw new AiProviderError('AI_UNAVAILABLE', 'Ollama недоступна');
    } finally {
      clearTimeout(timer);
    }
  }
}
