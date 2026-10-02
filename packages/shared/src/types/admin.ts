/**
 * Типы данных панели управления.
 *
 * Отделены от типов мобильного приложения: панель видит существенно больше —
 * статусы, нарушения, историю действий. Смешивать их в одном типе опасно:
 * легко случайно отдать в приложение поле, предназначенное только сотрудникам.
 */

/** Пользователь в списке панели управления. */
export interface AdminUserListItem {
  id: string;
  phone: string;
  firstName: string;
  lastName: string | null;
  status: 'pending' | 'active' | 'blocked' | 'deleted';
  isVerified: boolean;
  cityName: string | null;
  roles: string[];
  ratingAverage: number;
  ratingCount: number;
  createdAt: string;
  lastLoginAt: string | null;
  /** Активная блокировка, если есть */
  activeBlock: {
    reason: string;
    expiresAt: string | null;
    createdAt: string;
  } | null;
  violationCount: number;
}

/** Запись журнала действий администраторов. */
export interface AuditLogEntry {
  id: string;
  action: string;
  actor: {
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string;
  } | null;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: string;
  before: unknown;
  after: unknown;
}

/** Роль с набором прав. */
export interface RoleWithPermissions {
  id: string;
  name: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  /** Сколько сотрудников имеют эту роль */
  userCount: number;
}

/** Новость в списке панели: то же, что видит приложение, плюс служебное. */
export interface AdminNewsListItem {
  id: string;
  title: string;
  scope: 'city' | 'dagestan' | 'russia' | 'world';
  cityName: string | null;
  sourceName: string;
  score: number;
  corroboration: number;
  isHidden: boolean;
  publishedAt: string;
  url: string;
}

/** Сводка для главной страницы панели. */
export interface DashboardSummary {
  users: {
    total: number;
    active: number;
    blocked: number;
    /** Зарегистрировались за последние 7 дней */
    newLastWeek: number;
  };
  cities: {
    total: number;
    active: number;
  };
  media: {
    total: number;
    /** Файлы, не привязанные ни к одному объекту */
    orphans: number;
    totalBytes: number;
  };
  /** Последние действия администраторов */
  recentActions: AuditLogEntry[];
}
