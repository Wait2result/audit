import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  placeListQuerySchema,
  promoPlacementSchema,
  replyReviewSchema,
  reviewListQuerySchema,
  upsertReviewSchema,
  uuidSchema,
  type HomeTilesDto,
  type PaginatedResponse,
  type PlaceDetailsDto,
  type PlaceDto,
  type PlaceCategoryDto,
  type PlaceMenuDto,
  type PlaceReviewDto,
  type PlaceReviewsDto,
  type PromoBannerDto,
  type ReplyReviewDto,
  type UpsertReviewDto,
} from '@dagestan/shared';

import { CurrentUser, Public, RateLimit } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ApiZodBody } from '../../common/zod/zod-openapi.js';
import { zodBody } from '../../common/zod/zod-validation.pipe.js';
import { CategoriesService } from './categories.service.js';
import { MenuService } from './menu.service.js';
import { PlacesService } from './places.service.js';
import { PromoBannersService } from './promo-banners.service.js';
import { ReviewsService } from './reviews.service.js';

/**
 * Витрина заведений (Этап 6).
 *
 * Смотреть, где поесть, можно без аккаунта — он нужен, чтобы оформить заказ,
 * добавить в избранное или оставить отзыв. Публичные маршруты всё равно
 * разбирают токен, если он прислан: одному и тому же списку нужно показать
 * закрашенное сердечко своему и пустое гостю.
 */
