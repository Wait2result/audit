/**
 * Общие схемы проверки данных (Zod).
 *
 * Схема — это описание «как должны выглядеть правильные данные». Сервер
 * прогоняет через неё каждый входящий запрос: всё, что не соответствует,
 * отклоняется ещё до того, как попадёт в бизнес-логику. Это закрывает
 * основную массу атак и опечаток разом.
 *
 * Те же схемы использует мобильное приложение — чтобы проверять форму
 * на телефоне и не гонять заведомо неверные данные на сервер.
 */

import { z } from 'zod';
import { isE164, normalizePhone, phoneErrorMessage } from '../utils/phone.js';

/** Идентификатор записи в базе (UUID). */
export const uuidSchema = z.uuid('Некорректный идентификатор');

/**
 * Номер телефона. Автоматически приводится к формату +7XXXXXXXXXX,
 * поэтому «8 928 000-00-00» пройдёт проверку и сохранится корректно, а
 * недописанный «950» или «8950» — нет, с объяснением, чего не хватает.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Укажите номер телефона')
  .transform((value, ctx) => {
    const result = normalizePhone(value);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: phoneErrorMessage(result.error) });
      return z.NEVER;
    }
    return result.phone;
  })
  .refine(isE164, 'Некорректный номер телефона');

/**
 * Пароль. Требования намеренно умеренные: слишком строгие правила заставляют
 * людей писать пароли на бумажке. Минимум 8 символов, есть буква и цифра.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Пароль должен содержать не менее 8 символов')
  .max(128, 'Слишком длинный пароль')
  .refine((v) => /[a-zA-Zа-яА-Я]/.test(v), 'Пароль должен содержать хотя бы одну букву')
  .refine((v) => /\d/.test(v), 'Пароль должен содержать хотя бы одну цифру');

/** Код из SMS: ровно 6 цифр. */
export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Код подтверждения состоит из 6 цифр');

/**
 * Географические координаты. `finite` — явно: NaN и бесконечность в точку
 * не превращаются, а ломают поиск по радиусу у всех соседних объявлений.
 */
export const latitudeSchema = z
  .number('Широта должна быть числом')
  .finite('Некорректная широта')
  .min(-90, 'Широта от −90 до 90')
  .max(90, 'Широта от −90 до 90');
export const longitudeSchema = z
  .number('Долгота должна быть числом')
  .finite('Некорректная долгота')
  .min(-180, 'Долгота от −180 до 180')
  .max(180, 'Долгота от −180 до 180');

export const coordinatesSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

export type Coordinates = z.infer<typeof coordinatesSchema>;

/**
 * Курсорная пагинация.
 *
 * Вместо «дай страницу №5» клиент говорит «дай следующие 20 после вот этой
 * записи». Это быстрее на больших списках и не ломается, когда во время
 * листания добавляются новые записи (пункт 40 ТЗ).
 */
export const paginationSchema = z.object({
  /** Курсор последней полученной записи. Пусто = с начала списка. */
  cursor: z.string().optional(),
  /** Сколько записей вернуть. Ограничение сверху защищает базу от тяжёлых запросов. */
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/** Сортировка. */
export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

/** Фильтр по городу — присутствует почти во всех запросах каталога. */
export const cityFilterSchema = z.object({
  cityId: uuidSchema.optional(),
});
