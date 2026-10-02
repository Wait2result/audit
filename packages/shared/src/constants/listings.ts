/**
 * Объявления (Этап 7): справочники, лимиты и переходы статусов.
 *
 * Лимиты живут константами, а не в таблице настроек: сервиса чтения настроек
 * в проекте пока нет вообще. Когда он появится, значения переедут туда —
 * места их использования от этого не изменятся.
 *
 * Обоснование решений раздела — docs/ADR/0008-объявления.md.
 */

import { ModerationStatus } from './moderation.js';

/** Единица цены: «120 000 ₽» и «25 000 ₽/мес» — разные величины. */
export const ListingPriceUnit = {
  TOTAL: 'total',
  PER_MONTH: 'per_month',
  PER_DAY: 'per_day',
  PER_HOUR: 'per_hour',
  /** За штуку, метр, тонну — стройматериалы, услуги «за единицу» */
  PER_UNIT: 'per_unit',
} as const;

export type ListingPriceUnit = (typeof ListingPriceUnit)[keyof typeof ListingPriceUnit];

export const LISTING_PRICE_UNITS = Object.values(ListingPriceUnit) as ListingPriceUnit[];

/** Короткая приписка к цене. У цены целиком приписки нет. */
export const LISTING_PRICE_UNIT_SUFFIX: Record<ListingPriceUnit, string> = {
  total: '',
  per_month: '/мес',
  per_day: '/сут',
  per_hour: '/час',
  per_unit: '/шт',
};

/** Состояние вещи. У квартиры и вакансии не заполняется. */
export const ListingCondition = {
  NEW: 'new',
  USED: 'used',
} as const;

export type ListingCondition = (typeof ListingCondition)[keyof typeof ListingCondition];

export const LISTING_CONDITION_LABELS: Record<ListingCondition, string> = {
  new: 'Новое',
  used: 'Б/у',
};

/** Почему объявление ушло в архив. */
export const ListingArchiveReason = {
  SOLD: 'sold',
  WITHDRAWN: 'withdrawn',
  EXPIRED: 'expired',
} as const;

export type ListingArchiveReason = (typeof ListingArchiveReason)[keyof typeof ListingArchiveReason];

export const LISTING_ARCHIVE_REASON_LABELS: Record<ListingArchiveReason, string> = {
  sold: 'Продано',
  withdrawn: 'Снято автором',
  expired: 'Истёк срок размещения',
};

/**
 * Как отсортировать выдачу.
 *
 * «Рекомендуемые» — порядок по умолчанию: он учитывает соответствие запросу,
 * свежесть, расстояние, заполненность карточки и продвижение (см.
 * LISTING_RANKING). Остальные варианты — прямые и предсказуемые: человек,
 * выбравший «сначала дешевле», хочет именно цену по возрастанию, а не
 * умную выдачу.
 */
export const ListingSort = {
  RECOMMENDED: 'recommended',
  /** По дате поднятия — то же, что «сначала новые» */
  DATE: 'date',
  PRICE_ASC: 'price_asc',
  PRICE_DESC: 'price_desc',
  /** Ближе ко мне — работает, когда человек разрешил геолокацию */
  DISTANCE: 'distance',
} as const;

export type ListingSort = (typeof ListingSort)[keyof typeof ListingSort];

export const LISTING_SORT_LABELS: Record<ListingSort, string> = {
  recommended: 'Рекомендуемые',
  date: 'Сначала новые',
  price_asc: 'Сначала дешевле',
  price_desc: 'Сначала дороже',
  distance: 'Сначала ближе',
};

// ─────────────────────────────────────────────────────────────────────────────
//  Лимиты
// ─────────────────────────────────────────────────────────────────────────────

/** Сколько дней объявление видно до автоматического ухода в архив. */
export const LISTING_LIFETIME_DAYS = 30;

/**
 * Сколько объявлений человек может подать за сутки. Намеренно скромно:
 * объявления публикуются без проверки, и ограничение частоты — основная
 * защита от заливки мусора.
 */
export const LISTING_DAILY_LIMIT = 10;

/** Как часто можно поднимать одно объявление, в часах. */
export const LISTING_BUMP_COOLDOWN_HOURS = 24;

/** Сколько фотографий помещается в объявление. */
export const LISTING_MAX_PHOTOS = 10;

