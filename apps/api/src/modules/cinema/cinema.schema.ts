import { uuidSchema } from '@dagestan/shared';
import { z } from 'zod';

/** Схемы данных для расписания и управления кинотеатрами (Этап 4 ТЗ). */

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть в формате ГГГГ-ММ-ДД')
  .optional();

export const cinemaScheduleQuerySchema = z.object({
  cityId: uuidSchema,
  /** Если не указана — сегодняшняя дата в часовом поясе города */
  date: dateSchema,
});

export type CinemaScheduleQuery = z.infer<typeof cinemaScheduleQuerySchema>;

export const cinemaListQuerySchema = z.object({
  cityId: uuidSchema,
});

export const cinemaMovieQuerySchema = z.object({
  cityId: uuidSchema,
  movieId: z.coerce.number().int().positive(),
});

export type CinemaMovieQuery = z.infer<typeof cinemaMovieQuerySchema>;

export type CinemaListQuery = z.infer<typeof cinemaListQuerySchema>;

export const createCinemaSchema = z.object({
  cityId: uuidSchema,
  name: z.string().trim().min(1, 'Укажите название кинотеатра').max(160),
  address: z.string().trim().min(1, 'Укажите адрес').max(300),
  phone: z.string().trim().max(20).optional(),
  websiteUrl: z.url('Укажите корректную ссылку на сайт').max(300),
  kinoplanToken: z.string().trim().min(1, 'Укажите токен Kinoplan').max(120),
  kinoplanCinemaId: z.number().int(),
  kinoplanCityId: z.number().int(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export type CreateCinemaDto = z.infer<typeof createCinemaSchema>;

export const updateCinemaSchema = createCinemaSchema.partial();

export type UpdateCinemaDto = z.infer<typeof updateCinemaSchema>;
