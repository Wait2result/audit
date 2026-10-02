import { ErrorCode, type ApiErrorBody, type AuthTokens } from '@dagestan/shared';

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config';
import { StorageKey, secureStorage } from './storage';

/**
 * Туннели для разработки (когда сервер тоже приходится пробрасывать в
 * интернет — например, чтобы открыть приложение в Expo Go без общего Wi-Fi)
 * показывают первому посетителю межстраничную заглушку с предупреждением,
 * отсекая случайных гостей. Вместо JSON приходит HTML, и падает любой экран.
 * Эти заголовки её отключают. В бою ни один из них не подставляется.
 */
export const TUNNEL_HEADERS: Record<string, string> = API_BASE_URL.includes('.loca.lt')
  ? { 'Bypass-Tunnel-Reminder': 'true' }
  : API_BASE_URL.includes('.ngrok-free.') || API_BASE_URL.includes('.ngrok.io')
    ? { 'ngrok-skip-browser-warning': 'true' }
    : {};

/** Совместимость с прежним именем внутри этого файла. */
const EXTRA_HEADERS = TUNNEL_HEADERS;

/**
 * Обращение к серверу API.
 *
 * Берёт на себя три вещи, которые иначе пришлось бы повторять на каждом экране:
 *   • подставляет токен доступа;
 *   • сам обновляет просроченный токен и повторяет запрос;
 *   • приводит любые сбои к одному понятному типу ошибки.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Нет сети или сервер недоступен — это не ошибка пользователя. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Не подставлять токен и не пытаться обновлять сессию */
  anonymous?: boolean;
  /** Дополнительные заголовки: например, Idempotency-Key при оформлении заказа */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Обновление токена выполняется строго по одному за раз.
 *
 * Иначе при запуске приложения пять экранов одновременно получают 401,
 * пять раз параллельно обновляют сессию, и четыре из пяти новых токенов
 * тут же становятся недействительными — сервер считает их повторным
 * использованием и, по правилам защиты от кражи, гасит всю цепочку сессий.
 * Пользователь при этом просто «вылетает» из аккаунта без причины.
 */
let refreshInFlight: Promise<AuthTokens | null> | null = null;

/** Вызывается, когда сессия окончательно потеряна: приложение выходит из аккаунта. */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/**
 * Вызывается, когда сохранённого на устройстве города больше нет на сервере
 * или он отключён.
 *
 * Без этого приложение оказывается в тупике, из которого человек не может
 * выйти сам: название города показывается из памяти устройства, экран
 * выглядит обычным, но каждый запрос за данными отвечает «город не найден».
 * Так бывает и когда город отключают через панель управления, и когда базу
 * пересоздают заново — в обоих случаях у города новый идентификатор.
 */
let onCityGone: (() => void) | null = null;

export function setCityGoneHandler(handler: (() => void) | null): void {
  onCityGone = handler;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await performRequest(path, options);

  // Токен просрочен — пробуем обновить и повторить запрос ровно один раз
  if (response.status === 401 && !options.anonymous) {
    const tokens = await refreshSession();

    if (!tokens) {
      onSessionExpired?.();
      throw await toApiError(response);
    }

    const retried = await performRequest(path, options);
    if (!retried.ok) throw await fail(retried);
    return parseBody<T>(retried);
  }

  if (!response.ok) throw await fail(response);
  return parseBody<T>(response);
}

/** Превращает неуспешный ответ в ошибку, попутно замечая пропавший город. */
async function fail(response: Response): Promise<ApiError> {
  const error = await toApiError(response);

  if (error.code === ErrorCode.CITY_NOT_FOUND || error.code === ErrorCode.CITY_INACTIVE) {
    onCityGone?.();
  }

  return error;
}

async function performRequest(path: string, options: RequestOptions): Promise<Response> {
  const token = options.anonymous ? null : await secureStorage.get(StorageKey.ACCESS_TOKEN);

  // Ограничение времени ожидания: сигнал прерывания срабатывает сам
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...EXTRA_HEADERS,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal,
    });
  } catch (err) {
    // Различаем «нет сети» и «сервер долго не отвечает»: сообщения разные,
    // и действия пользователя тоже разные.
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      timedOut
        ? 'Сервер долго не отвечает. Проверьте соединение и попробуйте снова.'
        : 'Нет соединения с интернетом.',
    );
  }
}

/** Обновляет сессию. Возвращает null, если это уже невозможно. */
async function refreshSession(): Promise<AuthTokens | null> {
  refreshInFlight ??= (async () => {
    try {
      const refreshToken = await secureStorage.get(StorageKey.REFRESH_TOKEN);
      if (!refreshToken) return null;

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { ...EXTRA_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        await clearTokens();
        return null;
      }

      const data = (await response.json()) as { tokens: AuthTokens };
      await saveTokens(data.tokens);
      return data.tokens;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    /* сервер ответил не в формате JSON */
  }

  return new ApiError(
    response.status,
    body?.code ?? 'UNKNOWN',
    body?.message ?? 'Что-то пошло не так. Попробуйте позже.',
    body?.details,
    body?.retryAfter,
  );
}

async function parseBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ── Токены ──────────────────────────────────────────────────────────────────

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  await secureStorage.set(StorageKey.ACCESS_TOKEN, tokens.accessToken);
  await secureStorage.set(StorageKey.REFRESH_TOKEN, tokens.refreshToken);
}

export async function clearTokens(): Promise<void> {
  await secureStorage.remove(StorageKey.ACCESS_TOKEN);
  await secureStorage.remove(StorageKey.REFRESH_TOKEN);
}

export async function hasSession(): Promise<boolean> {
  return (await secureStorage.get(StorageKey.REFRESH_TOKEN)) !== null;
}
