import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LISTING_LIFETIME_DAYS, ListingArchiveReason } from '@dagestan/shared';

import { ModerationStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

/**
 * Ночная уборка ленты: объявления, у которых вышел срок.
 *
 * Срок нужен не ради порядка в базе, а ради доверия к ленте. Доска, где
 * половина объявлений продана полгода назад, перестаёт работать: человек
 * звонит по пяти номерам и слышит «уже продал». Поэтому объявление живёт
 * тридцать дней, а дальше уходит в архив, откуда автор возвращает его одной
 * кнопкой — то есть подтверждает, что оно ещё актуально.
 *
 * Архив, а не удаление: объявление остаётся у автора в кабинете со всей
 * статистикой, и вернуть его — одно нажатие, а не заполнение формы заново.
 *
 * Время — три часа ночи: в этот час ленту почти никто не читает, и если
 * уборка на секунду притормозит базу, этого никто не заметит.
 */
@Injectable()
export class ListingsArchiveTask {
  private readonly logger = new Logger(ListingsArchiveTask.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *', { name: 'listings-archive' })
  async archiveExpired(): Promise<void> {
    const now = new Date();

    const archived = await this.prisma.listing.updateMany({
      where: {
        status: ModerationStatus.approved,
        deletedAt: null,
        expiresAt: { lte: now },
      },
      data: {
        status: ModerationStatus.archived,
        archiveReason: ListingArchiveReason.EXPIRED,
        statusChangedAt: now,
      },
    });

    if (archived.count > 0) {
      this.logger.log(`В архив по сроку (${LISTING_LIFETIME_DAYS} дн.): ${archived.count} объявл.`);
    }
  }
}
