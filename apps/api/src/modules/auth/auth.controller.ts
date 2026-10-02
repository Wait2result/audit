import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  changePasswordSchema,
  completeRegistrationSchema,
  loginSchema,
  refreshTokenSchema,
  requestOtpSchema,
  resetPasswordSchema,
  twoFactorLoginSchema,
  verifyOtpSchema,
  type AuthResponse,
  type ChangePasswordDto,
  type CompleteRegistrationDto,
  type LoginDto,
  type LoginResponse,
  type RefreshTokenDto,
  type RequestOtpDto,
  type RequestOtpResponse,
  type ResetPasswordDto,
  type TwoFactorLoginDto,
  type VerifyOtpDto,
  type VerifyOtpResponse,
} from '@dagestan/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { CurrentUser, Public, RateLimit } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ApiZodBody } from '../../common/zod/zod-openapi.js';
import { zodBody } from '../../common/zod/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import type { TokenContext } from './token.service.js';
import { TotpService } from './totp.service.js';

/** Код из приложения-аутентификатора: ровно шесть цифр. */
const totpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Код состоит из 6 цифр'),
});

type TotpCodeDto = z.infer<typeof totpCodeSchema>;

/**
 * Авторизация и регистрация (пункт 6 ТЗ).
 *
 * Каждый эндпоинт здесь имеет собственное, более строгое ограничение частоты,
 * чем общее по приложению: это самые привлекательные точки для атак —
 * подбор пароля, перебор кодов, слив бюджета на SMS.
 */
