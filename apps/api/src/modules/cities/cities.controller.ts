import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission, type CityDto, type DistrictDto } from '@dagestan/shared';
import type { FastifyRequest } from 'fastify';

import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ApiZodBody } from '../../common/zod/zod-openapi.js';
import { zodBody } from '../../common/zod/zod-validation.pipe.js';
import { CitiesService } from './cities.service.js';
import {
  createCitySchema,
  updateCitySchema,
  type CreateCityDto,
  type UpdateCityDto,
} from './cities.schema.js';

@ApiTags('Города')
@Controller('cities')
export class CitiesController {
  constructor(private readonly cities: CitiesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Список активных городов',
    description:
      'Используется на экране выбора города при первом запуске приложения. Аккаунт не требуется.',
  })
  list(): Promise<CityDto[]> {
    return this.cities.listActive();
  }

  @RequirePermissions(Permission.CITIES_MANAGE)
  @Get('all')
  @ApiOperation({
    summary: 'Все города, включая выключенные',
    description: 'Только для панели управления.',
  })
  listAll(): Promise<CityDto[]> {
    return this.cities.listAll();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Город по латинскому идентификатору' })
  findBySlug(@Param('slug') slug: string): Promise<CityDto> {
    return this.cities.findBySlug(slug);
  }

  @Public()
  @Get(':cityId/districts')
  @ApiOperation({
    summary: 'Районы города',
    description:
      'Для выбора места в объявлении. Есть не у каждого города — пустой список означает, ' +
      'что город административно на районы не делится.',
  })
  listDistricts(@Param('cityId') cityId: string): Promise<DistrictDto[]> {
    return this.cities.listDistricts(cityId);
  }

  @RequirePermissions(Permission.CITIES_MANAGE)
  @Post()
  @ApiOperation({ summary: 'Добавить город' })
  @ApiZodBody(createCitySchema)
  create(
    @Body(zodBody(createCitySchema)) dto: CreateCityDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<CityDto> {
    return this.cities.create(dto, user.id, auditContext(request));
  }

  @RequirePermissions(Permission.CITIES_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Изменить город' })
  @ApiZodBody(updateCitySchema)
  update(
    @Param('id') id: string,
    @Body(zodBody(updateCitySchema)) dto: UpdateCityDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<CityDto> {
    return this.cities.update(id, dto, user.id, auditContext(request));
  }

  @RequirePermissions(Permission.CITIES_MANAGE)
  @Delete(':id')
  @ApiOperation({
    summary: 'Скрыть город',
    description:
      'Город скрывается, но не удаляется физически: на него ссылаются заказы, объявления и поездки.',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.cities.softDelete(id, user.id, auditContext(request));
    return { success: true };
  }
}

/** Собирает данные о запросе для журнала аудита. */
function auditContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    requestId: (request as { id?: string }).id,
  };
}
