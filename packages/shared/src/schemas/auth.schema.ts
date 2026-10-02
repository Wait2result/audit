/**
 * Схемы авторизации и регистрации (пункт 6 ТЗ).
 *
 * Сценарий регистрации:
 *   1. request-code  → сервер шлёт SMS с кодом
 *   2. verify-code   → сервер проверяет код и выдаёт временный «пропуск на регистрацию»
 *   3. complete      → пользователь придумывает пароль, аккаунт создан
 *
 * Почему на шаге 2 выдаётся отдельный временный токен, а не «код + пароль одним
 * запросом»: код из SMS после проверки сразу сгорает. Иначе один и тот же код
 * можно было бы использовать повторно, а это дыра в безопасности.
 */

import { z } from 'zod';
import { otpCodeSchema, passwordSchema, phoneSchema } from './common.schema.js';

/** Информация об устройстве — нужна для push-уведомлений и разбора инцидентов. */
export const deviceInfoSchema = z.object({
  /** Постоянный идентификатор установки приложения */
  deviceId: z.string().min(1).max(200),
  platform: z.enum(['ios', 'android', 'web']),
  /** Модель устройства, например «iPhone 15 Pro» */
  model: z.string().max(120).optional(),
  osVersion: z.string().max(60).optional(),
  appVersion: z.string().max(40).optional(),
  /** Токен для push-уведомлений, если пользователь их разрешил */
  pushToken: z.string().max(500).optional(),
});

export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

// ── Шаг 1: запрос кода ───────────────────────────────────────────────────────

export const requestOtpSchema = z.object({
  phone: phoneSchema,
  /** Зачем запрашивается код — от этого зависят проверки на сервере */
  purpose: z.enum(['registration', 'password_reset', 'phone_change']),
});

export type RequestOtpDto = z.infer<typeof requestOtpSchema>;

export interface RequestOtpResponse {
  /** Через сколько секунд можно запросить код повторно */
  cooldownSeconds: number;
  /** Сколько секунд действует высланный код */
  expiresInSeconds: number;
  /** Номер в замаскированном виде — чтобы показать «код отправлен на +7 928 ***-**-00» */
  maskedPhone: string;
  /**
   * ТОЛЬКО в режиме разработки: сам код, чтобы не подключать SMS на этапе разработки.
   * В production это поле никогда не заполняется.
   */
  devCode?: string;
}

// ── Шаг 2: проверка кода ─────────────────────────────────────────────────────

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
  purpose: z.enum(['registration', 'password_reset', 'phone_change']),
});

export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;

export interface VerifyOtpResponse {
  /** Одноразовый временный токен, подтверждающий: этот номер только что проверен */
  verificationToken: string;
  expiresInSeconds: number;
}

// ── Шаг 3: завершение регистрации ────────────────────────────────────────────

export const completeRegistrationSchema = z.object({
  verificationToken: z.string().min(1),
  password: passwordSchema,
  firstName: z.string().trim().min(1, 'Укажите имя').max(60),
  lastName: z.string().trim().max(60).optional(),
  /** Город, выбранный на онбординге */
  cityId: z.uuid().optional(),
  device: deviceInfoSchema.optional(),
  /** Согласие с правилами и политикой конфиденциальности — обязательно по 152-ФЗ */
  acceptedTerms: z.literal(true, {
    error: 'Необходимо принять условия использования',
  }),
});

export type CompleteRegistrationDto = z.infer<typeof completeRegistrationSchema>;

// ── Вход ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Введите пароль'),
  device: deviceInfoSchema.optional(),
});

export type LoginDto = z.infer<typeof loginSchema>;

/**
 * Второй шаг входа для сотрудников с двухфакторной авторизацией.
 *
 * Присылается только код и временный «пропуск», выданный на первом шаге.
 * Телефон и пароль повторно не передаются — и это не только удобство:
 * пароль не должен лишний раз лежать в памяти страницы и уходить по сети.
 */
export const twoFactorLoginSchema = z.object({
  /** Временный пропуск, полученный в ответ на первый шаг */
  twoFactorToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'Код состоит из 6 цифр'),
  device: deviceInfoSchema.optional(),
});

export type TwoFactorLoginDto = z.infer<typeof twoFactorLoginSchema>;

// ── Обновление и завершение сессии ───────────────────────────────────────────

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

// ── Восстановление пароля ────────────────────────────────────────────────────

export const resetPasswordSchema = z.object({
  verificationToken: z.string().min(1),
  newPassword: passwordSchema,
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

// ── Ответ с токенами ─────────────────────────────────────────────────────────

export interface AuthTokens {
  /** Короткоживущий «пропуск» для обращений к API */
  accessToken: string;
  /** Долгоживущий токен, по которому выдаётся новый accessToken */
  refreshToken: string;
  /** Через сколько секунд истекает accessToken */
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface AuthenticatedUser {
  id: string;
  phone: string;
  firstName: string;
  lastName: string | null;
  avatarUrl: string | null;
  cityId: string | null;
  isVerified: boolean;
  roles: string[];
  permissions: string[];
}

export interface AuthResponse {
  user: AuthenticatedUser;
  tokens: AuthTokens;
}

/**
 * Ответ на попытку входа.
 *
 * Вход может завершиться двумя разными способами, и клиенту нужно их различать:
 *   ok            — телефон и пароль верны, сессия открыта
 *   2fa_required  — телефон и пароль верны, но нужен второй фактор
 *
 * Второй случай — НЕ ошибка: пользователь всё ввёл правильно, просто вход
 * состоит из двух шагов. Поэтому он приходит обычным успешным ответом,
 * а не сообщением об ошибке.
 */
export type LoginResponse = ({ status: 'ok' } & AuthResponse) | TwoFactorRequiredResponse;

export interface TwoFactorRequiredResponse {
  status: '2fa_required';
  /** Временный пропуск для второго шага. Живёт несколько минут и одноразовый. */
  twoFactorToken: string;
  expiresInSeconds: number;
  /** Замаскированный номер — чтобы показать, на какой аккаунт идёт вход */
  maskedPhone: string;
}
