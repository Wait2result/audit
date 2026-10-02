import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission, type MediaDto } from '@dagestan/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  CurrentUser,
  Public,
  RateLimit,
  RequirePermissions,
} from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ApiZodBody } from '../../common/zod/zod-openapi.js';
import { zodBody } from '../../common/zod/zod-validation.pipe.js';
import { MediaService } from './media.service.js';
import {
  confirmUploadSchema,
  requestUploadSchema,
  type ConfirmUploadDto,
  type RequestUploadDto,
  type UploadTicket,
} from './media.schema.js';

/**
 * Загрузка файлов.
 *
 * Все действия требуют авторизации: аноним не должен иметь возможности
 * заполнять ваше хранилище (и ваш счёт за него) чем угодно.
 */
@ApiTags('Файлы')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload-url')
  // Ограничение по пользователю: 60 файлов в час — с запасом для объявления
  // с двадцатью фотографиями, но недостаточно, чтобы залить хранилище.
  @RateLimit({ limit: 60, windowSeconds: 3600, scope: 'user' })
  @ApiOperation({
    summary: 'Шаг 1: получить ссылку для загрузки файла',
    description:
      'Сервер проверяет тип и размер заранее и возвращает временную ссылку. ' +
      'Приложение отправляет файл по этой ссылке методом PUT напрямую в хранилище, ' +
      'минуя сервер. Затем вызывает подтверждение (шаг 2).',
  })
  @ApiZodBody(requestUploadSchema)
  requestUpload(
    @Body(zodBody(requestUploadSchema)) dto: RequestUploadDto,
    @CurrentUser() user: RequestUser,
  ): Promise<UploadTicket> {
    return this.media.requestUpload(dto, user.id);
  }

  @Put('upload/:id')
  @Public()
  // Подпись в адресе заменяет вход: ссылку выдал сервер на шаге 1, она
  // одна на файл и живёт 10 минут. Лимит — от перебора и заливки мусора
  @RateLimit({ limit: 120, windowSeconds: 3600, scope: 'ip' })
  @HttpCode(204)
  @ApiOperation({
    summary: 'Шаг 2 (режим proxy): отправить файл через API',
    description:
      'Используется, когда хранилище недоступно телефону напрямую (разработка через ' +
      'туннель). Адрес с подписью выдаёт шаг 1; тело — сам файл, Content-Type — заявленный.',
  })
  async receiveUpload(
    @Param('id') id: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.media.receiveUpload({
      mediaId: z.string().uuid().parse(id),
      expires: z.coerce.number().int().positive().parse(expires),
      signature: z
        .string()
        .regex(/^[0-9a-f]{64}$/)
        .parse(signature),
      contentType: request.headers['content-type'],
      body: Buffer.isBuffer(request.body) ? request.body : undefined,
    });
  }

  @Post(':id/confirm')
  @RateLimit({ limit: 60, windowSeconds: 3600, scope: 'user' })
  @ApiOperation({
    summary: 'Шаг 2: подтвердить загрузку',
    description:
      'Сервер скачивает файл, проверяет его настоящий тип по содержимому, ' +
      'пересобирает изображение (удаляя EXIF с координатами съёмки) и готовит ' +
      'уменьшенные копии. Возвращает готовые ссылки.',
  })
  @ApiZodBody(confirmUploadSchema)
  confirmUpload(
    @Param('id') id: string,
    @Body(zodBody(confirmUploadSchema)) dto: ConfirmUploadDto,
    @CurrentUser() user: RequestUser,
  ): Promise<MediaDto> {
    return this.media.confirmUpload(id, user.id, dto.alt);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Сведения о файле' })
  findById(@Param('id') id: string): Promise<MediaDto> {
    return this.media.findById(id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить свой файл',
    description: 'Содержимое стирается из хранилища физически, а не помечается скрытым.',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ success: true }> {
    await this.media.remove(id, user.id);
    return { success: true };
  }

  @Post('cleanup-orphans')
  @RequirePermissions(Permission.SYSTEM_SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Убрать файлы, не привязанные ни к одному объекту',
    description:
      'Удаляет файлы старше суток, которые так и не прикрепили к объявлению или заведению. ' +
      'Предназначено для запуска по расписанию.',
  })
  cleanupOrphans(): Promise<{ deleted: number }> {
    return this.media.cleanupOrphans();
  }
}
