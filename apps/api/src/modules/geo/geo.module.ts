import { Module } from '@nestjs/common';

import { GeoController } from './geo.controller.js';
import { GeocodingService } from './geocoding.service.js';

/**
 * Геокодирование (ADR-0010): подсказки адреса и адрес по точке — для формы
 * объявления, выбора места поиска и обогащения адреса при сохранении.
 */
@Module({
  controllers: [GeoController],
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeoModule {}
