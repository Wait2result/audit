import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type CreatePromoBannerDto,
  type MediaDto,
  type PromoBannerAdminDto,
  type PromoBannerDto,
  type PromoPlacement,
  type UpdatePromoBannerDto,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';

interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

type BannerRow = {
  id: string;
  placement: string;
  title: string;
  subtitle: string | null;
  imageMediaId: string | null;
  targetPlaceId: string | null;
  sortOrder: number;
  isActive: boolean;
};

/**
 * Промо-баннеры карусели — на главной странице и на витрине доставки
 * (Этап 6, доработка «тёмная тема и баннеры»).
 *
 * Раньше карточки были зашиты в код приложения: однотонная подложка вместо
 * фото и кнопка «Смотреть» без картинки. Теперь и картинку, и переход на
 * конкретное заведение задаёт владелец из панели — так же, как категории
 * витрины (см. `categories.service.ts`), тем же приёмом.
 */
@Injectable()
export class PromoBannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  /** Карточки для карусели: только включённые, в заданном владельцем порядке. */
  async list(placement: PromoPlacement): Promise<PromoBannerDto[]> {
    const rows = await this.prisma.promoBanner.findMany({
      where: { placement, deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const images = await this.imageMap(rows);

    return rows.map((row) => toDto(row, images.get(row.imageMediaId ?? '') ?? null));
  }

  // ── Панель ────────────────────────────────────────────────────────────────

  /** Все карточки места показа, включая выключенные. */
  async listForAdmin(placement: PromoPlacement): Promise<PromoBannerAdminDto[]> {
    const rows = await this.prisma.promoBanner.findMany({
      where: { placement, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { targetPlace: { select: { name: true } } },
    });

    const images = await this.imageMap(rows);

    return rows.map((row) => ({
      ...toDto(row, images.get(row.imageMediaId ?? '') ?? null),
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      targetPlaceName: row.targetPlace?.name ?? null,
    }));
  }

  async create(
    dto: CreatePromoBannerDto,
    actorId: string,
    context: AuditContext,
  ): Promise<PromoBannerAdminDto> {
    if (dto.targetPlaceId) await this.requirePlace(dto.targetPlaceId);

    // Новая карточка встаёт в конец своего места показа, а не в начало:
    // порядок карусели — решение владельца, и добавление не должно молча
    // подвинуть то, что он уже расставил
    const last = await this.prisma.promoBanner.findFirst({
      where: { placement: dto.placement, deletedAt: null },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const created = await this.prisma.promoBanner.create({
      data: {
        placement: dto.placement,
        title: dto.title,
        subtitle: dto.subtitle ?? null,
        imageMediaId: dto.imageMediaId ?? null,
        targetPlaceId: dto.targetPlaceId ?? null,
        sortOrder: dto.sortOrder > 0 ? dto.sortOrder : (last?.sortOrder ?? -1) + 1,
        isActive: dto.isActive,
      },
    });

    await this.attachImage(created.id, dto.imageMediaId ?? null, actorId);
    await this.audit.record({
      actorId,
      action: 'promo-banner.create',
      targetType: 'promo_banner',
      targetId: created.id,
      after: { placement: created.placement, title: created.title },
      ...context,
    });

    return this.oneForAdmin(created.id, created.placement);
  }

  async update(
    id: string,
    dto: UpdatePromoBannerDto,
    actorId: string,
    context: AuditContext,
  ): Promise<PromoBannerAdminDto> {
    const before = await this.requireOne(id);

    if (dto.targetPlaceId) await this.requirePlace(dto.targetPlaceId);

    const updated = await this.prisma.promoBanner.update({
      where: { id },
      data: {
        ...(dto.placement !== undefined ? { placement: dto.placement } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle ?? null } : {}),
        ...(dto.imageMediaId !== undefined ? { imageMediaId: dto.imageMediaId ?? null } : {}),
        ...(dto.targetPlaceId !== undefined ? { targetPlaceId: dto.targetPlaceId ?? null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    if (dto.imageMediaId !== undefined && dto.imageMediaId !== before.imageMediaId) {
      await this.attachImage(id, dto.imageMediaId ?? null, actorId);
    }

    await this.audit.record({
      actorId,
      action: 'promo-banner.update',
      targetType: 'promo_banner',
      targetId: id,
      before: { title: before.title, isActive: before.isActive },
      after: { title: updated.title, isActive: updated.isActive },
      ...context,
    });

    return this.oneForAdmin(id, updated.placement);
  }

  /** Удаление мягкое: карточка могла упоминаться в статистике показов. */
  async remove(id: string, actorId: string, context: AuditContext): Promise<void> {
    const banner = await this.requireOne(id);

    await this.prisma.promoBanner.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit.record({
      actorId,
      action: 'promo-banner.delete',
      targetType: 'promo_banner',
      targetId: id,
      before: { placement: banner.placement, title: banner.title },
      ...context,
    });
  }

  /** Перестановка карточек одного места показа: приходит весь порядок целиком. */
  async reorder(
    placement: PromoPlacement,
    ids: string[],
    actorId: string,
    context: AuditContext,
  ): Promise<void> {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.promoBanner.update({
          where: { id, placement },
          data: { sortOrder: index },
        }),
      ),
    );

    await this.audit.record({
      actorId,
      action: 'promo-banner.reorder',
      targetType: 'promo_banner',
      after: { placement, order: ids },
      ...context,
    });
  }

  private async oneForAdmin(id: string, placement: PromoPlacement): Promise<PromoBannerAdminDto> {
    const all = await this.listForAdmin(placement);
    const found = all.find((banner) => banner.id === id);

    if (!found) {
      throw AppException.notFound('Баннер не найден', ErrorCode.NOT_FOUND);
    }

    return found;
  }

  private async requireOne(id: string): Promise<BannerRow> {
    const banner = await this.prisma.promoBanner.findFirst({ where: { id, deletedAt: null } });

    if (!banner) {
      throw AppException.notFound('Баннер не найден', ErrorCode.NOT_FOUND);
    }

    return banner;
  }

  private async requirePlace(placeId: string): Promise<void> {
    const place = await this.prisma.place.findFirst({
      where: { id: placeId, deletedAt: null },
      select: { id: true },
    });

    if (!place) {
      throw AppException.badRequest('Заведение не найдено', ErrorCode.VALIDATION_FAILED);
    }
  }

  /**
   * Закрепляет картинку за баннером.
   *
   * Без этого файл остаётся «ничьим» и попадёт под ночную уборку неприкаянных
   * загрузок — карточка однажды осталась бы без изображения.
   */
  private async attachImage(
    bannerId: string,
    mediaId: string | null,
    actorId: string,
  ): Promise<void> {
    if (!mediaId) return;

    await this.media.attach({
      mediaIds: [mediaId],
      ownerType: 'promo_banner',
      ownerId: bannerId,
      userId: actorId,
    });
  }

  private async imageMap(rows: { imageMediaId: string | null }[]): Promise<Map<string, MediaDto>> {
    const ids = rows.map((row) => row.imageMediaId).filter((id): id is string => Boolean(id));

    if (ids.length === 0) return new Map();

    const media = await this.media.findByIds(ids);

    return new Map(media.map((item) => [item.id, item]));
  }
}

function toDto(row: BannerRow, image: MediaDto | null): PromoBannerDto {
  return {
    id: row.id,
    placement: row.placement as PromoPlacement,
    title: row.title,
    subtitle: row.subtitle,
    image,
    targetPlaceId: row.targetPlaceId,
  };
}
