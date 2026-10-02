import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createReportSchema,
  listingListQuerySchema,
  listingMapQuerySchema,
  listingSuggestQuerySchema,
  paginationSchema,
  pointQuerySchema,
  uuidSchema,
  type CreateReportDto,
  type FavoriteListingDto,
  type ListingCategoryDto,
  type ListingDetailsDto,
  type ListingDictionaryEntryDto,
  type ListingDto,
  type ListingMapPointDto,
  type ListingPhoneDto,
  type ListingSuggestionDto,
  type PaginatedResponse,
} from '@dagestan/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { CurrentUser, Public, RateLimit } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ApiZodBody } from '../../common/zod/zod-openapi.js';
import { zodBody } from '../../common/zod/zod-validation.pipe.js';
import { ListingCategoriesService } from './listing-categories.service.js';
import { ListingViewsService } from './listing-views.service.js';
import { ListingsModerationService } from './listings-moderation.service.js';
import { ListingsService } from './listings.service.js';

/**
 * Витрина объявлений (Этап 7).
 *
 * Смотреть объявления можно без аккаунта — он нужен, чтобы подать своё,
 * добавить в избранное или пожаловаться. Публичные маршруты всё равно
 * разбирают токен, если он прислан: одному и тому же списку нужно показать
 * закрашенное сердечко своему и пустое гостю.
 */
@ApiTags('Объявления')
@Controller('listings')
export class ListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly categories: ListingCategoriesService,
    private readonly moderation: ListingsModerationService,
    private readonly views: ListingViewsService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Лента объявлений',
    description:
      'Фильтры по категории, цене, району и характеристикам. Параметр freshBefore ' +
      'замораживает ленту на момент открытия: без него поднятые во время листания ' +
      'объявления показывают карточку дважды или прячут её.',
  })
  list(
    @Query() rawQuery: unknown,
    @CurrentUser() user?: RequestUser,
  ): Promise<PaginatedResponse<ListingDto>> {
    return this.listings.list(listingListQuerySchema.parse(rawQuery), user?.id);
  }

  @Get('categories')
  @Public()
  @ApiOperation({
    summary: 'Дерево категорий',
    description:
      'С параметром withAttributes приходят и поля категорий — по ним приложение ' +
      'строит форму подачи и экран фильтров.',
  })
  categoriesTree(@Query('withAttributes') withAttributes?: string): Promise<ListingCategoryDto[]> {
    return this.categories.tree(withAttributes === '1' || withAttributes === 'true');
  }

  @Get('map')
  @Public()
  @ApiOperation({
    summary: 'Точки для карты',
    description:
      'Те же фильтры, что у ленты, плюс bbox=юг,запад,север,восток. Только со своей точкой.',
  })
  map(
    @Query() rawQuery: unknown,
    @CurrentUser() user?: RequestUser,
  ): Promise<ListingMapPointDto[]> {
    return this.listings.mapPoints(listingMapQuerySchema.parse(rawQuery), user?.id);
  }

  @Get('suggest')
  @Public()
  @ApiOperation({ summary: 'Подсказки к строке поиска' })
  suggest(@Query() rawQuery: unknown): Promise<ListingSuggestionDto[]> {
    const { cityId, q } = listingSuggestQuerySchema.parse(rawQuery);
    return this.listings.suggest(cityId, q);
  }

  @Get('dictionaries/:kind')
  @Public()
  @ApiOperation({
    summary: 'Справочник значений',
    description:
      'Марки, модели, бренды. Параметр parent сужает список до записей под ' +
      'родителем: модели выбранной марки.',
  })
  dictionary(
    @Param('kind') kind: string,
    @Query('parent') parent?: string,
  ): Promise<ListingDictionaryEntryDto[]> {
    return this.categories.dictionary(
      z.string().trim().min(1).max(40).parse(kind),
      parent === undefined ? undefined : z.string().trim().max(80).parse(parent),
    );
  }

  @Get('favorites')
  @ApiOperation({
    summary: 'Моё избранное',
    description:
      'Свежие отметки первыми. В отличие от ленты — и проданное, и снятое, с пометкой availability.',
  })
  favorites(
    @CurrentUser() user: RequestUser,
    @Query() raw: Record<string, unknown>,
  ): Promise<PaginatedResponse<FavoriteListingDto>> {
    return this.listings.favoriteListings(user.id, paginationSchema.parse(raw));
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Объявление целиком' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user?: RequestUser,
    // Координаты необязательны: без них карточка показывает один город,
    // с ними — ещё и расстояние, как в списке
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Req() request?: FastifyRequest,
  ): Promise<ListingDetailsDto> {
    const listingId = uuidSchema.parse(id);
    const point = pointQuerySchema.parse({ latitude, longitude });
    const listing = await this.listings.findOne(listingId, user?.id, point);

    // Свои просмотры не считаем: иначе цифра в кабинете продавца — про то,
    // сколько раз он сам открыл собственное объявление. Повторы одного
    // зрителя за сутки и перебор скриптом отсекает ListingViewsService
    if (!listing.isMine) {
      await this.views.count(listingId, {
        userId: user?.id ?? null,
        ip: request?.ip ?? null,
        userAgent: request?.headers['user-agent'] ?? null,
      });
    }

    return listing;
  }

  @Post(':id/phone')
  @Public()
  @RateLimit({ limit: 30, windowSeconds: 3600, scope: 'ip+user' })
  @ApiOperation({
    summary: 'Показать номер телефона',
    description:
      'Номер не отдаётся в списке: иначе базу телефонов собирает первый же скрипт. ' +
      'Каждый показ попадает в счётчик — продавцу он понятнее, чем просмотры.',
  })
  revealPhone(@Param('id') id: string): Promise<ListingPhoneDto> {
    return this.listings.revealPhone(uuidSchema.parse(id));
  }

  @Post(':id/favorite')
  @ApiOperation({ summary: 'Добавить или убрать из избранного' })
  toggleFavorite(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ isFavorite: boolean }> {
    return this.listings.toggleFavorite(user.id, uuidSchema.parse(id));
  }

  @Post(':id/report')
  @RateLimit({ limit: 10, windowSeconds: 86_400, scope: 'user' })
  @ApiZodBody(createReportSchema)
  @ApiOperation({
    summary: 'Пожаловаться на объявление',
    description:
      'Одна жалоба на человека и объявление. Несколько жалоб от разных людей ' +
      'снимают объявление автоматически — сотрудник потом разбирает.',
  })
  async report(
    @Param('id') id: string,
    @Body(zodBody(createReportSchema)) dto: CreateReportDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ ok: true }> {
    await this.moderation.report(uuidSchema.parse(id), user.id, dto);
    return { ok: true };
  }
}
