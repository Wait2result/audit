import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { SmsModule } from '../sms/sms.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OtpService } from './otp.service.js';
import { TokenService } from './token.service.js';
import { TotpService } from './totp.service.js';

/**
 * Модуль авторизации.
 *
 * Зависимости (пункт 46 ТЗ требует их проговаривать):
 *   • UsersModule — создание и поиск пользователей, работа с паролями
 *   • SmsModule   — отправка кодов подтверждения
 *   • RbacModule  — роли и права (глобальный)
 *   • PrismaModule, RedisModule, CryptoModule, RateLimitModule — глобальные
 *
 * Модуль ни от чего больше не зависит и потому может собираться и тестироваться
 * первым — на нём стоят все остальные разделы приложения.
 */
@Module({
  imports: [
    UsersModule,
    SmsModule,
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): JwtModuleOptions => ({
        secret: config.JWT_ACCESS_SECRET,
        signOptions: {
          // Формат «15m» библиотека понимает, но её тип описан как литеральное
          // объединение конкретных строк, поэтому нужно явное приведение.
          expiresIn: config.JWT_ACCESS_TTL as `${number}m`,
          issuer: 'dagestan-api',
        },
        verifyOptions: {
          issuer: 'dagestan-api',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, TokenService, TotpService],
  // JwtModule экспортируется, потому что глобальный страж JwtAuthGuard
  // проверяет токены тем же сервисом, которым они выпускаются.
  exports: [AuthService, TokenService, TotpService, JwtModule],
})
export class AuthModule {}
