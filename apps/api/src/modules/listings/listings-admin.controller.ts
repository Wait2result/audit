import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Permission,
  adminListingsQuerySchema,
  paginationSchema,
  promoteListingSchema,
  resolveReportSchema,
  suspendListingSchema,
  uuidSchema,
  type ListingAdminDto,
  type ListingCategoryAdminDto,
  type ListingReportDto,
  type PaginatedResponse,
  type PromoteListingDto,
  type ResolveReportDto,
  type SuspendListingDto,
} from '@dagestan/shared';
import type { FastifyRequest } from 'fastify';

import { CurrentUser, RequirePermissions } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ApiZodBody } from '../../common/zod/zod-openapi.js';
import { zodBody } from '../../common/zod/zod-validation.pipe.js';
import { auditContext } from '../places/audit-context.js';
import { ListingCategoriesService } from './listing-categories.service.js';
import { ListingsModerationService } from './listings-moderation.service.js';

/**
 * Объявления: работа сотрудника платформы (Этап 7).
 *
 * Отдельный контроллер от витрины намеренно: смешивать разбор жалоб и
 * публичный список в одном файле — верный способ однажды отдать наружу
 * телефон продавца и очередь модерации.
 *
 * Разделение прав: снимать и возвращать объявления может модератор
 * (moderation:decide), а править справочник категорий и раздавать
 * продвижение — только администратор (listings:manage). Это разные задачи и
 * разные люди.
 */
@ApiTags('Объявления: управление')
@ApiBearerAuth()
@Controller('listings')
export class ListingsAdminController {
  constructor(
    private readonly moderation: ListingsModerationService,
    private readonly categories: ListingCategoriesService,
  ) {}

  @Get('admin/list')
  @RequirePermissions(Permission.MODERATION_READ)
  @ApiOperation({
    summary: 'Все объявления',
    description: 'Сначала те, на кого жалуются: очередь разбора — главный смысл раздела.',
  })
  list(@Query() rawQuery: unknown): Promise<PaginatedResponse<ListingAdminDto>> {
    return this.moderation.adminList(adminListingsQuerySchema.parse(rawQuery));
  }

  @Get('admin/reports')
  @RequirePermissions(Permission.REPORTS_READ)
  @ApiOperation({ summary: 'Жалобы на объявления' })
  reports(
    @Query() rawQuery: unknown,
    @Query('onlyNew') onlyNew?: string,
  ): Promise<PaginatedResponse<ListingReportDto>> {
    const page = paginationSchema.parse(rawQuery);
    return this.moderation.reports({ ...page, onlyNew: onlyNew === '1' || onlyNew === 'true' });
  }

  @Post('admin/reports/:reportId/resolve')
  @RequirePermissions(Permission.REPORTS_RESOLVE)
  @ApiZodBody(resolveReportSchema)
  @ApiOperation({
    summary: 'Решение по жалобе',
    description:
      'Подтверждение снимает объявление и закрывает разом все жалобы на него: ' +
      'разбирать двадцать одинаковых по очереди незачем.',
  })
  async resolveReport(
    @Param('reportId') reportId: string,
    @Body(zodBody(resolveReportSchema)) dto: ResolveReportDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ ok: true }> {
    await this.moderation.resolveReport(
      uuidSchema.parse(reportId),
      dto,
      user.id,
      auditContext(request),
    );
    return { ok: true };
  }

  @Post('admin/:id/suspend')
  @RequirePermissions(Permission.MODERATION_DECIDE)
  @ApiZodBody(suspendListingSchema)
  @ApiOperation({
    summary: 'Снять с публикации',
    description:
      'Объявление остаётся в базе и у автора в кабинете — с причиной. Удаления нет ' +
      'намеренно: спор «вы стёрли моё объявление» решается записями.',
  })
  async suspend(
    @Param('id') id: string,
    @Body(zodBody(suspendListingSchema)) dto: SuspendListingDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ ok: true }> {
    await this.moderation.suspend(uuidSchema.parse(id), dto.reason, user.id, auditContext(request));
    return { ok: true };
  }

  @Post('admin/:id/restore')
  @RequirePermissions(Permission.MODERATION_DECIDE)
  @ApiOperation({
    summary: 'Вернуть в ленту',
    description: 'Накопленные жалобы закрываются, иначе объявление тут же снимется снова.',
  })
  async restore(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ ok: true }> {
    await this.moderation.restore(uuidSchema.parse(id), user.id, auditContext(request));
    return { ok: true };
  }

  @Post('admin/:id/archive')
  @RequirePermissions(Permission.MODERATION_DECIDE)
  @ApiOperation({ summary: 'Убрать в архив' })
  async archive(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ ok: true }> {
    await this.moderation.archive(uuidSchema.parse(id), user.id, auditContext(request));
    return { ok: true };
  }

  @Post('admin/:id/category')
  @RequirePermissions(Permission.MODERATION_DECIDE)
  @ApiOperation({
    summary: 'Перенести в другую категорию',
    description: 'Типовое решение по жалобе «не та категория» — вместо снятия.',
  })
  async changeCategory(
    @Param('id') id: string,
    @Body('categoryId') categoryId: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ ok: true }> {
    await this.moderation.changeCategory(
      uuidSchema.parse(id),
      uuidSchema.parse(categoryId),
      user.id,
      auditContext(request),
    );
    return { ok: true };
  }

  @Post('admin/:id/bump')
  @RequirePermissions(Permission.LISTINGS_MANAGE)
  @ApiOperation({ summary: 'Поднять объявление' })
  async bump(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ ok: true }> {
    await this.moderation.bump(uuidSchema.parse(id), user.id, auditContext(request));
    return { ok: true };
  }

  @Post('admin/:id/promote')
  @RequirePermissions(Permission.LISTINGS_MANAGE)
  @ApiZodBody(promoteListingSchema)
  @ApiOperation({
    summary: 'Продвижение объявления',
    description:
      'Оплаты пока нет: сроки ставятся вручную. «В топе до» на порядок выдачи ' +
      'сейчас не влияет — см. docs/ADR/0008-объявления.md.',
  })
  async promote(
    @Param('id') id: string,
    @Body(zodBody(promoteListingSchema)) dto: PromoteListingDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ ok: true }> {
    await this.moderation.promote(uuidSchema.parse(id), dto, user.id, auditContext(request));
    return { ok: true };
  }

  @Get('admin/categories')
  @RequirePermissions(Permission.LISTINGS_MANAGE)
  @ApiOperation({ summary: 'Дерево категорий со скрытыми' })
  categoriesTree(): Promise<ListingCategoryAdminDto[]> {
    return this.categories.adminTree();
  }
}
