import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import crypto from 'node:crypto';
import { ErrorCode, type AuthTokens } from '@dagestan/shared';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { EncryptionService } from '../../common/crypto/encryption.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AccessTokenPayload } from '../../common/types/request-user.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export interface TokenContext {
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface TokenSubject {
  id: string;
  phone: string;
  roles: string[];
  permissions: string[];
  partnerId?: string;
}

/**
 * Выдача и обновление токенов доступа.
 *
 * Схема «короткий access + длинный refresh»:
 *
 *   accessToken  — живёт 15 минут, прикладывается к каждому запросу.
 *                  Короткий срок означает: если токен украдут, окно
 *                  злоупотребления невелико.
 *   refreshToken — живёт 30 дней, используется ТОЛЬКО чтобы получить новый
 *                  accessToken. Хранится на устройстве в защищённом системном
 *                  хранилище (Keychain / Keystore).
 *
 * Главная защита здесь — РОТАЦИЯ С ОБНАРУЖЕНИЕМ КРАЖИ.
 *
 * При каждом обновлении старый refresh-токен гасится и выдаётся новый.
 * Если кто-то попытается воспользоваться уже погашенным токеном, это
 * означает ровно одно: токен был скопирован. В этот момент вся цепочка
 * сессий этого устройства аннулируется — и злоумышленник, и настоящий
 * владелец разлогиниваются. Владелец просто войдёт заново; злоумышленник
 * не сможет.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  /** Выдаёт новую пару токенов — при входе или завершении регистрации. */
  async issue(subject: TokenSubject, context: TokenContext): Promise<AuthTokens> {
    const familyId = crypto.randomUUID();
    return this.createPair(subject, context, familyId);
  }

  /**
   * Обновляет пару токенов по refresh-токену.
   * Здесь же срабатывает обнаружение кражи.
   */
  async rotate(
    refreshToken: string,
    context: TokenContext,
    loadSubject: (userId: string) => Promise<TokenSubject>,
  ): Promise<{ tokens: AuthTokens; userId: string }> {
    const tokenHash = this.encryption.hmac(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { status: true } } },
    });

    if (!stored) {
      throw AppException.unauthorized(
        'Некорректный токен обновления',
        ErrorCode.AUTH_TOKEN_INVALID,
      );
    }

    // ── Обнаружение кражи ───────────────────────────────────────────────────
    if (stored.revokedAt) {
      this.logger.error(
        { userId: stored.userId, familyId: stored.familyId, ip: context.ipAddress },
        'ОБНАРУЖЕНО ПОВТОРНОЕ ИСПОЛЬЗОВАНИЕ ТОКЕНА: все сессии устройства аннулированы',
      );

      await this.revokeFamily(stored.familyId, 'token_reuse_detected');

      throw AppException.unauthorized(
        'Обнаружена подозрительная активность. Войдите заново.',
        ErrorCode.AUTH_TOKEN_REUSE_DETECTED,
      );
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw AppException.unauthorized('Срок действия сессии истёк', ErrorCode.AUTH_TOKEN_EXPIRED);
    }

    if (stored.user.status === 'blocked') {
      await this.revokeAllForUser(stored.userId, 'user_blocked');
      throw AppException.forbidden('Аккаунт заблокирован', ErrorCode.AUTH_ACCOUNT_BLOCKED);
    }

    if (stored.user.status === 'deleted') {
      throw AppException.unauthorized('Аккаунт удалён', ErrorCode.AUTH_TOKEN_INVALID);
    }

    // Права перечитываются из базы при каждом обновлении: если у сотрудника
    // отобрали доступ, изменение вступит в силу максимум через 15 минут.
    const subject = await loadSubject(stored.userId);

    const tokens = await this.createPair(subject, context, stored.familyId);

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), revokedReason: 'rotated' },
    });

    return { tokens, userId: stored.userId };
  }

  /** Завершение сессии на текущем устройстве. */
  async revoke(refreshToken: string): Promise<void> {
    const tokenHash = this.encryption.hmac(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
  }

  /** Гасит всю цепочку токенов одного устройства. */
  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /**
   * Гасит все сессии пользователя на всех устройствах.
   * Вызывается при блокировке аккаунта и при смене пароля.
   */
  async revokeAllForUser(userId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /**
   * Удаляет из базы просроченные и погашенные токены.
   * Запускается по расписанию: без уборки таблица растёт бесконечно.
   */
  async cleanupExpired(olderThanDays = 60): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
    const result = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    });
    return result.count;
  }

  // ── Внутреннее ────────────────────────────────────────────────────────────

  private async createPair(
    subject: TokenSubject,
    context: TokenContext,
    familyId: string,
  ): Promise<AuthTokens> {
    const tokenId = crypto.randomUUID();

    const payload: AccessTokenPayload = {
      sub: subject.id,
      phone: subject.phone,
      roles: subject.roles,
      perms: subject.permissions,
      jti: tokenId,
      ...(subject.partnerId ? { partnerId: subject.partnerId } : {}),
    };

    const accessToken = await this.jwt.signAsync(payload);

    // Refresh-токен — просто случайные 48 байт. Это не JWT: его содержимое
    // никому не нужно, важна только невозможность подобрать.
    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + parseDuration(this.config.JWT_REFRESH_TTL));

    await this.prisma.refreshToken.create({
      data: {
        userId: subject.id,
        tokenHash: this.encryption.hmac(refreshToken),
        familyId,
        deviceId: context.deviceId ?? null,
        userAgent: context.userAgent?.slice(0, 500) ?? null,
        ipAddress: context.ipAddress ?? null,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(parseDuration(this.config.JWT_ACCESS_TTL) / 1000),
      tokenType: 'Bearer',
    };
  }
}

/** Переводит записи вида «15m», «30d», «12h» в миллисекунды. */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `Некорректный формат длительности: «${value}». Ожидается, например, 15m или 30d.`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return amount * (multipliers[unit as string] as number);
}
