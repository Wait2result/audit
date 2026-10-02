/**
 * Загрузка и проверка переменных окружения.
 *
 * Принцип: сервер НЕ ЗАПУСКАЕТСЯ, если настройки некорректны или отсутствуют.
 * Это сознательно: лучше явная ошибка при старте, чем сервер, который вроде
 * работает, но, например, не может отправить SMS — и вы узнаёте об этом
 * от пользователей.
 *
 * Здесь же живут проверки безопасности: в production запрещены значения
 * по умолчанию и слишком короткие секретные ключи.
 */

import { config as loadEnvFile } from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');

/** Приводит строки «true»/«1»/«yes» к логическому значению. */
const booleanFromString = z
  .string()
  .transform((v) => ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase()));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_PUBLIC_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default(''),

  DATABASE_URL: z.string().min(1, 'Не указан адрес базы данных (DATABASE_URL)'),
  REDIS_URL: z.string().min(1, 'Не указан адрес Redis (REDIS_URL)'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET должен быть не короче 32 символов'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET должен быть не короче 32 символов'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  ENCRYPTION_KEY: z.string().min(1, 'Не указан ключ шифрования (ENCRYPTION_KEY)'),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('ru-central1'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  S3_BUCKET_PUBLIC: z.string().default('dagestan-media'),
  S3_BUCKET_PRIVATE: z.string().default('dagestan-private'),
  S3_FORCE_PATH_STYLE: booleanFromString.default(true),
  /**
   * Откуда приложение берёт картинки. Пусто — файлы отдаёт сам сервер
   * (см. MediaFilesController): при разработке через туннель наружу торчит
   * только API, и прямая ссылка на хранилище с телефона не открывается.
   * В production сюда ставится адрес хранилища или сети доставки.
   */
  S3_PUBLIC_URL: z.string().default(''),
  /**
   * Куда подписывается ссылка для ЗАГРУЗКИ файла с телефона напрямую в
   * хранилище. Пусто — берётся S3_ENDPOINT (обычный локальный запуск).
   *
   * При разработке через туннель этого недостаточно: S3_ENDPOINT остаётся
   * localhost — адресом самого телефона, а не компьютера — и загрузка фото
   * падает с сети, хотя весь остальной API через туннель работает. Сюда
   * ставится публичный туннель, проброшенный именно к MinIO (порт 9000),
   * отдельно от туннеля к API.
   */
  S3_UPLOAD_ENDPOINT: z.string().default(''),
  /**
   * Как телефон отправляет файл:
   *   direct — по подписанной ссылке прямо в хранилище (production: сервер
   *            не тратит канал на чужие фотографии);
   *   proxy  — через этот же API (`PUT /media/upload/:id` с подписью в
   *            адресе). Нужен при разработке через туннель: у телефона есть
   *            доступ только к туннелю API, а не к MinIO на компьютере.
   * Пусто — proxy вне production, direct в production.
   */
  S3_UPLOAD_MODE: z.enum(['direct', 'proxy']).optional(),

  SMS_PROVIDER: z.enum(['console', 'smsc', 'smsru']).default('console'),
  SMS_SENDER_NAME: z.string().default('DAGESTAN'),
  SMSC_LOGIN: z.string().default(''),
  SMSC_PASSWORD: z.string().default(''),
  SMSRU_API_ID: z.string().default(''),

  RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().default(120),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  OTP_MAX_PER_PHONE_PER_DAY: z.coerce.number().int().positive().default(5),
  OTP_MAX_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(10),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  /**
   * Общий суточный потолок отправки SMS по всей системе.
   * Последний рубеж защиты бюджета при распределённой атаке, когда каждый
   * отдельный адрес остаётся в рамках своих лимитов.
   */
  SMS_DAILY_LIMIT: z.coerce.number().int().positive().default(2000),

  SENTRY_DSN: z.string().default(''),

  WEATHER_PROVIDER: z.string().default('open-meteo'),
  /**
   * Open-Meteo отдаёт одинаковый API и с публичного сервиса, и с
   * self-hosted инстанса — меняется только этот адрес. В разработке
   * используется публичный (бесплатно, без ключа); в production обязателен
   * self-hosted — см. проверку ниже и docs/ADR/0003-погода-open-meteo.md.
   */
  OPEN_METEO_BASE_URL: z.string().default('https://api.open-meteo.com'),
  WEATHER_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  MAPS_PROVIDER: z.string().default('2gis'),
  MAPS_API_KEY: z.string().default(''),

  /**
   * Геокодирование: подсказки адреса и адрес по точке (ADR-0010). Поставщики
   * за общей прослойкой GeocodingService — чтобы сменить их, меняются только
   * эти строки. Photon создан для подсказок при наборе; Nominatim точнее
   * определяет адрес по точке, включая район города. Оба — OpenStreetMap,
   * без ключа; в production — свои серверы (см. проверку ниже).
   */
  GEOCODER_SUGGEST_PROVIDER: z.enum(['photon', 'nominatim']).default('photon'),
  GEOCODER_REVERSE_PROVIDER: z.enum(['nominatim', 'photon']).default('nominatim'),
  PHOTON_BASE_URL: z.string().default('https://photon.komoot.io'),
  NOMINATIM_BASE_URL: z.string().default('https://nominatim.openstreetmap.org'),
  /** Публичные сервисы OpenStreetMap требуют представиться: имя и контакт */
  GEOCODER_USER_AGENT: z.string().default('DagestanApp/1.0 (development)'),
  GEOCODER_TIMEOUT_MS: z.coerce.number().int().positive().default(6000),
  GEOCODER_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),

  PAYMENTS_ENABLED: booleanFromString.default(false),
  PAYMENT_PROVIDER: z.string().default('yookassa'),
  YOOKASSA_SHOP_ID: z.string().default(''),
  YOOKASSA_SECRET_KEY: z.string().default(''),
});

