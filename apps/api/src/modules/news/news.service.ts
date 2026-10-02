import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type AdminNewsListItem,
  type NewsDetailsDto,
  type NewsScope,
  type NewsSummaryDto,
  type PaginatedResponse,
  type PaginationParams,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import { isoInTimezone } from '../../common/utils/timezone.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CitiesService } from '../cities/cities.service.js';
import { NEWS_LIMITS, NEWS_SOURCES } from './news.sources.js';

const DEFAULT_TIMEZONE = 'Europe/Moscow';

interface NewsRow {
  id: string;
  source: string;
  url: string;
  title: string;
  lead: string | null;
  body: string | null;
  imageUrl: string | null;
  scope: NewsScope | null;
  cityId: string | null;
  sourceCategory: string | null;
  publishedAt: Date;
}

interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Новости для приложения и панели управления (Этап 5).
 *
 * В отличие от погоды и кино, ленту не кешируем: источник — наша же база с
 * индексом под этот запрос, экономить нечего, а свежая новость должна
 * появляться сразу, а не через полчаса кеша.
 */
@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cities: CitiesService,
  ) {}

  // ── Для приложения ────────────────────────────────────────────────────────

  async getFeed(
    cityId: string,
    scope: NewsScope,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<NewsSummaryDto>> {
    const city = await this.cities.findById(cityId);

    const where: Prisma.NewsItemWhereInput = {
      isHidden: false,
      // Карточка без текста бесполезна: «Подробнее» должно открывать статью целиком.
      // Карточка без фото — тоже: лента новостей с серыми заглушками выглядит
      // как незаконченная, а фото у изданий есть почти всегда
      body: { not: null },
      imageUrl: { not: null },
      // Старые новости не показываем: лента должна быть свежей
      publishedAt: { gte: new Date(Date.now() - NEWS_LIMITS.maxAgeDays * 24 * 3_600_000) },
      scope,
      // «Город» — только новости этого города; «Дагестан» одинаков для всех
      ...(scope === 'city' ? { cityId } : {}),
      // Федеральная новость показывается лишь когда её подтвердили несколько изданий
      ...(scope === 'russia' || scope === 'world'
        ? { corroboration: { gte: NEWS_LIMITS.minCorroboration } }
        : {}),
    };

    // Запрашиваем на одну запись больше: если она пришла — есть следующая порция
    const rows = await this.prisma.newsItem.findMany({
      where,
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = rows.length > pagination.limit;
    const items = hasMore ? rows.slice(0, pagination.limit) : rows;

    return {
      items: items.map((row) => toSummary(row as NewsRow, city.timezone)),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  async getItem(id: string): Promise<NewsDetailsDto> {
    const row = await this.prisma.newsItem.findFirst({
      where: { id, isHidden: false, scope: { not: null }, body: { not: null } },
      include: { city: { select: { timezone: true } } },
    });

    const federal = row?.scope === 'russia' || row?.scope === 'world';
    if (!row || (federal && row.corroboration < NEWS_LIMITS.minCorroboration)) {
      throw AppException.notFound('Новость не найдена', ErrorCode.NEWS_NOT_FOUND);
    }

    return {
      ...toSummary(row, row.city?.timezone ?? DEFAULT_TIMEZONE),
      paragraphs: row.body ? row.body.split('\n\n') : [],
    };
  }

  // ── Для панели управления ─────────────────────────────────────────────────

  async listForAdmin(
    pagination: PaginationParams,
    filters: { scope?: NewsScope },
  ): Promise<PaginatedResponse<AdminNewsListItem>> {
    const rows = await this.prisma.newsItem.findMany({
      where: { scope: filters.scope ?? { not: null } },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      include: { city: { select: { name: true, timezone: true } } },
    });

    const hasMore = rows.length > pagination.limit;
    const items = hasMore ? rows.slice(0, pagination.limit) : rows;

    return {
      items: items.map((row) => ({
        id: row.id,
        title: row.title,
        scope: row.scope ?? 'dagestan',
        cityName: row.city?.name ?? null,
        sourceName: sourceName(row.source),
        score: row.score,
        corroboration: row.corroboration,
        isHidden: row.isHidden,
        publishedAt: isoInTimezone(row.publishedAt, row.city?.timezone ?? DEFAULT_TIMEZONE),
        url: row.url,
      })),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  /**
   * Аварийный выключатель: автоматическая публикация должна иметь способ
   * мгновенно убрать новость, которую правила пропустили зря.
   */
  async setHidden(
    id: string,
    hidden: boolean,
    actorId: string,
    context: AuditContext,
  ): Promise<void> {
    const before = await this.prisma.newsItem.findUnique({ where: { id } });
    if (!before) {
      throw AppException.notFound('Новость не найдена', ErrorCode.NEWS_NOT_FOUND);
    }

    await this.prisma.newsItem.update({ where: { id }, data: { isHidden: hidden } });

    await this.audit.record({
      actorId,
      action: hidden ? 'news.hide' : 'news.unhide',
      targetType: 'news',
      targetId: id,
      before: { isHidden: before.isHidden, title: before.title },
      after: { isHidden: hidden },
      ...context,
    });
  }
}

function sourceName(sourceId: string): string {
  return NEWS_SOURCES.find((source) => source.id === sourceId)?.name ?? sourceId;
}

function toSummary(row: NewsRow, timezone: string): NewsSummaryDto {
  return {
    id: row.id,
    title: row.title,
    lead: row.lead,
    imageUrl: row.imageUrl,
    publishedAt: isoInTimezone(row.publishedAt, timezone),
    scope: row.scope ?? 'dagestan',
    cityId: row.cityId,
    sourceName: sourceName(row.source),
    sourceCategory: row.sourceCategory,
    url: row.url,
  };
}
