import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthCheckResponse } from '@dagestan/shared';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Public } from '../../common/decorators/index.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';

/**
 * Проверка работоспособности сервера.
 *
 * Эти адреса опрашивает система мониторинга. Если /health/ready перестал
 * отвечать «ok» — приходит оповещение в Telegram, и о проблеме вы узнаёте
 * раньше, чем о ней напишут пользователи (пункт 33 ТЗ).
 *
 * Различие двух проверок:
 *   /health       — «процесс жив». Не ходит в базу: должен отвечать всегда
 *                   и мгновенно, иначе при нагрузке на базу мониторинг решит,
 *                   что сервер умер, и перезапустит рабочий процесс.
 *   /health/ready — «сервер готов обслуживать запросы»: проверяет базу и Redis.
 */
@ApiTags('Служебное')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Проверка, что процесс сервера жив' })
  liveness(): { status: 'ok'; uptimeSeconds: number } {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Проверка готовности: база данных и Redis' })
  async readiness(): Promise<HealthCheckResponse> {
    const checks: HealthCheckResponse['checks'] = {};

    try {
      checks.database = { status: 'ok', latencyMs: await this.prisma.ping() };
    } catch (err) {
      checks.database = { status: 'error', message: errorMessage(err) };
    }

    try {
      checks.redis = { status: 'ok', latencyMs: await this.redis.ping() };
    } catch (err) {
      checks.redis = { status: 'error', message: errorMessage(err) };
    }

    try {
      checks.storage = { status: 'ok', latencyMs: await this.storage.ping() };
    } catch (err) {
      checks.storage = { status: 'error', message: errorMessage(err) };
    }

    const failed = Object.values(checks).filter((c) => c.status === 'error').length;

    return {
      // Без базы сервер бесполезен — это «error».
      // Без Redis работать можно, но медленнее — это «degraded».
      status: checks.database?.status === 'error' ? 'error' : failed > 0 ? 'degraded' : 'ok',
      version: process.env.npm_package_version ?? '0.0.0',
      environment: this.config.NODE_ENV,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      checks,
    };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Неизвестная ошибка';
}
