import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Permission,
  paginationSchema,
  type AuditLogEntry,
  type DashboardSummary,
  type PaginatedResponse,
  type PaginationParams,
  type RoleWithPermissions,
} from '@dagestan/shared';
import { z } from 'zod';

import { RequirePermissions } from '../../common/decorators/index.js';
import { ApiZodQuery } from '../../common/zod/zod-openapi.js';
import { AdminService } from './admin.service.js';

const auditQuerySchema = paginationSchema.extend({
  action: z.string().trim().max(80).optional(),
  actorId: z.uuid().optional(),
  targetType: z.string().trim().max(40).optional(),
});

@ApiTags('Панель управления')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  @RequirePermissions(Permission.ANALYTICS_READ)
  @ApiOperation({ summary: 'Сводка для главной страницы панели' })
  dashboard(): Promise<DashboardSummary> {
    return this.admin.getDashboard();
  }

  @Get('audit')
  @RequirePermissions(Permission.SYSTEM_AUDIT_READ)
  @ApiOperation({
    summary: 'Журнал действий администраторов',
    description:
      'Записи только добавляются: изменить или удалить их нельзя ни через панель, ни через API.',
  })
  @ApiZodQuery(auditQuerySchema)
  audit(@Query() rawQuery: unknown): Promise<PaginatedResponse<AuditLogEntry>> {
    const query = auditQuerySchema.parse(rawQuery);
    const pagination: PaginationParams = {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    };

    return this.admin.listAuditLog(pagination, {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
    });
  }

  @Get('roles')
  @RequirePermissions(Permission.ROLES_READ)
  @ApiOperation({ summary: 'Роли и их наборы прав' })
  roles(): Promise<RoleWithPermissions[]> {
    return this.admin.listRoles();
  }
}
