import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  OrderStatus,
  type PaginatedResponse,
  type PlaceReviewDto,
  type PlaceReviewsDto,
  type ReplyReviewDto,
  type ReviewListQuery,
  type UpsertReviewDto,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PlaceAccessService } from './place-access.service.js';

interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

const REVIEW_SELECT = {
  id: true,
  userId: true,
  rating: true,
  text: true,
  reply: true,
  createdAt: true,
  user: { select: { firstName: true } },
} satisfies Prisma.PlaceReviewSelect;

type ReviewRow = Prisma.PlaceReviewGetPayload<{ select: typeof REVIEW_SELECT }>;

/**
 * Отзывы о заведениях (Этап 6).
 *
 * Главное правило: отзыв можно оставить только после выполненного заказа
 * в этом заведении. Оценка влияет на выручку, и без такой привязки рейтинг
 * становится оружием — несколько аккаунтов утопят конкурента, ни разу у него
 * ничего не купив.
 *
 * Средний рейтинг пересчитывается при каждой правке и хранится прямо в
 * заведении: списки грузятся часто, и считать среднее по всем отзывам
 * на каждый запрос ленты — лишняя работа для базы.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: PlaceAccessService,
  ) {}

  /** Отзывы заведения вместе со сводкой — один запрос для карточки. */
  async forPlace(
    placeId: string,
    query: ReviewListQuery,
    userId?: string,
  ): Promise<PlaceReviewsDto> {
    const place = await this.prisma.place.findFirst({
      where: { id: placeId, deletedAt: null },
      select: { ratingAverage: true, ratingCount: true },
    });

    if (!place) {
      throw AppException.notFound('Заведение не найдено', ErrorCode.PLACE_NOT_FOUND);
    }

    const visible: Prisma.PlaceReviewWhereInput = { placeId, deletedAt: null, isHidden: false };

    const [rows, grouped, myReview] = await Promise.all([
      this.prisma.placeReview.findMany({
        where: { ...visible, ...(query.rating ? { rating: query.rating } : {}) },
        take: query.limit,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: REVIEW_SELECT,
      }),
      this.prisma.placeReview.groupBy({
        by: ['rating'],
        where: visible,
        _count: { rating: true },
      }),
      userId
        ? this.prisma.placeReview.findUnique({
            where: { placeId_userId: { placeId, userId } },
            select: REVIEW_SELECT,
          })
        : null,
    ]);

    // Полоски в карточке рисуются всегда для всех пяти оценок, включая нули:
    // пропуск строки «2 звезды» читается как «таких отзывов не бывает»
    const breakdown = [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: grouped.find((row) => row.rating === rating)?._count.rating ?? 0,
    }));

    return {
      rating: {
        average: Math.round(place.ratingAverage * 10) / 10,
        count: place.ratingCount,
      },
      breakdown,
      canReview: userId ? await this.hasCompletedOrder(placeId, userId) : false,
      myReview: myReview ? toReviewDto(myReview, userId) : null,
      items: rows.map((row) => toReviewDto(row, userId)),
    };
  }

  /** Страница отзывов — «показать ещё» в списке. */
  async page(
    placeId: string,
    query: ReviewListQuery,
    userId?: string,
  ): Promise<PaginatedResponse<PlaceReviewDto>> {
    const rows = await this.prisma.placeReview.findMany({
      where: {
        placeId,
        deletedAt: null,
        isHidden: false,
        ...(query.rating ? { rating: query.rating } : {}),
      },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: REVIEW_SELECT,
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: items.map((row) => toReviewDto(row, userId)),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  /**
   * Оставить или изменить свой отзыв.
   *
   * Отзыв один на человека и заведение: второй заказ правит существующую
   * оценку, а не добавляет вторую. Иначе постоянный клиент своими десятью
   * заказами перевесил бы десять разных людей.
   */
  async upsert(placeId: string, userId: string, dto: UpsertReviewDto): Promise<PlaceReviewDto> {
    if (!(await this.hasCompletedOrder(placeId, userId))) {
      throw AppException.forbidden(
        'Отзыв можно оставить после выполненного заказа в этом заведении',
        ErrorCode.REVIEW_NOT_ALLOWED,
      );
    }

    const review = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.placeReview.upsert({
        where: { placeId_userId: { placeId, userId } },
        create: { placeId, userId, rating: dto.rating, text: dto.text ?? null },
        // Правка отзыва снимает ответ заведения: ответ был написан на другой
        // текст, и оставлять его под новым — подлог
        update: { rating: dto.rating, text: dto.text ?? null, reply: null, repliedAt: null },
        select: REVIEW_SELECT,
      });

      await recalculate(tx, placeId);

      return saved;
    });

    return toReviewDto(review, userId);
  }

  /** Убрать свой отзыв. */
  async remove(placeId: string, userId: string): Promise<void> {
    const review = await this.prisma.placeReview.findUnique({
      where: { placeId_userId: { placeId, userId } },
      select: { id: true },
    });

    if (!review) {
      throw AppException.notFound('Отзыв не найден', ErrorCode.REVIEW_NOT_FOUND);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.placeReview.delete({ where: { id: review.id } });
      await recalculate(tx, placeId);
    });
  }

  /** Ответ заведения. Пишет управляющий из кабинета. */
  async reply(reviewId: string, userId: string, dto: ReplyReviewDto): Promise<PlaceReviewDto> {
    const review = await this.prisma.placeReview.findFirst({
      where: { id: reviewId, deletedAt: null },
      select: { id: true, placeId: true },
    });

    if (!review) {
      throw AppException.notFound('Отзыв не найден', ErrorCode.REVIEW_NOT_FOUND);
    }

    await this.access.assertAccess(userId, review.placeId, true);

    const saved = await this.prisma.placeReview.update({
      where: { id: review.id },
      data: { reply: dto.reply, repliedAt: new Date() },
      select: REVIEW_SELECT,
    });

    return toReviewDto(saved, userId);
  }

  // ── Модерация из панели ───────────────────────────────────────────────────

  async listForAdmin(
    pagination: { cursor?: string; limit: number },
    includeHidden: boolean,
  ): Promise<PaginatedResponse<PlaceReviewDto & { placeName: string; isHidden: boolean }>> {
    const rows = await this.prisma.placeReview.findMany({
      where: { deletedAt: null, ...(includeHidden ? {} : { isHidden: false }) },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { ...REVIEW_SELECT, isHidden: true, place: { select: { name: true } } },
    });

    const hasMore = rows.length > pagination.limit;
    const items = hasMore ? rows.slice(0, pagination.limit) : rows;

    return {
      items: items.map((row) => ({
        ...toReviewDto(row),
        placeName: row.place.name,
        isHidden: row.isHidden,
      })),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  /** Скрытый отзыв остаётся в базе, но не показывается и не влияет на рейтинг. */
  async setHidden(
    reviewId: string,
    isHidden: boolean,
    actorId: string,
    context: AuditContext,
  ): Promise<void> {
    const review = await this.prisma.placeReview.findFirst({
      where: { id: reviewId, deletedAt: null },
      select: { id: true, placeId: true },
    });

    if (!review) {
      throw AppException.notFound('Отзыв не найден', ErrorCode.REVIEW_NOT_FOUND);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.placeReview.update({ where: { id: review.id }, data: { isHidden } });
      await recalculate(tx, review.placeId);
    });

    await this.audit.record({
      actorId,
      action: isHidden ? 'review.hide' : 'review.unhide',
      targetType: 'place_review',
      targetId: review.id,
      ...context,
    });
  }

  /**
   * Был ли у человека выполненный заказ в этом заведении.
   * Отменённые заказы права на отзыв не дают: заказ, который не состоялся,
   * ничего не говорит о еде.
   */
  private async hasCompletedOrder(placeId: string, userId: string): Promise<boolean> {
    const order = await this.prisma.order.findFirst({
      where: { placeId, userId, status: OrderStatus.COMPLETED },
      select: { id: true },
    });

    return order !== null;
  }
}

/**
 * Пересчёт среднего и количества.
 *
 * Считается по видимым отзывам: скрытый модератором отзыв не должен тянуть
 * рейтинг вниз. Когда отзывов не осталось, среднее обнуляется — приложение
 * по `count === 0` показывает «Нет оценок», а не «0.0».
 */
async function recalculate(tx: Prisma.TransactionClient, placeId: string): Promise<void> {
  const stats = await tx.placeReview.aggregate({
    where: { placeId, deletedAt: null, isHidden: false },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await tx.place.update({
    where: { id: placeId },
    data: {
      ratingAverage: stats._avg.rating ?? 0,
      ratingCount: stats._count.rating,
    },
  });
}

function toReviewDto(row: ReviewRow, viewerId?: string): PlaceReviewDto {
  return {
    id: row.id,
    // Фамилию не показываем: отзыв о шашлыке не повод раскрывать личность
    authorName: row.user.firstName ?? 'Гость',
    rating: row.rating,
    text: row.text,
    reply: row.reply,
    createdAt: row.createdAt.toISOString(),
    isMine: viewerId !== undefined && row.userId === viewerId,
  };
}
