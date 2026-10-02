import { Controller, Get, Header, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { Public } from '../../common/decorators/index.js';
import { AppException } from '../../common/errors/app.exception.js';
import { StorageService } from '../../infra/storage/storage.service.js';

/**
 * Отдача публичных картинок через сервер.
 *
 * Зачем это нужно, если файлы уже лежат в хранилище: хранилище доступно
 * не всегда и не всем. При разработке через туннель наружу торчит только
 * API, а MinIO живёт на localhost — телефон по мобильному интернету к нему
 * не достучится, и вместо фотографий человек видит пустые кружки.
 *
 * Поэтому ссылка на файл по умолчанию ведёт сюда: адрес картинки всегда
 * там же, где API, и работает везде, где работает API.
 *
 * В production так делать не нужно: там `S3_PUBLIC_URL` указывает прямо
 * на хранилище или на сеть доставки содержимого, и этот маршрут не
 * задействуется. Гонять каждую картинку через Node — лишняя работа для
 * сервера, оправданная только отсутствием другого пути.
 */
@ApiExcludeController()
@Controller('media/public')
export class MediaFilesController {
  constructor(private readonly storage: StorageService) {}

  @Public()
  @Get('*')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  // Общая защита ставит same-origin, и браузер не показывает такую картинку
  // на чужой странице — например, в админ-панели на другом порту. Публичные
  // картинки как раз предназначены для встраивания
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async file(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    // Ключ приходит остатком пути: image/<id>/thumb.webp.
    // Fastify кладёт его в параметр со звёздочкой
    const storageKey = String((request.params as Record<string, string>)['*'] ?? '');

    // Выход за пределы хранилища закрыт: «..» в пути — это попытка
    // прочитать чужой файл, а не опечатка
    if (!storageKey || storageKey.includes('..')) {
      throw AppException.notFound('Файл не найден');
    }

    const info = await this.storage.head(storageKey, false);

    if (!info) {
      throw AppException.notFound('Файл не найден');
    }

    const body = await this.storage.get(storageKey, false);

    await reply.type(info.contentType).send(body);
  }
}
