import { Inject, Injectable, Logger } from '@nestjs/common';
import crypto from 'node:crypto';
import { ErrorCode, maskPhone } from '@dagestan/shared';
import type { OtpPurpose } from '../../generated/prisma/enums.js';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { EncryptionService } from '../../common/crypto/encryption.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { SmsService } from '../sms/sms.service.js';

/**
 * Коды подтверждения из SMS.
 *
 * ЭТО САМОЕ ДОРОГОЕ МЕСТО В ПРИЛОЖЕНИИ С ТОЧКИ ЗРЕНИЯ АТАКИ.
 *
 * Обычная DDoS-атака нагружает сервер — это неприятно, но проходит.
 * Атака на отправку SMS тратит ваши реальные деньги: каждый запрос кода
 * списывает несколько рублей со счёта у SMS-агрегатора. Скрипт, дёргающий
 * этот метод со случайными номерами, за ночь способен обнулить баланс —
 * после чего перестают регистрироваться и настоящие пользователи.
 *
 * Поэтому здесь ЧЕТЫРЕ независимых ограничения:
 *   1. Пауза между повторными отправками на один номер.
 *   2. Суточный лимит на один номер.
 *   3. Часовой лимит на один IP-адрес.
 *   4. Общий суточный потолок расходов на всю систему — последний рубеж
 *      на случай распределённой атаки с тысяч адресов.
 *
 * Сами коды хранятся только в виде отпечатка (HMAC): сотрудник с доступом
 * к базе не должен иметь возможности войти в чужой аккаунт.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sms: SmsService,
    private readonly encryption: EncryptionService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /**
   * Генерирует код, сохраняет его отпечаток и отправляет SMS.
   * Возвращает параметры, нужные интерфейсу: сколько ждать до повтора и т. п.
   */
  async request(
    phone: string,
    purpose: OtpPurpose,
    ipAddress: string,
  ): Promise<{ cooldownSeconds: number; expiresInSeconds: number; devCode?: string }> {
    await this.enforceLimits(phone, ipAddress);

    const code = generateNumericCode(6);
    const codeHash = this.encryption.hmac(`${phone}:${purpose}:${code}`);
    const expiresAt = new Date(Date.now() + this.config.OTP_TTL_SECONDS * 1000);

    // Предыдущие неиспользованные коды для этого номера и цели гасим:
    // одновременно действующих кодов быть не должно.
    await this.prisma.otpCode.updateMany({
      where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otpCode.create({
      data: {
        phone,
        purpose,
        codeHash,
        maxAttempts: this.config.OTP_MAX_ATTEMPTS,
        expiresAt,
        ipAddress,
      },
    });

    await this.sms.send(phone, this.buildMessage(code, purpose));

    // Пауза до следующей отправки ставится ПОСЛЕ успешной отправки:
    // если SMS не ушла, пользователь не должен ждать минуту впустую.
    await this.redis.setEphemeral(
      cooldownKey(phone),
      String(Date.now()),
      this.config.OTP_RESEND_COOLDOWN_SECONDS,
    );

    this.logger.log({ phone: maskPhone(phone), purpose }, 'Код подтверждения отправлен');

    return {
      cooldownSeconds: this.config.OTP_RESEND_COOLDOWN_SECONDS,
      expiresInSeconds: this.config.OTP_TTL_SECONDS,
      // Код возвращается в ответе ТОЛЬКО в режиме разработки, чтобы можно было
      // тестировать регистрацию без подключённого SMS-провайдера.
      ...(this.config.SMS_PROVIDER === 'console' && !this.config.isProduction
        ? { devCode: code }
        : {}),
    };
  }

  /**
   * Проверяет код. При успехе код сгорает — повторно использовать его нельзя.
   */
  async verify(phone: string, purpose: OtpPurpose, code: string): Promise<void> {
    const record = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw AppException.badRequest(
        'Код не запрашивался или уже использован',
        ErrorCode.OTP_INVALID,
      );
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw AppException.badRequest('Срок действия кода истёк', ErrorCode.OTP_EXPIRED);
    }

    if (record.attempts >= record.maxAttempts) {
      throw AppException.badRequest(
        'Превышено количество попыток ввода. Запросите новый код.',
        ErrorCode.OTP_TOO_MANY_ATTEMPTS,
      );
    }

    const expectedHash = this.encryption.hmac(`${phone}:${purpose}:${code}`);

    if (!this.encryption.safeCompare(expectedHash, record.codeHash)) {
      const updated = await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });

      const left = Math.max(0, updated.maxAttempts - updated.attempts);

      // Исчерпав попытки, код сжигаем — иначе его можно было бы добивать
      // после истечения ограничения частоты запросов.
      if (left === 0) {
        await this.prisma.otpCode.update({
          where: { id: record.id },
          data: { consumedAt: new Date() },
        });
        throw AppException.badRequest(
          'Превышено количество попыток ввода. Запросите новый код.',
          ErrorCode.OTP_TOO_MANY_ATTEMPTS,
        );
      }

      throw AppException.badRequest(
        `Неверный код. Осталось попыток: ${left}`,
        ErrorCode.OTP_INVALID,
      );
    }

    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
  }

  // ── Одноразовый «пропуск» после успешной проверки кода ────────────────────

  /**
   * После правильного ввода кода выдаётся временный токен.
   *
   * Зачем не завершить регистрацию сразу: пользователю ещё нужно придумать
   * пароль, а это отдельный экран. Просить прислать код второй раз нельзя —
   * он уже сгорел. Токен живёт 15 минут и используется ровно один раз.
   */
  async issueVerificationToken(
    phone: string,
    purpose: OtpPurpose,
  ): Promise<{ token: string; expiresInSeconds: number }> {
    const token = crypto.randomBytes(32).toString('base64url');
    const ttl = 15 * 60;

    await this.redis.setEphemeral(
      verificationKey(this.encryption.hmac(token)),
      JSON.stringify({ phone, purpose }),
      ttl,
    );

    return { token, expiresInSeconds: ttl };
  }

  /**
   * Проверяет и ГАСИТ временный токен. Возвращает номер телефона,
   * для которого он был выдан.
   */
  async consumeVerificationToken(token: string, expectedPurpose: OtpPurpose): Promise<string> {
    const raw = await this.redis.consumeEphemeral(verificationKey(this.encryption.hmac(token)));

    if (!raw) {
      throw AppException.badRequest(
        'Подтверждение номера просрочено. Начните заново.',
        ErrorCode.OTP_NOT_VERIFIED,
      );
    }

    const payload = JSON.parse(raw) as { phone: string; purpose: OtpPurpose };

    if (payload.purpose !== expectedPurpose) {
      // Токен, выданный для восстановления пароля, не должен подходить
      // для регистрации, и наоборот.
      throw AppException.badRequest('Некорректное подтверждение', ErrorCode.OTP_NOT_VERIFIED);
    }

    return payload.phone;
  }

  // ── Ограничения ───────────────────────────────────────────────────────────

  private async enforceLimits(phone: string, ipAddress: string): Promise<void> {
    // 1. Пауза между отправками на один номер
    const cooldownTtl = await this.redis.client.ttl(cooldownKey(phone));
    if (cooldownTtl > 0) {
      throw AppException.rateLimited(
        `Повторная отправка возможна через ${cooldownTtl} с`,
        cooldownTtl,
        ErrorCode.OTP_COOLDOWN,
      );
    }

    // 2. Суточный лимит на номер
    const perPhone = await this.rateLimit.check(
      {
        name: 'otp:phone:day',
        limit: this.config.OTP_MAX_PER_PHONE_PER_DAY,
        windowSeconds: 86_400,
      },
      phone,
    );
    if (!perPhone.allowed) {
      throw AppException.rateLimited(
        'Исчерпан суточный лимит отправки кодов на этот номер',
        perPhone.retryAfter,
        ErrorCode.OTP_DAILY_LIMIT,
      );
    }

    // 3. Часовой лимит на один адрес
    const perIp = await this.rateLimit.check(
      { name: 'otp:ip:hour', limit: this.config.OTP_MAX_PER_IP_PER_HOUR, windowSeconds: 3_600 },
      ipAddress,
    );
    if (!perIp.allowed) {
      throw AppException.rateLimited(
        'Слишком много запросов с вашего устройства. Повторите позже.',
        perIp.retryAfter,
        ErrorCode.RATE_LIMITED,
      );
    }

    // 4. Общий потолок на всю систему за сутки — защита от распределённой
    //    атаки, где каждый отдельный адрес остаётся в рамках лимита.
    const global = await this.rateLimit.check(
      { name: 'otp:global:day', limit: this.config.SMS_DAILY_LIMIT, windowSeconds: 86_400 },
      'all',
    );
    if (!global.allowed) {
      // Это уже инцидент: либо атака, либо всплеск регистраций.
      // Требует немедленного внимания дежурного.
      this.logger.error(
        { limit: this.config.SMS_DAILY_LIMIT },
        'ДОСТИГНУТ СУТОЧНЫЙ ПОТОЛОК ОТПРАВКИ SMS. Отправка приостановлена.',
      );
      throw AppException.rateLimited(
        'Сервис отправки кодов временно недоступен. Попробуйте позже.',
        global.retryAfter,
        ErrorCode.RATE_LIMITED,
      );
    }

    // Предупреждаем заранее, на 80% исчерпания, — чтобы успеть среагировать.
    if (global.remaining < this.config.SMS_DAILY_LIMIT * 0.2) {
      this.logger.warn(
        { remaining: global.remaining },
        'Расход SMS приближается к суточному потолку',
      );
    }
  }

  private buildMessage(code: string, purpose: OtpPurpose): string {
    switch (purpose) {
      case 'password_reset':
        return `${code} — код для восстановления пароля. Никому его не сообщайте.`;
      case 'phone_change':
        return `${code} — код для смены номера телефона. Никому его не сообщайте.`;
      case 'registration':
      default:
        return `${code} — код подтверждения. Никому его не сообщайте.`;
    }
  }
}

/**
 * Генерация кода криптостойким источником случайности.
 *
 * Math.random() здесь недопустим: его последовательность предсказуема,
 * и зная несколько выданных кодов, можно вычислить следующие.
 */
function generateNumericCode(length: number): string {
  let result = '';
  while (result.length < length) {
    // Отбрасываем значения >= 250, иначе остаток от деления на 10 сделал бы
    // цифры 0–5 чуть более вероятными, чем 6–9.
    const byte = crypto.randomBytes(1)[0] as number;
    if (byte >= 250) continue;
    result += String(byte % 10);
  }
  return result;
}

const cooldownKey = (phone: string) => `otp:cooldown:${phone}`;
const verificationKey = (tokenHash: string) => `otp:verified:${tokenHash}`;
