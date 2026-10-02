import { Injectable, Logger } from '@nestjs/common';
import { argon2id, hash as argon2Hash, verify as argon2Verify, type HashOptions } from 'argon2';
import {
  ErrorCode,
  RoleName,
  type AdminUserListItem,
  type AuthenticatedUser,
  type PaginatedResponse,
  type PaginationParams,
} from '@dagestan/shared';
import type { Prisma, User } from '../../generated/prisma/client.js';

import { AppException } from '../../common/errors/app.exception.js';
import type { TokenSubject } from '../auth/token.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RbacService } from '../rbac/rbac.service.js';

/**
 * Параметры хеширования паролей (argon2id).
 *
 * argon2id — современный алгоритм, победитель конкурса Password Hashing
 * Competition. В отличие от старых (MD5, SHA1, даже bcrypt) он специально
 * сделан «дорогим по памяти»: перебор на видеокартах, которые дают взломщику
 * тысячекратное преимущество, становится невыгодным.
 *
 * memoryCost 19 МиБ и timeCost 2 — минимум, рекомендованный OWASP.
 * Увеличивать стоит осознанно: каждая проверка пароля занимает процессор
 * сервера, и слишком высокие значения превращают форму входа в лёгкую
 * мишень для атаки на исчерпание ресурсов.
 */
