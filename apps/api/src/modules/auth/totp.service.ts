import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';
import { ErrorCode, ROLES_REQUIRING_2FA, type RoleName } from '@dagestan/shared';

import { EncryptionService } from '../../common/crypto/encryption.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';

/**
 * Допуск на расхождение часов, в секундах.
 *
 * Код действует 30 секунд. Часы на телефонах нередко уходят на несколько
 * секунд, и без допуска сотрудники периодически не могли бы войти. Ставим
 * ровно один шаг: больше — значит дольше держать код действующим, а это
 * увеличивает окно для того, кто код подсмотрел.
 */
const CLOCK_TOLERANCE_SECONDS = 30;

/**
 * Сколько живёт временный пропуск между первым и вторым шагом входа.
 * Пяти минут достаточно, чтобы взять телефон и открыть приложение,
 * и мало, чтобы пропуск успел кому-то пригодиться.
 */
const CHALLENGE_TTL_SECONDS = 300;

/** Сколько раз можно ошибиться кодом по одному пропуску. */
const MAX_CHALLENGE_ATTEMPTS = 5;

/**
 * Двухфакторная авторизация сотрудников (пункт 4 ТЗ).
 *
 * Что это простыми словами: помимо пароля при входе запрашивается шестизначный
 * код, который каждые 30 секунд сам меняется в приложении на телефоне
 * (Google Authenticator, Яндекс.Ключ и подобные). Код вычисляется из общего
 * секрета и текущего времени, по сети не передаётся и нигде не хранится.
 *
 * Зачем это обязательно для администраторов: пароль можно подсмотреть,
 * подобрать или выманить обманом. Украв пароль администратора, злоумышленник
 * получает доступ ко всем данным всех пользователей. Второй фактор означает,
 * что одного пароля недостаточно — нужен ещё и телефон сотрудника.
 *
 * Секрет хранится в базе в зашифрованном виде: даже утечка базы не позволит
 * генерировать чужие коды.
 */
@Injectable()
export class TotpService {
  private readonly logger = new Logger(TotpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly encryption: EncryptionService,
  ) {}

  /** Обязательна ли двухфакторная авторизация для этих ролей. */
  isRequiredFor(roles: string[]): boolean {
    return roles.some((role) => ROLES_REQUIRING_2FA.includes(role as RoleName));
  }

