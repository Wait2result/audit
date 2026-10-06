import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  archiveListingSchema,
  createListingSchema,
  draftListingSchema,
  ErrorCode,
  myListingsQuerySchema,
  setListingPhotosSchema,
  updateMyListingSchema,
  uuidSchema,
  type ArchiveListingDto,
  type MyListingDetailsDto,
  type MyListingDto,
  type PaginatedResponse,
  type SetListingPhotosDto,
  type UpdateMyListingDto,
} from '@dagestan/shared';

import { CurrentUser, RateLimit } from '../../common/decorators/index.js';
import { AppException } from '../../common/errors/app.exception.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ApiZodBody } from '../../common/zod/zod-openapi.js';
import { zodBody } from '../../common/zod/zod-validation.pipe.js';
import { ListingsLifecycleService } from './listings-lifecycle.service.js';

/** Сколько помнится ключ повтора подачи: сутки — дольше форму не держат открытой. */
const REPEAT_TTL_SECONDS = 24 * 60 * 60;

/** Ключ повтора подачи в Redis; null — клиент ключ не прислал (старое приложение). */
function repeatKey(userId: string, raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value || !/^[A-Za-z0-9_-]{8,100}$/.test(value)) return null;
  return `listings:create:${userId}:${value}`;
}

/**
 * Мои объявления (Этап 7, часть 2).
 *
 * Кабинет автора: здесь видно то, чего нет в ленте, — черновики, снятое и
 * архив. Всё закрыто входом, и каждое действие начинается с проверки
 * владельца: идентификатор из запроса сам по себе ничего не разрешает.
 */
@ApiTags('Объявления: мои')
@ApiBearerAuth()
@Controller('my/listings')
export class MyListingsController {
  constructor(
    private readonly lifecycle: ListingsLifecycleService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Мои объявления: активные, черновики, архив' })
  list(
    @CurrentUser() user: RequestUser,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<MyListingDto>> {
    return this.lifecycle.myListings(user.id, myListingsQuerySchema.parse(rawQuery));
  }

  /**
   * Своё объявление целиком — для экрана правки. Настоящий телефон и полные
   * характеристики, а не то, что видит покупатель на публичной карточке.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Своё объявление для правки' })
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<MyListingDetailsDto> {
    return this.lifecycle.findOne(uuidSchema.parse(id), user.id);
  }

  /**
   * Подача объявления.
   *
   * `draft=1` сохраняет черновик: форма заполняется в несколько шагов, и
   * человек может выйти из неё на середине — потерять при этом введённое
   * значит заставить начинать заново.
   */
  @Post()
  @RateLimit({ limit: 20, windowSeconds: 60 * 60 })
  @ApiOperation({ summary: 'Разместить объявление' })
  @ApiZodBody(createListingSchema)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Ключ повтора: та же форма, отправленная дважды (нет ответа, «сервер долго не отвечает»), ' +
      'вернёт уже созданное объявление, а не второе',
  })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
    @Query('draft') draft?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<MyListingDto> {
    // Черновик проверяется мягче: обязательных полей у него нет, кроме
    // города и категории. Полная проверка — при публикации
    const isDraft = draft === '1' || draft === 'true';
    if (isDraft) return this.lifecycle.createDraft(user.id, draftListingSchema.parse(body));
    const dto = createListingSchema.parse(body);
    const key = repeatKey(user.id, idempotencyKey);
    if (!key) return this.lifecycle.create(user.id, dto);

    // Повтор той же формы: объявление уже создано — его и вернуть
    const done = await this.redis.client.get(key).catch(() => null);
    if (done) return this.lifecycle.findOne(done, user.id);

    // Два нажатия подряд: второе ждёт ответа первого, а не создаёт копию.
    // Redis недоступен — подача всё равно работает, просто без защиты от повтора
    const lock = `${key}:lock`;
    const locked = await this.redis.client.set(lock, '1', 'EX', 60, 'NX').catch(() => 'OK');
    if (!locked) {
      throw AppException.conflict(
        'Объявление уже публикуется — подождите несколько секунд',
        ErrorCode.CONFLICT,
      );
    }
    try {
      const listing = await this.lifecycle.create(user.id, dto);
      await this.redis.client.set(key, listing.id, 'EX', REPEAT_TTL_SECONDS).catch(() => null);
      return listing;
    } finally {
      await this.redis.client.del(lock).catch(() => null);
    }
  }

  @Post(':id/resubmit')
  @ApiOperation({
    summary: 'Исправить и отправить на проверку',
    description:
      'Снятое сотрудником объявление уходит на проверку, а не сразу в ленту: ' +
      'вернуть его может только сотрудник.',
  })
  resubmit(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<MyListingDto> {
    return this.lifecycle.resubmit(uuidSchema.parse(id), user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменить своё объявление' })
  @ApiZodBody(updateMyListingSchema)
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(zodBody(updateMyListingSchema)) dto: UpdateMyListingDto,
  ): Promise<MyListingDto> {
    return this.lifecycle.update(uuidSchema.parse(id), user.id, dto);
  }

  /** Полный состав и порядок фотографий. Первая становится обложкой. */
  @Put(':id/photos')
  @ApiOperation({ summary: 'Фотографии объявления и их порядок' })
  @ApiZodBody(setListingPhotosSchema)
  async photos(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(zodBody(setListingPhotosSchema)) dto: SetListingPhotosDto,
  ): Promise<{ ok: true }> {
    await this.lifecycle.setPhotos(uuidSchema.parse(id), user.id, dto.photoIds);
    return { ok: true };
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Опубликовать черновик или вернуть из архива' })
  publish(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<MyListingDto> {
    return this.lifecycle.publish(uuidSchema.parse(id), user.id);
  }

  @Post(':id/bump')
  @ApiOperation({ summary: 'Поднять объявление в ленте' })
  bump(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<MyListingDto> {
    return this.lifecycle.bump(uuidSchema.parse(id), user.id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Продано или снято' })
  @ApiZodBody(archiveListingSchema)
  archive(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(zodBody(archiveListingSchema)) dto: ArchiveListingDto,
  ): Promise<MyListingDto> {
    return this.lifecycle.archive(uuidSchema.parse(id), user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить своё объявление' })
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.lifecycle.remove(uuidSchema.parse(id), user.id);
    return { ok: true };
  }
}
