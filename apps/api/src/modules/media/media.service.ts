import { Inject, Injectable, Logger } from '@nestjs/common';
import crypto from 'node:crypto';
import { ErrorCode, type MediaDto } from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import type { Media } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import {
  MEDIA_RULES,
  ORPHAN_LIFETIME_HOURS,
  UPLOAD_URL_TTL_SECONDS,
  type ImageVariantName,
} from './media.constants.js';
import { MediaProcessingService } from './media-processing.service.js';
import type { RequestUploadDto, UploadTicket } from './media.schema.js';

/**
 * Загрузка и хранение файлов (пункт 34 ТЗ).
 *
 * Загрузка идёт в три шага:
 *
 *   1. Приложение просит ссылку     → сервер проверяет тип и размер ЗАРАНЕЕ
 *                                     и заводит запись о будущем файле
 *   2. Приложение шлёт файл в хранилище напрямую, минуя наш сервер
 *   3. Приложение сообщает «готово»  → сервер скачивает файл, проверяет его
 *                                     по-настоящему и пересобирает
 *
 * Почему не проще — «отправить файл на сервер, он сохранит»: тогда сто
 * одновременных загрузок фотографий занимают всю память и весь канал сервера,
 * и остальные пользователи в это время не могут даже открыть погоду.
 *
 * Файл считается «ничьим» (isOrphan), пока его не привяжут к объекту —
 * ресторану, объявлению, новости. Ничьи файлы удаляются через сутки:
 * пользователь мог загрузить фото и передумать публиковать объявление.
 */

/**
 * Заведомо несуществующий идентификатор — для условия «ничего из этого».
 * Пустой список в `notIn` база понимает как «ни одного исключения», то есть
 * как условие, которому отвечают ВСЕ строки: без этой заглушки удаление
 * всех фотографий объявления отвязало бы заодно и чужие.
 */