@ApiTags('Заведения')
@Controller('places')
export class PlacesController {
  constructor(
    private readonly places: PlacesService,
    private readonly menu: MenuService,
    private readonly reviews: ReviewsService,
    private readonly categories: CategoriesService,
    private readonly promoBanners: PromoBannersService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Заведения города',
    description:
      'Список с фильтрами: плитка категории, вид заведения, кухня, поиск ' +
      '(по названию, адресу и названиям блюд в меню), «открыто сейчас», ' +
      '«есть доставка», «до N минут», только избранные и порядок сортировки. ' +
      'Постраничная выдача по курсору. «Открыто сейчас» считается в поясе города.',
  })
  list(
    @Query() rawQuery: unknown,
    @CurrentUser() user?: RequestUser,
  ): Promise<PaginatedResponse<PlaceDto>> {
    return this.places.list(placeListQuerySchema.parse(rawQuery), user?.id);
  }

  @Public()
  @Get('cuisines')
  @ApiOperation({
    summary: 'Кухни, которые есть в городе',
    description: 'Строится из данных заведений: пустых фильтров в приложении не бывает.',
  })
  cuisines(@Query('cityId') cityId: string): Promise<string[]> {
    return this.places.cuisines(uuidSchema.parse(cityId));
  }

  @Public()
  @Get('categories')
  @ApiOperation({
    summary: 'Категории витрины',
    description:
      'Плитки в порядке, заданном владельцем в панели. Выключенные не возвращаются. ' +
      'Список живёт в базе: добавление плитки не требует новой версии приложения.',
  })
  listCategories(): Promise<PlaceCategoryDto[]> {
    return this.categories.list();
  }

  @Public()
  @Get('promo-banners')
  @ApiOperation({
    summary: 'Промо-карточки карусели',
    description:
      'Карточки для главной страницы или витрины доставки, в порядке, заданном ' +
      'владельцем в панели. Выключенные не возвращаются.',
  })
  listPromoBanners(@Query('placement') placement: unknown): Promise<PromoBannerDto[]> {
    return this.promoBanners.list(promoPlacementSchema.parse(placement));
  }

  @Public()
  @Get('home-tiles')
  @ApiOperation({
    summary: 'Фото плиток главной',
    description:
      'Первая включённая карточка каждой плитки («Объявления», «Заказать», «Сейчас в ' +
      'кино», «Новости», «Попутчики») одним ответом. Нет карточки — null: приложение ' +
      'показывает своё фото по умолчанию, у кино — афишу сеанса.',
  })
  homeTiles(): Promise<HomeTilesDto> {
    return this.promoBanners.homeTiles();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Карточка заведения' })
  findOne(@Param('id') id: string, @CurrentUser() user?: RequestUser): Promise<PlaceDetailsDto> {
    return this.places.findOne(uuidSchema.parse(id), user?.id);
  }

  @Public()
  @Get(':id/menu')
  @ApiOperation({
    summary: 'Меню заведения',
    description:
      'Разделы, позиции и группы выбора. Позиции из стоп-листа остаются в ответе ' +
      'с пометкой: человек должен видеть, что блюдо в меню есть, просто сегодня закончилось.',
  })
  menuOf(@Param('id') id: string, @CurrentUser() user?: RequestUser): Promise<PlaceMenuDto> {
    return this.menu.forPlace(uuidSchema.parse(id), false, user?.id);
  }

  // ── Избранное ─────────────────────────────────────────────────────────────

  @Post(':id/favorite')
  @ApiOperation({
    summary: 'Добавить или убрать из избранного',
    description: 'Один маршрут на оба действия: сердечко — переключатель, а не две кнопки.',
  })
  toggleFavorite(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ isFavorite: boolean }> {
    return this.places.toggleFavorite(user.id, uuidSchema.parse(id));
  }

  // ── Отзывы ────────────────────────────────────────────────────────────────

  @Public()
  @Get(':id/reviews')
  @ApiOperation({
    summary: 'Отзывы о заведении',
    description:
      'Сводка (средняя оценка, разбивка по звёздам), свой отзыв и первая страница чужих. ' +
      'Поле canReview говорит, вправе ли спрашивающий оставить отзыв.',
  })
  reviewsOf(
    @Param('id') id: string,
    @Query() rawQuery: unknown,
    @CurrentUser() user?: RequestUser,
  ): Promise<PlaceReviewsDto> {
    return this.reviews.forPlace(
      uuidSchema.parse(id),
      reviewListQuerySchema.parse(rawQuery),
      user?.id,
    );
  }

  @Public()
  @Get(':id/reviews/page')
  @ApiOperation({ summary: 'Ещё отзывы', description: 'Продолжение списка по курсору.' })
  reviewsPage(
    @Param('id') id: string,
    @Query() rawQuery: unknown,
    @CurrentUser() user?: RequestUser,
  ): Promise<PaginatedResponse<PlaceReviewDto>> {
    return this.reviews.page(uuidSchema.parse(id), reviewListQuerySchema.parse(rawQuery), user?.id);
  }

  @Put(':id/reviews/my')
  @RateLimit({ limit: 20, windowSeconds: 3600, scope: 'user' })
  @ApiOperation({
    summary: 'Оставить или изменить свой отзыв',
    description:
      'Доступно только после выполненного заказа в этом заведении. Отзыв один ' +
      'на человека и заведение: повторный заказ правит существующую оценку.',
  })
  @ApiZodBody(upsertReviewSchema)
  upsertReview(
    @Param('id') id: string,
    @Body(zodBody(upsertReviewSchema)) dto: UpsertReviewDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PlaceReviewDto> {
    return this.reviews.upsert(uuidSchema.parse(id), user.id, dto);
  }

  @Delete(':id/reviews/my')
  @ApiOperation({ summary: 'Убрать свой отзыв' })
  removeReview(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.reviews.remove(uuidSchema.parse(id), user.id);
  }

  @Post('reviews/:reviewId/reply')
  @ApiOperation({
    summary: 'Ответить на отзыв',
    description: 'Пишет управляющий заведения из своего кабинета.',
  })
  @ApiZodBody(replyReviewSchema)
  replyToReview(
    @Param('reviewId') reviewId: string,
    @Body(zodBody(replyReviewSchema)) dto: ReplyReviewDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PlaceReviewDto> {
    return this.reviews.reply(uuidSchema.parse(reviewId), user.id, dto);
  }
}