export type AppConfig = z.infer<typeof envSchema> & {
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  corsOrigins: string[];
  /** Ключ шифрования в виде байтов (расшифрован из base64) */
  encryptionKey: Buffer;
};

let cached: AppConfig | null = null;

/**
 * Читает .env, проверяет значения и возвращает типизированную конфигурацию.
 * Результат кешируется — файл читается один раз за время работы процесса.
 */
export function loadConfig(): AppConfig {
  if (cached) return cached;

  // Переменные, уже заданные в окружении (например, в Docker), имеют приоритет
  // над файлом .env — поэтому override: false.
  loadEnvFile({ path: path.join(REPO_ROOT, '.env'), quiet: true });
  loadEnvFile({ path: path.join(REPO_ROOT, '.env.local'), override: true, quiet: true });

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      'Некорректные переменные окружения. Сервер не запущен.\n' +
        problems +
        '\n\nПроверьте файл .env в корне проекта (за образец возьмите .env.example).',
    );
  }

  const env = parsed.data;

  let encryptionKey: Buffer;
  try {
    encryptionKey = Buffer.from(env.ENCRYPTION_KEY, 'base64');
  } catch {
    throw new Error('ENCRYPTION_KEY должен быть строкой в формате base64');
  }
  if (encryptionKey.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY должен содержать ровно 32 байта (получено ${encryptionKey.length}). ` +
        "Сгенерируйте новый: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  const isProduction = env.NODE_ENV === 'production';

  // ── Проверки, которые применяются только в production ───────────────────
  if (isProduction) {
    const failures: string[] = [];

    if (
      env.JWT_ACCESS_SECRET.includes('CHANGE_ME') ||
      env.JWT_REFRESH_SECRET.includes('CHANGE_ME')
    ) {
      failures.push('JWT-секреты не изменены со значений по умолчанию');
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      failures.push('JWT_ACCESS_SECRET и JWT_REFRESH_SECRET должны различаться');
    }
    if (env.ENCRYPTION_KEY.includes('CHANGE_ME')) {
      failures.push('ENCRYPTION_KEY не изменён со значения по умолчанию');
    }
    if (env.SMS_PROVIDER === 'console') {
      failures.push(
        'SMS_PROVIDER=console недопустим в production: коды подтверждения не будут отправляться пользователям',
      );
    }
    if (!env.SENTRY_DSN) {
      failures.push('Не настроен мониторинг ошибок (SENTRY_DSN)');
    }
    if (env.API_PUBLIC_URL.startsWith('http://')) {
      failures.push('API_PUBLIC_URL должен использовать HTTPS');
    }
    if (env.OPEN_METEO_BASE_URL.includes('api.open-meteo.com')) {
      failures.push(
        'OPEN_METEO_BASE_URL указывает на публичный API Open-Meteo — в production обязателен ' +
          'self-hosted инстанс (см. docs/ADR/0003-погода-open-meteo.md)',
      );
    }
    if (
      env.NOMINATIM_BASE_URL.includes('nominatim.openstreetmap.org') ||
      env.PHOTON_BASE_URL.includes('photon.komoot.io')
    ) {
      failures.push(
        'Геокодер указывает на публичный сервер OpenStreetMap — его правила запрещают ' +
          'нагрузку приложения: в production нужен свой Nominatim/Photon или платный ' +
          'поставщик (см. docs/ADR/0010-геолокация-объявлений.md)',
      );
    }

    if (failures.length > 0) {
      throw new Error(
        'Конфигурация небезопасна для production. Сервер не запущен:\n' +
          failures.map((f) => `  • ${f}`).join('\n'),
      );
    }
  }

  cached = {
    ...env,
    // Пустой адрес означает «отдаёт сам сервер»: ссылка на картинку тогда
    // ведёт туда же, куда и остальной API, и работает через любой туннель
    S3_PUBLIC_URL:
      env.S3_PUBLIC_URL.trim() || `${env.API_PUBLIC_URL.replace(/\/$/, '')}/api/v1/media/public`,
    S3_UPLOAD_ENDPOINT: env.S3_UPLOAD_ENDPOINT.trim() || env.S3_ENDPOINT,
    S3_UPLOAD_MODE: env.S3_UPLOAD_MODE ?? (isProduction ? 'direct' : 'proxy'),
    isProduction,
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    encryptionKey,
  };

  return cached;
}

/** Сбрасывает кеш конфигурации. Нужно только в тестах. */
export function resetConfigCache(): void {
  cached = null;
}

/** Токен внедрения зависимости для NestJS. */
export const APP_CONFIG = Symbol('APP_CONFIG');
