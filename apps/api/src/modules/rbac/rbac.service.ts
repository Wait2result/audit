import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';

export interface UserAccess {
  roles: string[];
  permissions: string[];
}

/**
 * Разбор прав пользователя (пункт 28 ТЗ).
 *
 * Права хранятся не у пользователя напрямую, а через роли:
 *   пользователь → роли → права
 *
 * Такая связка позволяет менять набор прав роли «Модератор» один раз,
 * а не у каждого из двадцати модераторов по отдельности.
 *
 * Результат кешируется на короткое время: он нужен при каждом входе и
 * обновлении токена, а меняется редко.
 */
@Injectable()
export class RbacService {
  private static readonly CACHE_TTL_SECONDS = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getUserAccess(userId: string): Promise<UserAccess> {
    const cacheKey = accessKey(userId);

    const cached = await this.redis.getJson<UserAccess>(cacheKey);
    if (cached) return cached;

    const assignments = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: { include: { permission: { select: { name: true } } } },
          },
        },
      },
    });

    const roles = assignments.map((a) => a.role.name);

    // Set убирает дубли: одно и то же право может прийти из нескольких ролей.
    const permissions = [
      ...new Set(assignments.flatMap((a) => a.role.permissions.map((rp) => rp.permission.name))),
    ];

    const access: UserAccess = { roles, permissions };
    await this.redis.setJson(cacheKey, access, RbacService.CACHE_TTL_SECONDS);

    return access;
  }

  /**
   * Сбрасывает кеш прав пользователя.
   * Обязательно вызывать при выдаче или отзыве роли — иначе изменение
   * вступит в силу только через пять минут.
   */
  async invalidate(userId: string): Promise<void> {
    await this.redis.del(accessKey(userId));
  }

  /** Назначает роль пользователю. */
  async assignRole(userId: string, roleName: string, grantedById?: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new Error(
        `Роль «${roleName}» не найдена. Выполните заполнение справочников (db:seed).`,
      );
    }

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id, grantedById: grantedById ?? null },
      update: {},
    });

    await this.invalidate(userId);
  }

  async removeRole(userId: string, roleName: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) return;

    await this.prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
    await this.invalidate(userId);
  }

  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const access = await this.getUserAccess(userId);
    return access.permissions.includes(permission);
  }
}

const accessKey = (userId: string) => `rbac:access:${userId}`;
