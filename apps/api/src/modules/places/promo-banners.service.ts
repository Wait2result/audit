import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  HOME_TILE_KEYS,
  homeTilePlacement,
  type CreatePromoBannerDto,
  type HomeTilesDto,
  type MediaDto,
  type PromoActionType,
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
  actionType: string;
  actionValue: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  sortOrder: number;
  isActive: boolean;
};

/**
 * Срок показа идёт сейчас: начало не в будущем, окончание не в прошлом.
 * Пустая граница — без ограничения с этой стороны.
 */
function showingNow(now = new Date()) {
  return {
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
  };
}

/** Действие карточки из запроса панели: тип, значение и заведение для place. */
function resolveAction(dto: {
  actionType?: PromoActionType | undefined;
  actionValue?: string | null | undefined;
  targetPlaceId?: string | null | undefined;
}): { actionType: PromoActionType; actionValue: string | null; targetPlaceId: string | null } {
  // Старый клиент присылает только заведение: есть оно — «открыть заведение»
  const type: PromoActionType = dto.actionType ?? (dto.targetPlaceId ? 'place' : 'none');
  if (type === 'place') {
    return {
      actionType: type,
      actionValue: null,
      targetPlaceId: dto.targetPlaceId ?? dto.actionValue ?? null,
    };
  }
  return {
    actionType: type,
    actionValue: type === 'none' ? null : (dto.actionValue ?? null),
    targetPlaceId: null,
  };
}

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

  /**
   * Карточки для карусели: только включённые и в своём сроке показа, в
   * заданном владельцем порядке.
   */
  async list(placement: PromoPlacement): Promise<PromoBannerDto[]> {
    const rows = await this.prisma.promoBanner.findMany({
      where: { placement, deletedAt: null, isActive: true, ...showingNow() },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const images = await this.imageMap(rows);

    return rows.map((row) => toDto(row, images.get(row.imageMediaId ?? '') ?? null));
  }

  /**
   * Фото плиток главной: по одной карточке на плитку — первой включённой в
   * порядке панели. Одним запросом к базе, а не пятью: главная открывается
   * чаще всего остального.
   */
  async homeTiles(): Promise<HomeTilesDto> {
    const rows = await this.prisma.promoBanner.findMany({
      where: {
        placement: { in: HOME_TILE_KEYS.map(homeTilePlacement) },
        deletedAt: null,
        isActive: true,
        ...showingNow(),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const first = HOME_TILE_KEYS.map(
      (key) => [key, rows.find((row) => row.placement === homeTilePlacement(key)) ?? null] as const,
    );
    const images = await this.imageMap(first.flatMap(([, row]) => (row ? [row] : [])));

    return Object.fromEntries(
      first.map(([key, row]) => [
        key,
        row ? toDto(row, images.get(row.imageMediaId ?? '') ?? null) : null,
      ]),
    ) as HomeTilesDto;
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
    const action = resolveAction(dto);
    if (action.targetPlaceId) await this.requirePlace(action.targetPlaceId);

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
        ...action,
        startsAt: dto.startsAt ?? null,
        endsAt: dto.endsAt ?? null,
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

    // Действие меняется, только если панель его прислала (или старый клиент — заведение)
    const action =
      dto.actionType !== undefined || dto.targetPlaceId !== undefined ? resolveAction(dto) : null;
    if (action?.targetPlaceId) await this.requirePlace(action.targetPlaceId);

    const updated = await this.prisma.promoBanner.update({
      where: { id },
      data: {
        ...(dto.placement !== undefined ? { placement: dto.placement } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle ?? null } : {}),
        ...(dto.imageMediaId !== undefined ? { imageMediaId: dto.imageMediaId ?? null } : {}),
        ...(action ?? {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ?? null } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ?? null } : {}),
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
    actionType: row.actionType as PromoActionType,
    // У «открыть заведение» значение — само заведение: приложению не нужно знать про связь
    actionValue: row.actionType === 'place' ? row.targetPlaceId : row.actionValue,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
  };
}
