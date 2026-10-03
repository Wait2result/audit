import { z } from 'zod';

import { latitudeSchema, longitudeSchema, uuidSchema } from './common.schema.js';

/**
 * Умный поиск (Global Smart Search): контракт между приложением, сервером и
 * языковой моделью.
 *
 * Модель НЕ ищет данные и не отвечает пользователю. Её единственная работа —
 * превратить фразу человека («Toyota Succeed до 1.2 млн, автомат») в
 * намерение строго этой формы. Дальше сервер проверяет каждое значение по
 * справочникам раздела и сам вызывает существующий поиск. Всё, что не
 * укладывается в схему, отбрасывается целиком — невалидный ответ модели
 * никогда не исполняется.
 *
 * Версия схемы растёт при несовместимых изменениях: ответы модели старой
 * версии отклоняются, а не толкуются «как получится».
 */

export const SMART_SEARCH_SCHEMA_VERSION = '1' as const;

/**
 * Разделы, с которыми умеет работать умный поиск. Новый раздел — новое
 * значение здесь и новый адаптер на сервере; маршрутизатор не меняется.
 */
export const SMART_SEARCH_DOMAINS = ['listings', 'cinema', 'news', 'delivery'] as const;
export type SmartSearchDomain = (typeof SMART_SEARCH_DOMAINS)[number];

/** Пределы: защищают модель и сервер от огромных запросов и ответов. */
export const SMART_SEARCH_LIMITS = {
  /** Длина текста от человека */
  maxTextLength: 300,
  /** Фильтров и пожеланий в одном намерении */
  maxFilters: 20,
  /** Независимых подзапросов в составном запросе */
  maxSubqueries: 3,
  /** Результатов в одной части ответа */
  maxResults: 20,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  Намерение — то, что возвращает модель
// ─────────────────────────────────────────────────────────────────────────────

/** Имя фильтра: латиница, как у ключей характеристик («gearbox», «priceMax» нельзя — см. range). */
const filterKey = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, 'Недопустимое имя фильтра');

const scalar = z.union([z.string().trim().min(1).max(80), z.number().finite(), z.boolean()]);

/**
 * Значение фильтра: одно значение, список («2 или 3 комнаты») или границы
 * («до 1.2 млн» → `{ max: 1200000 }`). Строковые границы — для моделей:
 * «iPhone 15 или новее» → `{ min: "iPhone 15" }`.
 */
export const smartSearchFilterValueSchema = z.union([
  scalar,
  z
    .array(z.union([z.string().trim().min(1).max(80), z.number().finite()]))
    .min(1)
    .max(12),
  z
    .object({
      min: z.union([z.number().finite(), z.string().trim().min(1).max(80)]).optional(),
      max: z.union([z.number().finite(), z.string().trim().min(1).max(80)]).optional(),
    })
    .strict()
    .refine((range) => range.min !== undefined || range.max !== undefined, 'Пустой диапазон'),
]);

export type SmartSearchFilterValue = z.infer<typeof smartSearchFilterValueSchema>;

const filterRecord = z
  .record(filterKey, smartSearchFilterValueSchema)
  .refine(
    (record) => Object.keys(record).length <= SMART_SEARCH_LIMITS.maxFilters,
    'Слишком много фильтров',
  );

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Время в формате ЧЧ:ММ');

/** «Сегодня», «завтра» или точная дата: относительные слова переводит сервер. */
const dayValue = z.union([
  z.enum(['today', 'tomorrow', 'day_after_tomorrow', 'yesterday']),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате ГГГГ-ММ-ДД'),
]);

export const SMART_SEARCH_DAY_PERIODS = ['morning', 'day', 'evening', 'night'] as const;
export type SmartSearchDayPeriod = (typeof SMART_SEARCH_DAY_PERIODS)[number];

export const SMART_SEARCH_SORTS = [
  'relevance',
  'newest',
  'price_asc',
  'price_desc',
  'nearest',
  'rating',
  'fastest',
] as const;
export type SmartSearchSort = (typeof SMART_SEARCH_SORTS)[number];

/**
 * Что человек хочет сделать:
 *   search  — новый поиск;
 *   refine  — уточнение предыдущего («а автомат?»);
 *   action  — действие (заказать, купить, забронировать) — поиск его не выполняет;
 *   unknown — не удалось понять.
 */
