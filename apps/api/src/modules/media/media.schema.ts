import { z } from 'zod';

import { MediaKind } from './media.constants.js';

/** Запрос ссылки на загрузку файла. */
export const requestUploadSchema = z.object({
  /** Что загружаем: изображение, видео или документ */
  kind: z.enum([MediaKind.IMAGE, MediaKind.VIDEO, MediaKind.DOCUMENT]),
  /** Тип файла, каким его считает приложение. Проверяется повторно по содержимому. */
  contentType: z.string().trim().min(3).max(120),
  /** Размер файла в байтах — чтобы отказать заранее, не тратя трафик пользователя */
  sizeBytes: z.number().int().positive(),
  /**
   * Приватный файл (документы водителя) виден только модератору по временной
   * ссылке. Обычные фотографии объявлений — публичные.
   */
  isPrivate: z.boolean().default(false),
  /** Описание для незрячих пользователей */
  alt: z.string().trim().max(300).optional(),
});

export type RequestUploadDto = z.infer<typeof requestUploadSchema>;

// Тип билета загрузки общий: им пользуются и приложение, и панель
export type { UploadTicket } from '@dagestan/shared';

/** Подтверждение загрузки: файл уже в хранилище, можно обрабатывать. */
export const confirmUploadSchema = z.object({
  /** Описание для незрячих пользователей */
  alt: z.string().trim().max(300).optional(),
});

export type ConfirmUploadDto = z.infer<typeof confirmUploadSchema>;
