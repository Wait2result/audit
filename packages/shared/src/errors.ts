/**
 * Единый справочник кодов ошибок.
 *
 * Зачем: сервер отвечает машиночитаемым кодом (например AUTH_OTP_EXPIRED),
 * а приложение само решает, какой текст показать пользователю и на каком языке.
 * Так текст ошибки можно менять без обновления сервера, а сервер — без
 * обновления приложения в сторах.
 */

export const ErrorCode = {
  // ── Общие ─────────────────────────────────────────────────────────────────
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  /** Сервер недоступен. Формируется клиентом, а не сервером. */
  NETWORK_ERROR: 'NETWORK_ERROR',

  // ── Авторизация и регистрация ─────────────────────────────────────────────
  AUTH_PHONE_INVALID: 'AUTH_PHONE_INVALID',
  AUTH_PHONE_ALREADY_REGISTERED: 'AUTH_PHONE_ALREADY_REGISTERED',
  AUTH_PHONE_NOT_REGISTERED: 'AUTH_PHONE_NOT_REGISTERED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_BLOCKED: 'AUTH_ACCOUNT_BLOCKED',
  AUTH_ACCOUNT_NOT_ACTIVATED: 'AUTH_ACCOUNT_NOT_ACTIVATED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  /** Старый refresh-токен использован повторно — признак кражи, все сессии гасятся */
  AUTH_TOKEN_REUSE_DETECTED: 'AUTH_TOKEN_REUSE_DETECTED',
  AUTH_2FA_REQUIRED: 'AUTH_2FA_REQUIRED',
  AUTH_2FA_INVALID: 'AUTH_2FA_INVALID',

  // ── Коды подтверждения (SMS) ──────────────────────────────────────────────
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',
  OTP_COOLDOWN: 'OTP_COOLDOWN',
  OTP_DAILY_LIMIT: 'OTP_DAILY_LIMIT',
  OTP_NOT_VERIFIED: 'OTP_NOT_VERIFIED',
  SMS_SEND_FAILED: 'SMS_SEND_FAILED',

  // ── Файлы ─────────────────────────────────────────────────────────────────
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TYPE_NOT_ALLOWED: 'FILE_TYPE_NOT_ALLOWED',
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',

  // ── Города и справочники ──────────────────────────────────────────────────
  CITY_NOT_FOUND: 'CITY_NOT_FOUND',
  CITY_INACTIVE: 'CITY_INACTIVE',

  // ── Погода ────────────────────────────────────────────────────────────────
  WEATHER_UNAVAILABLE: 'WEATHER_UNAVAILABLE',

  // ── Геокодирование ────────────────────────────────────────────────────────
  /** Поставщик адресов не ответил: сеть, лимит или сбой на его стороне */
  GEOCODER_UNAVAILABLE: 'GEOCODER_UNAVAILABLE',

  // ── Кино ──────────────────────────────────────────────────────────────────
  CINEMA_NOT_FOUND: 'CINEMA_NOT_FOUND',

  // ── Заведения и меню ──────────────────────────────────────────────────────
  PLACE_NOT_FOUND: 'PLACE_NOT_FOUND',
  PLACE_CLOSED: 'PLACE_CLOSED',
  /** Номер не принадлежит ни одному зарегистрированному аккаунту */
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  PLACE_ACCESS_DENIED: 'PLACE_ACCESS_DENIED',
  MENU_ITEM_NOT_FOUND: 'MENU_ITEM_NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_MIXED_PLACES: 'ORDER_MIXED_PLACES',
  ORDER_MIN_AMOUNT: 'ORDER_MIN_AMOUNT',
  ORDER_PRICE_CHANGED: 'ORDER_PRICE_CHANGED',
  ORDER_INVALID_TRANSITION: 'ORDER_INVALID_TRANSITION',
  ORDERS_DISABLED: 'ORDERS_DISABLED',
  MENU_ITEM_UNAVAILABLE: 'MENU_ITEM_UNAVAILABLE',

  // ── Отзывы ────────────────────────────────────────────────────────────────
  REVIEW_NOT_FOUND: 'REVIEW_NOT_FOUND',
  /** Отзыв можно оставить только после выполненного заказа в этом заведении */
  REVIEW_NOT_ALLOWED: 'REVIEW_NOT_ALLOWED',

  // ── Новости ───────────────────────────────────────────────────────────────
  NEWS_NOT_FOUND: 'NEWS_NOT_FOUND',

  // ── Объявления ────────────────────────────────────────────────────────────
  LISTING_NOT_FOUND: 'LISTING_NOT_FOUND',
  /** Чужое объявление. Тот же код, что и «не найдено»: разные ответы
   *  позволяли бы перебором выяснять, какие идентификаторы существуют */
  LISTING_ACCESS_DENIED: 'LISTING_ACCESS_DENIED',
  LISTING_CATEGORY_NOT_FOUND: 'LISTING_CATEGORY_NOT_FOUND',
  /** В эту категорию нельзя подавать — только в её подкатегорию */
  LISTING_CATEGORY_NOT_LEAF: 'LISTING_CATEGORY_NOT_LEAF',
  /** Исчерпан суточный предел объявлений */
  LISTING_DAILY_LIMIT: 'LISTING_DAILY_LIMIT',
  /** «Куплю», «сниму» — объявления-запросы не публикуются */
  LISTING_REQUEST_NOT_ALLOWED: 'LISTING_REQUEST_NOT_ALLOWED',
  /** Поднимать можно раз в сутки */
  LISTING_BUMP_TOO_SOON: 'LISTING_BUMP_TOO_SOON',
  /** Такой переход статуса недопустим */
  LISTING_INVALID_TRANSITION: 'LISTING_INVALID_TRANSITION',
  /** Жалоба на это объявление от вас уже есть */
  LISTING_REPORT_ALREADY_SENT: 'LISTING_REPORT_ALREADY_SENT',
  LISTING_REPORT_NOT_FOUND: 'LISTING_REPORT_NOT_FOUND',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Формат тела ответа при любой ошибке API. */
export interface ApiErrorBody {
  /** Машиночитаемый код из ErrorCode */
  code: ErrorCode;
  /** Техническое описание на русском (для разработчика и логов) */
  message: string;
  /** Детали: например, какие поля не прошли валидацию */
  details?: unknown;
  /** Идентификатор запроса — по нему ошибку находят в логах за секунду */
  requestId: string;
  /** Время возникновения ошибки в формате ISO */
  timestamp: string;
  /** Для RATE_LIMITED: через сколько секунд можно повторить */
  retryAfter?: number;
}
