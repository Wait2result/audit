'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  loginSchema,
  type AuthResponse,
  type AuthTokens,
  type AuthenticatedUser,
  type LoginResponse,
} from '@dagestan/shared';

import { apiFetchAnonymous } from '@/lib/api';
import { readField } from '@/lib/form';
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions } from '@/lib/session';

export interface LoginState {
  error?: string;
  /** Поле, в котором ошибка, — чтобы подсветить его в форме */
  field?: 'phone' | 'password' | 'code';
  /**
   * Пока заполнено — форма показывает ввод кода вместо телефона и пароля.
   * Пусто — форма показывает первый шаг.
   */
  challenge?: {
    token: string;
    maskedPhone: string;
  };
}

/**
 * Вход в панель управления.
 *
 * Один обработчик на оба шага: сервер сам понимает, какой шаг перед ним,
 * по наличию пропуска в форме. Благодаря этому экран определяется
 * исключительно ответом сервера — в браузере не хранится ничего, что могло
 * бы разойтись с действительностью.
 *
 * Выполняется на сервере Next.js («серверное действие»): пароль уходит
 * с формы прямо на сервер панели и оттуда на API. В коде, который работает
 * в браузере, нет ни пароля, ни токенов, ни адреса API.
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const next = readField(formData, 'next') || '/';
  const twoFactorToken = readField(formData, 'twoFactorToken');

  return twoFactorToken
    ? completeWithCode(formData, twoFactorToken, next)
    : startWithPassword(formData, next);
}

/** Шаг 1: телефон и пароль. */
async function startWithPassword(formData: FormData, next: string): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    phone: readField(formData, 'phone'),
    password: readField(formData, 'password'),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue?.message ?? 'Проверьте введённые данные',
      field: (issue?.path[0] as LoginState['field']) ?? 'phone',
    };
  }

  const result = await apiFetchAnonymous<LoginResponse>('/auth/login', parsed.data);

  if (!result.ok) {
    return {
      error: result.error.message,
      field: result.error.code === 'AUTH_INVALID_CREDENTIALS' ? 'password' : 'phone',
    };
  }

  // Второй фактор включён — переходим на второй шаг. Телефон и пароль
  // больше не понадобятся: их заменяет одноразовый пропуск.
  if (result.data.status === '2fa_required') {
    return {
      challenge: {
        token: result.data.twoFactorToken,
        maskedPhone: result.data.maskedPhone,
      },
    };
  }

  return finishLogin(result.data, next);
}

/** Шаг 2: код из приложения-аутентификатора. */
async function completeWithCode(
  formData: FormData,
  token: string,
  next: string,
): Promise<LoginState> {
  const code = readField(formData, 'code');
  const challenge = { token, maskedPhone: readField(formData, 'maskedPhone') };

  if (!/^\d{6}$/.test(code)) {
    return { error: 'Введите шесть цифр из приложения', field: 'code', challenge };
  }

  const result = await apiFetchAnonymous<AuthResponse>('/auth/login/2fa', {
    twoFactorToken: token,
    code,
  });

  if (result.ok) {
    return finishLogin(result.data, next);
  }

  // Пропуск истёк или израсходован: возвращаем состояние БЕЗ пропуска —
  // форма сама вернётся к первому шагу. Иначе человек продолжал бы вводить
  // коды в форму, которая уже ничего не может подтвердить.
  const challengeGone =
    result.error.code === 'AUTH_TOKEN_EXPIRED' || result.error.message.includes('Войдите заново');

  return challengeGone
    ? { error: result.error.message, field: 'phone' }
    : { error: result.error.message, field: 'code', challenge };
}

/** Общий финал обоих путей: сохранить сессию и перейти в панель. */
async function finishLogin(
  auth: { user: AuthenticatedUser; tokens: AuthTokens },
  next: string,
): Promise<LoginState> {
  // В панель пускаем только сотрудников. Обычный пользователь приложения,
  // знающий свой пароль, не должен получить сюда доступ даже к пустому экрану.
  const isStaff = auth.user.roles.some((role) => role !== 'user' && role !== 'partner');
  if (!isStaff) {
    return { error: 'У этой учётной записи нет доступа к панели управления', field: 'phone' };
  }

  const store = await cookies();
  store.set(ACCESS_COOKIE, auth.tokens.accessToken, {
    ...cookieOptions,
    maxAge: auth.tokens.expiresIn,
  });
  store.set(REFRESH_COOKIE, auth.tokens.refreshToken, {
    ...cookieOptions,
    maxAge: 30 * 24 * 3600,
  });

  // Возвращаем человека туда, куда он изначально шёл. Проверка на «/» в начале
  // обязательна: без неё в параметре next можно передать чужой адрес и увести
  // сотрудника на поддельную страницу входа.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

/** Выход: гасим сессию на сервере и стираем cookie. */
export async function logout(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    // Токен гасится и на сервере API, а не только у нас: иначе украденный
    // ранее токен продолжал бы работать ещё месяц.
    await apiFetchAnonymous('/auth/logout', { refreshToken });
  }

  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);

  redirect('/login');
}
