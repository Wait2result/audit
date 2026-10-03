import { Module } from '@nestjs/common';

import { CitiesModule } from '../cities/cities.module.js';
import { CinemaController } from './cinema.controller.js';
import { CinemaService } from './cinema.service.js';
import { CinemaTrailersTask } from './cinema-trailers.task.js';
import { KinoplanClient } from './kinoplan-client.js';

@Module({
  imports: [CitiesModule],
  controllers: [CinemaController],
  providers: [CinemaService, KinoplanClient, CinemaTrailersTask],
  // Для умного поиска: он ищет через этот же сервис, а не своей копией
  exports: [CinemaService],
})
export class CinemaModule {}
