import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@dagestan/shared';

import { RedisService } from '../../infra/redis/redis.service.js';
import { AppException } from '../errors/app.exception.js';

export interface RateLimitRule {
  /** Уникальное имя правила — попадает в ключ Redis и в логи */
  name: string;
  /** Сколько действий разрешено за окно */
  limit: number;
  /** Длительность окна в секундах */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Через сколько секунд счётчик обнулится */
  retryAfter: number;
}

/**
 * Ограничение частоты действий (rate limiting).
 *
 * Это третий слой защиты от DDoS из плана — уровень приложения. Он работает
 * даже тогда, когда атака слишком «умная» для внешнего фильтра: например,
 * когда с тысячи разных адресов приходят внешне легитимные запросы на
 * отправку SMS.
 *
 * Как считаем: фиксированное окно. Первый запрос в окне заводит счётчик со
 * сроком жизни windowSeconds, дальше счётчик растёт. Это дешевле скользящего
 * окна и для наших задач достаточно точно.
 *
 * Все счётчики живут в Redis, а не в памяти процесса — иначе при нескольких
 * копиях сервера каждая считала бы свой лимит, и общий лимит был бы кратно выше.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Проверяет и увеличивает счётчик. Не бросает исключение — возвращает решение.
   * Используйте, когда превышение лимита нужно обработать особым образом.
   */
  async check(rule: RateLimitRule, identifier: string): Promise<RateLimitResult> {
    const key = `rl:${rule.name}:${identifier}`;

    try {
      const { count, ttl } = await this.redis.incrementWithTtl(key, rule.windowSeconds);

      return {
        allowed: count <= rule.limit,
        remaining: Math.max(0, rule.limit - count),
        retryAfter: ttl,
      };
    } catch (err) {
      // Если Redis недоступен — пропускаем запрос, но громко жалуемся.
      // Отказывать всем пользователям из-за проблем с кешем хуже, чем
      // временно остаться без ограничения частоты.
      this.logger.error({ err, rule: rule.name }, 'Ограничение частоты недоступно: сбой Redis');
      return { allowed: true, remaining: rule.limit, retryAfter: 0 };
    }
  }

  /**
   * То же самое, но при превышении сразу отвечает клиенту ошибкой 429.
   * Основной способ применения.
   */
  async consume(rule: RateLimitRule, identifier: string, message?: string): Promise<void> {
    const result = await this.check(rule, identifier);

    if (!result.allowed) {
      this.logger.warn(
        { rule: rule.name, identifier: maskIdentifier(identifier) },
        'Превышено ограничение частоты',
      );
      throw AppException.rateLimited(
        message ?? 'Слишком много запросов. Повторите попытку позже.',
        result.retryAfter,
        ErrorCode.RATE_LIMITED,
      );
    }
  }

  /**
   * Проверяет лимит, НЕ увеличивая счётчик.
   * Нужно там, где считать нужно только успешные (или только неуспешные) попытки.
   */
  async peek(rule: RateLimitRule, identifier: string): Promise<number> {
    return this.redis.getCount(`rl:${rule.name}:${identifier}`);
  }

  /** Сбрасывает счётчик. Например, после успешного входа — счётчик неудач обнуляется. */
  async reset(rule: RateLimitRule, identifier: string): Promise<void> {
    await this.redis.del(`rl:${rule.name}:${identifier}`);
  }
}

/** Не пишем в логи полные телефоны и адреса — только достаточное для расследования. */
function maskIdentifier(identifier: string): string {
  if (identifier.startsWith('+')) {
    return identifier.slice(0, identifier.length - 4) + '****';
  }
  return identifier;
}
