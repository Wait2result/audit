import { Injectable } from '@nestjs/common';
import type {
  AuditLogEntry,
  DashboardSummary,
  PaginatedResponse,
  PaginationParams,
  RoleWithPermissions,
} from '@dagestan/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

/**
 * Данные для панели управления (пункт 27 ТЗ).
 *
 * Отдельный сервис, а не «по методу в каждом модуле»: панели нужны сводные
 * цифры сразу по всем разделам, и собирать их в одном месте дешевле, чем
 * дёргать десяток модулей по очереди.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Журнал действий ───────────────────────────────────────────────────────

  /**
   * Журнал действий администраторов.
   *
   * Пункт 4 ТЗ: записи только добавляются, изменять и удалять их не может
   * никто — методов для этого в системе просто нет.
   */
  async listAuditLog(
    pagination: PaginationParams,
    filters: { action?: string; actorId?: string; targetType?: string },
  ): Promise<PaginatedResponse<AuditLogEntry>> {
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(filters.action ? { action: { contains: filters.action } } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.targetType ? { targetType: filters.targetType } : {}),
    };

    const rows = await this.prisma.adminAuditLog.findMany({
      where,
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });

    const hasMore = rows.length > pagination.limit;
    const items = hasMore ? rows.slice(0, pagination.limit) : rows;

    return {
      items: items.map(toAuditEntry),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  // ── Роли и права ──────────────────────────────────────────────────────────

  async listRoles(): Promise<RoleWithPermissions[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { include: { permission: { select: { name: true } } } },
        _count: { select: { users: true } },
      },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      label: role.label,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions.map((rp) => rp.permission.name),
      userCount: role._count.users,
    }));
  }

  // ── Сводка ────────────────────────────────────────────────────────────────

  async getDashboard(): Promise<DashboardSummary> {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);

    // Все подсчёты одним заходом в базу вместо девяти последовательных:
    // на главной странице панели это разница между «мгновенно» и «секунда».
    const [
      totalUsers,
      activeUsers,
      blockedUsers,
      newUsers,
      totalCities,
      activeCities,
      mediaStats,
      orphanMedia,
      recentActions,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, status: 'active' } }),
      this.prisma.user.count({ where: { deletedAt: null, status: 'blocked' } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: weekAgo } } }),
      this.prisma.city.count({ where: { deletedAt: null } }),
      this.prisma.city.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.media.aggregate({
        where: { deletedAt: null },
        _count: true,
        _sum: { sizeBytes: true },
      }),
      this.prisma.media.count({ where: { deletedAt: null, isOrphan: true } }),
      this.prisma.adminAuditLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        blocked: blockedUsers,
        newLastWeek: newUsers,
      },
      cities: { total: totalCities, active: activeCities },
      media: {
        total: mediaStats._count,
        orphans: orphanMedia,
        totalBytes: mediaStats._sum.sizeBytes ?? 0,
      },
      recentActions: recentActions.map(toAuditEntry),
    };
  }
}

interface AuditRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: Date;
  before: unknown;
  after: unknown;
  actor: { id: string; firstName: string; lastName: string | null; phone: string } | null;
}

function toAuditEntry(row: AuditRow): AuditLogEntry {
  return {
    id: row.id,
    action: row.action,
    actor: row.actor,
    targetType: row.targetType,
    targetId: row.targetId,
    ipAddress: row.ipAddress,
    requestId: row.requestId,
    createdAt: row.createdAt.toISOString(),
    before: row.before,
    after: row.after,
  };
}
