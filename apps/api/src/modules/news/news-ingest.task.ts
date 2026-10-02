import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { NewsIngestService } from './news-ingest.service.js';

/**
 * Обновление новостей по расписанию (Этап 5).
 *
 * Раз в 15 минут — заметно чаще, чем обновляет ленту сам источник (у РИА
 * «Дагестан» ttl час), но заведомо не нагрузка для него. Плюс запуск при
 * старте сервера: без него лента оставалась бы пустой до первого срабатывания.
 */
@Injectable()
export class NewsIngestTask implements OnApplicationBootstrap {
  private readonly logger = new Logger(NewsIngestTask.name);

  constructor(private readonly ingest: NewsIngestService) {}

  onApplicationBootstrap(): void {
    // Старт сервера не ждёт сети: забор идёт в фоне
    void this.refresh();
  }

  @Cron('*/15 * * * *', { name: 'news-ingest' })
  async refresh(): Promise<void> {
    try {
      await this.ingest.run();
    } catch (err) {
      this.logger.error({ err }, 'Не удалось обновить новости');
    }
  }
}
