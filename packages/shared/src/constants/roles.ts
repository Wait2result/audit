/**
 * Роли и права доступа (RBAC) — пункт 28 ТЗ.
 *
 * Принцип «минимально необходимых прав»: сотрудник видит только то, что нужно
 * ему для работы. Право — это одна конкретная возможность («блокировать
 * пользователя»). Роль — это именованный набор прав.
 *
 * Права проверяются НА СЕРВЕРЕ при каждом запросе. Скрытие кнопки в интерфейсе
 * защитой не является.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Права
// ─────────────────────────────────────────────────────────────────────────────

export const Permission = {
  // Пользователи
  USERS_READ: 'users:read',
  USERS_UPDATE: 'users:update',
  USERS_BLOCK: 'users:block',
  USERS_VERIFY: 'users:verify',
  USERS_DELETE: 'users:delete',

  // Роли и доступы сотрудников
  ROLES_READ: 'roles:read',
  ROLES_MANAGE: 'roles:manage',

  // Города и справочники
  CITIES_READ: 'cities:read',
  CITIES_MANAGE: 'cities:manage',

  // Модерация пользовательского контента
  MODERATION_READ: 'moderation:read',
  MODERATION_DECIDE: 'moderation:decide',

  // Жалобы
  REPORTS_READ: 'reports:read',
  REPORTS_RESOLVE: 'reports:resolve',

  // Отзывы
  REVIEWS_READ: 'reviews:read',
  REVIEWS_MODERATE: 'reviews:moderate',

  // Партнёры
  PARTNERS_READ: 'partners:read',
  PARTNERS_MANAGE: 'partners:manage',

  // Заведения (рестораны, магазины, кинотеатры)
  PLACES_READ: 'places:read',
  PLACES_MANAGE: 'places:manage',

  // Объявления: справочник категорий и продвижение. Снятие и возврат
  // объявлений — по правам модерации, это разные задачи и разные люди.
  LISTINGS_MANAGE: 'listings:manage',

  // Заказы
  ORDERS_READ: 'orders:read',
  ORDERS_MANAGE: 'orders:manage',

  // Новости
  NEWS_READ: 'news:read',
  NEWS_MANAGE: 'news:manage',
  NEWS_PUBLISH: 'news:publish',

  // Реклама
  ADS_READ: 'ads:read',
  ADS_MANAGE: 'ads:manage',

  // Финансы: комиссии, платежи, выплаты
  FINANCE_READ: 'finance:read',
  FINANCE_MANAGE: 'finance:manage',

  // Аналитика
  ANALYTICS_READ: 'analytics:read',

  // Техническая часть
  SYSTEM_LOGS_READ: 'system:logs',
  SYSTEM_ERRORS_READ: 'system:errors',
  SYSTEM_SETTINGS_MANAGE: 'system:settings',
  SYSTEM_AUDIT_READ: 'system:audit',

  // Собственный кабинет партнёра (свои объекты, свои заказы, своя статистика)
  PARTNER_CABINET: 'partner:cabinet',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: Permission[] = Object.values(Permission);

// ─────────────────────────────────────────────────────────────────────────────
//  Роли
// ─────────────────────────────────────────────────────────────────────────────

export const RoleName = {
  /** Владелец системы. Может всё, включая выдачу прав другим. */
  SUPER_ADMIN: 'super_admin',
  /** Администратор: управление контентом и операционной частью, без системных настроек. */
  ADMIN: 'admin',
  /** Модератор: объявления, жалобы, отзывы, блокировки. */
  MODERATOR: 'moderator',
  /** Поддержка: помощь пользователям, разбор проблем с заказами. */
  SUPPORT: 'support',
  /** Аналитик: только отчёты, без доступа к персональным данным. */
  ANALYST: 'analyst',
  /** Технический администратор: логи, ошибки, настройки инфраструктуры. */
  TECH_ADMIN: 'tech_admin',
  /** Партнёр: только собственный бизнес. Админ-панель недоступна. */
  PARTNER: 'partner',
  /** Обычный пользователь приложения. Прав в панели управления нет. */
  USER: 'user',
} as const;

