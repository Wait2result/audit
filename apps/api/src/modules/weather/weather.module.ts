import { Module } from '@nestjs/common';

import { CitiesModule } from '../cities/cities.module.js';
import { WeatherController } from './weather.controller.js';
import { WeatherService } from './weather.service.js';

@Module({
  imports: [CitiesModule],
  controllers: [WeatherController],
  providers: [WeatherService],
  // Умный поиск отвечает на «какая завтра погода» тем же прогнозом, что и экран
  exports: [WeatherService],
})
export class WeatherModule {}
