import { z } from 'zod';

import { PART_NUMBER_KINDS, partNumberKey } from '../constants/parts/part-number.js';

/**
 * Запчасть как слой объявления: номера и совместимость. Это не атрибуты —
 * совместимость бывает списком («подходит к Succeed, Probox и Caldina»), а
 * атрибут объявления хранит одно значение или список строк. Поэтому у слоя
 * свои таблицы, свои индексы и своя форма в API; у объявления без запчасти
 * слоя просто нет.
 */

const YEAR_MIN = 1950;
const YEAR_MAX = 2035;

export const partNumberInputSchema = z
  .object({
    kind: z.enum(PART_NUMBER_KINDS).default('oem'),
    value: z
      .string()
      .trim()
      .min(3, 'Номер слишком короткий')
      .max(60, 'Номер длиннее 60 знаков')
      .refine((value) => partNumberKey(value).length >= 3, 'В номере нет букв и цифр'),
  })
  .strict();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

/**
 * Одна строка совместимости: к чему подходит деталь. Марка и модель — коды
 * из справочников самой техники (или свободный текст там, где справочника
 * нет); остальное — необязательные уточнения: кузов («NCP165»), двигатель
 * («1NZ-FE»), годы, модификация.
 */
export const compatibilityInputSchema = z
  .object({
    brand: optionalText(80),
    model: optionalText(80),
    chassis: optionalText(40),
    yearFrom: z.number().int().min(YEAR_MIN).max(YEAR_MAX).optional(),
    yearTo: z.number().int().min(YEAR_MIN).max(YEAR_MAX).optional(),
    engine: optionalText(60),
    modification: optionalText(120),
  })
  .strict()
  .refine(
    (row) => Boolean(row.brand || row.model || row.chassis || row.engine || row.modification),
    'Укажите хотя бы марку, модель, кузов или двигатель',
  )
  .refine(
    (row) => row.yearFrom === undefined || row.yearTo === undefined || row.yearFrom <= row.yearTo,
    'Год «от» больше года «до»',
  );

export const listingPartInputSchema = z
  .object({
    numbers: z.array(partNumberInputSchema).max(10, 'Не больше 10 номеров').default([]),
    compatibility: z
      .array(compatibilityInputSchema)
      .max(30, 'Не больше 30 строк совместимости')
      .default([]),
  })
  .strict();

export type PartNumberInput = z.infer<typeof partNumberInputSchema>;
export type CompatibilityInput = z.infer<typeof compatibilityInputSchema>;
export type ListingPartInput = z.infer<typeof listingPartInputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
//  Ответ API
// ─────────────────────────────────────────────────────────────────────────────

export interface ListingPartNumberDto {
  kind: (typeof PART_NUMBER_KINDS)[number];
  value: string;
}

export interface ListingCompatibilityDto {
  /** Код марки из справочника техники (или текст, если справочника нет) */
  brand: string | null;
  /** Подпись для показа: «Toyota» */
  brandLabel: string | null;
  model: string | null;
  modelLabel: string | null;
  chassis: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  engine: string | null;
  modification: string | null;
}

/** Слой запчасти объявления глазами покупателя и автора. */
export interface ListingPartDto {
  /** Тип техники — определяется подкатегорией: passenger_car, phone, tv… */
  equipmentType: string;
  numbers: ListingPartNumberDto[];
  compatibility: ListingCompatibilityDto[];
}
