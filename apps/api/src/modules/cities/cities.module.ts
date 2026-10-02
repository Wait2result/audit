import { Module } from '@nestjs/common';

import { CitiesController } from './cities.controller.js';
import { CitiesService } from './cities.service.js';

@Module({
  controllers: [CitiesController],
  providers: [CitiesService],
  // Экспортируется, потому что другие модули (недвижимость, поездки, заведения)
  // будут проверять через него корректность города в присланных данных.
  exports: [CitiesService],
})
export class CitiesModule {}
