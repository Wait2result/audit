import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Permission,
  addPlaceMemberSchema,
  adminPlaceListQuerySchema,
  createPlaceCategorySchema,
  createPlaceSchema,
  createPromoBannerSchema,
  paginationSchema,
  promoPlacementSchema,
  reorderCategoriesSchema,
  reorderPromoBannersSchema,
  updatePlaceCategorySchema,
  updatePlaceSchema,
  updatePromoBannerSchema,
  updateScheduleSchema,
  uuidSchema,
  type AddPlaceMemberDto,
  type CreatePlaceDto,
  type CreatePlaceCategoryDto,
  type CreatePromoBannerDto,
  type PaginatedResponse,
  type PlaceCategoryAdminDto,
  type PlaceMemberDto,
  type PlaceReviewDto,
  type PlaceScheduleDto,
  type PromoBannerAdminDto,
  type ReorderCategoriesDto,
  type ReorderPromoBannersDto,
  type UpdatePlaceCategoryDto,
  type UpdatePlaceDto,
  type UpdatePromoBannerDto,
  type UpdateScheduleDto,
} from '@dagestan/shared';
import type { FastifyRequest } from 'fastify';

import { CurrentUser, RequirePermissions } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ApiZodBody } from '../../common/zod/zod-openapi.js';
import { zodBody } from '../../common/zod/zod-validation.pipe.js';
import { auditContext } from './audit-context.js';
import { CategoriesService } from './categories.service.js';
import { PlacesService } from './places.service.js';
import { PromoBannersService } from './promo-banners.service.js';
import { ReviewsService } from './reviews.service.js';

/**
 * Управление заведениями из админ-панели (Этап 6).
 *
 * Сотрудник платформы заводит заведение и выдаёт доступ его сотрудникам.
 * Дальше заведение ведут они сами — из приложения.
 */
@ApiTags('Заведения: управление')
@ApiBearerAuth()
@Controller('places')
export class PlacesAdminController {
  constructor(
    private readonly places: PlacesService,
    private readonly reviews: ReviewsService,
    private readonly categories: CategoriesService,
    private readonly promoBanners: PromoBannersService,
  ) {}