@ApiTags('Авторизация')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly totp: TotpService,
  ) {}

  // ── Регистрация: шаг 1 ────────────────────────────────────────────────────

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  // Ограничение по адресу устройства. Основные лимиты (на номер, на систему)
  // проверяются внутри — здесь грубый отсев самых наглых запросов.
  @RateLimit({ limit: 10, windowSeconds: 3600, scope: 'ip' })
  @ApiOperation({
    summary: 'Запросить код подтверждения по SMS',
    description:
      'Используется при регистрации, восстановлении пароля и смене номера. ' +
      'В режиме разработки код возвращается в поле devCode и печатается в консоль сервера.',
  })
  @ApiZodBody(requestOtpSchema)
  requestOtp(
    @Body(zodBody(requestOtpSchema)) dto: RequestOtpDto,
    @Req() request: FastifyRequest,
  ): Promise<RequestOtpResponse> {
    return this.auth.requestOtp(dto, request.ip);
  }

  // ── Регистрация: шаг 2 ────────────────────────────────────────────────────

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 20, windowSeconds: 3600, scope: 'ip' })
  @ApiOperation({
    summary: 'Проверить код из SMS',
    description:
      'При успехе возвращает временный токен подтверждения, который нужен для следующего шага. ' +
      'Код после проверки сгорает.',
  })
  @ApiZodBody(verifyOtpSchema)
  verifyOtp(@Body(zodBody(verifyOtpSchema)) dto: VerifyOtpDto): Promise<VerifyOtpResponse> {
    return this.auth.verifyOtp(dto);
  }

  // ── Регистрация: шаг 3 ────────────────────────────────────────────────────

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 10, windowSeconds: 3600, scope: 'ip' })
  @ApiOperation({
    summary: 'Завершить регистрацию: задать пароль и имя',
    description: 'Требует токен подтверждения, полученный на шаге проверки кода.',
  })
  @ApiZodBody(completeRegistrationSchema)
  register(
    @Body(zodBody(completeRegistrationSchema)) dto: CompleteRegistrationDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthResponse> {
    return this.auth.completeRegistration(dto, tokenContext(request, dto.device?.deviceId));
  }

  // ── Вход ──────────────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 20, windowSeconds: 900, scope: 'ip' })
  @ApiOperation({
    summary: 'Шаг 1: вход по номеру телефона и паролю',
    description:
      'Возвращает status: "ok" и токены — если второй фактор не включён. ' +
      'Если включён, возвращает status: "2fa_required" и временный пропуск, ' +
      'с которым нужно обратиться к /auth/login/2fa. Телефон и пароль на втором ' +
      'шаге не повторяются.',
  })
  @ApiZodBody(loginSchema)
  login(
    @Body(zodBody(loginSchema)) dto: LoginDto,
    @Req() request: FastifyRequest,
  ): Promise<LoginResponse> {
    return this.auth.login(dto, tokenContext(request, dto.device?.deviceId));
  }

  @Public()
  @Post('login/2fa')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 900, scope: 'ip' })
  @ApiOperation({
    summary: 'Шаг 2: код из приложения-аутентификатора',
    description:
      'Принимает только временный пропуск и код. Пропуск живёт 5 минут, ' +
      'одноразовый, и после пяти неверных кодов аннулируется.',
  })
  @ApiZodBody(twoFactorLoginSchema)
  loginWithTwoFactor(
    @Body(zodBody(twoFactorLoginSchema)) dto: TwoFactorLoginDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthResponse> {
    return this.auth.loginWithTwoFactor(dto, tokenContext(request, dto.device?.deviceId));
  }

  // ── Обновление сессии ─────────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 60, windowSeconds: 3600, scope: 'ip' })
  @ApiOperation({
    summary: 'Обновить токен доступа',
    description:
      'Старый токен обновления гасится и заменяется новым. Повторное использование ' +
      'погашенного токена трактуется как кража и завершает все сессии устройства.',
  })
  @ApiZodBody(refreshTokenSchema)
  refresh(
    @Body(zodBody(refreshTokenSchema)) dto: RefreshTokenDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthResponse> {
    return this.auth.refresh(dto.refreshToken, tokenContext(request));
  }

  // ── Выход ─────────────────────────────────────────────────────────────────

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Выйти из аккаунта на текущем устройстве' })
  @ApiZodBody(refreshTokenSchema)
  async logout(
    @Body(zodBody(refreshTokenSchema)) dto: RefreshTokenDto,
  ): Promise<{ success: true }> {
    await this.auth.logout(dto.refreshToken);
    return { success: true };
  }

  // ── Восстановление пароля ─────────────────────────────────────────────────

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 3600, scope: 'ip' })
  @ApiOperation({
    summary: 'Задать новый пароль после подтверждения по SMS',
    description: 'Все активные сессии пользователя завершаются.',
  })
  @ApiZodBody(resetPasswordSchema)
  async resetPassword(
    @Body(zodBody(resetPasswordSchema)) dto: ResetPasswordDto,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.auth.resetPassword(dto, tokenContext(request));
    return { success: true };
  }

  // ── Двухфакторная авторизация ─────────────────────────────────────────────

  @ApiBearerAuth()
  @Get('2fa/status')
  @ApiOperation({ summary: 'Включена ли двухфакторная авторизация' })
  async totpStatus(
    @CurrentUser() user: RequestUser,
  ): Promise<{ enabled: boolean; required: boolean }> {
    return {
      enabled: await this.totp.isEnabled(user.id),
      required: this.totp.isRequiredFor(user.roles),
    };
  }

  @ApiBearerAuth()
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 3600, scope: 'user' })
  @ApiOperation({
    summary: 'Шаг 1: получить секрет для приложения-аутентификатора',
    description:
      'Возвращает секрет и ссылку otpauth для QR-кода. Двухфакторная авторизация ' +
      'при этом ещё НЕ включается — сначала нужно подтвердить кодом (шаг 2), иначе ' +
      'сотрудник, не успевший добавить секрет в приложение, потерял бы доступ навсегда.',
  })
  totpSetup(@CurrentUser() user: RequestUser): Promise<{ secret: string; otpauthUrl: string }> {
    return this.totp.beginSetup(user.id, user.phone);
  }

  @ApiBearerAuth()
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 900, scope: 'user' })
  @ApiOperation({ summary: 'Шаг 2: подтвердить кодом и включить' })
  @ApiZodBody(totpCodeSchema)
  async totpEnable(
    @Body(zodBody(totpCodeSchema)) dto: TotpCodeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ success: true }> {
    await this.totp.completeSetup(user.id, dto.code);
    return { success: true };
  }

  @ApiBearerAuth()
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, windowSeconds: 900, scope: 'user' })
  @ApiOperation({
    summary: 'Отключить двухфакторную авторизацию',
    description: 'Требует действующий код — иначе защиту мог бы снять любой, кто сел за компьютер.',
  })
  @ApiZodBody(totpCodeSchema)
  async totpDisable(
    @Body(zodBody(totpCodeSchema)) dto: TotpCodeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ success: true }> {
    await this.totp.disable(user.id, dto.code);
    return { success: true };
  }

  @ApiBearerAuth()
  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 3600, scope: 'user' })
  @ApiOperation({
    summary: 'Сменить пароль, зная текущий',
    description: 'Все активные сессии пользователя завершаются.',
  })
  @ApiZodBody(changePasswordSchema)
  async changePassword(
    @Body(zodBody(changePasswordSchema)) dto: ChangePasswordDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.auth.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      tokenContext(request),
    );
    return { success: true };
  }
}

function tokenContext(request: FastifyRequest, deviceId?: string): TokenContext {
  return {
    ...(deviceId ? { deviceId } : {}),
    ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
    ipAddress: request.ip,
  };
}
