import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';

/**
 * Файловое хранилище (пункт 34 ТЗ).
 *
 * Фотографии и видео НЕ хранятся в базе данных — она для этого не предназначена:
 * резервные копии распухают до неподъёмных размеров, а каждый запрос списка
 * начинает тащить мегабайты картинок. В базе лежат только ссылки.
 *
 * Работает с любым S3-совместимым хранилищем. На вашем компьютере это MinIO
 * в контейнере, на боевом сервере — арендованное объектное хранилище.
 * Для кода разницы нет: меняются только значения в .env.
 *
 * Два раздела хранилища:
 *   public  — то, что видят все: фото ресторанов, квартир, новостей.
 *   private — документы водителей и прочее чувствительное. Доступ только
 *             по временной ссылке, живущей несколько минут.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  /**
   * Отдельный клиент только для подписи ссылок ЗАГРУЗКИ.
   *
   * Подпись S3 включает хост, на который пойдёт запрос: ссылку нельзя
   * подписать одним адресом, а обратиться по другому — подпись не совпадёт.
   * Обычно оба клиента смотрят в один и тот же MinIO одним и тем же адресом,
   * и разницы нет. При разработке через туннель — есть: сервер продолжает
   * читать и писать файлы у себя на localhost, а ссылку для телефона нужно
   * подписать адресом туннеля, иначе телефон стучится сам в себя.
   */
  private readonly uploadClient: S3Client;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const credentials = {
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
    };
    // MinIO работает по схеме «адрес/корзина/файл», настоящий S3 —
    // «корзина.адрес/файл». Переключается настройкой.
    const forcePathStyle = config.S3_FORCE_PATH_STYLE;

    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      credentials,
      forcePathStyle,
    });

    this.uploadClient =
      config.S3_UPLOAD_ENDPOINT === config.S3_ENDPOINT
        ? this.client
        : new S3Client({
            endpoint: config.S3_UPLOAD_ENDPOINT,
            region: config.S3_REGION,
            credentials,
            forcePathStyle,
          });
  }

  bucketFor(isPrivate: boolean): string {
    return isPrivate ? this.config.S3_BUCKET_PRIVATE : this.config.S3_BUCKET_PUBLIC;
  }

  /**
   * Временная ссылка для ЗАГРУЗКИ файла напрямую в хранилище.
   *
   * Зачем так, а не через наш сервер: файл идёт от телефона сразу в хранилище,
   * минуя сервер. Сервер не тратит на это ни память, ни канал — а значит,
   * сотня одновременных загрузок фотографий не мешает остальным пользователям.
   *
   * Ссылка действует 10 минут и годится только для одного конкретного файла
   * с заранее объявленным типом.
   */
  async createUploadUrl(params: {
    key: string;
    contentType: string;
    isPrivate: boolean;
    expiresInSeconds?: number;
  }): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketFor(params.isPrivate),
      Key: params.key,
      ContentType: params.contentType,
    });

    return getSignedUrl(this.uploadClient, command, {
      expiresIn: params.expiresInSeconds ?? 600,
    });
  }

  /**
   * Временная ссылка для СКАЧИВАНИЯ приватного файла.
   * Используется там, где файл нельзя отдавать всем: документы водителей,
   * которые видит только модератор во время проверки.
   */
  async createDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketFor(true),
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /** Постоянный адрес публичного файла. */
  publicUrl(key: string): string {
    return `${this.config.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  }

  // ── Операции с файлами ────────────────────────────────────────────────────

  async put(params: {
    key: string;
    body: Buffer;
    contentType: string;
    isPrivate: boolean;
    cacheSeconds?: number;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketFor(params.isPrivate),
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        // Готовые превью не меняются никогда: пусть браузер и CDN
        // кешируют их надолго.
        ...(params.cacheSeconds
          ? { CacheControl: `public, max-age=${params.cacheSeconds}, immutable` }
          : {}),
      }),
    );
  }

  async get(key: string, isPrivate: boolean): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucketFor(isPrivate), Key: key }),
    );

    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`Файл ${key} пуст или недоступен`);
    }
    return Buffer.from(bytes);
  }

  /** Сведения о файле без его скачивания: размер и объявленный тип. */
  async head(
    key: string,
    isPrivate: boolean,
  ): Promise<{ sizeBytes: number; contentType: string } | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketFor(isPrivate), Key: key }),
      );
      return {
        sizeBytes: response.ContentLength ?? 0,
        contentType: response.ContentType ?? 'application/octet-stream',
      };
    } catch {
      // Файл ещё не загружен или уже удалён — для вызывающего это одно и то же.
      return null;
    }
  }

  async delete(key: string, isPrivate: boolean): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucketFor(isPrivate), Key: key }),
    );
  }

  /** Удаление пачкой — для уборки брошенных файлов по расписанию. */
  async deleteMany(keys: string[], isPrivate: boolean): Promise<void> {
    if (keys.length === 0) return;

    // S3 принимает не более 1000 ключей за раз.
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucketFor(isPrivate),
          Delete: { Objects: chunk.map((Key) => ({ Key })) },
        }),
      );
    }

    this.logger.log({ count: keys.length }, 'Файлы удалены из хранилища');
  }

  /** Проверка доступности хранилища для health-check. */
  async ping(): Promise<number> {
    const start = Date.now();
    await this.head('__healthcheck__', false);
    return Date.now() - start;
  }
}
