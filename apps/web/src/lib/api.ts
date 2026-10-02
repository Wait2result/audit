import { redirect } from 'next/navigation';
import type { ApiErrorBody } from '@dagestan/shared';

import { getAccessToken } from './session';

/**
 * Обращение к серверу API из панели управления.
 *
 * Выполняется ТОЛЬКО на сервере Next.js, никогда в браузере. Благодаря
 * этому адрес API и токен доступа не попадают в код страницы: браузер
 * пользователя обращается только к панели, а панель — к API.
 */

export const API_URL = process.env.API_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /**
   * Сколько секунд держать ответ в кеше Next.js.
   * По умолчанию кеш выключен: панель должна показывать текущее состояние,
   * а не то, что было минуту назад.
   */
  revalidate?: number;
  /** Не перенаправлять на страницу входа при 401 — нужно самой странице входа */
  skipAuthRedirect?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    ...(options.revalidate !== undefined
      ? { next: { revalidate: options.revalidate } }
      : { cache: 'no-store' }),
  });

  if (response.status === 401 && !options.skipAuthRedirect) {
    // Сессия истекла или была отозвана — отправляем на вход.
    redirect('/login?reason=expired');
  }

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      /* тело ответа не в формате JSON */
    }

    throw new ApiError(
      response.status,
      body?.code ?? 'UNKNOWN',
      body?.message ?? `Ошибка запроса (${response.status})`,
      body?.details,
    );
  }

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

/**
 * Запрос без токена — для страницы входа.
 * Возвращает и данные, и статус: странице входа нужно различать
 * «неверный пароль» и «сервер недоступен».
 */
export async function apiFetchAnonymous<T>(
  path: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: ApiErrorBody }> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const json: unknown = await response.json();

    if (!response.ok) {
      return { ok: false, error: json as ApiErrorBody };
    }
    return { ok: true, data: json as T };
  } catch {
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Сервер недоступен. Проверьте, что он запущен.',
        requestId: '',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
