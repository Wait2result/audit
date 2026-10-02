import { Injectable, Logger } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import sharp, { type Metadata } from 'sharp';
import { ErrorCode } from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import {
  IMAGE_VARIANTS,
  MEDIA_RULES,
  MediaKind,
  type ImageVariantName,
} from './media.constants.js';

export interface ProcessedImage {
  /** Готовые копии: имя размера → содержимое файла */
  variants: Record<ImageVariantName, { buffer: Buffer; width: number; height: number }>;
  /** Размеры исходного изображения */
  originalWidth: number;
  originalHeight: number;
}

/**
 * Проверка и обработка загруженных файлов.
 *
 * Здесь закрываются две разные угрозы.
 *
 * УГРОЗА 1: подделка типа файла.
 * Расширение и заявленный тип — это то, что сказал клиент, а клиенту верить
 * нельзя. Файл «фото.jpg» может оказаться исполняемым скриптом. Поэтому тип
 * определяется по СОДЕРЖИМОМУ — по первым байтам, которые у каждого формата
 * свои («магические числа») и которые подделать под другой формат нельзя.
 *
 * УГРОЗА 2: вредоносная нагрузка внутри настоящей картинки.
 * В корректный JPEG можно дописать вредоносный код так, что картинка
 * останется картинкой. Защита: мы никогда не отдаём пользователям исходный
 * файл — только пересобранный заново. При пересборке остаются одни пиксели,
 * всё постороннее исчезает.
 *
 * Побочная, но важная польза: пересборка удаляет EXIF. Это метаданные, которые
 * телефон записывает в каждый снимок, включая GPS-координаты места съёмки.
 * Без очистки фотография квартиры выдавала бы точный адрес владельца всем,
 * кто скачает картинку.
 */
@Injectable()
export class MediaProcessingService {
  private readonly logger = new Logger(MediaProcessingService.name);

  /**
   * Определяет настоящий тип файла и сверяет с заявленным.
   * Возвращает подтверждённый тип.
   */
  async verifyFileType(buffer: Buffer, declaredMime: string, kind: MediaKind): Promise<string> {
    const detected = await fileTypeFromBuffer(buffer);

    if (!detected) {
      throw AppException.badRequest(
        'Не удалось определить тип файла. Загрузите изображение, видео или PDF.',
        ErrorCode.FILE_TYPE_NOT_ALLOWED,
      );
    }

    const rules = MEDIA_RULES[kind];

    if (!rules.mimeTypes.includes(detected.mime)) {
      this.logger.warn(
        { declared: declaredMime, detected: detected.mime, kind },
        'Отклонён файл недопустимого типа',
      );
      throw AppException.badRequest(
        `Недопустимый тип файла. Разрешено: ${rules.label}.`,
        ErrorCode.FILE_TYPE_NOT_ALLOWED,
      );
    }

    // Заявленный тип не совпал с настоящим — верим настоящему, но записываем
    // в лог: систематические расхождения означают либо ошибку в приложении,
    // либо чьи-то попытки подобрать обход проверки.
    if (detected.mime !== declaredMime) {
      this.logger.warn(
        { declared: declaredMime, detected: detected.mime },
        'Заявленный тип файла не совпал с настоящим',
      );
    }

    return detected.mime;
  }

  /** Проверяет размер файла. */
  assertSize(sizeBytes: number, kind: MediaKind): void {
    const rules = MEDIA_RULES[kind];

    if (sizeBytes <= 0) {
      throw AppException.badRequest('Файл пуст', ErrorCode.FILE_UPLOAD_FAILED);
    }

    if (sizeBytes > rules.maxBytes) {
      const limitMb = Math.floor(rules.maxBytes / (1024 * 1024));
      throw AppException.badRequest(
        `Файл слишком большой. Максимум для этого типа: ${limitMb} МБ.`,
        ErrorCode.FILE_TOO_LARGE,
      );
    }
  }

  /**
   * Пересобирает изображение и готовит копии разных размеров.
   * Формат результата — WebP: при том же качестве он весит на 25-35% меньше
   * JPEG, а поддерживается всеми современными телефонами и браузерами.
   */
  async processImage(buffer: Buffer): Promise<ProcessedImage> {
    let metadata: Metadata;

    try {
      metadata = await sharp(buffer).metadata();
    } catch (err) {
      this.logger.warn({ err }, 'Не удалось прочитать изображение');
      throw AppException.badRequest(
        'Файл повреждён или не является изображением',
        ErrorCode.FILE_TYPE_NOT_ALLOWED,
      );
    }

    const originalWidth = metadata.width ?? 0;
    const originalHeight = metadata.height ?? 0;

    if (originalWidth === 0 || originalHeight === 0) {
      throw AppException.badRequest(
        'Не удалось определить размеры изображения',
        ErrorCode.FILE_TYPE_NOT_ALLOWED,
      );
    }

    // Защита от «бомбы сжатия»: файл в пару мегабайт может разворачиваться
    // в изображение на 50000×50000 точек и съесть всю память сервера.
    const MAX_PIXELS = 50_000_000; // 50 мегапикселей — с запасом для любой камеры
    if (originalWidth * originalHeight > MAX_PIXELS) {
      throw AppException.badRequest(
        'Изображение слишком большое по разрешению',
        ErrorCode.FILE_TOO_LARGE,
      );
    }

    const variants = {} as ProcessedImage['variants'];

    for (const [name, spec] of Object.entries(IMAGE_VARIANTS) as [
      ImageVariantName,
      (typeof IMAGE_VARIANTS)[ImageVariantName],
    ][]) {
      const pipeline = sharp(buffer, { failOn: 'error' })
        // Поворачиваем по метке ориентации из EXIF — иначе снятые вертикально
        // фотографии окажутся лежащими на боку.
        .rotate()
        .resize({
          width: spec.width,
          // Маленькие изображения не растягиваем: увеличение только портит вид
          withoutEnlargement: true,
          fit: 'inside',
        })
        .webp({ quality: spec.quality });

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      variants[name] = { buffer: data, width: info.width, height: info.height };
    }

    return { variants, originalWidth, originalHeight };
  }
}