const ARGON2_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
  ) {}

  // ── Пароли ────────────────────────────────────────────────────────────────

  async hashPassword(password: string): Promise<string> {
    return argon2Hash(password, ARGON2_OPTIONS);
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2Verify(hash, password);
    } catch {
      // Повреждённый или устаревший формат хеша не должен ронять вход —
      // просто считаем пароль неверным.
      return false;
    }
  }

  // ── Поиск ─────────────────────────────────────────────────────────────────

  async findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { phone, deletedAt: null } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  async requireById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw AppException.notFound('Пользователь не найден');
    return user;
  }

  // ── Создание ──────────────────────────────────────────────────────────────

  async createUser(data: {
    phone: string;
    password: string;
    firstName: string;
    lastName?: string;
    cityId?: string;
    termsVersion: string;
  }): Promise<User> {
    const passwordHash = await this.hashPassword(data.password);

    // Всё создаётся одной транзакцией: пользователь, роль и настройки
    // уведомлений. Если хоть что-то не удастся — не создастся ничего,
    // и в базе не останется пользователя без роли.
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phone: data.phone,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName ?? null,
          cityId: data.cityId ?? null,
          status: 'active',
          termsAcceptedAt: new Date(),
          termsVersion: data.termsVersion,
        },
      });

      const userRole = await tx.role.findUnique({ where: { name: RoleName.USER } });
      if (userRole) {
        await tx.userRole.create({ data: { userId: user.id, roleId: userRole.id } });
      } else {
        this.logger.error(
          'Базовая роль «user» отсутствует в базе. Выполните заполнение справочников (npm run db:seed).',
        );
      }

      await tx.notificationPreference.create({ data: { userId: user.id } });

      return user;
    });
  }

  // ── Изменения ─────────────────────────────────────────────────────────────

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await this.hashPassword(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async markLoggedIn(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), lastSeenAt: new Date() },
    });
  }

  async registerDevice(
    userId: string,
    device: {
      deviceId: string;
      platform: 'ios' | 'android' | 'web';
      model?: string;
      osVersion?: string;
      appVersion?: string;
      pushToken?: string;
    },
  ): Promise<void> {
    const data: Prisma.UserDeviceUncheckedCreateInput = {
      userId,
      deviceId: device.deviceId,
      platform: device.platform,
      model: device.model ?? null,
      osVersion: device.osVersion ?? null,
      appVersion: device.appVersion ?? null,
      pushToken: device.pushToken ?? null,
      pushProvider: device.pushToken ? guessPushProvider(device.platform) : null,
      lastActiveAt: new Date(),
    };

    await this.prisma.userDevice.upsert({
      where: { userId_deviceId: { userId, deviceId: device.deviceId } },
      create: data,
      update: {
        model: data.model,
        osVersion: data.osVersion,
        appVersion: data.appVersion,
        pushToken: data.pushToken,
        pushProvider: data.pushProvider,
        lastActiveAt: new Date(),
      },
    });
  }

  // ── Проверки состояния аккаунта ───────────────────────────────────────────

  /**
   * Проверяет, что пользователю разрешено пользоваться сервисом.
   * Вызывается при каждом входе и обновлении токена.
   */
  assertUsable(user: User): void {
    if (user.status === 'blocked') {
      throw AppException.forbidden('Аккаунт заблокирован', ErrorCode.AUTH_ACCOUNT_BLOCKED);
    }
    if (user.status === 'deleted') {
      throw AppException.unauthorized('Аккаунт удалён', ErrorCode.AUTH_INVALID_CREDENTIALS);
    }
    if (user.status === 'pending') {
      throw AppException.forbidden(
        'Регистрация не завершена',
        ErrorCode.AUTH_ACCOUNT_NOT_ACTIVATED,
      );
    }
  }

  // ── Представления ─────────────────────────────────────────────────────────

  /** Собирает данные для выпуска токена: роли и права. */
  async buildTokenSubject(userId: string): Promise<TokenSubject> {
    const user = await this.requireById(userId);
    const access = await this.rbac.getUserAccess(userId);

    return {
      id: user.id,
      phone: user.phone,
      roles: access.roles,
      permissions: access.permissions,
    };
  }

  // ── Панель управления ─────────────────────────────────────────────────────

  /**
   * Список пользователей для панели управления.
   *
   * Пагинация курсорная: вместо «дай страницу №50» клиент говорит «дай
   * следующие 20 после вот этого». На таблице в миллион строк обычная
   * постраничная навигация заставляет базу пересчитывать всё с начала —
   * пятидесятая страница открывается заметно медленнее первой, а сотая
   * не открывается вовсе.
   */
  async listForAdmin(
    pagination: PaginationParams,
    filters: { search?: string; status?: 'pending' | 'active' | 'blocked' | 'deleted' },
  ): Promise<PaginatedResponse<AdminUserListItem>> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search
        ? {
            OR: [
              { firstName: { contains: filters.search, mode: 'insensitive' } },
              { lastName: { contains: filters.search, mode: 'insensitive' } },
              { phone: { contains: filters.search } },
            ],
          }
        : {}),
    };

    // Запрашиваем на одну запись больше, чем нужно: если она пришла —
    // значит, есть следующая порция. Это дешевле, чем отдельный подсчёт.
    const rows = await this.prisma.user.findMany({
      where,
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        city: { select: { name: true } },
        roles: { include: { role: { select: { name: true } } } },
        blocksReceived: {
          where: { liftedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { violations: true } },
      },
    });

    const hasMore = rows.length > pagination.limit;
    const items = hasMore ? rows.slice(0, pagination.limit) : rows;

    return {
      items: items.map(toAdminListItem),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  async findForAdmin(id: string): Promise<AdminUserListItem> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        city: { select: { name: true } },
        roles: { include: { role: { select: { name: true } } } },
        blocksReceived: { where: { liftedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { violations: true } },
      },
    });

    if (!user) throw AppException.notFound('Пользователь не найден');
    return toAdminListItem(user);
  }

  /**
   * Блокирует пользователя.
   *
   * Важная деталь: одновременно гасятся ВСЕ его сессии. Без этого
   * заблокированный человек продолжал бы пользоваться приложением до
   * истечения токена — до пятнадцати минут после блокировки.
   */
  async block(
    id: string,
    dto: { reason: string; expiresAt?: string },
    actorId: string,
    context: { ipAddress?: string; userAgent?: string; requestId?: string },
  ): Promise<void> {
    const user = await this.requireById(id);

    if (user.id === actorId) {
      throw AppException.badRequest('Нельзя заблокировать самого себя');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userBlock.create({
        data: {
          userId: id,
          reason: dto.reason,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          blockedById: actorId,
        },
      });

      await tx.user.update({ where: { id }, data: { status: 'blocked' } });

      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'user_blocked' },
      });
    });

    await this.rbac.invalidate(id);

    await this.audit.record({
      actorId,
      action: 'user.block',
      targetType: 'user',
      targetId: id,
      before: { status: user.status },
      after: { status: 'blocked', reason: dto.reason, expiresAt: dto.expiresAt ?? null },
      ...context,
    });

    this.logger.warn({ userId: id, actorId, reason: dto.reason }, 'Пользователь заблокирован');
  }

  async unblock(
    id: string,
    actorId: string,
    context: { ipAddress?: string; userAgent?: string; requestId?: string },
  ): Promise<void> {
    const user = await this.requireById(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.userBlock.updateMany({
        where: { userId: id, liftedAt: null },
        data: { liftedAt: new Date(), liftedById: actorId },
      });
      await tx.user.update({ where: { id }, data: { status: 'active' } });
    });

    await this.audit.record({
      actorId,
      action: 'user.unblock',
      targetType: 'user',
      targetId: id,
      before: { status: user.status },
      after: { status: 'active' },
      ...context,
    });

    this.logger.log({ userId: id, actorId }, 'Блокировка снята');
  }

  /** Данные пользователя для мобильного приложения. */
  async toAuthenticatedUser(user: User): Promise<AuthenticatedUser> {
    const access = await this.rbac.getUserAccess(user.id);

    return {
      id: user.id,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      // Ссылка на аватар подставляется модулем медиа на своём этапе
      avatarUrl: null,
      cityId: user.cityId,
      isVerified: user.isVerified,
      roles: access.roles,
      permissions: access.permissions,
    };
  }
}

function guessPushProvider(platform: 'ios' | 'android' | 'web'): string {
  // На своём этапе провайдер будет определяться точнее: у Android без
  // Google-сервисов вместо FCM используется RuStore Push.
  return platform === 'ios' ? 'apns' : platform === 'android' ? 'fcm' : 'web';
}

/** Внутренний тип: пользователь со всеми связями, нужными панели управления. */
interface UserWithRelations extends User {
  city: { name: string } | null;
  roles: { role: { name: string } }[];
  blocksReceived: { reason: string; expiresAt: Date | null; createdAt: Date }[];
  _count: { violations: number };
}

/** Превращает запись из базы в то, что видит сотрудник в панели. */
function toAdminListItem(user: UserWithRelations): AdminUserListItem {
  const block = user.blocksReceived[0];

  return {
    id: user.id,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    isVerified: user.isVerified,
    cityName: user.city?.name ?? null,
    roles: user.roles.map((r) => r.role.name),
    ratingAverage: user.ratingAverage,
    ratingCount: user.ratingCount,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    activeBlock: block
      ? {
          reason: block.reason,
          expiresAt: block.expiresAt?.toISOString() ?? null,
          createdAt: block.createdAt.toISOString(),
        }
      : null,
    violationCount: user._count.violations,
  };
}
