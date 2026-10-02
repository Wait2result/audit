import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';
import { ErrorCode } from '@dagestan/shared';

import { IS_PUBLIC_KEY } from '../decorators/index.js';
import { AppException } from '../errors/app.exception.js';
import type { AccessTokenPayload, RequestUser } from '../types/request-user.js';

/**
 * Проверка токена доступа.
 *
 * Включён ГЛОБАЛЬНО: по умолчанию закрыт каждый эндпоинт, открытые помечаются
 * декоратором @Public(). Так забытая проверка приводит к «ошибке в безопасную
 * сторону» — эндпоинт окажется закрытым, а не открытым всему интернету.
 *
 * Для публичных эндпоинтов токен всё равно разбирается, если он прислан:
 * это позволяет одному и тому же списку ресторанов показывать звёздочку
 * «в избранном» авторизованному пользователю и не показывать гостю.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: RequestUser }>();
    const token = extractBearerToken(request);

    if (!token) {
      if (isPublic) return true;
      throw AppException.unauthorized('Требуется авторизация', ErrorCode.UNAUTHORIZED);
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);

      request.user = {
        id: payload.sub,
        phone: payload.phone,
        roles: payload.roles ?? [],
        permissions: payload.perms ?? [],
        tokenId: payload.jti,
        ...(payload.partnerId ? { partnerId: payload.partnerId } : {}),
      };

      return true;
    } catch (err) {
      // На публичном эндпоинте просроченный токен не должен мешать
      // просто посмотреть контент.
      if (isPublic) return true;

      const expired = err instanceof Error && err.name === 'TokenExpiredError';
      throw AppException.unauthorized(
        expired ? 'Срок действия токена истёк' : 'Некорректный токен',
        expired ? ErrorCode.AUTH_TOKEN_EXPIRED : ErrorCode.AUTH_TOKEN_INVALID,
      );
    }
  }
}

function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;

  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'bearer') return null;

  return value.trim() || null;
}
