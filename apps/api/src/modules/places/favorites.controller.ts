import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  paginationSchema,
  uuidSchema,
  type FavoriteDishDto,
  type FavoritesSummaryDto,
  type PaginatedResponse,
} from '@dagestan/shared';

import { CurrentUser, RateLimit } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { FavoritesService } from './favorites.service.js';

/**
 * Избранное (Этап 6).
 *
 * Требует аккаунта: избранное принадлежит человеку и не может жить у гостя.
 * Приложение перехватывает нажатие у гостя раньше и предлагает войти, так что
 * сюда без токена запрос доходит только при ошибке.
 *
 * Заведения в избранное добавляются маршрутом `POST /places/:id/favorite`, а
 * список избранных заведений — обычным списком с `favoritesOnly=true`.
 */
@ApiTags('Избранное')
@ApiBearerAuth()
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Сколько в избранном',
    description: 'Заведения и блюда выбранного города — для значка на кнопке и вкладок.',
  })
  summary(
    @Query('cityId') cityId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<FavoritesSummaryDto> {
    return this.favorites.summary(user.id, uuidSchema.parse(cityId));
  }

  @Get('dishes')
  @ApiOperation({
    summary: 'Избранные блюда',
    description:
      'Блюда выбранного города вместе с заведением и признаком «можно заказать сейчас». ' +
      'Блюдо из стоп-листа остаётся в списке с пометкой.',
  })
  dishes(
    @Query('cityId') cityId: string,
    @Query() rawQuery: unknown,
    @CurrentUser() user: RequestUser,
  ): Promise<PaginatedResponse<FavoriteDishDto>> {
    const { cursor, limit } = paginationSchema.parse(rawQuery);

    return this.favorites.dishes(user.id, uuidSchema.parse(cityId), { cursor, limit });
  }

  @Post('dishes/:itemId')
  @RateLimit({ limit: 300, windowSeconds: 3600, scope: 'user' })
  @ApiOperation({
    summary: 'Добавить блюдо в избранное или убрать',
    description: 'Один маршрут на оба действия: сердечко — переключатель, а не две кнопки.',
  })
  toggleDish(
    @Param('itemId') itemId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ isFavorite: boolean }> {
    return this.favorites.toggleDish(user.id, uuidSchema.parse(itemId));
  }
}
