import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type CreatePlaceCategoryDto,
  type MediaDto,
  type PlaceCategoryAdminDto,
  type PlaceCategoryDto,
  type PlaceType,
  type UpdatePlaceCategoryDto,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';

interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  imageMediaId: string | null;
  cuisines: string[];
  types: string[];
  sortOrder: number;
  isActive: boolean;
};

/**
 * Категории витрины доставки (Этап 6).
 *
 * Список плиток меняет владелец из панели, поэтому он в базе, а не в коде:
 * добавить «Пельменные» не должно означать выпуск новой версии приложения.
 *
 * Категория не хранит список заведений — она подбирает их правилами по
 * словам кухонь и виду заведения. Правила превращаются в условие запроса
 * (см. `whereFor`), а не отсеивают записи после выборки: отсев после
 * выборки ломает постраничную выдачу.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  /** Плитки для витрины: только включённые, в заданном владельцем порядке. */
  async list(): Promise<PlaceCategoryDto[]> {
    const rows = await this.prisma.placeCategory.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const images = await this.imageMap(rows);

    return rows.map((row) => toDto(row, images.get(row.imageMediaId ?? '') ?? null));
  }

  /**
   * Категория по коду — для фильтра списка заведений.
   * Неизвестный код возвращает null, и список просто не фильтруется:
   * ссылка на удалённую категорию не должна ронять экран.
   */
  async findBySlug(slug: string): Promise<CategoryRow | null> {
    return this.prisma.placeCategory.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  /**
   * Условие отбора заведений для категории.
   *
   * Сравнение по вхождению и без учёта регистра: кухни заполняют руками, и
   * «Дагестанская кухня» должна попадать в категорию со словом «дагестанск».
   * Поэтому ищем и в самих кухнях заведения, и в названиях его блюд —
   * заведение может не проставить кухню, но «хинкал» в меню у него есть.
   */
  whereFor(category: { cuisines: string[]; types: string[] }): Prisma.PlaceWhereInput {
    const or: Prisma.PlaceWhereInput[] = [];

    for (const word of category.cuisines) {
      or.push({ cuisines: { hasSome: [word] } });
      or.push({
        items: {
          some: { deletedAt: null, isActive: true, name: { contains: word, mode: 'insensitive' } },
        },
      });
    }

    if (category.types.length > 0) {
      or.push({ type: { in: category.types as PlaceType[] } });
    }

    // Пустая категория не должна показывать вообще всё: правил нет —
    // значит, и заведений в ней нет, пока владелец правила не задаст
    return or.length > 0 ? { OR: or } : { id: { in: [] } };
  }

  // ── Панель ────────────────────────────────────────────────────────────────

  /** Все категории, включая выключенные, со счётчиком заведений. */
  async listForAdmin(): Promise<PlaceCategoryAdminDto[]> {
    const rows = await this.prisma.placeCategory.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const images = await this.imageMap(rows);

    // Счётчик показывает, не пустая ли плитка: категория без заведений
    // выглядит в приложении как обман, и лучше увидеть это в панели
    const counts = await Promise.all(
      rows.map((row) =>
        this.prisma.place.count({
          where: { deletedAt: null, isActive: true, ...this.whereFor(row) },
        }),
      ),
    );

    return rows.map((row, index) => ({
      ...toDto(row, images.get(row.imageMediaId ?? '') ?? null),
      cuisines: row.cuisines,
      types: row.types,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      placeCount: counts[index] ?? 0,
    }));
  }

  async create(
    dto: CreatePlaceCategoryDto,
    actorId: string,
    context: AuditContext,
  ): Promise<PlaceCategoryAdminDto> {
    const existing = await this.prisma.placeCategory.findUnique({ where: { slug: dto.slug } });

    if (existing) {
      throw AppException.badRequest(
        `Категория с кодом «${dto.slug}» уже есть`,
        ErrorCode.VALIDATION_FAILED,
      );
    }

    // Новая категория встаёт в конец, а не в начало: порядок плиток —
    // это решение владельца, и новая запись не должна молча подвинуть
    // всё, что он уже расставил
    const last = await this.prisma.placeCategory.findFirst({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const created = await this.prisma.placeCategory.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        cuisines: dto.cuisines,
        types: dto.types,
        imageMediaId: dto.imageMediaId ?? null,
        sortOrder: dto.sortOrder > 0 ? dto.sortOrder : (last?.sortOrder ?? -1) + 1,
        isActive: dto.isActive,
      },
    });

    await this.attachImage(created.id, dto.imageMediaId ?? null, actorId);
    await this.audit.record({
      actorId,
      action: 'place-category.create',
      targetType: 'place_category',
      targetId: created.id,
      after: { slug: created.slug, name: created.name },
      ...context,
    });

    return this.oneForAdmin(created.id);
  }

  async update(
    id: string,
    dto: UpdatePlaceCategoryDto,
    actorId: string,
    context: AuditContext,
  ): Promise<PlaceCategoryAdminDto> {
    const before = await this.requireOne(id);

    const updated = await this.prisma.placeCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.cuisines !== undefined ? { cuisines: dto.cuisines } : {}),
        ...(dto.types !== undefined ? { types: dto.types } : {}),
        ...(dto.imageMediaId !== undefined ? { imageMediaId: dto.imageMediaId ?? null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    if (dto.imageMediaId !== undefined && dto.imageMediaId !== before.imageMediaId) {
      await this.attachImage(id, dto.imageMediaId ?? null, actorId);
    }

    await this.audit.record({
      actorId,
      action: 'place-category.update',
      targetType: 'place_category',
      targetId: id,
      before: { name: before.name, isActive: before.isActive },
      after: { name: updated.name, isActive: updated.isActive },
      ...context,
    });

    return this.oneForAdmin(id);
  }

  /**
   * Удаление мягкое: ссылки вида `?category=grill` могут быть где угодно,
   * и запись должна остаться, чтобы понять, чем была эта ссылка.
   */
  async remove(id: string, actorId: string, context: AuditContext): Promise<void> {
    const category = await this.requireOne(id);

    await this.prisma.placeCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit.record({
      actorId,
      action: 'place-category.delete',
      targetType: 'place_category',
      targetId: id,
      before: { slug: category.slug, name: category.name },
      ...context,
    });
  }

  /** Перестановка плиток: приходит весь порядок целиком, одним списком. */
  async reorder(ids: string[], actorId: string, context: AuditContext): Promise<void> {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.placeCategory.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    await this.audit.record({
      actorId,
      action: 'place-category.reorder',
      targetType: 'place_category',
      after: { order: ids },
      ...context,
    });
  }

  private async oneForAdmin(id: string): Promise<PlaceCategoryAdminDto> {
    const all = await this.listForAdmin();
    const found = all.find((category) => category.id === id);

    if (!found) {
      throw AppException.notFound('Категория не найдена', ErrorCode.NOT_FOUND);
    }

    return found;
  }

  private async requireOne(id: string): Promise<CategoryRow> {
    const category = await this.prisma.placeCategory.findFirst({ where: { id, deletedAt: null } });

    if (!category) {
      throw AppException.notFound('Категория не найдена', ErrorCode.NOT_FOUND);
    }

    return category;
  }

  /**
   * Закрепляет картинку за категорией.
   *
   * Без этого файл остаётся «ничьим» и попадёт под ночную уборку
   * неприкаянных загрузок — плитка однажды осталась бы без картинки.
   */
  private async attachImage(
    categoryId: string,
    mediaId: string | null,
    actorId: string,
  ): Promise<void> {
    if (!mediaId) return;

    await this.media.attach({
      mediaIds: [mediaId],
      ownerType: 'place_category',
      ownerId: categoryId,
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

function toDto(row: CategoryRow, image: MediaDto | null): PlaceCategoryDto {
  return { id: row.id, slug: row.slug, name: row.name, image };
}