export type RoleName = (typeof RoleName)[keyof typeof RoleName];

/** Роли, которым разрешён вход в веб-панель управления. */
export const STAFF_ROLES: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MODERATOR,
  RoleName.SUPPORT,
  RoleName.ANALYST,
  RoleName.TECH_ADMIN,
];

/** Роли, для которых двухфакторная авторизация обязательна (пункт 4 ТЗ). */
export const ROLES_REQUIRING_2FA: RoleName[] = STAFF_ROLES;

const P = Permission;

/** Набор прав по умолчанию для каждой роли. Хранится в БД и может корректироваться. */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  [RoleName.SUPER_ADMIN]: ALL_PERMISSIONS,

  [RoleName.ADMIN]: [
    P.USERS_READ,
    P.USERS_UPDATE,
    P.USERS_BLOCK,
    P.USERS_VERIFY,
    P.CITIES_READ,
    P.CITIES_MANAGE,
    P.MODERATION_READ,
    P.MODERATION_DECIDE,
    P.REPORTS_READ,
    P.REPORTS_RESOLVE,
    P.REVIEWS_READ,
    P.REVIEWS_MODERATE,
    P.PARTNERS_READ,
    P.PARTNERS_MANAGE,
    P.PLACES_READ,
    P.PLACES_MANAGE,
    P.LISTINGS_MANAGE,
    P.ORDERS_READ,
    P.ORDERS_MANAGE,
    P.NEWS_READ,
    P.NEWS_MANAGE,
    P.NEWS_PUBLISH,
    P.ADS_READ,
    P.ADS_MANAGE,
    P.FINANCE_READ,
    P.ANALYTICS_READ,
    P.SYSTEM_AUDIT_READ,
  ],

  [RoleName.MODERATOR]: [
    P.USERS_READ,
    P.USERS_BLOCK,
    P.CITIES_READ,
    P.MODERATION_READ,
    P.MODERATION_DECIDE,
    P.REPORTS_READ,
    P.REPORTS_RESOLVE,
    P.REVIEWS_READ,
    P.REVIEWS_MODERATE,
    P.PLACES_READ,
    P.NEWS_READ,
  ],

  [RoleName.SUPPORT]: [
    P.USERS_READ,
    P.USERS_UPDATE,
    P.CITIES_READ,
    P.REPORTS_READ,
    P.ORDERS_READ,
    P.PLACES_READ,
    P.PARTNERS_READ,
  ],

  // У аналитика намеренно НЕТ доступа к персональным данным пользователей —
  // ему нужны цифры, а не телефоны.
  [RoleName.ANALYST]: [P.ANALYTICS_READ, P.CITIES_READ, P.FINANCE_READ],

  [RoleName.TECH_ADMIN]: [
    P.SYSTEM_LOGS_READ,
    P.SYSTEM_ERRORS_READ,
    P.SYSTEM_SETTINGS_MANAGE,
    P.SYSTEM_AUDIT_READ,
    P.CITIES_READ,
  ],

  [RoleName.PARTNER]: [P.PARTNER_CABINET],

  [RoleName.USER]: [],
};

/** Человекочитаемые названия ролей для интерфейса панели управления. */
export const ROLE_LABELS: Record<RoleName, string> = {
  [RoleName.SUPER_ADMIN]: 'Владелец системы',
  [RoleName.ADMIN]: 'Администратор',
  [RoleName.MODERATOR]: 'Модератор',
  [RoleName.SUPPORT]: 'Поддержка',
  [RoleName.ANALYST]: 'Аналитик',
  [RoleName.TECH_ADMIN]: 'Технический администратор',
  [RoleName.PARTNER]: 'Партнёр',
  [RoleName.USER]: 'Пользователь',
};
