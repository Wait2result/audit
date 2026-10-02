import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  LISTING_AUTO_SUSPEND_REPORTS,
  LISTING_REPORT_REASON_LABELS,
  canModeratorTransition,
  type AdminListingsQuery,
  type CreateReportDto,
  type ListingAdminDto,
  type ListingReportDto,
  type MediaDto,
  type PaginatedResponse,
  type PromoteListingDto,
  type ResolveReportDto,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ListingReportStatus, ModerationStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';
import { ListingCategoriesService, type ListingCatalogue } from './listing-categories.service.js';
import { listingPlaceLabel } from './listing-location.js';
import { ListingsService } from './listings.service.js';

interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Модерация объявлений и жалобы.
 *
 * Объявления публикуются без предварительной проверки, поэтому вся защита —
 * здесь: жалоба от человека, автоматическое снятие при нескольких жалобах и
 * ручное решение сотрудника. Удаления нет: снятое остаётся в базе, иначе
 * спор «вы стёрли моё объявление» нечем закрыть.
 */
@Injectable()
export class ListingsModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly listings: ListingsService,
    private readonly categories: ListingCategoriesService,
  ) {}

  // ── Жалобы ────────────────────────────────────────────────────────────────

  /**
   * Жалоба на объявление. Одна на человека и объявление: иначе один обиженный
   * конкурент создаёт очередь из двадцати жалоб на одно и то же.
   */
  async report(listingId: string, userId: string, dto: CreateReportDto): Promise<void> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { id: true, sellerId: true, status: true, reportsCount: true },
    });

    if (!listing) {
      throw AppException.notFound('Объявление не найдено', ErrorCode.LISTING_NOT_FOUND);
    }

    if (listing.sellerId === userId) {
      throw AppException.badRequest('Это ваше объявление', ErrorCode.LISTING_REPORT_ALREADY_SENT);
    }

    const existing = await this.prisma.listingReport.findUnique({
      where: { listingId_reporterId: { listingId, reporterId: userId } },
      select: { id: true },
    });

    if (existing) {
      throw AppException.conflict(
        'Вы уже жаловались на это объявление',
        ErrorCode.LISTING_REPORT_ALREADY_SENT,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.listingReport.create({
        data: {
          listingId,
          reporterId: userId,
          reason: dto.reason,
          comment: dto.comment ?? null,
        },
      });

      const updated = await tx.listing.update({
        where: { id: listingId },
        data: { reportsCount: { increment: 1 } },
        select: { reportsCount: true, status: true },
      });

      // Сотрудник физически не успевает: мошенник соберёт звонки раньше, чем
      // кто-то проснётся. Снятие обратимо одной кнопкой, автор видит причину.
      const enough = updated.reportsCount >= LISTING_AUTO_SUSPEND_REPORTS;
      if (enough && updated.status === ModerationStatus.approved) {
        await tx.listing.update({
          where: { id: listingId },
          data: {
            status: ModerationStatus.suspended,
            statusReason: `Снято автоматически: несколько жалоб (${LISTING_REPORT_REASON_LABELS[dto.reason]})`,
            statusChangedAt: new Date(),
          },
        });
      }
    });

    const after = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { status: true, reportsCount: true },
    });

    if (after?.status === ModerationStatus.suspended && listing.status !== after.status) {
      // Действие системы, а не человека: actorId пуст
      await this.audit.record({
        action: 'listing.auto_suspend',
        targetType: 'listing',
        targetId: listingId,
        after: { reportsCount: after.reportsCount },
      });
    }
  }

  async reports(query: {
    cursor?: string;
    limit: number;
    onlyNew?: boolean;
  }): Promise<PaginatedResponse<ListingReportDto>> {
    const where: Prisma.ListingReportWhereInput = query.onlyNew
      ? { status: ListingReportStatus.new }
      : {};

    const rows = await this.prisma.listingReport.findMany({
      where,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: {
        listing: { select: { title: true, reportsCount: true } },
        reporter: { select: { firstName: true } },
      },
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: items.map((row) => ({
        id: row.id,
        listingId: row.listingId,
        listingTitle: row.listing.title,
        reason: row.reason,
        comment: row.comment,
        status: row.status,
        resolution: row.resolution,
        reporterName: row.reporter.firstName ?? 'Пользователь',
        createdAt: row.createdAt.toISOString(),
        listingReportsCount: row.listing.reportsCount,
      })),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  /**
   * Решение по жалобе. Подтверждение снимает объявление и закрывает разом все
   * жалобы на него: разбирать двадцать одинаковых по очереди незачем.
   */
  async resolveReport(
    reportId: string,
    dto: ResolveReportDto,
    actorId: string,
    context: AuditContext,
  ): Promise<void> {
    const report = await this.prisma.listingReport.findUnique({
      where: { id: reportId },
      select: { id: true, listingId: true, reason: true, status: true },
    });

    if (!report) {
      throw AppException.notFound('Жалоба не найдена', ErrorCode.LISTING_REPORT_NOT_FOUND);
    }

    const confirm = dto.action === 'confirm';
    const resolution = dto.comment ?? (confirm ? 'Жалоба подтверждена' : 'Жалоба не подтвердилась');

    await this.prisma.$transaction(async (tx) => {
      if (confirm) {
        await tx.listing.update({
          where: { id: report.listingId },
          data: {
            status: ModerationStatus.suspended,
            statusReason: `Снято по жалобе: ${LISTING_REPORT_REASON_LABELS[report.reason]}`,
            statusChangedAt: new Date(),
            statusChangedById: actorId,
          },
        });

        await tx.listingReport.updateMany({
          where: { listingId: report.listingId, status: ListingReportStatus.new },
          data: {
            status: ListingReportStatus.resolved,
            resolution,
            resolvedById: actorId,
            resolvedAt: new Date(),
          },
        });

        const listing = await tx.listing.findUnique({
          where: { id: report.listingId },
          select: { sellerId: true },
        });

        if (listing) {
          // Нарушение фиксируется у автора: три снятых объявления подряд —
          // это уже разговор о блокировке аккаунта, а не об одном объявлении
          await tx.userViolation.create({
            data: {
              userId: listing.sellerId,
              kind: `listing_${report.reason}`,
              severity: 1,
              targetType: 'listing',
              targetId: report.listingId,
            },
          });
        }
        return;
      }

      await tx.listingReport.update({
        where: { id: reportId },
        data: {
          status: ListingReportStatus.rejected,
          resolution,
          resolvedById: actorId,
          resolvedAt: new Date(),
        },
      });
    });

    await this.audit.record({
      actorId,
      action: confirm ? 'listing_report.confirm' : 'listing_report.reject',
      targetType: 'listing_report',
      targetId: reportId,
      after: { listingId: report.listingId, resolution },
      ...context,
    });
  }

  // ── Управление объявлением из панели ──────────────────────────────────────

  async adminList(query: AdminListingsQuery): Promise<PaginatedResponse<ListingAdminDto>> {
    const catalogue = await this.categories.catalogue();
    const where: Prisma.ListingWhereInput = {
      deletedAt: null,
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.reportedOnly ? { reports: { some: { status: ListingReportStatus.new } } } : {}),
      ...(query.needsReviewOnly ? { needsReview: true } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.listing.findMany({
      where,
      take: query.limit + 1,
      // Сначала те, на кого жалуются: очередь разбора — главный смысл раздела
      orderBy: [{ reportsCount: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        city: { select: { name: true } },
        category: { select: { name: true, slug: true } },
        district: { select: { name: true } },
        seller: {
          select: {
            id: true,
            firstName: true,
            phone: true,
            avatarId: true,
            createdAt: true,
            ratingAverage: true,
            ratingCount: true,
          },
        },
      },
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const covers = await this.coverMap(items.map((row) => row.coverMediaId));

    return {
      items: items.map((row) =>
        this.toAdminDto(row, covers.get(row.coverMediaId ?? '') ?? null, catalogue),
      ),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  /** Снять с публикации. Причина обязательна — её видит автор. */
  async suspend(
    listingId: string,
    reason: string,
    actorId: string,
    context: AuditContext,
  ): Promise<void> {
    await this.changeStatus(listingId, ModerationStatus.suspended, actorId, context, reason);
  }

  /** Вернуть снятое обратно в ленту. */
  async restore(listingId: string, actorId: string, context: AuditContext): Promise<void> {
    await this.changeStatus(listingId, ModerationStatus.approved, actorId, context, null);
  }

  /** Убрать из ленты без обвинения: устарело, продано, потеряло смысл. */
  async archive(listingId: string, actorId: string, context: AuditContext): Promise<void> {
    await this.changeStatus(listingId, ModerationStatus.archived, actorId, context, null);
  }

  private async changeStatus(
    listingId: string,
    next: ModerationStatus,
    actorId: string,
    context: AuditContext,
    reason: string | null,
  ): Promise<void> {
    const before = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { id: true, status: true, statusReason: true, reportsCount: true },
    });

    if (!before) {
      throw AppException.notFound('Объявление не найдено', ErrorCode.LISTING_NOT_FOUND);
    }

    if (before.status !== next && !canModeratorTransition(before.status, next)) {
      throw AppException.badRequest(
        'Такое изменение статуса недопустимо',
        ErrorCode.LISTING_INVALID_TRANSITION,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: listingId },
        data: {
          status: next,
          statusReason: reason,
          statusChangedAt: new Date(),
          statusChangedById: actorId,
          // Возврат в ленту закрывает и накопленные жалобы: иначе объявление
          // тут же снимется автоматически теми же тремя жалобами. Проверка
          // правок тоже закрыта — сотрудник только что всё посмотрел
          ...(next === ModerationStatus.approved ? { reportsCount: 0, needsReview: false } : {}),
        },
      });

      if (next === ModerationStatus.approved) {
        await tx.listingReport.updateMany({
          where: { listingId, status: ListingReportStatus.new },
          data: {
            status: ListingReportStatus.rejected,
            resolution: 'Объявление возвращено в ленту',
            resolvedById: actorId,
            resolvedAt: new Date(),
          },
        });
      }
    });

    await this.audit.record({
      actorId,
      action: `listing.${next}`,
      targetType: 'listing',
      targetId: listingId,
      before,
      after: { status: next, statusReason: reason },
      ...context,
    });
  }

  /** Перенос в другую категорию: типовое решение по жалобе «не та категория». */
  async changeCategory(
    listingId: string,
    categoryId: string,
    actorId: string,
    context: AuditContext,
  ): Promise<void> {
    const before = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { id: true, categoryId: true },
    });

    if (!before) {
      throw AppException.notFound('Объявление не найдено', ErrorCode.LISTING_NOT_FOUND);
    }

    const category = await this.prisma.listingCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true, isLeaf: true },
    });

    if (!category) {
      throw AppException.notFound('Категория не найдена', ErrorCode.LISTING_CATEGORY_NOT_FOUND);
    }

    if (!category.isLeaf) {
      throw AppException.badRequest(
        'В этот раздел нельзя переносить: выберите подкатегорию',
        ErrorCode.LISTING_CATEGORY_NOT_LEAF,
      );
    }

    await this.prisma.listing.update({ where: { id: listingId }, data: { categoryId } });

    await this.audit.record({
      actorId,
      action: 'listing.category_change',
      targetType: 'listing',
      targetId: listingId,
      before,
      after: { categoryId },
      ...context,
    });
  }

  /** Ручное поднятие из панели: то же «поднять», что доступно автору. */
  async bump(listingId: string, actorId: string, context: AuditContext): Promise<void> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { id: true, bumpedAt: true },
    });

    if (!listing) {
      throw AppException.notFound('Объявление не найдено', ErrorCode.LISTING_NOT_FOUND);
    }

    await this.prisma.listing.update({
      where: { id: listingId },
      data: { bumpedAt: new Date() },
    });

    await this.audit.record({
      actorId,
      action: 'listing.bump',
      targetType: 'listing',
      targetId: listingId,
      before: { bumpedAt: listing.bumpedAt },
      ...context,
    });
  }

  /**
   * Продвижение. Оплаты нет: сроки ставит сотрудник вручную. «В топе до» пока
   * не влияет на порядок выдачи — почему, см. docs/ADR/0008-объявления.md.
   */
  async promote(
    listingId: string,
    dto: PromoteListingDto,
    actorId: string,
    context: AuditContext,
  ): Promise<void> {
    const before = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { id: true, promotedAt: true, promotedUntil: true, highlightedUntil: true },
    });

    if (!before) {
      throw AppException.notFound('Объявление не найдено', ErrorCode.LISTING_NOT_FOUND);
    }

    const promotedUntil = dto.promotedUntil ?? null;
    // Момент старта ставим только при ВКЛЮЧЕНИИ продвижения. Продлили
    // действующее — отсчёт не начинается заново: иначе надбавка, которая
    // должна затухать, держалась бы на максимуме бесконечными продлениями
    const alreadyPromoted = before.promotedUntil !== null && before.promotedUntil > new Date();

    await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        promotedUntil,
        promotedAt:
          promotedUntil === null ? null : alreadyPromoted ? before.promotedAt : new Date(),
        highlightedUntil: dto.highlightedUntil ?? null,
      },
    });

    await this.audit.record({
      actorId,
      action: 'listing.promote',
      targetType: 'listing',
      targetId: listingId,
      before,
      after: dto,
      ...context,
    });
  }

  private async coverMap(ids: (string | null)[]): Promise<Map<string, MediaDto>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const media = await this.media.findByIds(unique);
    return new Map(media.map((item) => [item.id, item]));
  }

  private toAdminDto(
    row: Prisma.ListingGetPayload<{
      include: {
        city: { select: { name: true } };
        category: { select: { name: true; slug: true } };
        district: { select: { name: true } };
        seller: {
          select: {
            id: true;
            firstName: true;
            phone: true;
            avatarId: true;
            createdAt: true;
            ratingAverage: true;
            ratingCount: true;
          };
        };
      };
    }>,
    cover: MediaDto | null,
    catalogue: ListingCatalogue,
  ): ListingAdminDto {
    return {
      id: row.id,
      cityId: row.cityId,
      categoryId: row.categoryId,
      categorySlug: row.category.slug,
      title: row.title,
      transactionType: row.transactionType,
      rentPeriod: row.rentPeriod,
      price: {
        value: row.price,
        max: row.priceMax,
        unit: row.priceUnit,
        isNegotiable: row.isNegotiable,
        perSqm: row.pricePerSqm,
      },
      cover,
      attributesSummary: this.listings.summaryFor(row, catalogue),
      placeLabel: listingPlaceLabel(row),
      districtName: row.cityDistrict ?? row.district?.name ?? null,
      // В панели расстояние ни от чего не считается: сотрудник смотрит
      // объявления города, а не то, что рядом с его столом
      distanceKm: null,
      bumpedAt: row.bumpedAt.toISOString(),
      highlightedUntil: row.highlightedUntil?.toISOString() ?? null,
      isFavorite: false,
      status: row.status,
      statusReason: row.statusReason,
      cityName: row.city.name,
      categoryName: row.category.name,
      seller: this.listings.toSellerDto(row.seller, null),
      sellerPhone: row.seller.phone,
      reportsCount: row.reportsCount,
      viewsCount: row.viewsCount,
      createdAt: row.createdAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      promotedUntil: row.promotedUntil?.toISOString() ?? null,
    };
  }
}
