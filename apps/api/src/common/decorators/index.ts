import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Permission } from '@dagestan/shared';

import type { RequestUser } from '../types/request-user.js';

/**
 * Метки (метаданные) на методах контроллеров.
 *
 * Как это работает: декоратор вешает на метод пометку, а глобальный «страж»
 * (guard) перед вызовом метода читает её и решает, пропускать запрос или нет.
 */

// ─────────────────────────────────────────────────────────────────────────────

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Помечает эндпоинт как доступный без авторизации.
 *
 * Важное архитектурное решение: проверка авторизации включена ГЛОБАЛЬНО, и
 * открытость нужно указывать явно. Обратный подход («по умолчанию открыто,
 * закрываем что нужно») рано или поздно приводит к забытому эндпоинту с
 * чужими персональными данными.
 *
 * Пункт 6 ТЗ: просмотр погоды, кино, новостей и каталогов доступен без аккаунта.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Требует наличия перечисленных прав. Нужны ВСЕ указанные.
 *
 *   @RequirePermissions(Permission.USERS_BLOCK)
 *   blockUser() { ... }
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

// ─────────────────────────────────────────────────────────────────────────────

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitMetadata {
  limit: number;
  windowSeconds: number;
  /** По чему считать: адрес устройства, пользователь или их сочетание */
  scope?: 'ip' | 'user' | 'ip+user';
}

/**
 * Индивидуальное ограничение частоты для конкретного эндпоинта.
 * Если не указано, применяется общий лимит из настроек.
 */
export const RateLimit = (metadata: RateLimitMetadata) => SetMetadata(RATE_LIMIT_KEY, metadata);

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Подставляет в аргумент метода данные текущего пользователя:
 *
 *   getProfile(@CurrentUser() user: RequestUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (field: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user?: RequestUser }>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);

/** Идентификатор запроса — для сквозной трассировки в логах. */
export const RequestId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<FastifyRequest>();
  return (request as { id?: string }).id;
});
