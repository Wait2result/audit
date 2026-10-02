import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { WeatherDto } from '@dagestan/shared';

import { Public } from '../../common/decorators/index.js';
import { ApiZodQuery } from '../../common/zod/zod-openapi.js';
import { weatherQuerySchema } from './weather.schema.js';
import { WeatherService } from './weather.service.js';

@ApiTags('Погода')
@Controller('weather')
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Прогноз погоды для города',
    description:
      'Текущая погода, почасовой прогноз (~48 часов) и дневной прогноз (7 дней). ' +
      'Координаты берутся из базы по cityId, а не из запроса. Аккаунт не требуется.',
  })
  @ApiZodQuery(weatherQuerySchema)
  getForecast(@Query() rawQuery: unknown): Promise<WeatherDto> {
    const { cityId, refresh } = weatherQuerySchema.parse(rawQuery);
    return this.weather.getForecast(cityId, refresh);
  }
}
