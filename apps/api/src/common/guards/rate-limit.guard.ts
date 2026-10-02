import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { RATE_LIMIT_KEY, type RateLimitMetadata } from '../decorators/index.js';
import { RateLimitService } from '../rate-limit/rate-limit.service.js';
import type { RequestUser } from '../types/request-user.js';

/**
 * Общее ограничение частоты запросов — второй рубеж защиты от DDoS
 * на уровне приложения.
 *
 * По умолчанию действует общий лимит из настроек (RATE_LIMIT_GLOBAL_PER_MINUTE)
 * для каждого IP-адреса. Отдельным эндпоинтам можно задать свой лимит
 * декоратором @RateLimit({...}) — например, отправка SMS ограничена гораздо
 * строже, потому что каждая SMS стоит денег.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: RequestUser }>();

    const custom = this.reflector.getAllAndOverride<RateLimitMetadata>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const routeName = `${request.method}:${request.routeOptions?.url ?? request.url}`;

    if (custom) {
      const identifier = buildIdentifier(custom.scope ?? 'ip', request);
      await this.rateLimit.consume(
        {
          name: `route:${routeName}`,
          limit: custom.limit,
          windowSeconds: custom.windowSeconds,
        },
        identifier,
      );
      return true;
    }

    await this.rateLimit.consume(
      {
        name: 'global',
        limit: this.config.RATE_LIMIT_GLOBAL_PER_MINUTE,
        windowSeconds: 60,
      },
      clientIp(request),
    );

    return true;
  }
}

function buildIdentifier(
  scope: NonNullable<RateLimitMetadata['scope']>,
  request: FastifyRequest & { user?: RequestUser },
): string {
  const ip = clientIp(request);
  const userId = request.user?.id;

  switch (scope) {
    case 'user':
      // Неавторизованного считаем по адресу — иначе лимит вообще не применялся бы
      return userId ? `u:${userId}` : `ip:${ip}`;
    case 'ip+user':
      return userId ? `ip:${ip}|u:${userId}` : `ip:${ip}`;
    case 'ip':
    default:
      return `ip:${ip}`;
  }
}

/**
 * Адрес клиента.
 *
 * ВАЖНО: request.ip берёт адрес из заголовка X-Forwarded-For только если
 * в main.ts включён режим доверия прокси, и доверять нужно ТОЛЬКО адресам
 * собственного обратного прокси. Если доверять заголовку от кого угодно,
 * злоумышленник подставит произвольный адрес и обойдёт все лимиты.
 */
function clientIp(request: FastifyRequest): string {
  return request.ip || 'unknown';
}
