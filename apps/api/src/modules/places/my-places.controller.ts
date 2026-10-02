import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createMenuCategorySchema,
  createMenuItemSchema,
  createOptionGroupSchema,
  setAvailabilitySchema,
  updateMenuCategorySchema,
  updateMenuItemSchema,
  updateMyPlaceSchema,
  updateScheduleSchema,
  uuidSchema,
  type CreateMenuCategoryDto,
  type CreateMenuItemDto,
  type CreateOptionGroupDto,
  type MenuCategoryDto,
  type MenuItemDto,
  type MyPlaceDto,
  type PlaceDetailsDto,
  type PlaceMenuDto,
  type PlaceScheduleDto,
  type SetAvailabilityDto,
  type UpdateMenuCategoryDto,
  type UpdateMenuItemDto,
  type UpdateMyPlaceDto,
  type UpdateScheduleDto,
} from '@dagestan/shared';
import type { FastifyRequest } from 'fastify';

import { CurrentUser } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ApiZodBody } from '../../common/zod/zod-openapi.js';
import { zodBody } from '../../common/zod/zod-validation.pipe.js';
import { auditContext } from './audit-context.js';
import { MenuService } from './menu.service.js';
import { PlaceAccessService } from './place-access.service.js';
import { PlacesService } from './places.service.js';

/**
 * Кабинет заведения (Этап 6).
 *
 * Сюда заходят сотрудники самого заведения — обычные пользователи
 * приложения, которым выдали доступ в админ-панели. Это не роль платформы:
 * право здесь даёт запись в place_members, и проверяется она на каждом
 * маршруте через PlaceAccessService.
 *
 * Уровни: управляющий меняет всё, сотрудник — только стоп-лист (и заказы,
 * когда они появятся). Скрытые в приложении кнопки — удобство, а не защита.
 */
