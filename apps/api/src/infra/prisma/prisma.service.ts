import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';

/**
 * Доступ к базе данных.
 *
 * Это единственное место в приложении, которое знает, как подключаться к базе.
 * Мобильное приложение и админка к базе не обращаются никогда — только через API
 * (требование пункта 3 ТЗ).
 *
 * Начиная с Prisma 7 подключение идёт через «драйвер-адаптер» — обычный
 * пул соединений PostgreSQL. Пул означает, что соединения переиспользуются:
 * открывать новое подключение к базе на каждый запрос было бы медленно.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const adapter = new PrismaPg({
      connectionString: config.DATABASE_URL,
      // Верхняя граница числа одновременных соединений. Каждое соединение —
      // это память на сервере базы, поэтому его нельзя оставлять безграничным.
      max: config.isProduction ? 20 : 5,
    });

    super({
      adapter,
      log: config.isDevelopment
        ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
        : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Подключение к базе данных установлено');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Соединение с базой данных закрыто');
  }

  /**
   * Проверка живости базы для health-check.
   * Возвращает время ответа в миллисекундах.
   */
  async ping(): Promise<number> {
    const start = Date.now();
    await this.$queryRaw`SELECT 1`;
    return Date.now() - start;
  }
}
