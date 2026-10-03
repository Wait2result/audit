/**
 * Прослойка над языковой моделью.
 *
 * Умный поиск знает только этот интерфейс: «дай текст по подсказке и
 * сообщениям» и «жива ли модель». Ollama с Qwen3 — первая реализация; другая
 * локальная или облачная модель подключается новым классом и строкой в
 * настройках, без правки поиска. Имя модели нигде в логике поиска не
 * встречается.
 *
 * Модель не получает ни доступа к базе, ни инструментов, ни адресов API:
 * только текст подсказки и текст человека. Всё, что она вернёт, — строка,
 * которую дальше проверяет сервер.
 */

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  /** Неизменяемые правила: роль, схема ответа, допустимые разделы */
  system: string;
  /** Контекст и фраза человека — данные, а не инструкции */
  messages: readonly AiMessage[];
  /** JSON Schema ответа: поставщик, который умеет ограничивать вывод схемой, её применит */
  jsonSchema?: Record<string, unknown>;
}

export interface AiCompletionResult {
  text: string;
  latencyMs: number;
}

export interface AiHealth {
  status: 'ok' | 'unavailable' | 'disabled';
  model: string | null;
  latencyMs: number | null;
  message: string | null;
}

export interface AiProvider {
  /** Название поставщика для журнала и панели: «ollama», «disabled» */
  readonly name: string;
  /** Имя модели — только для мониторинга, поиск на него не опирается */
  readonly model: string | null;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
  health(): Promise<AiHealth>;
}

/** Почему модель не ответила. Код уходит в ответ поиска, текст — в журнал. */
export type AiFailureCode =
  'AI_DISABLED' | 'AI_UNAVAILABLE' | 'AI_TIMEOUT' | 'AI_BAD_RESPONSE' | 'AI_RESPONSE_TOO_LARGE';

export class AiProviderError extends Error {
  constructor(
    readonly code: AiFailureCode,
    message: string,
    /** Статус HTTP поставщика, если он ответил */
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/** Модель выключена настройками: умный поиск честно отвечает «недоступен». */
export class DisabledAiProvider implements AiProvider {
  readonly name = 'disabled';
  readonly model = null;

  complete(): Promise<AiCompletionResult> {
    return Promise.reject(new AiProviderError('AI_DISABLED', 'Языковая модель выключена'));
  }

  health(): Promise<AiHealth> {
    return Promise.resolve({
      status: 'disabled',
      model: null,
      latencyMs: null,
      message: 'AI_ENABLED=false',
    });
  }
}
