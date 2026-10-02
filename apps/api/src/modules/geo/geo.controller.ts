import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { geoReverseQuerySchema, geoSuggestQuerySchema, type GeoPlaceDto } from '@dagestan/shared';

import { Public, RateLimit } from '../../common/decorators/index.js';
import { ApiZodQuery } from '../../common/zod/zod-openapi.js';
import { GeocodingService } from './geocoding.service.js';

/**
 * Адреса для приложения: подсказки при наборе и адрес по точке на карте.
 *
 * Приложение ходит к поставщику не напрямую, а через сервер: так работают
 * кеш, ограничение частоты (публичные геокодеры блокируют за нагрузку) и
 * замена поставщика без выпуска новой версии приложения.
 */
@ApiTags('Геокодирование')
@Controller('geo')
export class GeoController {
  constructor(private readonly geocoding: GeocodingService) {}

  @Public()
  @Get('suggest')
  @RateLimit({ limit: 90, windowSeconds: 60, scope: 'ip' })
  @ApiZodQuery(geoSuggestQuerySchema)
  @ApiOperation({
    summary: 'Подсказки адреса',
    description:
      'Населённые пункты, улицы и дома Дагестана по началу строки: «Махачкала Батыра», ' +
      '«Манаск». kind=settlement — только населённые пункты. latitude/longitude — искать ' +
      'рядом с этой точкой в первую очередь.',
  })
  suggest(@Query() rawQuery: unknown): Promise<GeoPlaceDto[]> {
    return this.geocoding.suggest(geoSuggestQuerySchema.parse(rawQuery));
  }

  @Public()
  @Get('reverse')
  @RateLimit({ limit: 40, windowSeconds: 60, scope: 'ip' })
  @ApiZodQuery(geoReverseQuerySchema)
  @ApiOperation({
    summary: 'Адрес по точке',
    description:
      'Населённый пункт, район, улица и дом для точки на карте. null — по точке ' +
      'адреса нет (море, горы): точка при этом остаётся годной.',
  })
  reverse(@Query() rawQuery: unknown): Promise<GeoPlaceDto | null> {
    return this.geocoding.reverse(geoReverseQuerySchema.parse(rawQuery));
  }
}