/**
 * Сколько жалоб от разных людей снимают объявление автоматически.
 *
 * При проверке постфактум сотрудник физически не успевает: мошенник соберёт
 * звонки раньше, чем кто-то проснётся. Снятие обратимо одной кнопкой, автор
 * видит причину, а снятые автоматически попадают в очередь разбора первыми.
 */
export const LISTING_AUTO_SUSPEND_REPORTS = 3;

/** Сколько жалоб человек может отправить за сутки. */
export const LISTING_REPORT_DAILY_LIMIT = 10;

// ─────────────────────────────────────────────────────────────────────────────
//  Где искать
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Радиусы поиска в километрах.
 *
 * Шаги, а не ползунок: «5 или 10 км» — понятный выбор, а «между 7 и 8»
 * никому ничего не говорит. Дагестан вытянут вдоль моря, поэтому 50 км
 * накрывает Махачкалу с Каспийском и Избербашем, 100 км — почти всё
 * приморье, но не весь регион — для него есть отдельный вариант.
 */
export const LISTING_RADIUS_OPTIONS = [1, 5, 10, 25, 50, 100] as const;

export type ListingRadiusKm = (typeof LISTING_RADIUS_OPTIONS)[number];

/**
 * Радиус по умолчанию. 25 км вокруг города — сам город с пригородами и
 * соседними сёлами: то, что человек обычно имеет в виду под «рядом».
 */
export const LISTING_DEFAULT_RADIUS_KM: ListingRadiusKm = 25;

/** Больше этого радиуса сервер не принимает: дальше — «Весь Дагестан». */
export const LISTING_MAX_RADIUS_KM = 300;

/** Подпись радиуса: «10 км», «Весь Дагестан». */
export function listingRadiusLabel(radiusKm: number | null): string {
  return radiusKm === null ? 'Весь Дагестан' : `${radiusKm} км`;
}

/**
 * Насколько далеко объявление считается «рядом» — ближе этого расстояние
 * не показывается цифрой, а говорится словом «рядом»: «300 м» от чужой
 * квартиры звучит как слежка, да и точность координат этого не выдержит.
 */
export const LISTING_NEARBY_KM = 1;

/**
 * Расстояние для карточки: «рядом», «3 км», «27 км».
 *
 * Всегда целые километры: дробные доли создают впечатление точности,
 * которой у центра города и наспех поставленной точки нет.
 */
export function formatDistance(distanceKm: number | null): string | null {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < LISTING_NEARBY_KM) return 'рядом';

  return `${Math.round(distanceKm)} км`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Статусы и переходы
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Статусы объявления — из общего перечисления `ModerationStatus`.
 *
 * `pending` — «на проверке»: объявление, которое автор исправил после
 * снятия и отправил заново, либо которое задержала автоматическая проверка.
 * `rejected` не используется: отказ выражается снятием с причиной.
 */
export const LISTING_STATUS_LABELS: Partial<Record<ModerationStatus, string>> = {
  draft: 'Черновик',
  pending: 'На проверке',
  approved: 'Опубликовано',
  suspended: 'Снято с публикации',
  archived: 'В архиве',
};

/** Статусы, в которых объявление видно всем. */
export const LISTING_PUBLIC_STATUSES: ModerationStatus[] = [ModerationStatus.APPROVED];

/**
 * Что автор может сделать со своим объявлением.
 *
 * Из `suspended` автор не возвращает объявление в ленту сам: снятое
 * модератором возвращает только модератор, иначе снятие ничего не значит.
 * Но исправить и отправить на проверку (`pending`) — может. Из `archived`
 * можно опубликовать заново — это и есть «продлить» по истечении срока.
 */
export const LISTING_AUTHOR_TRANSITIONS: Partial<Record<ModerationStatus, ModerationStatus[]>> = {
  draft: [ModerationStatus.APPROVED],
  approved: [ModerationStatus.ARCHIVED],
  pending: [ModerationStatus.ARCHIVED],
  suspended: [ModerationStatus.PENDING],
  archived: [ModerationStatus.APPROVED],
};

/** Что со объявлением может сделать сотрудник платформы. */
export const LISTING_MODERATOR_TRANSITIONS: Partial<Record<ModerationStatus, ModerationStatus[]>> =
  {
    draft: [ModerationStatus.SUSPENDED],
    pending: [ModerationStatus.APPROVED, ModerationStatus.SUSPENDED],
    approved: [ModerationStatus.SUSPENDED, ModerationStatus.ARCHIVED],
    suspended: [ModerationStatus.APPROVED, ModerationStatus.ARCHIVED],
    archived: [ModerationStatus.APPROVED, ModerationStatus.SUSPENDED],
  };