const NO_MEDIA = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly processing: MediaProcessingService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ── Шаг 1: выдача ссылки на загрузку ──────────────────────────────────────

  async requestUpload(dto: RequestUploadDto, userId: string): Promise<UploadTicket> {
    const kind = dto.kind;
    const rules = MEDIA_RULES[kind];

    // Проверяем заявленный тип и размер ДО выдачи ссылки: незачем позволять
    // человеку залить сто мегабайт, чтобы потом сказать «нельзя».
    if (!rules.mimeTypes.includes(dto.contentType)) {
      throw AppException.badRequest(
        `Недопустимый тип файла. Разрешено: ${rules.label}.`,
        ErrorCode.FILE_TYPE_NOT_ALLOWED,
      );
    }
    this.processing.assertSize(dto.sizeBytes, kind);

    const id = crypto.randomUUID();
    const extension = extensionFor(dto.contentType);
    const storageKey = `${kind}/${id}/original.${extension}`;

    await this.prisma.media.create({
      data: {
        id,
        type: kind,
        storageKey,
        isPrivate: dto.isPrivate,
        mimeType: dto.contentType,
        sizeBytes: dto.sizeBytes,
        alt: dto.alt ?? null,
        uploadedById: userId,
        isOrphan: true,
        moderationStatus: 'pending',
      },
    });

    // Через туннель у телефона есть доступ только к API — файл идёт через
    // него (см. S3_UPLOAD_MODE). В production — прямо в хранилище
    const uploadUrl =
      this.config.S3_UPLOAD_MODE === 'proxy'
        ? this.proxyUploadUrl(id)
        : await this.storage.createUploadUrl({
            key: storageKey,
            contentType: dto.contentType,
            isPrivate: dto.isPrivate,
            expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
          });

    return {
      mediaId: id,
      uploadUrl,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      // Тип обязателен: ссылка подписана вместе с ним, и с другим типом
      // хранилище запрос отклонит.
      requiredHeaders: { 'Content-Type': dto.contentType },
    };
  }

  // ── Шаг 2 через API (режим proxy) ─────────────────────────────────────────

  /**
   * Адрес загрузки через API: одноразовая подпись вместо токена входа —
   * так же, как у ссылки хранилища, адрес годится только для этого файла и
   * только 10 минут, и приложению не нужно отличать один режим от другого.
   */
  private proxyUploadUrl(mediaId: string): string {
    const expires = Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL_SECONDS;
    const signature = this.uploadSignature(mediaId, expires);
    const base = this.config.API_PUBLIC_URL.replace(/\/$/, '');
    return `${base}/api/v1/media/upload/${mediaId}?expires=${expires}&signature=${signature}`;
  }

  private uploadSignature(mediaId: string, expires: number): string {
    return crypto
      .createHmac('sha256', this.config.encryptionKey)
      .update(`media-upload:${mediaId}:${expires}`)
      .digest('hex');
  }

  /**
   * Принять файл, присланный через API, и положить его в хранилище. Дальше
   * всё как при прямой загрузке: подтверждение проверит содержимое, уберёт
   * метаданные и сделает превью.
   */
  async receiveUpload(params: {
    mediaId: string;
    expires: number;
    signature: string;
    contentType: string | undefined;
    body: Buffer | undefined;
  }): Promise<void> {
    const expected = this.uploadSignature(params.mediaId, params.expires);
    const given = Buffer.from(params.signature, 'hex');
    const valid =
      given.length === expected.length / 2 &&
      crypto.timingSafeEqual(given, Buffer.from(expected, 'hex'));
    if (!valid || params.expires < Math.floor(Date.now() / 1000)) {
      throw AppException.forbidden('Ссылка на загрузку недействительна или устарела');
    }

    const media = await this.prisma.media.findFirst({
      where: { id: params.mediaId, deletedAt: null },
    });
    if (!media) throw AppException.notFound('Запись о файле не найдена');
    if (media.moderationStatus !== 'pending') throw AppException.conflict('Файл уже обработан');

    const contentType = params.contentType?.split(';')[0]?.trim().toLowerCase();
    if (contentType !== media.mimeType) {
      throw AppException.badRequest(
        'Тип файла не совпадает с заявленным',
        ErrorCode.FILE_TYPE_NOT_ALLOWED,
      );
    }
    if (!params.body || params.body.length === 0) {
      throw AppException.badRequest('Пустой файл');
    }
    this.processing.assertSize(params.body.length, media.type);

    await this.storage.put({
      key: media.storageKey,
      body: params.body,
      contentType: media.mimeType,
      isPrivate: media.isPrivate,
    });
  }

  // ── Шаг 3: подтверждение и обработка ──────────────────────────────────────

  /**
   * Вызывается приложением после успешной загрузки файла в хранилище.
   *
   * Здесь файл впервые проверяется по-настоящему: до этого момента сервер
   * знал о нём только со слов клиента.
   */
  async confirmUpload(mediaId: string, userId: string, alt?: string): Promise<MediaDto> {
    const media = await this.prisma.media.findFirst({
      where: { id: mediaId, deletedAt: null },
    });

    if (!media) {
      throw AppException.notFound('Запись о файле не найдена');
    }

    // Подтвердить загрузку может только тот, кто её начал.
    if (media.uploadedById !== userId) {
      throw AppException.forbidden('Этот файл загружен другим пользователем');
    }

    if (media.moderationStatus !== 'pending') {
      throw AppException.conflict('Файл уже обработан');
    }

    const kind = media.type;

    // Реальный размер берём у хранилища, а не со слов клиента.
    const info = await this.storage.head(media.storageKey, media.isPrivate);
    if (!info) {
      throw AppException.badRequest(
        'Файл не найден в хранилище. Загрузите его заново.',
        ErrorCode.FILE_UPLOAD_FAILED,
      );
    }

    this.processing.assertSize(info.sizeBytes, kind);

    const buffer = await this.storage.get(media.storageKey, media.isPrivate);
    const realMime = await this.processing.verifyFileType(buffer, media.mimeType, kind);

    let width: number | null = null;
    let height: number | null = null;
    let variants: Record<string, string> | null = null;
    let finalKey = media.storageKey;

    const isImage = realMime.startsWith('image/');

    if (isImage) {
      const processed = await this.processing.processImage(buffer);
      const prefix = `${kind}/${media.id}`;

      const stored: Record<string, string> = {};
      for (const [name, variant] of Object.entries(processed.variants) as [
        ImageVariantName,
        { buffer: Buffer; width: number; height: number },
      ][]) {
        const key = `${prefix}/${name}.webp`;
        await this.storage.put({
          key,
          body: variant.buffer,
          contentType: 'image/webp',
          isPrivate: media.isPrivate,
          // Готовые копии никогда не меняются — пусть кешируются на год
          cacheSeconds: 31_536_000,
        });
        stored[name] = key;
      }

      width = processed.originalWidth;
      height = processed.originalHeight;
      variants = stored;
      finalKey = stored.large ?? media.storageKey;

      // Исходник удаляем: пользователям он не отдаётся никогда, а вместе с ним
      // исчезают и EXIF с координатами съёмки, и любая посторонняя нагрузка,
      // которую могли дописать в файл.
      await this.storage.delete(media.storageKey, media.isPrivate);
    }

    const updated = await this.prisma.media.update({
      where: { id: media.id },
      data: {
        storageKey: finalKey,
        mimeType: isImage ? 'image/webp' : realMime,
        sizeBytes: info.sizeBytes,
        width,
        height,
        variants: variants ?? undefined,
        ...(alt !== undefined ? { alt } : {}),
        moderationStatus: 'approved',
      },
    });

    this.logger.log(
      { mediaId: media.id, kind, sizeBytes: info.sizeBytes },
      'Файл загружен и обработан',
    );

    return this.toDto(updated);
  }

  // ── Привязка к объектам ───────────────────────────────────────────────────

  /**
   * Привязывает файлы к объекту: ресторану, объявлению, новости.
   *
   * Вызывается другими модулями в момент создания объекта. С этого момента
   * файл перестаёт быть «ничьим» и не будет удалён уборкой.
   */
  /**
   * Можно ли привязать файлы: только свои и только обработанные — иначе к
   * своему объявлению можно было бы прицепить чужую фотографию. Подача
   * объявления проверяет это ДО записи: иначе при сбое фото объявление уже
   * опубликовано без них, а повторная отправка создаёт второе.
   */
  async assertAttachable(mediaIds: readonly string[], userId: string): Promise<void> {
    if (mediaIds.length === 0) return;
    const owned = await this.prisma.media.findMany({
      where: {
        id: { in: [...mediaIds] },
        uploadedById: userId,
        moderationStatus: 'approved',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (owned.length !== new Set(mediaIds).size) {
      throw AppException.badRequest(
        'Часть фотографий не загрузилась до конца. Удалите их и добавьте заново',
        ErrorCode.FILE_UPLOAD_FAILED,
      );
    }
  }

  async attach(params: {
    mediaIds: string[];
    ownerType: string;
    ownerId: string;
    userId: string;
  }): Promise<void> {
    if (params.mediaIds.length === 0) return;

    await this.assertAttachable(params.mediaIds, params.userId);

    await this.prisma.media.updateMany({
      where: { id: { in: params.mediaIds } },
      data: {
        ownerType: params.ownerType,
        ownerId: params.ownerId,
        isOrphan: false,
      },
    });
  }

  /**
   * Файлы, привязанные к объекту, в порядке, который задал их владелец.
   *
   * Порядок важен: первая фотография объявления становится обложкой, и
   * «сделать главной» — это перестановка, а не загрузка заново. Дата
   * загрузки остаётся запасным ключом для файлов, порядок которым никто
   * не задавал: у них у всех sortOrder = 0.
   */
  async listForOwner(ownerType: string, ownerId: string): Promise<MediaDto[]> {
    const items = await this.prisma.media.findMany({
      where: { ownerType, ownerId, deletedAt: null, moderationStatus: 'approved' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return Promise.all(items.map((item) => this.toDto(item)));
  }

  /**
   * Полный состав и порядок фотографий объекта.
   *
   * Принимается ВЕСЬ список, а не «добавить одну»: человек в форме
   * переставляет и удаляет карточки, и отправлять по одному действию на
   * каждое движение пальца — значит получить рассогласование при первой же
   * потере связи.
   *
   * Убранные фотографии не удаляются, а отвязываются: они становятся
   * «ничьими» и уезжают в суточную уборку. Случайно удалённое фото можно
   * вернуть в течение суток — для этого достаточно снова его выбрать.
   */
  async setOrder(params: {
    mediaIds: string[];
    ownerType: string;
    ownerId: string;
    userId: string;
  }): Promise<void> {
    await this.attach(params);

    await this.prisma.$transaction([
      // Сначала отвязываем всё, чего в новом списке нет
      this.prisma.media.updateMany({
        where: {
          ownerType: params.ownerType,
          ownerId: params.ownerId,
          id: { notIn: params.mediaIds.length > 0 ? params.mediaIds : [NO_MEDIA] },
        },
        data: { ownerId: null, ownerType: null, isOrphan: true, sortOrder: 0 },
      }),
      ...params.mediaIds.map((id, index) =>
        this.prisma.media.update({ where: { id }, data: { sortOrder: index } }),
      ),
    ]);
  }

  async findById(id: string): Promise<MediaDto> {
    const media = await this.prisma.media.findFirst({ where: { id, deletedAt: null } });
    if (!media) throw AppException.notFound('Файл не найден');
    return this.toDto(media);
  }

  /**
   * Несколько файлов одним запросом: списку из двадцати карточек нужны
   * двадцать обложек, и спрашивать их по одной — двадцать запросов к базе.
   * Пропавшие файлы просто отсутствуют в ответе, ошибки нет.
   */
  async findByIds(ids: string[]): Promise<MediaDto[]> {
    if (ids.length === 0) return [];

    const items = await this.prisma.media.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });

    return Promise.all(items.map((item) => this.toDto(item)));
  }

  // ── Удаление и уборка ─────────────────────────────────────────────────────

  /**
   * Удаляет файл: помечает запись удалённой и стирает содержимое из хранилища.
   *
   * Содержимое стирается сразу и физически — этого требует и пункт 34 ТЗ,
   * и закон о персональных данных: «удалить» должно означать «удалить».
   */
  async remove(id: string, userId: string): Promise<void> {
    const media = await this.prisma.media.findFirst({ where: { id, deletedAt: null } });
    if (!media) throw AppException.notFound('Файл не найден');

    if (media.uploadedById !== userId) {
      throw AppException.forbidden('Нельзя удалить чужой файл');
    }

    await this.deleteFromStorage(media);

    await this.prisma.media.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Удаляет файлы, которые так и не привязали ни к чему.
   *
   * Запускается по расписанию. Без этого хранилище постепенно наполняется
   * фотографиями от объявлений, которые никто не опубликовал, и вы платите
   * за их хранение годами.
   */
  async cleanupOrphans(): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - ORPHAN_LIFETIME_HOURS * 3_600_000);

    const orphans = await this.prisma.media.findMany({
      where: { isOrphan: true, deletedAt: null, createdAt: { lt: cutoff } },
      take: 500,
    });

    for (const media of orphans) {
      await this.deleteFromStorage(media);
    }

    if (orphans.length > 0) {
      await this.prisma.media.updateMany({
        where: { id: { in: orphans.map((m) => m.id) } },
        data: { deletedAt: new Date() },
      });
      this.logger.log({ count: orphans.length }, 'Убраны непривязанные файлы');
    }

    return { deleted: orphans.length };
  }

  // ── Внутреннее ────────────────────────────────────────────────────────────

  private async deleteFromStorage(media: Media): Promise<void> {
    const keys = new Set<string>([media.storageKey]);

    if (media.variants && typeof media.variants === 'object') {
      for (const value of Object.values(media.variants as Record<string, unknown>)) {
        if (typeof value === 'string') keys.add(value);
      }
    }

    try {
      await this.storage.deleteMany([...keys], media.isPrivate);
    } catch (err) {
      // Запись всё равно помечаем удалённой: пользователь не должен видеть
      // файл из-за проблем с хранилищем. Мусор уберёт следующая уборка.
      this.logger.error({ err, mediaId: media.id }, 'Не удалось стереть файл из хранилища');
    }
  }

  private async toDto(media: Media): Promise<MediaDto> {
    const variants = (media.variants ?? {}) as Record<string, string>;

    const url = media.isPrivate
      ? await this.storage.createDownloadUrl(media.storageKey)
      : this.storage.publicUrl(media.storageKey);

    const thumbKey = variants.thumb;
    const thumbnailUrl = thumbKey
      ? media.isPrivate
        ? await this.storage.createDownloadUrl(thumbKey)
        : this.storage.publicUrl(thumbKey)
      : null;

    return {
      id: media.id,
      url,
      thumbnailUrl,
      type: media.type === 'video' ? 'video' : 'image',
      width: media.width,
      height: media.height,
      alt: media.alt,
    };
  }
}

/** Расширение файла по типу — только для читаемости имён в хранилище. */
function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'application/pdf': 'pdf',
  };
  return map[mimeType] ?? 'bin';
}