  @RequirePermissions(Permission.PLACES_READ)
  @Get('admin/list')
  @ApiOperation({ summary: 'Все заведения, включая выключенные' })
  listForAdmin(@Query() rawQuery: unknown) {
    const { cursor, limit, cityId, search } = adminPlaceListQuerySchema.parse(rawQuery);

    return this.places.listForAdmin({ cursor, limit }, { cityId, search });
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Post()
  @ApiOperation({
    summary: 'Завести заведение',
    description: 'Сразу создаётся неделя расписания с обычными часами — её потом правят.',
  })
  @ApiZodBody(createPlaceSchema)
  create(
    @Body(zodBody(createPlaceSchema)) dto: CreatePlaceDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ) {
    return this.places.create(dto, user.id, auditContext(request));
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Изменить заведение' })
  @ApiZodBody(updatePlaceSchema)
  update(
    @Param('id') id: string,
    @Body(zodBody(updatePlaceSchema)) dto: UpdatePlaceDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ) {
    return this.places.update(uuidSchema.parse(id), dto, user.id, auditContext(request));
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Patch(':id/schedule')
  @ApiOperation({ summary: 'Часы работы на неделю' })
  @ApiZodBody(updateScheduleSchema)
  updateSchedule(
    @Param('id') id: string,
    @Body(zodBody(updateScheduleSchema)) dto: UpdateScheduleDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<PlaceScheduleDto[]> {
    return this.places.updateSchedule(uuidSchema.parse(id), dto, user.id, auditContext(request));
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Delete(':id')
  @ApiOperation({ summary: 'Убрать заведение из каталога' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.places.softDelete(uuidSchema.parse(id), user.id, auditContext(request));

    return { success: true };
  }

  // ── Доступы сотрудников заведения ─────────────────────────────────────────

  @RequirePermissions(Permission.PLACES_READ)
  @Get(':id/members')
  @ApiOperation({ summary: 'Кто управляет заведением' })
  members(@Param('id') id: string): Promise<PlaceMemberDto[]> {
    return this.places.listMembers(uuidSchema.parse(id));
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Post(':id/members')
  @ApiOperation({
    summary: 'Выдать доступ по номеру телефона',
    description:
      'Номер должен принадлежать уже зарегистрированному аккаунту. Приглашений ' +
      'по коду нет: код можно передать кому угодно, а номер привязан к человеку.',
  })
  @ApiZodBody(addPlaceMemberSchema)
  addMember(
    @Param('id') id: string,
    @Body(zodBody(addPlaceMemberSchema)) dto: AddPlaceMemberDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<PlaceMemberDto> {
    return this.places.addMember(uuidSchema.parse(id), dto, user.id, auditContext(request));
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Отозвать доступ' })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.places.removeMember(
      uuidSchema.parse(id),
      uuidSchema.parse(userId),
      user.id,
      auditContext(request),
    );

    return { success: true };
  }

  // ── Модерация отзывов ─────────────────────────────────────────────────────

  @RequirePermissions(Permission.REVIEWS_READ)
  @Get('admin/reviews')
  @ApiOperation({
    summary: 'Отзывы о заведениях',
    description: 'Общий список для модерации. includeHidden=1 показывает и скрытые.',
  })
  listReviews(
    @Query() rawQuery: unknown,
    @Query('includeHidden') includeHidden?: string,
  ): Promise<PaginatedResponse<PlaceReviewDto & { placeName: string; isHidden: boolean }>> {
    const { cursor, limit } = paginationSchema.parse(rawQuery);

    return this.reviews.listForAdmin({ cursor, limit }, includeHidden === '1');
  }

  @RequirePermissions(Permission.REVIEWS_MODERATE)
  @Post('admin/reviews/:reviewId/hide')
  @ApiOperation({
    summary: 'Скрыть отзыв',
    description:
      'Отзыв остаётся в базе, но не показывается и перестаёт влиять на рейтинг. ' +
      'Удаления нет намеренно: спор «вы стёрли мой отзыв» решается записями.',
  })
  async hideReview(
    @Param('reviewId') reviewId: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.reviews.setHidden(uuidSchema.parse(reviewId), true, user.id, auditContext(request));

    return { success: true };
  }

  @RequirePermissions(Permission.REVIEWS_MODERATE)
  @Post('admin/reviews/:reviewId/unhide')
  @ApiOperation({ summary: 'Вернуть отзыв' })
  async unhideReview(
    @Param('reviewId') reviewId: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.reviews.setHidden(uuidSchema.parse(reviewId), false, user.id, auditContext(request));

    return { success: true };
  }

  // ── Категории витрины ─────────────────────────────────────────────────────

  @RequirePermissions(Permission.PLACES_READ)
  @Get('admin/categories')
  @ApiOperation({
    summary: 'Категории витрины',
    description:
      'Все категории, включая выключенные. У каждой показано, сколько заведений ' +
      'в неё сейчас попадает: пустая плитка в приложении выглядит как обман.',
  })
  listCategories(): Promise<PlaceCategoryAdminDto[]> {
    return this.categories.listForAdmin();
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Post('admin/categories')
  @ApiOperation({
    summary: 'Добавить категорию',
    description:
      'Категория подбирает заведения по словам кухонь и виду заведения. ' +
      'Слово сравнивается по вхождению: «дагестанск» поймает «Дагестанская кухня».',
  })
  @ApiZodBody(createPlaceCategorySchema)
  createCategory(
    @Body(zodBody(createPlaceCategorySchema)) dto: CreatePlaceCategoryDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<PlaceCategoryAdminDto> {
    return this.categories.create(dto, user.id, auditContext(request));
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Patch('admin/categories/:categoryId')
  @ApiOperation({ summary: 'Изменить категорию' })
  @ApiZodBody(updatePlaceCategorySchema)
  updateCategory(
    @Param('categoryId') categoryId: string,
    @Body(zodBody(updatePlaceCategorySchema)) dto: UpdatePlaceCategoryDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<PlaceCategoryAdminDto> {
    return this.categories.update(
      uuidSchema.parse(categoryId),
      dto,
      user.id,
      auditContext(request),
    );
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Post('admin/categories/reorder')
  @ApiOperation({
    summary: 'Переставить категории',
    description: 'Приходит весь порядок целиком: перестановка — это не правка полей.',
  })
  @ApiZodBody(reorderCategoriesSchema)
  async reorderCategories(
    @Body(zodBody(reorderCategoriesSchema)) dto: ReorderCategoriesDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.categories.reorder(dto.ids, user.id, auditContext(request));

    return { success: true };
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Delete('admin/categories/:categoryId')
  @ApiOperation({
    summary: 'Удалить категорию',
    description: 'Удаление мягкое: запись остаётся, чтобы старые ссылки можно было разобрать.',
  })
  async deleteCategory(
    @Param('categoryId') categoryId: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.categories.remove(uuidSchema.parse(categoryId), user.id, auditContext(request));

    return { success: true };
  }

  // ── Промо-баннеры ─────────────────────────────────────────────────────────

  @RequirePermissions(Permission.PLACES_READ)
  @Get('admin/promo-banners')
  @ApiOperation({
    summary: 'Промо-баннеры места показа',
    description: 'Все карточки главной страницы или витрины доставки, включая выключенные.',
  })
  listPromoBanners(@Query('placement') placement: unknown): Promise<PromoBannerAdminDto[]> {
    return this.promoBanners.listForAdmin(promoPlacementSchema.parse(placement));
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Post('admin/promo-banners')
  @ApiOperation({
    summary: 'Добавить промо-баннер',
    description:
      'Картинка — обычная загрузка через модуль медиа. Заведение необязательно: ' +
      'без него карточка просто информационная, нажатие никуда не ведёт.',
  })
  @ApiZodBody(createPromoBannerSchema)
  createPromoBanner(
    @Body(zodBody(createPromoBannerSchema)) dto: CreatePromoBannerDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<PromoBannerAdminDto> {
    return this.promoBanners.create(dto, user.id, auditContext(request));
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Patch('admin/promo-banners/:bannerId')
  @ApiOperation({ summary: 'Изменить промо-баннер' })
  @ApiZodBody(updatePromoBannerSchema)
  updatePromoBanner(
    @Param('bannerId') bannerId: string,
    @Body(zodBody(updatePromoBannerSchema)) dto: UpdatePromoBannerDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<PromoBannerAdminDto> {
    return this.promoBanners.update(
      uuidSchema.parse(bannerId),
      dto,
      user.id,
      auditContext(request),
    );
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Post('admin/promo-banners/reorder')
  @ApiOperation({
    summary: 'Переставить промо-баннеры',
    description: 'Приходит весь порядок целиком, отдельно для каждого места показа.',
  })
  @ApiZodBody(reorderPromoBannersSchema)
  async reorderPromoBanners(
    @Query('placement') placement: unknown,
    @Body(zodBody(reorderPromoBannersSchema)) dto: ReorderPromoBannersDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.promoBanners.reorder(
      promoPlacementSchema.parse(placement),
      dto.ids,
      user.id,
      auditContext(request),
    );

    return { success: true };
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Delete('admin/promo-banners/:bannerId')
  @ApiOperation({
    summary: 'Удалить промо-баннер',
    description: 'Удаление мягкое: запись остаётся в базе.',
  })
  async deletePromoBanner(
    @Param('bannerId') bannerId: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.promoBanners.remove(uuidSchema.parse(bannerId), user.id, auditContext(request));

    return { success: true };
  }
}