  async isEnabled(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpEnabledAt: true },
    });
    return Boolean(user?.totpEnabledAt);
  }

  /**
   * Шаг 1: создать секрет и показать его сотруднику для добавления в приложение.
   *
   * Пока секрет не подтверждён кодом, двухфакторная авторизация НЕ включается.
   * Иначе человек, не успевший добавить секрет в приложение, потерял бы доступ
   * к своей учётной записи навсегда.
   */
  async beginSetup(userId: string, phone: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.totpEnabledAt) {
      throw AppException.conflict('Двухфакторная авторизация уже включена');
    }

    const secret = generateSecret();

    // Секрет сохраняем сразу, но в зашифрованном виде и без отметки включения.
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecretEncrypted: this.encryption.encrypt(secret) },
    });

    return {
      secret,
      // Ссылка, которую приложение-аутентификатор считывает с QR-кода
      otpauthUrl: generateURI({ issuer: 'Дагестан', label: phone, secret }),
    };
  }

  /**
   * Шаг 2: подтвердить кодом, что секрет действительно добавлен в приложение,
   * и включить двухфакторную авторизацию.
   */
  async completeSetup(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.totpEnabledAt) {
      throw AppException.conflict('Двухфакторная авторизация уже включена');
    }
    if (!user.totpSecretEncrypted) {
      throw AppException.badRequest('Сначала запросите настройку двухфакторной авторизации');
    }

    const secret = this.encryption.decrypt(user.totpSecretEncrypted);
    const result = await verifyOtp({
      secret,
      token: code,
      epochTolerance: CLOCK_TOLERANCE_SECONDS,
    });

    if (!result.valid) {
      throw AppException.unauthorized('Неверный код подтверждения', ErrorCode.AUTH_2FA_INVALID);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabledAt: new Date() },
    });

    this.logger.log({ userId }, 'Двухфакторная авторизация включена');
  }

  /**
   * Проверка кода при входе.
   *
   * Здесь же закрывается неочевидная брешь: код действует 30 секунд, и всё это
   * время его можно использовать повторно. Если злоумышленник подсмотрел код
   * через плечо или перехватил его, он успел бы войти вторым. Поэтому каждый
   * использованный код запоминается на время его жизни и второй раз не проходит.
   */
  async verifyLoginCode(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.totpEnabledAt || !user.totpSecretEncrypted) {
      throw AppException.badRequest('Двухфакторная авторизация не настроена');
    }

    const usedKey = `totp:used:${userId}:${code}`;
    if (await this.redis.client.exists(usedKey)) {
      this.logger.warn(
        { userId },
        'Попытка повторного использования кода двухфакторной авторизации',
      );
      throw AppException.unauthorized(
        'Этот код уже использован. Дождитесь следующего.',
        ErrorCode.AUTH_2FA_INVALID,
      );
    }

    const secret = this.encryption.decrypt(user.totpSecretEncrypted);
    const result = await verifyOtp({
      secret,
      token: code,
      epochTolerance: CLOCK_TOLERANCE_SECONDS,
    });

    if (!result.valid) {
      this.logger.warn({ userId }, 'Неверный код двухфакторной авторизации');
      throw AppException.unauthorized('Неверный код подтверждения', ErrorCode.AUTH_2FA_INVALID);
    }

    // 90 секунд: время жизни кода плюс допуск на расхождение часов
    await this.redis.setEphemeral(usedKey, '1', 90);
  }

  // ── Временный пропуск между шагами входа ──────────────────────────────────

  /**
   * Выдаёт пропуск после проверки телефона и пароля.
   *
   * Зачем: вход состоит из двух шагов, и на втором нужно понимать, кто именно
   * входит. Просить пароль повторно неудобно и вредно — он лишний раз оказался
   * бы в памяти страницы. Вместо этого выдаётся одноразовая метка, которая
   * сама по себе бесполезна: без кода из приложения по ней не войти.
   */
  async issueChallenge(userId: string): Promise<{ token: string; expiresInSeconds: number }> {
    const token = randomBytes(32).toString('base64url');
    const ttl = CHALLENGE_TTL_SECONDS;

    await this.redis.setEphemeral(challengeKey(this.encryption.hmac(token)), userId, ttl);

    return { token, expiresInSeconds: ttl };
  }

  /**
   * Проверяет пропуск и код, после чего пропуск гасится.
   *
   * Здесь же ограничивается число попыток ввода кода по одному пропуску.
   * Без этого злоумышленник, знающий пароль, мог бы спокойно перебирать
   * шестизначный код: миллион вариантов подбирается за часы.
   */
  async consumeChallenge(token: string, code: string): Promise<string> {
    const hashed = this.encryption.hmac(token);
    const userId = await this.redis.client.get(challengeKey(hashed));

    if (!userId) {
      throw AppException.unauthorized(
        'Время на ввод кода истекло. Войдите заново.',
        ErrorCode.AUTH_TOKEN_EXPIRED,
      );
    }

    const attempts = await this.redis.client.incr(challengeAttemptsKey(hashed));
    await this.redis.client.expire(challengeAttemptsKey(hashed), CHALLENGE_TTL_SECONDS);

    if (attempts > MAX_CHALLENGE_ATTEMPTS) {
      await this.redis.del(challengeKey(hashed), challengeAttemptsKey(hashed));
      this.logger.warn({ userId }, 'Превышено число попыток ввода кода: пропуск аннулирован');
      throw AppException.unauthorized(
        'Слишком много неверных кодов. Войдите заново.',
        ErrorCode.AUTH_2FA_INVALID,
      );
    }

    await this.verifyLoginCode(userId, code);

    // Код верный — пропуск отработал и больше не нужен
    await this.redis.del(challengeKey(hashed), challengeAttemptsKey(hashed));

    return userId;
  }

  /**
   * Отключение двухфакторной авторизации.
   * Требует действующий код — иначе получивший доступ к открытому компьютеру
   * мог бы просто снять защиту.
   */
  async disable(userId: string, code: string): Promise<void> {
    await this.verifyLoginCode(userId, code);

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabledAt: null, totpSecretEncrypted: null },
    });

    this.logger.warn({ userId }, 'Двухфакторная авторизация отключена');
  }
}

/** Ключи в Redis. Хранится отпечаток пропуска, а не он сам. */
const challengeKey = (tokenHash: string) => `2fa:challenge:${tokenHash}`;
const challengeAttemptsKey = (tokenHash: string) => `2fa:challenge:attempts:${tokenHash}`;
