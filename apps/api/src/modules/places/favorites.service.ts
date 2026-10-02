import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type FavoriteDishDto,
  type FavoritesSummaryDto,
  type MediaDto,
  type PaginatedResponse,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import { minutesInTimezone, weekdayInTimezone } from '../../common/utils/timezone.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';
import { openStateAt } from './open-hours.js';

const DEFAULT_TIMEZONE = 'Europe/Moscow';

/**
 * Избранные блюда (Этап 6).
 *
 * Избранные заведения живут в PlacesService: они уже часть списка заведений
 * и подчиняются его фильтрам. Блюда — другая сущность со своим списком,
 * поэтому у них свой сервис.
 *
 * Все запросы ограничены городом: человек в Махачкале не должен видеть в
 * «Избранном» блюдо из Дербента, которое он не может заказать. Избранное
 * никуда не пропадает — оно вернётся, стоит сменить город обратно.
 */
@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  /** Сколько в избранном по типам: заведения и блюда — этого города, объявления — все. */
  async summary(userId: string, cityId: string): Promise<FavoritesSummaryDto> {
    const [places, dishes, listings] = await Promise.all([
      this.prisma.favoritePlace.count({
        where: { userId, place: { cityId, deletedAt: null, isActive: true } },
      }),
      this.prisma.favoriteMenuItem.count({
        where: { userId, menuItem: this.visibleItem(cityId) },
      }),
      // Проданное и снятое тоже в счёте: в избранном оно остаётся с пометкой
      this.prisma.favoriteListing.count({ where: { userId, listing: { deletedAt: null } } }),
    ]);

    return { places, dishes, listings };
  }

  /** Избранные блюда: сначала добавленные позже. */
  async dishes(
    userId: string,
    cityId: string,
    pagination: { cursor?: string; limit: number },
  ): Promise<PaginatedResponse<FavoriteDishDto>> {
    const rows = await this.prisma.favoriteMenuItem.findMany({
      where: { userId, menuItem: this.visibleItem(cityId) },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        menuItem: {
          include: {
            groups: {
              where: { deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              include: {
                options: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
              },
            },
            place: { include: { schedules: true, city: true } },
          },
        },
      },
    });

    const hasMore = rows.length > pagination.limit;
    const page = hasMore ? rows.slice(0, pagination.limit) : rows;

    const imageIds = page
      .map((row) => row.menuItem.imageMediaId)
      .filter((id): id is string => Boolean(id));
    const images = new Map<string, MediaDto>(
      (imageIds.length > 0 ? await this.media.findByIds(imageIds) : []).map((m) => [m.id, m]),
    );

    const now = new Date();

    return {
      items: page.map((row): FavoriteDishDto => {
        const item = row.menuItem;
        const zone = item.place.city.timezone || DEFAULT_TIMEZONE;
        const state = openStateAt(
          item.place.schedules,
          weekdayInTimezone(now, zone),
          minutesInTimezone(now, zone),
        );

        return {
          item: {
            id: item.id,
            categoryId: item.categoryId,
            name: item.name,
            description: item.description,
            price: item.price,
            portion: item.portion,
            image: images.get(item.imageMediaId ?? '') ?? null,
            isAvailable: item.isAvailable,
            isFavorite: true,
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
          },
          place: {
            id: item.place.id,
            name: item.place.name,
            canOrder: item.place.ordersEnabled && state.isOpenNow,
            openLabel: state.label,
          },
        };
      }),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  /** Сердечко на блюде: добавляет, а повторное нажатие убирает. */
  async toggleDish(userId: string, menuItemId: string): Promise<{ isFavorite: boolean }> {
    const item = await this.prisma.menuItem.findFirst({
      where: { id: menuItemId, deletedAt: null, isActive: true, place: { deletedAt: null } },
      select: { id: true },
    });

    if (!item) {
      throw AppException.notFound('Блюдо не найдено', ErrorCode.MENU_ITEM_NOT_FOUND);
    }

    const existing = await this.prisma.favoriteMenuItem.findUnique({
      where: { userId_menuItemId: { userId, menuItemId } },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.favoriteMenuItem.delete({ where: { id: existing.id } });

      return { isFavorite: false };
    }

    await this.prisma.favoriteMenuItem.create({ data: { userId, menuItemId } });

    return { isFavorite: true };
  }

  /**
   * Какие из этих блюд у человека в избранном — одним запросом на всё меню,
   * а не по запросу на блюдо.
   */
  async favoriteIds(userId: string | undefined, itemIds: string[]): Promise<Set<string>> {
    if (!userId || itemIds.length === 0) return new Set();

    const rows = await this.prisma.favoriteMenuItem.findMany({
      where: { userId, menuItemId: { in: itemIds } },
      select: { menuItemId: true },
    });

    return new Set(rows.map((row) => row.menuItemId));
  }

  /**
   * Блюдо, которое ещё есть в меню: не удалено и не скрыто заведением.
   * Блюдо в стоп-листе сюда попадает — оно вернётся в продажу.
   */
  private visibleItem(cityId: string) {
    return {
      deletedAt: null,
      isActive: true,
      place: { cityId, deletedAt: null, isActive: true },
    };
  }
}
