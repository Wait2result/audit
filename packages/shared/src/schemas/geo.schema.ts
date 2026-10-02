import { z } from 'zod';

import { ListingAddressVisibility, ListingLocationAccuracy } from '../constants/geo.js';
import { latitudeSchema, longitudeSchema } from './common.schema.js';

/**
 * Проверка географических данных: запросы к геокодеру и место объявления.
 */

const componentSchema = z.string().trim().max(160).nullish();

export const locationAccuracySchema = z.enum(
  Object.values(ListingLocationAccuracy) as [ListingLocationAccuracy, ...ListingLocationAccuracy[]],
);

export const addressVisibilitySchema = z.enum(
  Object.values(ListingAddressVisibility) as [
    ListingAddressVisibility,
    ...ListingAddressVisibility[],
  ],
);

/**
 * Где находится объявление — одним объектом.
 *
 * Координаты обязательны и проверяются строго: именно по ним работает поиск
 * по радиусу, а NaN или перепутанные местами широта и долгота выбрасывают
 * объявление из выдачи незаметно для всех. Всё остальное — адрес и его
 * части — необязательно: геокодер может не знать дома, а человек может не
 * хотеть его указывать. Точка при этом сохраняется всегда.
 */
export const listingLocationSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  accuracy: locationAccuracySchema,
  /** «Адрес или ориентир» — как его видно в поле формы */
  address: z.string().trim().max(300).nullish(),
  /** Полный адрес от геокодера */
  formattedAddress: z.string().trim().max(500).nullish(),
  country: componentSchema,
  region: componentSchema,
  district: componentSchema,
  cityDistrict: componentSchema,
  city: componentSchema,
  settlement: componentSchema,
  street: z.string().trim().max(200).nullish(),
  houseNumber: z.string().trim().max(40).nullish(),
});

export type ListingLocationInput = z.infer<typeof listingLocationSchema>;

/** Подсказки адреса: строка от двух символов и, по желанию, точка «рядом с чем». */
export const geoSuggestQuerySchema = z.object({
  q: z.string().trim().min(2, 'Введите хотя бы две буквы').max(120),
  /** Искать только населённые пункты — для выбора места поиска */
  kind: z.enum(['any', 'settlement']).default('any'),
  /** Точка, рядом с которой искать в первую очередь (выбранное село) */
  latitude: z.coerce.number().pipe(latitudeSchema).optional(),
  longitude: z.coerce.number().pipe(longitudeSchema).optional(),
  limit: z.coerce.number().int().min(1).max(10).default(6),
});

export type GeoSuggestQuery = z.infer<typeof geoSuggestQuerySchema>;

/** Адрес по точке. */
export const geoReverseQuerySchema = z.object({
  latitude: z.coerce.number().pipe(latitudeSchema),
  longitude: z.coerce.number().pipe(longitudeSchema),
});

export type GeoReverseQuery = z.infer<typeof geoReverseQuerySchema>;
