import type {
  SmartSearchFeedbackRequest,
  SmartSearchFeedbackResponse,
  SmartSearchRequest,
  SmartSearchResponse,
} from '@dagestan/shared';

import { ApiError, apiFetch } from './client';

/**
 * Умный поиск: фраза уходит на наш сервер, и только он говорит с моделью.
 * Приложение никогда не обращается к модели напрямую и не видит ни её
 * подсказки, ни её сырого ответа — только проверенный сервером ответ.
 */

/**
 * Предел ожидания ответа. Модель разбирает фразу 4–6 секунд, первая фраза
 * после перезапуска сервера — до 20; сервер сам прерывает модель через 20 с
 * и отвечает «недоступно», поэтому здесь запас сверху.
 */
export const SMART_SEARCH_TIMEOUT_MS = 30_000;

export type SmartSearchInput = Omit<SmartSearchRequest, 'limit'> & { limit?: number };

/**
 * Сбой самого запроса (не ответ «не понял», а нет ответа вовсе): нет сети,
 * сервер не дождался, лимит запросов. Экран тогда переходит на обычный поиск.
 */
export type SmartSearchFailure = 'timeout' | 'network' | 'rate_limited' | 'server';

export class SmartSearchRequestError extends Error {
  constructor(
    readonly reason: SmartSearchFailure,
    message: string,
  ) {
    super(message);
    this.name = 'SmartSearchRequestError';
  }
}

export async function requestSmartSearch(
  input: SmartSearchInput,
  signal?: AbortSignal,
): Promise<SmartSearchResponse> {
  try {
    return await apiFetch<SmartSearchResponse>('/smart-search', {
      method: 'POST',
      body: { limit: 10, ...input },
      timeoutMs: SMART_SEARCH_TIMEOUT_MS,
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    throw toSmartSearchError(error);
  }
}

function toSmartSearchError(error: unknown): SmartSearchRequestError {
  if (error instanceof ApiError) {
    if (error.isNetworkError) {
      return error.message.includes('долго')
        ? new SmartSearchRequestError(
            'timeout',
            'Не удалось обработать запрос. Попробуйте ещё раз.',
          )
        : new SmartSearchRequestError('network', 'Нет соединения с интернетом.');
    }
    if (error.status === 429) {
      return new SmartSearchRequestError(
        'rate_limited',
        'Слишком много запросов подряд. Подождите минуту.',
      );
    }
  }
  return new SmartSearchRequestError('server', 'Не удалось обработать запрос. Попробуйте ещё раз.');
}

export type SmartSearchFeedbackInput = SmartSearchFeedbackRequest;

export function sendSmartSearchFeedback(
  input: SmartSearchFeedbackInput,
): Promise<SmartSearchFeedbackResponse> {
  return apiFetch<SmartSearchFeedbackResponse>('/smart-search/feedback', {
    method: 'POST',
    body: input,
  });
}
