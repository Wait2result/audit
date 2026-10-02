import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ErrorCode, type Permission } from '@dagestan/shared';

import { PERMISSIONS_KEY } from '../decorators/index.js';
import { AppException } from '../errors/app.exception.js';
import type { RequestUser } from '../types/request-user.js';

/**
 * Проверка прав доступа (пункт 28 ТЗ).
 *
 * Работает после JwtAuthGuard: к этому моменту в запросе уже есть данные
 * пользователя с его списком прав.
 *
 * Ключевой момент: это проверка НА СЕРВЕРЕ. Скрытие кнопки в интерфейсе
 * админки — удобство, а не защита: запрос можно отправить и без интерфейса.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: RequestUser }>();
    const user = request.user;

    if (!user) {
      throw AppException.unauthorized('Требуется авторизация', ErrorCode.UNAUTHORIZED);
    }

    const granted = new Set(user.permissions);
    const missing = required.filter((permission) => !granted.has(permission));

    if (missing.length > 0) {
      // Попытки доступа к закрытым разделам логируются: серия таких записей —
      // признак либо ошибки в интерфейсе, либо разведки перед атакой.
      this.logger.warn(
        { userId: user.id, url: request.url, missing },
        'Отказано в доступе: недостаточно прав',
      );
      throw AppException.forbidden('Недостаточно прав для выполнения действия');
    }

    return true;
  }
}
