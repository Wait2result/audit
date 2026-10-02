import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type CreateMenuCategoryDto,
  type CreateMenuItemDto,
  type CreateOptionGroupDto,
  type MediaDto,
  type MenuCategoryDto,
  type MenuItemDto,
  type PlaceMenuDto,
  type UpdateMenuCategoryDto,
  type UpdateMenuItemDto,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';
import { FavoritesService } from './favorites.service.js';

interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Меню заведения: разделы, позиции и группы выбора.
 *
 * Правки меню пишутся в журнал действий с указанием аккаунта. Цена — это
 * деньги, и спор «мне показали другую цену» решается только записями.
 */
@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly favorites: FavoritesService,
  ) {}

  /**
   * Меню для витрины: только то, что заведение показывает покупателю.
   * Позиции из стоп-листа остаются, но помечены — человек должен видеть,
   * что блюдо в меню есть, просто сегодня закончилось.
   */
  async forPlace(placeId: string, includeHidden = false, userId?: string): Promise<PlaceMenuDto> {
    const categories = await this.prisma.menuCategory.findMany({
      where: { placeId, deletedAt: null, ...(includeHidden ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        items: {
          where: { deletedAt: null, ...(includeHidden ? {} : { isActive: true }) },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            groups: {
              where: { deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              include: {
                options: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    });

    const images = await this.imageMap(
      categories.flatMap((category) => category.items.map((item) => item.imageMediaId)),
    );

    // Сердечки всего меню — одним запросом, а не по запросу на блюдо
    const favorites = await this.favorites.favoriteIds(
      userId,
      categories.flatMap((category) => category.items.map((item) => item.id)),
    );

    return {
      placeId,
      categories: categories.map((category): MenuCategoryDto => ({
        id: category.id,
        name: category.name,
        items: category.items.map((item) =>
          toItemDto(item, images.get(item.imageMediaId ?? '') ?? null, favorites.has(item.id)),
        ),
      })),
    };
  }

  // ── Разделы ───────────────────────────────────────────────────────────────

  async createCategory(
    placeId: string,
    dto: CreateMenuCategoryDto,
    actorId: string,
    context: AuditContext,
  ): Promise<MenuCategoryDto> {
    const category = await this.prisma.menuCategory.create({ data: { ...dto, placeId } });

    await this.audit.record({
      actorId,
      action: 'menu.category.create',
      targetType: 'place',
      targetId: placeId,
      after: category,
      ...context,
    });

    return { id: category.id, name: category.name, items: [] };
  }

  async updateCategory(
    categoryId: string,
    dto: UpdateMenuCategoryDto,
    actorId: string,
    context: AuditContext,
  ): Promise<MenuCategoryDto> {
    const before = await this.prisma.menuCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
    });
    if (!before) {
      throw AppException.notFound('Раздел меню не найден', ErrorCode.PLACE_NOT_FOUND);
    }

    const category = await this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: dto,
    });

    await this.audit.record({
      actorId,
      action: 'menu.category.update',
      targetType: 'place',
      targetId: before.placeId,
      before,
      after: category,
      ...context,
    });

    return { id: category.id, name: category.name, items: [] };
  }

  async deleteCategory(categoryId: string, actorId: string, context: AuditContext): Promise<void> {
    const before = await this.prisma.menuCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
    });
    if (!before) {
      throw AppException.notFound('Раздел меню не найден', ErrorCode.PLACE_NOT_FOUND);
    }

    const now = new Date();

    // Позиции скрываются вместе с разделом: иначе они остались бы в меню
    // без раздела и пропали бы с экрана, но продолжали продаваться
    await this.prisma.$transaction([
      this.prisma.menuCategory.update({ where: { id: categoryId }, data: { deletedAt: now } }),
      this.prisma.menuItem.updateMany({
        where: { categoryId, deletedAt: null },
        data: { deletedAt: now },
      }),
    ]);

    await this.audit.record({
      actorId,
      action: 'menu.category.delete',
      targetType: 'place',
      targetId: before.placeId,
      before,
      ...context,
    });
  }

  // ── Позиции ───────────────────────────────────────────────────────────────

  async createItem(
    placeId: string,
    dto: CreateMenuItemDto,
    actorId: string,
    context: AuditContext,
  ): Promise<MenuItemDto> {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id: dto.categoryId, placeId, deletedAt: null },
    });

    // Раздел чужого заведения — попытка положить позицию не туда
    if (!category) {
      throw AppException.badRequest('Раздел меню не найден', ErrorCode.PLACE_NOT_FOUND);
    }

    const item = await this.prisma.menuItem.create({
      data: {
        placeId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description ?? null,
        price: dto.price,
        portion: dto.portion ?? null,
        imageMediaId: dto.imageMediaId ?? null,
        isAvailable: dto.isAvailable,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
      include: { groups: { include: { options: true } } },
    });

    if (dto.imageMediaId) {
      await this.media.attach({
        mediaIds: [dto.imageMediaId],
        ownerType: 'menu_item',
        ownerId: item.id,
        userId: actorId,
      });
    }

    await this.audit.record({
      actorId,
      action: 'menu.item.create',
      targetType: 'place',
      targetId: placeId,
      after: item,
      ...context,
    });

    return toItemDto(item, await this.imageOf(item.imageMediaId));
  }

  async updateItem(
    itemId: string,
    dto: UpdateMenuItemDto,
    actorId: string,
    context: AuditContext,
  ): Promise<MenuItemDto> {
    const before = await this.prisma.menuItem.findFirst({ where: { id: itemId, deletedAt: null } });
    if (!before) {
      throw AppException.notFound('Позиция не найдена', ErrorCode.MENU_ITEM_NOT_FOUND);
    }

    if (dto.categoryId) {
      const category = await this.prisma.menuCategory.findFirst({
        where: { id: dto.categoryId, placeId: before.placeId, deletedAt: null },
      });
      if (!category) {
        throw AppException.badRequest('Раздел меню не найден', ErrorCode.PLACE_NOT_FOUND);
      }
    }

    const item = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description ?? undefined,
        price: dto.price,
        portion: dto.portion ?? undefined,
        imageMediaId: dto.imageMediaId ?? undefined,
        isAvailable: dto.isAvailable,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
      include: {
        groups: {
          where: { deletedAt: null },
          include: { options: { where: { deletedAt: null } } },
        },
      },
    });

    if (dto.imageMediaId) {
      await this.media.attach({
        mediaIds: [dto.imageMediaId],
        ownerType: 'menu_item',
        ownerId: itemId,
        userId: actorId,
      });
    }

    await this.audit.record({
      actorId,
      // Смена цены — отдельное действие в журнале: его ищут чаще остальных
      action:
        dto.price !== undefined && dto.price !== before.price
          ? 'menu.item.price'
          : 'menu.item.update',
      targetType: 'place',
      targetId: before.placeId,
      before,
      after: item,
      ...context,
    });

    return toItemDto(item, await this.imageOf(item.imageMediaId));
  }

  /**
   * Стоп-лист. Самое частое действие за смену, поэтому отдельный маршрут
   * и единственное, что разрешено обоим уровням доступа.
   */
  async setAvailability(
    itemId: string,
    isAvailable: boolean,
    actorId: string,
    context: AuditContext,
  ): Promise<{ id: string; isAvailable: boolean }> {
    const before = await this.prisma.menuItem.findFirst({ where: { id: itemId, deletedAt: null } });
    if (!before) {
      throw AppException.notFound('Позиция не найдена', ErrorCode.MENU_ITEM_NOT_FOUND);
    }

    const item = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { isAvailable },
    });

    await this.audit.record({
      actorId,
      action: 'menu.item.availability',
      targetType: 'place',
      targetId: before.placeId,
      before: { isAvailable: before.isAvailable, name: before.name },
      after: { isAvailable },
      ...context,
    });

    return { id: item.id, isAvailable: item.isAvailable };
  }

  async deleteItem(itemId: string, actorId: string, context: AuditContext): Promise<void> {
    const before = await this.prisma.menuItem.findFirst({ where: { id: itemId, deletedAt: null } });
    if (!before) {
      throw AppException.notFound('Позиция не найдена', ErrorCode.MENU_ITEM_NOT_FOUND);
    }

    await this.prisma.menuItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });

    await this.audit.record({
      actorId,
      action: 'menu.item.delete',
      targetType: 'place',
      targetId: before.placeId,
      before,
      ...context,
    });
  }

  // ── Группы выбора ─────────────────────────────────────────────────────────

  /** Группа заменяется целиком вместе с вариантами: так проще и в форме, и здесь. */
  async replaceOptionGroup(
    itemId: string,
    groupId: string | null,
    dto: CreateOptionGroupDto,
    actorId: string,
    context: AuditContext,
  ): Promise<void> {
    const item = await this.prisma.menuItem.findFirst({ where: { id: itemId, deletedAt: null } });
    if (!item) {
      throw AppException.notFound('Позиция не найдена', ErrorCode.MENU_ITEM_NOT_FOUND);
    }

    await this.prisma.$transaction(async (tx) => {
      if (groupId) {
        await tx.menuOptionGroup.update({
          where: { id: groupId },
          data: { deletedAt: new Date() },
        });
      }

      await tx.menuOptionGroup.create({
        data: {
          itemId,
          name: dto.name,
          minChoices: dto.minChoices,
          maxChoices: dto.maxChoices,
          sortOrder: dto.sortOrder,
          options: {
            create: dto.options.map((option, index) => ({
              name: option.name,
              priceDelta: option.priceDelta,
              isAvailable: option.isAvailable,
              sortOrder: index,
            })),
          },
        },
      });
    });

    await this.audit.record({
      actorId,
      action: 'menu.options.update',
      targetType: 'place',
      targetId: item.placeId,
      after: dto,
      ...context,
    });
  }

  async deleteOptionGroup(groupId: string, actorId: string, context: AuditContext): Promise<void> {
    const group = await this.prisma.menuOptionGroup.findFirst({
      where: { id: groupId, deletedAt: null },
      include: { item: { select: { placeId: true } } },
    });

    if (!group) {
      throw AppException.notFound('Группа выбора не найдена', ErrorCode.MENU_ITEM_NOT_FOUND);
    }

    await this.prisma.menuOptionGroup.update({
      where: { id: groupId },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      actorId,
      action: 'menu.options.delete',
      targetType: 'place',
      targetId: group.item.placeId,
      before: group,
      ...context,
    });
  }

  /** Заведение, которому принадлежит группа выбора, — для проверки доступа. */
  async placeIdOfGroup(groupId: string): Promise<string> {
    const group = await this.prisma.menuOptionGroup.findFirst({
      where: { id: groupId, deletedAt: null },
      include: { item: { select: { placeId: true } } },
    });

    if (!group) {
      throw AppException.notFound('Группа выбора не найдена', ErrorCode.MENU_ITEM_NOT_FOUND);
    }

    return group.item.placeId;
  }

  private async imageOf(id: string | null): Promise<MediaDto | null> {
    if (!id) return null;
    const [media] = await this.media.findByIds([id]);

    return media ?? null;
  }

  private async imageMap(ids: (string | null)[]): Promise<Map<string, MediaDto>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const media = await this.media.findByIds(unique);

    return new Map(media.map((item) => [item.id, item]));
  }
}

interface ItemRow {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  portion: string | null;
  isAvailable: boolean;
  groups: {
    id: string;
    name: string;
    minChoices: number;
    maxChoices: number;
    options: { id: string; name: string; priceDelta: number; isAvailable: boolean }[];
  }[];
}

function toItemDto(item: ItemRow, image: MediaDto | null, isFavorite = false): MenuItemDto {
  return {
    id: item.id,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    price: item.price,
    portion: item.portion,
    image,
    isAvailable: item.isAvailable,
    isFavorite,
    groups: item.groups.map((group) => ({
      id: group.id,
      name: group.name,
      minChoices: group.minChoices,
      maxChoices: group.maxChoices,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: option.priceDelta,
        isAvailable: option.isAvailable,
      })),
    })),
  };
}
