import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { ModerationStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';

/**
 * Счётчик просмотров объявления.
 *
 * Просмотр — это человек, а не открытие страницы. Поэтому:
 *   - один и тот же зритель засчитывается раз в сутки на объявление:
 *     вошедший — по аккаунту, гость — по отпечатку адреса и браузера;
 *   - свои просмотры не считаются (это решает вызывающий код: он знает,
 *     чьё объявление);
 *   - с одного адреса засчитывается не больше VIEWS_PER_IP_HOUR в час —
 *     скрипт, перебирающий объявления, не накрутит цифры всем подряд.
 *
 * Адрес в ключах не хранится в открытом виде — только хэш.
 */

/** На сколько засчитанный просмотр «запоминается» за зрителем. */
export const VIEW_DEDUPE_SECONDS = 24 * 60 * 60;
/** Сколько разных объявлений в час может засчитать один адрес. */
export const VIEWS_PER_IP_HOUR = 300;

export interface Viewer {
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** Кто смотрит — для ключа дедупликации. null — определить нельзя. */
export function viewerId(viewer: Viewer): string | null {
  if (viewer.userId) return `u:${viewer.userId}`;
  if (!viewer.ip) return null;
  return `g:${fingerprint(`${viewer.ip}|${viewer.userAgent ?? ''}`)}`;
}

export function viewKey(listingId: string, viewer: string): string {
  return `lv:${listingId}:${viewer}`;
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

@Injectable()
export class ListingViewsService {
  private readonly logger = new Logger(ListingViewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Засчитать просмотр. true — засчитан, false — повтор или лимит. */
  async count(listingId: string, viewer: Viewer): Promise<boolean> {
    const id = viewerId(viewer);
    if (!id) return false;

    try {
      if (viewer.ip) {
        const { count } = await this.redis.incrementWithTtl(
          `lv:ip:${fingerprint(viewer.ip)}`,
          60 * 60,
        );
        if (count > VIEWS_PER_IP_HOUR) return false;
      }
      const fresh = await this.redis.setIfAbsent(viewKey(listingId, id), VIEW_DEDUPE_SECONDS);
      if (!fresh) return false;
    } catch (error) {
      // Без Redis просмотры не считаем вовсе: лучше недосчитать, чем
      // засчитывать каждое обновление страницы
      this.logger.warn(`Просмотр не засчитан: ${(error as Error).message}`);
      return false;
    }

    const result = await this.prisma.listing.updateMany({
      where: { id: listingId, deletedAt: null, status: ModerationStatus.approved },
      data: { viewsCount: { increment: 1 } },
    });
    return result.count > 0;
  }
}
