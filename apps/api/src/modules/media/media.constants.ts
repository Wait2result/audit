/**
 * Ограничения на загружаемые файлы (пункт 34 ТЗ).
 *
 * Списки разрешённых типов — «белые», а не «чёрные»: разрешено только
 * перечисленное, всё остальное отклоняется. Перечислять запрещённое
 * бесполезно — злоумышленник всегда найдёт формат, которого нет в списке.
 */

export const MediaKind = {
  IMAGE: 'image',
  VIDEO: 'video',
  DOCUMENT: 'document',
} as const;

export type MediaKind = (typeof MediaKind)[keyof typeof MediaKind];

export interface MediaKindRules {
  /** Разрешённые типы файлов */
  mimeTypes: readonly string[];
  /** Предельный размер в байтах */
  maxBytes: number;
  /** Человекочитаемое описание для сообщения об ошибке */
  label: string;
}

export const MEDIA_RULES: Record<MediaKind, MediaKindRules> = {
  [MediaKind.IMAGE]: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    maxBytes: 15 * 1024 * 1024, // 15 МБ — современный телефон снимает примерно столько
    label: 'изображение (JPEG, PNG, WebP, HEIC)',
  },
  [MediaKind.VIDEO]: {
    mimeTypes: ['video/mp4', 'video/quicktime'],
    maxBytes: 100 * 1024 * 1024, // 100 МБ
    label: 'видео (MP4, MOV)',
  },
  [MediaKind.DOCUMENT]: {
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxBytes: 20 * 1024 * 1024, // 20 МБ
    label: 'документ (PDF, JPEG, PNG)',
  },
};

/**
 * Размеры готовых копий изображений.
 *
 * Зачем: в списке ресторанов картинка занимает 150 точек по ширине. Грузить
 * туда исходник на 4000 точек — значит тратить трафик пользователя впустую
 * и заставлять его ждать. Пункт 40 ТЗ прямо требует оптимизации фотографий.
 */
export const IMAGE_VARIANTS = {
  /** Для списков и мелких карточек */
  thumb: { width: 320, quality: 72 },
  /** Для карточки объекта */
  medium: { width: 800, quality: 78 },
  /** Для полноэкранного просмотра */
  large: { width: 1600, quality: 82 },
} as const;

export type ImageVariantName = keyof typeof IMAGE_VARIANTS;

/**
 * Сколько времени файл может лежать «ничей», прежде чем его удалят.
 *
 * Пользователь может загрузить фото и передумать публиковать объявление.
 * Такие файлы никому не принадлежат и просто занимают место — их убирает
 * задача по расписанию.
 */
export const ORPHAN_LIFETIME_HOURS = 24;

/** Сколько времени действует ссылка на загрузку. */
export const UPLOAD_URL_TTL_SECONDS = 600;
