import { Injectable } from '@nestjs/common';
import { ErrorCode, PlaceMemberRole, canManagePlace } from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

/**
 * Доступ сотрудника заведения к своему заведению.
 *
 * Это не роль платформы (те живут в RBAC и раздаются сотрудникам «Дагестана»),
 * а доступ к одному объекту: администратор ресторана — обычный пользователь
 * приложения, которому выдали права на конкретное заведение.
 *
 * Единственная точка проверки. Любой маршрут кабинета начинается отсюда:
 * идентификатор заведения, пришедший из запроса, сам по себе ничего не
 * разрешает — разрешает только запись в place_members.
 */
@Injectable()
export class PlaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Возвращает уровень доступа или отказывает.
   *
   * `needManager` — действие меняет деньги или настройки заведения: цены,
   * состав меню, часы, условия доставки. Сотруднику на смене это не положено.
   */
  async assertAccess(
    userId: string,
    placeId: string,
    needManager: boolean,
  ): Promise<PlaceMemberRole> {
    const membership = await this.prisma.placeMember.findFirst({
      where: { placeId, userId, deletedAt: null, place: { deletedAt: null } },
      select: { role: true },
    });

    // Один и тот же отказ и когда доступа нет, и когда заведения нет:
    // иначе по ответам сервера можно перебором узнать чужие идентификаторы
    if (!membership) {
      throw AppException.forbidden('Нет доступа к этому заведению', ErrorCode.PLACE_ACCESS_DENIED);
    }

    const role = membership.role;

    if (needManager && !canManagePlace(role)) {
      throw AppException.forbidden(
        'Это может изменить только управляющий заведением',
        ErrorCode.PLACE_ACCESS_DENIED,
      );
    }

    return role;
  }

  /** Заведение, которому принадлежит позиция меню, — для проверки доступа. */
  async placeIdOfMenuItem(itemId: string): Promise<string> {
    const item = await this.prisma.menuItem.findFirst({
      where: { id: itemId, deletedAt: null },
      select: { placeId: true },
    });

    if (!item) {
      throw AppException.notFound('Позиция не найдена', ErrorCode.MENU_ITEM_NOT_FOUND);
    }

    return item.placeId;
  }

  /** Заведение, которому принадлежит раздел меню. */
  async placeIdOfCategory(categoryId: string): Promise<string> {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { placeId: true },
    });

    if (!category) {
      throw AppException.notFound('Раздел меню не найден', ErrorCode.PLACE_NOT_FOUND);
    }

    return category.placeId;
  }
}
