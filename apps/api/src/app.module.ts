import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';

import { APP_CONFIG, type AppConfig } from './config/env.js';
import { ConfigModule } from './config/config.module.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';
import { RateLimitGuard } from './common/guards/rate-limit.guard.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CinemaModule } from './modules/cinema/cinema.module.js';
import { CitiesModule } from './modules/cities/cities.module.js';
import { GeoModule } from './modules/geo/geo.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { NewsModule } from './modules/news/news.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { ListingsModule } from './modules/listings/listings.module.js';
import { PlacesModule } from './modules/places/places.module.js';
import { RbacModule } from './modules/rbac/rbac.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { WeatherModule } from './modules/weather/weather.module.js';

/**
 * Корневой модуль приложения.
 *
 * Структура намеренно разделена на три слоя (пункт 42 ТЗ о модульности):
 *
 *   config/  — настройки, читаются один раз при запуске
 *   infra/   — техническая обвязка: база, Redis, в будущем S3 и очереди
 *   common/  — сквозные механизмы: ошибки, права, лимиты, шифрование
 *   modules/ — бизнес-разделы. Каждый следующий этап ТЗ добавляет сюда
 *              новую папку, не трогая остальные.
 *
 * Три стража зарегистрированы ГЛОБАЛЬНО и работают в этом порядке:
 *   1. JwtAuthGuard    — кто это? (по умолчанию требует авторизации)
 *   2. RateLimitGuard  — не слишком ли часто он это делает?
 *   3. PermissionsGuard — а можно ли ему это?
 */
@Module({
  imports: [
    ConfigModule,

    // Работы по расписанию: пока это поиск трейлеров к новым фильмам,
    // дальше сюда же лягут рассылки и отчёты.
    ScheduleModule.forRoot(),

    // Логирование. Пишем в формате JSON — такие логи умеет разбирать
    // система мониторинга. В режиме разработки формат делаем читаемым глазами.
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.isProduction ? 'info' : 'debug',
          // Убираем из логов то, чего в них быть не должно.
          // Утечка токена в лог равносильна утечке пароля.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.newPassword',
              'req.body.currentPassword',
              'req.body.code',
              'req.body.refreshToken',
              'req.body.verificationToken',
              'req.body.totpCode',
              'res.headers["set-cookie"]',
            ],
            censor: '[скрыто]',
          },
          // Проверки живости от мониторинга идут каждые несколько секунд —
          // засорять ими логи бессмысленно.
          autoLogging: {
            ignore: (req) => req.url === '/api/v1/health',
          },
          ...(config.isProduction
            ? {}
            : {
                transport: {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
                },
              }),
        },
      }),
    }),

    // Техническая обвязка (все глобальные)
    PrismaModule,
    RedisModule,
    StorageModule,
    CryptoModule,
    RateLimitModule,
    AuditModule,
    RbacModule,

    // Бизнес-разделы
    HealthModule,
    AuthModule,
    UsersModule,
    CitiesModule,
    GeoModule,
    MediaModule,
    AdminModule,
    WeatherModule,
    CinemaModule,
    NewsModule,
    PlacesModule,
    OrdersModule,
    ListingsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
