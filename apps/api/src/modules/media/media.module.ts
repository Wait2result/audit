import { Module } from '@nestjs/common';

import { MediaController } from './media.controller.js';
import { MediaFilesController } from './media-files.controller.js';
import { MediaProcessingService } from './media-processing.service.js';
import { MediaService } from './media.service.js';

/**
 * Модуль медиафайлов.
 *
 * Зависимости: PrismaModule и StorageModule (оба глобальные).
 * Собственных зависимостей от бизнес-модулей нет — наоборот, они будут
 * зависеть от него: рестораны, недвижимость, новости прикрепляют свои
 * фотографии через MediaService.attach().
 */
@Module({
  controllers: [MediaController, MediaFilesController],
  providers: [MediaService, MediaProcessingService],
  exports: [MediaService],
})
export class MediaModule {}
