import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Permission,
  paginationSchema,
  type AdminUserListItem,
  type AuthenticatedUser,
  type PaginatedResponse,
  type PaginationParams,
} from '@dagestan/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { CurrentUser, RequirePermissions } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ApiZodBody, ApiZodQuery } from '../../common/zod/zod-openapi.js';
import { zodBody } from '../../common/zod/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

const listUsersSchema = paginationSchema.extend({
  /** Поиск по имени или номеру телефона */
  search: z.string().trim().max(60).optional(),
  status: z.enum(['pending', 'active', 'blocked', 'deleted']).optional(),
});

type ListUsersQuery = z.infer<typeof listUsersSchema>;

const blockUserSchema = z.object({
  reason: z.string().trim().min(3, 'Укажите причину блокировки').max(500),
  /** Пусто — блокировка бессрочная */
  expiresAt: z.iso.datetime().optional(),
});

type BlockUserDto = z.infer<typeof blockUserSchema>;

@ApiTags('Пользователи')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Данные текущего пользователя',
    description:
      'Используется приложением и панелью управления сразу после входа, ' +
      'чтобы узнать имя, город, роли и права.',
  })
  async me(@CurrentUser() user: RequestUser): Promise<AuthenticatedUser> {
    const record = await this.users.requireById(user.id);
    return this.users.toAuthenticatedUser(record);
  }

  @Get()
  @RequirePermissions(Permission.USERS_READ)
  @ApiOperation({
    summary: 'Список пользователей',
    description: 'Только для сотрудников с правом просмотра пользователей.',
  })
  @ApiZodQuery(listUsersSchema)
  list(@Query() rawQuery: unknown): Promise<PaginatedResponse<AdminUserListItem>> {
    const query: ListUsersQuery = listUsersSchema.parse(rawQuery);
    const params: PaginationParams = {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    };

    return this.users.listForAdmin(params, {
      ...(query.search ? { search: query.search } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions(Permission.USERS_READ)
  @ApiOperation({ summary: 'Карточка пользователя' })
  findOne(@Param('id') id: string): Promise<AdminUserListItem> {
    return this.users.findForAdmin(id);
  }

  @Post(':id/block')
  @RequirePermissions(Permission.USERS_BLOCK)
  @ApiOperation({
    summary: 'Заблокировать пользователя',
    description:
      'Все активные сессии пользователя завершаются немедленно — он теряет доступ, ' +
      'не дожидаясь истечения токена.',
  })
  @ApiZodBody(blockUserSchema)
  async block(
    @Param('id') id: string,
    @Body(zodBody(blockUserSchema)) dto: BlockUserDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.users.block(id, dto, actor.id, auditContext(request));
    return { success: true };
  }

  @Post(':id/unblock')
  @RequirePermissions(Permission.USERS_BLOCK)
  @ApiOperation({ summary: 'Снять блокировку' })
  async unblock(
    @Param('id') id: string,
    @CurrentUser() actor: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.users.unblock(id, actor.id, auditContext(request));
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