export function canAuthorTransition(from: ModerationStatus, to: ModerationStatus): boolean {
  return (LISTING_AUTHOR_TRANSITIONS[from] ?? []).includes(to);
}

export function canModeratorTransition(from: ModerationStatus, to: ModerationStatus): boolean {
  return (LISTING_MODERATOR_TRANSITIONS[from] ?? []).includes(to);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Срок размещения и поднятие
// ─────────────────────────────────────────────────────────────────────────────

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const MS_IN_HOUR = 60 * 60 * 1000;

/** Когда объявление, опубликованное в этот момент, уйдёт в архив. */
export function expiresAtFor(publishedAt: Date): Date {
  return new Date(publishedAt.getTime() + LISTING_LIFETIME_DAYS * MS_IN_DAY);
}

/** Истёк ли срок. Ровно в момент истечения объявление уже считается старым. */
export function isExpired(expiresAt: Date | null, now: Date): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= now.getTime();
}

/** Можно ли поднять объявление прямо сейчас. */
export function canBump(bumpedAt: Date, now: Date): boolean {
  return now.getTime() - bumpedAt.getTime() >= LISTING_BUMP_COOLDOWN_HOURS * MS_IN_HOUR;
}

/** Через сколько часов поднятие станет возможным. 0 — уже можно. */
export function hoursUntilBump(bumpedAt: Date, now: Date): number {
  const passed = now.getTime() - bumpedAt.getTime();
  const left = LISTING_BUMP_COOLDOWN_HOURS * MS_IN_HOUR - passed;
  return left <= 0 ? 0 : Math.ceil(left / MS_IN_HOUR);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Жалобы
// ─────────────────────────────────────────────────────────────────────────────

export const ListingReportReason = {
  FRAUD: 'fraud',
  PROHIBITED: 'prohibited',
  WRONG_CATEGORY: 'wrong_category',
  IRRELEVANT: 'irrelevant',
  DUPLICATE: 'duplicate',
  OFFENSIVE: 'offensive',
  SPAM: 'spam',
  OTHER: 'other',
} as const;

export type ListingReportReason = (typeof ListingReportReason)[keyof typeof ListingReportReason];

/** Название и пояснение причины — одинаковые в приложении и в панели. */
export const LISTING_REPORT_REASONS: {
  value: ListingReportReason;
  label: string;
  hint: string;
}[] = [
  {
    value: ListingReportReason.FRAUD,
    label: 'Мошенничество',
    hint: 'Просят предоплату, «бронь», перевод на карту до встречи',
  },
  {
    value: ListingReportReason.PROHIBITED,
    label: 'Запрещённый товар',
    hint: 'Оружие, лекарства, алкоголь, документы',
  },
  {
    value: ListingReportReason.WRONG_CATEGORY,
    label: 'Не та категория',
    hint: 'Объявление размещено не в своём разделе',
  },
  {
    value: ListingReportReason.IRRELEVANT,
    label: 'Уже неактуально',
    hint: 'Продано, сдано или цена ненастоящая',
  },
  {
    value: ListingReportReason.DUPLICATE,
    label: 'Повтор',
    hint: 'То же объявление размещено несколько раз',
  },
  {
    value: ListingReportReason.OFFENSIVE,
    label: 'Оскорбления',
    hint: 'Непристойное или оскорбительное содержание',
  },
  {
    value: ListingReportReason.SPAM,
    label: 'Спам',
    hint: 'Реклама вместо объявления',
  },
  {
    value: ListingReportReason.OTHER,
    label: 'Другое',
    hint: 'Опишите, что не так — без этого жалобу не разобрать',
  },
];

export const LISTING_REPORT_REASON_LABELS: Record<ListingReportReason, string> = Object.fromEntries(
  LISTING_REPORT_REASONS.map((reason) => [reason.value, reason.label]),
) as Record<ListingReportReason, string>;

export const ListingReportStatus = {
  NEW: 'new',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
} as const;

export type ListingReportStatus = (typeof ListingReportStatus)[keyof typeof ListingReportStatus];

export const LISTING_REPORT_STATUS_LABELS: Record<ListingReportStatus, string> = {
  new: 'Ждёт разбора',
  resolved: 'Подтверждена',
  rejected: 'Не подтвердилась',
};
