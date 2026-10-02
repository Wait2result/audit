import { Global, Module } from '@nestjs/common';

import { APP_CONFIG, loadConfig } from './env.js';

/**
 * Глобальный модуль конфигурации.
 *
 * @Global означает: конфигурацию можно запросить в любом месте приложения,
 * не импортируя этот модуль каждый раз. Для сквозной инфраструктуры
 * (настройки, база, логи) это оправдано; для бизнес-модулей — нет.
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: loadConfig,
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
