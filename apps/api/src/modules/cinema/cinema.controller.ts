import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Permission,
  type CinemaDto,
  type CinemaScheduleDto,
  type MovieDetailsDto,
} from '@dagestan/shared';
import type { FastifyRequest } from 'fastify';

import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ApiZodBody } from '../../common/zod/zod-openapi.js';
import { zodBody } from '../../common/zod/zod-validation.pipe.js';
import { CinemaService } from './cinema.service.js';
import {
  cinemaListQuerySchema,
  cinemaMovieQuerySchema,
  cinemaScheduleQuerySchema,
  createCinemaSchema,
  updateCinemaSchema,
  type CreateCinemaDto,
  type UpdateCinemaDto,
} from './cinema.schema.js';

@ApiTags('Кино')
@Controller('cinema')
export class CinemaController {
  constructor(private readonly cinema: CinemaService) {}

  @Public()
  @Get('schedule')
  @ApiOperation({
    summary: 'Расписание сеансов в городе на дату',
    description:
      'Фильмы и сеансы во всех кинотеатрах города на выбранную дату (по умолчанию — ' +
      'сегодня). Данные собираются с сайтов самих кинотеатров и не хранятся в базе. ' +
      'Пустой список — валидный ответ (нет сеансов в этот день или в городе пока нет ' +
      'подключённых кинотеатров). Аккаунт не требуется.',
  })
  getSchedule(@Query() rawQuery: unknown): Promise<CinemaScheduleDto> {
    const { cityId, date } = cinemaScheduleQuerySchema.parse(rawQuery);
    return this.cinema.getSchedule(cityId, date);
  }

  @Public()
  @Get('movie')
  @ApiOperation({
    summary: 'Карточка фильма: описание и трейлер',
    description:
      'Запрашивается по нажатию на фильм в расписании. Трейлер отдаётся прямой ' +
      'ссылкой на видео, чтобы приложение могло проиграть его у себя.',
  })
  getMovie(@Query() rawQuery: unknown): Promise<MovieDetailsDto> {
    const { cityId, movieId } = cinemaMovieQuerySchema.parse(rawQuery);
    return this.cinema.getMovie(cityId, movieId);
  }

  @Public()
  @Get('list')
  @ApiOperation({ summary: 'Кинотеатры города' })
  list(@Query() rawQuery: unknown): Promise<CinemaDto[]> {
    const { cityId } = cinemaListQuerySchema.parse(rawQuery);
    return this.cinema.listByCity(cityId);
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Post()
  @ApiOperation({ summary: 'Подключить кинотеатр' })
  @ApiZodBody(createCinemaSchema)
  create(
    @Body(zodBody(createCinemaSchema)) dto: CreateCinemaDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<CinemaDto> {
    return this.cinema.create(dto, user.id, auditContext(request));
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Изменить кинотеатр' })
  @ApiZodBody(updateCinemaSchema)
  update(
    @Param('id') id: string,
    @Body(zodBody(updateCinemaSchema)) dto: UpdateCinemaDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<CinemaDto> {
    return this.cinema.update(id, dto, user.id, auditContext(request));
  }

  @RequirePermissions(Permission.PLACES_MANAGE)
  @Delete(':id')
  @ApiOperation({ summary: 'Отключить кинотеатр' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<{ success: true }> {
    await this.cinema.softDelete(id, user.id, auditContext(request));
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