export const SMART_SEARCH_INTENTS = ['search', 'refine', 'action', 'unknown'] as const;
export type SmartSearchIntentKind = (typeof SMART_SEARCH_INTENTS)[number];

const intentCore = z
  .object({
    intent: z.enum(SMART_SEARCH_INTENTS),
    domain: z.enum(SMART_SEARCH_DOMAINS).nullable(),
    /** Слова для текстового поиска, если их не удалось разложить по фильтрам */
    query: z.string().trim().max(120).nullable(),
    /** Точные условия: «до», «от», «только», «обязательно» */
    filters: filterRecord,
    /** Пожелания: «желательно», «по возможности» — жёстким фильтром не становятся */
    preferences: filterRecord,
    location: z
      .object({
        /** Город так, как его назвал человек: «Каспийск», «в Махачкале» */
        city: z.string().trim().min(1).max(60).nullable(),
        /** «Рядом», «поблизости» — от точки человека */
        nearMe: z.boolean(),
        /** «Желательно в …» — пожелание, а не условие */
        preferred: z.boolean(),
      })
      .strict()
      .nullable(),
    time: z
      .object({
        date: dayValue.nullable(),
        from: timeOfDay.nullable(),
        to: timeOfDay.nullable(),
        period: z.enum(SMART_SEARCH_DAY_PERIODS).nullable(),
      })
      .strict()
      .nullable(),
    sort: z.enum(SMART_SEARCH_SORTS).nullable(),
    clarification: z
      .object({
        needed: z.boolean(),
        question: z.string().trim().max(160).nullable(),
        options: z.array(z.string().trim().min(1).max(60)).max(6),
      })
      .strict(),
    /** Насколько модель уверена в разборе, 0…1 */
    confidence: z.number().min(0).max(1),
    /** Слова, которые модель не смогла отнести ни к одному полю */
    unresolved: z.array(z.string().trim().min(1).max(60)).max(10),
  })
  .strict();

export type SmartSearchIntentCore = z.infer<typeof intentCore>;

export const smartSearchIntentCoreSchema = intentCore;

/**
 * Ответ модели целиком. Составной запрос («кино завтра вечером и новости
 * дня») — это основное намерение плюс до трёх независимых подзапросов; каждый
 * проверяется и исполняется отдельно.
 */
export const smartSearchIntentSchema = intentCore
  .extend({
    schemaVersion: z.literal(SMART_SEARCH_SCHEMA_VERSION),
    subqueries: z.array(intentCore).max(SMART_SEARCH_LIMITS.maxSubqueries),
  })
  .strict();

export type SmartSearchIntent = z.infer<typeof smartSearchIntentSchema>;

// ─────────────────────────────────────────────────────────────────────────────
//  Запрос от приложения
// ─────────────────────────────────────────────────────────────────────────────

export const SMART_SEARCH_SCREENS = [
  'home',
  'listings',
  'cinema',
  'news',
  'delivery',
  'other',
] as const;

export const smartSearchRequestSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'Напишите, что ищете')
      .max(SMART_SEARCH_LIMITS.maxTextLength, 'Слишком длинный запрос'),
    /** Сессия поиска из прошлого ответа — для продолжения («а автомат?») */
    sessionId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,64}$/, 'Некорректная сессия поиска')
      .optional(),
    /** Начать заново: прежний контекст не учитывается */
    reset: z.boolean().optional(),
    context: z
      .object({
        /** Выбранный в приложении город */
        cityId: uuidSchema.optional(),
        /** Точка человека — только если он разрешил геолокацию */
        latitude: latitudeSchema.optional(),
        longitude: longitudeSchema.optional(),
        /** Экран, с которого спрашивают: подсказка раздела для коротких фраз */
        screen: z.enum(SMART_SEARCH_SCREENS).optional(),
        /** Категория объявлений, открытая на экране */
        listingCategory: z.string().trim().max(60).optional(),
      })
      .strict()
      .optional(),
    limit: z.number().int().min(1).max(SMART_SEARCH_LIMITS.maxResults).default(10),
  })
  .strict();

export type SmartSearchRequest = z.infer<typeof smartSearchRequestSchema>;
