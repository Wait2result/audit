/**
 * Статусы модерации — общие для всех рубрик (объявления недвижимости,
 * поездки, отзывы, рекламные материалы, новости партнёров).
 */

export const ModerationStatus = {
  /** Черновик: автор ещё не отправил на проверку */
  DRAFT: 'draft',
  /** Ждёт проверки модератором */
  PENDING: 'pending',
  /** Проверено и опубликовано */
  APPROVED: 'approved',
  /** Отклонено, причина указана в moderationReason */
  REJECTED: 'rejected',
  /** Снято с публикации после жалобы или нарушения */
  SUSPENDED: 'suspended',
  /** Архив: срок размещения истёк или автор скрыл */
  ARCHIVED: 'archived',
} as const;

export type ModerationStatus = (typeof ModerationStatus)[keyof typeof ModerationStatus];

export const MODERATION_STATUS_LABELS: Record<ModerationStatus, string> = {
  [ModerationStatus.DRAFT]: 'Черновик',
  [ModerationStatus.PENDING]: 'На проверке',
  [ModerationStatus.APPROVED]: 'Опубликовано',
  [ModerationStatus.REJECTED]: 'Отклонено',
  [ModerationStatus.SUSPENDED]: 'Снято с публикации',
  [ModerationStatus.ARCHIVED]: 'В архиве',
};

/** Статусы, при которых объект виден обычным пользователям приложения. */
export const PUBLICLY_VISIBLE_STATUSES: ModerationStatus[] = [ModerationStatus.APPROVED];

// ─────────────────────────────────────────────────────────────────────────────

export const UserStatus = {
  /** Зарегистрирован, но не завершил подтверждение телефона */
  PENDING: 'pending',
  ACTIVE: 'active',
  /** Заблокирован администрацией */
  BLOCKED: 'blocked',
  /** Удалён по собственному запросу (данные обезличены) */
  DELETED: 'deleted',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
