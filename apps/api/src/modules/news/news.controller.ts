import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Permission,
  uuidSchema,
  type AdminNewsListItem,
  type NewsDetailsDto,
  type NewsSummaryDto,
  type PaginatedResponse,
} from '@dagestan/shared';
import type { FastifyRequest } from 'fastify';

import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { NewsService } from './news.service.js';
import { newsAdminListQuerySchema, newsFeedQuerySchema } from './news.schema.js';

@ApiTags('Новости')
@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Лента новостей',
    description:
      'scope: city — только выбранный город, dagestan — общая для всех городов, ' +
      'russia и world — федеральные, подтверждённые несколькими агентствами. ' +
      'Курсорная пагинация. Аккаунт не требуется.',
  })
  feed(@Query() rawQuery: unknown): Promise<PaginatedResponse<NewsSummaryDto>> {
    const { cityId, scope, cursor, limit } = newsFeedQuerySchema.parse(rawQuery);
    return this.news.getFeed(cityId, scope, { limit, ...(cursor ? { cursor } : {}) });
  }

  // Маршрут админки — три сегмента, поэтому с «:id» (два сегмента) не пересекается
  @RequirePermissions(Permission.NEWS_READ)
  @Get('admin/list')
  @ApiOperation({
    summary: 'Все новости, включая скрытые',
    description: 'Только для панели управления.',
  })
  adminList(@Query() rawQuery: unknown): Promise<PaginatedResponse<AdminNewsListItem>> {
    const { scope, cursor, limit } = newsAdminListQuerySchema.parse(rawQuery);
    return this.news.listForAdmin(
      { limit, ...(cursor ? { cursor } : {}) },
      { ...(scope ? { scope } : {}) },
    );
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Новость целиком: текст абзацами, если источник разрешает полный текст',
  })
  item(@Param('id') id: string): Promise<NewsDetailsDto> {
    return this.news.getItem(uuidSchema.parse(id));
  }

  @RequirePermissions(Permission.NEWS_MANAGE)
  @Post(':id/hide')
  @ApiOperation({ summary: 'Скрыть новость из приложения' })
  async hide(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.news.setHidden(uuidSchema.parse(id), true, user.id, auditContext(request));
    return { success: true };
  }

  @RequirePermissions(Permission.NEWS_MANAGE)
  @Post(':id/unhide')
  @ApiOperation({ summary: 'Вернуть скрытую новость в приложение' })
  async unhide(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.news.setHidden(uuidSchema.parse(id), false, user.id, auditContext(request));
    return { success: true };
  }
}

function auditContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    requestId: (request as { id?: string }).id,
  };
}
