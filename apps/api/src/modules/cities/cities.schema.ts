import { z } from 'zod';

/** Схемы данных для операций с городами. */

export const createCitySchema = z.object({
  name: z.string().trim().min(1, 'Укажите название города').max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Идентификатор может содержать только латинские буквы, цифры и дефис'),
  region: z.string().trim().max(160).default('Республика Дагестан'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().trim().max(60).default('Europe/Moscow'),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export type CreateCityDto = z.infer<typeof createCitySchema>;

export const updateCitySchema = createCitySchema.partial();

export type UpdateCityDto = z.infer<typeof updateCitySchema>;
