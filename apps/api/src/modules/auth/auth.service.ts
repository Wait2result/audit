import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  maskPhone,
  type AuthResponse,
  type CompleteRegistrationDto,
  type DeviceInfo,
  type LoginDto,
  type LoginResponse,
  type RequestOtpDto,
  type RequestOtpResponse,
  type ResetPasswordDto,
  type VerifyOtpDto,
  type TwoFactorLoginDto,
  type VerifyOtpResponse,
} from '@dagestan/shared';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { AppException } from '../../common/errors/app.exception.js';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service.js';
import { AuditService } from '../audit/audit.service.js';
import { OtpService } from './otp.service.js';
import { TokenService, type TokenContext } from './token.service.js';
import { TotpService } from './totp.service.js';
import { UsersService } from '../users/users.service.js';

/** Версия документа с условиями использования, с которой соглашается пользователь. */
const TERMS_VERSION = '1.0';

/** Счётчик неудачных попыток входа — защита от подбора пароля. */
const LOGIN_FAILURES_RULE = (limit: number, windowSeconds: number) => ({
  name: 'login:failures',
  limit,
  windowSeconds,
});

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly users: UsersService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly totp: TotpService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  //  Шаг 1: запрос кода подтверждения
  // ═══════════════════════════════════════════════════════════════════════

  async requestOtp(dto: RequestOtpDto, ipAddress: string): Promise<RequestOtpResponse> {
    const existing = await this.users.findByPhone(dto.phone);

    if (dto.purpose === 'registration' && existing) {
      throw AppException.conflict(
        'Этот номер уже зарегистрирован. Войдите или восстановите пароль.',
        ErrorCode.AUTH_PHONE_ALREADY_REGISTERED,
      );
    }

    if (dto.purpose === 'password_reset' && !existing) {
      // Сознательное решение: при восстановлении пароля мы НЕ сообщаем,
      // зарегистрирован ли номер. Иначе форму восстановления можно было бы
      // использовать как справочник «есть ли такой человек в сервисе»,
      // а это утечка персональных данных.
      //
      // Ответ выглядит как успешный, но SMS не отправляется и деньги не тратятся.
      this.logger.warn(
        { phone: maskPhone(dto.phone), ip: ipAddress },
        'Запрос восстановления пароля для незарегистрированного номера',
      );
      return {
        cooldownSeconds: this.config.OTP_RESEND_COOLDOWN_SECONDS,
        expiresInSeconds: this.config.OTP_TTL_SECONDS,
        maskedPhone: maskPhone(dto.phone),
      };
    }

    if (existing) this.users.assertUsable(existing);

    const result = await this.otp.request(dto.phone, dto.purpose, ipAddress);

    return {
      cooldownSeconds: result.cooldownSeconds,
      expiresInSeconds: result.expiresInSeconds,
      maskedPhone: maskPhone(dto.phone),
      ...(result.devCode ? { devCode: result.devCode } : {}),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Шаг 2: проверка кода
  // ═══════════════════════════════════════════════════════════════════════

  async verifyOtp(dto: VerifyOtpDto): Promise<VerifyOtpResponse> {
    await this.otp.verify(dto.phone, dto.purpose, dto.code);

    const { token, expiresInSeconds } = await this.otp.issueVerificationToken(
      dto.phone,
      dto.purpose,
    );

    return { verificationToken: token, expiresInSeconds };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Шаг 3: завершение регистрации
  // ═══════════════════════════════════════════════════════════════════════

  async completeRegistration(
    dto: CompleteRegistrationDto,
    context: TokenContext,
  ): Promise<AuthResponse> {
    const phone = await this.otp.consumeVerificationToken(dto.verificationToken, 'registration');

    // Повторная проверка: между подтверждением кода и этим запросом прошло
    // до 15 минут, за которые номер мог зарегистрировать кто-то другой.
    const existing = await this.users.findByPhone(phone);
    if (existing) {
      throw AppException.conflict(
        'Этот номер уже зарегистрирован',
        ErrorCode.AUTH_PHONE_ALREADY_REGISTERED,
      );
    }

    const user = await this.users.createUser({
      phone,
      password: dto.password,
      firstName: dto.firstName,
      ...(dto.lastName ? { lastName: dto.lastName } : {}),
      ...(dto.cityId ? { cityId: dto.cityId } : {}),
      termsVersion: TERMS_VERSION,
    });

    if (dto.device) await this.registerDevice(user.id, dto.device);

    await this.audit.record({
      actorId: user.id,
      action: 'user.register',
      targetType: 'user',
      targetId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    this.logger.log(
      { userId: user.id, phone: maskPhone(phone) },
      'Зарегистрирован новый пользователь',
    );

    return this.buildAuthResponse(user.id, context);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Вход
  // ═══════════════════════════════════════════════════════════════════════

  async login(dto: LoginDto, context: TokenContext): Promise<LoginResponse> {
    const rule = LOGIN_FAILURES_RULE(
      this.config.LOGIN_MAX_ATTEMPTS,
      this.config.LOGIN_LOCKOUT_MINUTES * 60,
    );

    // Счётчик неудач ведётся по номеру телефона, а не по IP: атака подбора
    // пароля к конкретному аккаунту обычно идёт с разных адресов.
    const failures = await this.rateLimit.peek(rule, dto.phone);
    if (failures >= this.config.LOGIN_MAX_ATTEMPTS) {
      throw AppException.rateLimited(
        `Слишком много неудачных попыток входа. Повторите через ${this.config.LOGIN_LOCKOUT_MINUTES} мин.`,
        this.config.LOGIN_LOCKOUT_MINUTES * 60,
      );
    }

    const user = await this.users.findByPhone(dto.phone);

    // Проверяем пароль даже для несуществующего пользователя — против
    // «атаки по времени»: если для незарегистрированного номера отвечать
    // мгновенно, а для зарегистрированного с задержкой на проверку хеша,
    // по времени ответа можно составить список клиентов сервиса.
    const passwordValid = user?.passwordHash
      ? await this.users.verifyPassword(user.passwordHash, dto.password)
      : await this.users.verifyPassword(DUMMY_HASH, dto.password);

    if (!user || !passwordValid) {
      await this.rateLimit.check(rule, dto.phone);
      this.logger.warn(
        { phone: maskPhone(dto.phone), ip: context.ipAddress },
        'Неудачная попытка входа',
      );
      throw AppException.unauthorized(
        'Неверный номер телефона или пароль',
        ErrorCode.AUTH_INVALID_CREDENTIALS,
      );
    }

    this.users.assertUsable(user);

    // ── Второй фактор (пункт 4 ТЗ) ──────────────────────────────────────────
    //
    // Если он включён, вход не завершается здесь. Пароль верен, поэтому
    // счётчик неудачных попыток сбрасывается, но вместо сессии выдаётся
    // временный пропуск на второй шаг. Повторно вводить телефон и пароль
    // не нужно — и пароль не остаётся лежать в памяти страницы.
    if (user.totpEnabledAt) {
      await this.rateLimit.reset(rule, dto.phone);

      const challenge = await this.totp.issueChallenge(user.id);

      return {
        status: '2fa_required',
        twoFactorToken: challenge.token,
        expiresInSeconds: challenge.expiresInSeconds,
        maskedPhone: maskPhone(user.phone),
      };
    }

    await this.rateLimit.reset(rule, dto.phone);
    await this.users.markLoggedIn(user.id);

    if (dto.device) await this.registerDevice(user.id, dto.device);

    return { status: 'ok', ...(await this.buildAuthResponse(user.id, context)) };
  }

  /**
   * Второй шаг входа: код из приложения-аутентификатора.
   *
   * Сюда приходит только пропуск и код. Телефон и пароль уже проверены
   * на первом шаге и повторно не запрашиваются.
   */
  async loginWithTwoFactor(dto: TwoFactorLoginDto, context: TokenContext): Promise<AuthResponse> {
    const userId = await this.totp.consumeChallenge(dto.twoFactorToken, dto.code);

    const user = await this.users.requireById(userId);
    this.users.assertUsable(user);

    await this.users.markLoggedIn(user.id);
    if (dto.device) await this.registerDevice(user.id, dto.device);

    this.logger.log({ userId: user.id }, 'Вход завершён со вторым фактором');

    return this.buildAuthResponse(user.id, context);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Обновление и завершение сессии
  // ═══════════════════════════════════════════════════════════════════════

  async refresh(refreshToken: string, context: TokenContext): Promise<AuthResponse> {
    const { tokens, userId } = await this.tokens.rotate(refreshToken, context, (id) =>
      this.users.buildTokenSubject(id),
    );

    const user = await this.users.requireById(userId);

    return {
      user: await this.users.toAuthenticatedUser(user),
      tokens,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Восстановление пароля
  // ═══════════════════════════════════════════════════════════════════════

  async resetPassword(dto: ResetPasswordDto, context: TokenContext): Promise<void> {
    const phone = await this.otp.consumeVerificationToken(dto.verificationToken, 'password_reset');

    const user = await this.users.findByPhone(phone);
    if (!user) {
      throw AppException.notFound('Пользователь не найден', ErrorCode.AUTH_PHONE_NOT_REGISTERED);
    }

    await this.users.updatePassword(user.id, dto.newPassword);

    // Смена пароля завершает ВСЕ сессии на всех устройствах.
    // Смысл: если пароль меняют из-за того, что аккаунт увели, злоумышленник
    // должен потерять доступ немедленно, а не через 30 дней.
    await this.tokens.revokeAllForUser(user.id, 'password_reset');

    await this.audit.record({
      actorId: user.id,
      action: 'user.password_reset',
      targetType: 'user',
      targetId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    this.logger.log({ userId: user.id }, 'Пароль изменён через восстановление');
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context: TokenContext,
  ): Promise<void> {
    const user = await this.users.requireById(userId);

    if (
      !user.passwordHash ||
      !(await this.users.verifyPassword(user.passwordHash, currentPassword))
    ) {
      throw AppException.unauthorized(
        'Текущий пароль указан неверно',
        ErrorCode.AUTH_INVALID_CREDENTIALS,
      );
    }

    await this.users.updatePassword(userId, newPassword);
    await this.tokens.revokeAllForUser(userId, 'password_change');

    await this.audit.record({
      actorId: userId,
      action: 'user.password_change',
      targetType: 'user',
      targetId: userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════

  private async registerDevice(userId: string, device: DeviceInfo): Promise<void> {
    await this.users.registerDevice(userId, {
      deviceId: device.deviceId,
      platform: device.platform,
      ...(device.model ? { model: device.model } : {}),
      ...(device.osVersion ? { osVersion: device.osVersion } : {}),
      ...(device.appVersion ? { appVersion: device.appVersion } : {}),
      ...(device.pushToken ? { pushToken: device.pushToken } : {}),
    });
  }

  private async buildAuthResponse(userId: string, context: TokenContext): Promise<AuthResponse> {
    const user = await this.users.requireById(userId);
    const subject = await this.users.buildTokenSubject(userId);
    const tokens = await this.tokens.issue(subject, context);

    return {
      user: await this.users.toAuthenticatedUser(user),
      tokens,
    };
  }
}

/**
 * Фиктивный хеш валидного формата argon2id.
 *
 * Нужен, чтобы проверка пароля несуществующего пользователя занимала столько
 * же времени, сколько проверка существующего. Иначе разница во времени ответа
 * выдаёт, зарегистрирован номер или нет.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4MDAwMDA';