@ApiTags('Заведения: кабинет')
@ApiBearerAuth()
@Controller('my/places')
export class MyPlacesController {
  constructor(
    private readonly places: PlacesService,
    private readonly menu: MenuService,
    private readonly access: PlaceAccessService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Мои заведения',
    description:
      'Заведения, к которым у аккаунта есть доступ. Пустой список — обычный ответ: ' +
      'по нему приложение прячет раздел «Моё заведение».',
  })
  myPlaces(@CurrentUser() user: RequestUser): Promise<MyPlaceDto[]> {
    return this.places.myPlaces(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Моё заведение целиком' })
  async myPlace(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PlaceDetailsDto> {
    const placeId = uuidSchema.parse(id);
    await this.access.assertAccess(user.id, placeId, false);

    return this.places.myPlace(placeId);
  }

  @Get(':id/menu')
  @ApiOperation({
    summary: 'Меню для редактирования',
    description: 'В отличие от витрины, показывает и скрытые разделы с позициями.',
  })
  async myMenu(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<PlaceMenuDto> {
    const placeId = uuidSchema.parse(id);
    await this.access.assertAccess(user.id, placeId, false);

    return this.menu.forPlace(placeId, true);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменить своё заведение', description: 'Только управляющий.' })
  @ApiZodBody(updateMyPlaceSchema)
  async updatePlace(
    @Param('id') id: string,
    @Body(zodBody(updateMyPlaceSchema)) dto: UpdateMyPlaceDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ) {
    const placeId = uuidSchema.parse(id);
    await this.access.assertAccess(user.id, placeId, true);

    return this.places.update(placeId, dto, user.id, auditContext(request));
  }

  @Patch(':id/schedule')
  @ApiOperation({ summary: 'Часы работы', description: 'Только управляющий.' })
  @ApiZodBody(updateScheduleSchema)
  async updateSchedule(
    @Param('id') id: string,
    @Body(zodBody(updateScheduleSchema)) dto: UpdateScheduleDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<PlaceScheduleDto[]> {
    const placeId = uuidSchema.parse(id);
    await this.access.assertAccess(user.id, placeId, true);

    return this.places.updateSchedule(placeId, dto, user.id, auditContext(request));
  }

  // ── Разделы меню ──────────────────────────────────────────────────────────

  @Post(':id/categories')
  @ApiOperation({ summary: 'Добавить раздел меню', description: 'Только управляющий.' })
  @ApiZodBody(createMenuCategorySchema)
  async createCategory(
    @Param('id') id: string,
    @Body(zodBody(createMenuCategorySchema)) dto: CreateMenuCategoryDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<MenuCategoryDto> {
    const placeId = uuidSchema.parse(id);
    await this.access.assertAccess(user.id, placeId, true);

    return this.menu.createCategory(placeId, dto, user.id, auditContext(request));
  }

  @Patch('categories/:categoryId')
  @ApiOperation({ summary: 'Изменить раздел меню', description: 'Только управляющий.' })
  @ApiZodBody(updateMenuCategorySchema)
  async updateCategory(
    @Param('categoryId') categoryId: string,
    @Body(zodBody(updateMenuCategorySchema)) dto: UpdateMenuCategoryDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<MenuCategoryDto> {
    const id = uuidSchema.parse(categoryId);
    await this.access.assertAccess(user.id, await this.access.placeIdOfCategory(id), true);

    return this.menu.updateCategory(id, dto, user.id, auditContext(request));
  }

  @Delete('categories/:categoryId')
  @ApiOperation({ summary: 'Убрать раздел меню', description: 'Только управляющий.' })
  async deleteCategory(
    @Param('categoryId') categoryId: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    const id = uuidSchema.parse(categoryId);
    await this.access.assertAccess(user.id, await this.access.placeIdOfCategory(id), true);
    await this.menu.deleteCategory(id, user.id, auditContext(request));

    return { success: true };
  }

  // ── Позиции ───────────────────────────────────────────────────────────────

  @Post(':id/items')
  @ApiOperation({ summary: 'Добавить позицию', description: 'Только управляющий.' })
  @ApiZodBody(createMenuItemSchema)
  async createItem(
    @Param('id') id: string,
    @Body(zodBody(createMenuItemSchema)) dto: CreateMenuItemDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<MenuItemDto> {
    const placeId = uuidSchema.parse(id);
    await this.access.assertAccess(user.id, placeId, true);

    return this.menu.createItem(placeId, dto, user.id, auditContext(request));
  }

  @Patch('items/:itemId')
  @ApiOperation({
    summary: 'Изменить позицию, в том числе цену',
    description: 'Только управляющий: цена — это деньги.',
  })
  @ApiZodBody(updateMenuItemSchema)
  async updateItem(
    @Param('itemId') itemId: string,
    @Body(zodBody(updateMenuItemSchema)) dto: UpdateMenuItemDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<MenuItemDto> {
    const id = uuidSchema.parse(itemId);
    await this.access.assertAccess(user.id, await this.access.placeIdOfMenuItem(id), true);

    return this.menu.updateItem(id, dto, user.id, auditContext(request));
  }

  @Patch('items/:itemId/availability')
  @ApiOperation({
    summary: 'Стоп-лист: позиция закончилась или снова есть',
    description: 'Доступно и сотруднику — это самое частое действие за смену.',
  })
  @ApiZodBody(setAvailabilitySchema)
  async setAvailability(
    @Param('itemId') itemId: string,
    @Body(zodBody(setAvailabilitySchema)) dto: SetAvailabilityDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ id: string; isAvailable: boolean }> {
    const id = uuidSchema.parse(itemId);
    await this.access.assertAccess(user.id, await this.access.placeIdOfMenuItem(id), false);

    return this.menu.setAvailability(id, dto.isAvailable, user.id, auditContext(request));
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Убрать позицию из меню', description: 'Только управляющий.' })
  async deleteItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    const id = uuidSchema.parse(itemId);
    await this.access.assertAccess(user.id, await this.access.placeIdOfMenuItem(id), true);
    await this.menu.deleteItem(id, user.id, auditContext(request));

    return { success: true };
  }

  // ── Группы выбора ─────────────────────────────────────────────────────────

  @Post('items/:itemId/option-groups')
  @ApiOperation({
    summary: 'Добавить или заменить группу выбора',
    description:
      'Группа со всеми вариантами записывается целиком. Чтобы заменить существующую, ' +
      'передайте её идентификатор в replacesGroupId. Только управляющий.',
  })
  @ApiZodBody(createOptionGroupSchema)
  async saveOptionGroup(
    @Param('itemId') itemId: string,
    @Body(zodBody(createOptionGroupSchema)) dto: CreateOptionGroupDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    const id = uuidSchema.parse(itemId);
    await this.access.assertAccess(user.id, await this.access.placeIdOfMenuItem(id), true);
    await this.menu.replaceOptionGroup(id, null, dto, user.id, auditContext(request));

    return { success: true };
  }

  @Delete('option-groups/:groupId')
  @ApiOperation({ summary: 'Убрать группу выбора', description: 'Только управляющий.' })
  async deleteOptionGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    const id = uuidSchema.parse(groupId);
    await this.access.assertAccess(user.id, await this.menu.placeIdOfGroup(id), true);
    await this.menu.deleteOptionGroup(id, user.id, auditContext(request));

    return { success: true };
  }
}
