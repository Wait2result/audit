import { z } from 'zod';

import { CATEGORY_SLUG_PATTERN } from '../constants/place-categories.js';
import { PlaceMemberRole, PlaceType } from '../constants/places.js';
import { paginationSchema, phoneSchema, uuidSchema } from './common.schema.js';

/**
 * Проверка данных заведений и меню (Этап 6).
 *
 * Схемы общие для сервера, админ-панели и приложения: одно описание
 * правильных данных вместо трёх расходящихся.
 *
 * Важно: поля описаны БЕЗ значений по умолчанию, а умолчания добавляются
 * только в схеме создания. Иначе `.partial()` для правки не помогает —
 * Zod всё равно подставит умолчание в отсутствующее поле, и сохранение
 * одной галочки сбросит доставку и минимальную сумму заказа.
 */

/** Деньги приходят в копейках: целое неотрицательное число. */
const moneySchema = z
  .number()
  .int('Сумма указывается в копейках, без дробной части')
  .min(0, 'Сумма не может быть отрицательной')
  .max(100_000_000, 'Слишком большая сумма');

const placeTypeSchema = z.enum(Object.values(PlaceType) as [PlaceType, ...PlaceType[]]);

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Укажите название')
  .max(160, 'Слишком длинное название');

/** Поля заведения без умолчаний — основа и для создания, и для правки. */
const placeFields = {
  cityId: uuidSchema,
  districtId: uuidSchema.nullish(),
  type: placeTypeSchema,
  name: nameSchema,
  description: z.string().trim().max(4000).nullish(),
  address: z.string().trim().min(3, 'Укажите адрес').max(300),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  phone: phoneSchema.nullish(),
  cuisines: z.array(z.string().trim().min(2).max(40)).max(10),
  averageCheck: moneySchema.nullish(),
  coverMediaId: uuidSchema.nullish(),

  ordersEnabled: z.boolean(),
  hasDelivery: z.boolean(),
  hasPickup: z.boolean(),
  deliveryFee: moneySchema,
  freeDeliveryFrom: moneySchema.nullish(),
  minOrderAmount: moneySchema,
  deliveryMinutes: z.number().int().min(1).max(600).nullish(),

  isActive: z.boolean(),
  sortOrder: z.number().int(),
};

export const createPlaceSchema = z.object(placeFields).extend({
  cuisines: placeFields.cuisines.default([]),
  ordersEnabled: z.boolean().default(false),
  hasDelivery: z.boolean().default(false),
  hasPickup: z.boolean().default(true),
  deliveryFee: moneySchema.default(0),
  minOrderAmount: moneySchema.default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export type CreatePlaceDto = z.infer<typeof createPlaceSchema>;

export const updatePlaceSchema = z.object(placeFields).partial();
export type UpdatePlaceDto = z.infer<typeof updatePlaceSchema>;

/**
 * Что о своём заведении может менять управляющий из приложения.
 * Города, вида заведения и порядка в списке здесь намеренно нет: это
 * решения платформы, а не заведения.
 */
export const updateMyPlaceSchema = z
  .object(placeFields)
  .pick({
    description: true,
    address: true,
    phone: true,
    cuisines: true,
    averageCheck: true,
    coverMediaId: true,
    ordersEnabled: true,
    hasDelivery: true,
    hasPickup: true,
    deliveryFee: true,
    freeDeliveryFrom: true,
    minOrderAmount: true,
    deliveryMinutes: true,
  })
  .partial();

export type UpdateMyPlaceDto = z.infer<typeof updateMyPlaceSchema>;

/** «09:00» — время в поясе города. */
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Время указывается как ЧЧ:ММ, например 09:00');

/**
 * Часы работы на неделю. Отправляются целиком: так не бывает состояния,
 * когда половина дней обновилась, а половина нет.
 */
export const updateScheduleSchema = z.object({
  days: z
    .array(
      z.object({
        weekday: z.number().int().min(1).max(7),
        isClosed: z.boolean().default(false),
        opensAt: timeSchema,
        /** Закрытие раньше открытия означает работу за полночь: 10:00 → 02:00 */
        closesAt: timeSchema,
      }),
    )
    .length(7, 'Нужны все семь дней недели'),
});

export type UpdateScheduleDto = z.infer<typeof updateScheduleSchema>;

// ── Меню ─────────────────────────────────────────────────────────────────────

const menuCategoryFields = {
  name: z.string().trim().min(2, 'Укажите название раздела').max(120),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
};

export const createMenuCategorySchema = z.object(menuCategoryFields).extend({
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export type CreateMenuCategoryDto = z.infer<typeof createMenuCategorySchema>;
export const updateMenuCategorySchema = z.object(menuCategoryFields).partial();
export type UpdateMenuCategoryDto = z.infer<typeof updateMenuCategorySchema>;

const menuItemFields = {
  categoryId: uuidSchema,
  name: nameSchema,
  description: z.string().trim().max(500).nullish(),
  price: moneySchema,
  portion: z.string().trim().max(40).nullish(),
  imageMediaId: uuidSchema.nullish(),
  isAvailable: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
};

export const createMenuItemSchema = z.object(menuItemFields).extend({
  isAvailable: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export type CreateMenuItemDto = z.infer<typeof createMenuItemSchema>;
export const updateMenuItemSchema = z.object(menuItemFields).partial();
export type UpdateMenuItemDto = z.infer<typeof updateMenuItemSchema>;

/** Стоп-лист — самое частое действие за смену, поэтому отдельный маршрут. */
export const setAvailabilitySchema = z.object({ isAvailable: z.boolean() });
export type SetAvailabilityDto = z.infer<typeof setAvailabilitySchema>;

export const createOptionGroupSchema = z
  .object({
    name: z.string().trim().min(2, 'Укажите название группы').max(120),
    minChoices: z.number().int().min(0).max(20).default(0),
    maxChoices: z.number().int().min(1).max(20).default(1),
    sortOrder: z.number().int().default(0),
    options: z
      .array(
        z.object({
          name: z.string().trim().min(1, 'Укажите название варианта').max(120),
          priceDelta: z.number().int().min(-100_000_000).max(100_000_000).default(0),
          isAvailable: z.boolean().default(true),
        }),
      )
      .min(1, 'Добавьте хотя бы один вариант')
      .max(30),
  })
  .refine((group) => group.maxChoices >= group.minChoices, {
    message: 'Максимум не может быть меньше минимума',
    path: ['maxChoices'],
  })
  .refine((group) => group.options.length >= group.minChoices, {
    message: 'Вариантов меньше, чем требуется выбрать',
    path: ['options'],
  });

export type CreateOptionGroupDto = z.infer<typeof createOptionGroupSchema>;

// ── Доступы ──────────────────────────────────────────────────────────────────

/** Доступ выдаётся по номеру телефона уже зарегистрированного аккаунта. */
export const addPlaceMemberSchema = z.object({
  phone: phoneSchema,
  role: z.enum(Object.values(PlaceMemberRole) as [PlaceMemberRole, ...PlaceMemberRole[]]),
});

export type AddPlaceMemberDto = z.infer<typeof addPlaceMemberSchema>;

// ── Запросы списка ───────────────────────────────────────────────────────────

export const placeListQuerySchema = paginationSchema.extend({
  cityId: uuidSchema,
  /** Несколько видов через запятую: «restaurant,cafe» */
  types: z.string().trim().max(120).optional(),
  cuisine: z.string().trim().max(40).optional(),
  /** Плитка с витрины: «shashlik», «pizza» — см. PLACE_CATEGORIES */
  category: z.string().trim().max(40).optional(),
  /** Ищет и по названию заведения, и по названиям блюд в его меню */
  search: z.string().trim().max(120).optional(),
  openNow: z.coerce.boolean().optional(),
  hasDelivery: z.coerce.boolean().optional(),
  /** «До 30 мин»: верхняя граница обычного срока доставки */
  maxMinutes: z.coerce.number().int().min(5).max(600).optional(),
  /** Только избранные — для вкладки «Избранное» */
  favoritesOnly: z.coerce.boolean().optional(),
  sort: z.enum(['default', 'rating', 'fast', 'cheap']).optional(),
});

export type PlaceListQuery = z.infer<typeof placeListQuerySchema>;

export const adminPlaceListQuerySchema = paginationSchema.extend({
  cityId: uuidSchema.optional(),
  search: z.string().trim().max(120).optional(),
});

export type AdminPlaceListQuery = z.infer<typeof adminPlaceListQuerySchema>;

// ── Отзывы ───────────────────────────────────────────────────────────────────

/**
 * Отзыв о заведении.
 *
 * Оценка обязательна, текст — нет: большинство людей готовы поставить
 * звёзды, но не готовы писать. Требовать текст значит не получить оценок.
 */
export const upsertReviewSchema = z.object({
  rating: z
    .number()
    .int('Оценка — целое число от 1 до 5')
    .min(1, 'Поставьте оценку')
    .max(5, 'Оценка не больше пяти'),
  text: z.string().trim().max(1000, 'Слишком длинный отзыв').nullish(),
});

export type UpsertReviewDto = z.infer<typeof upsertReviewSchema>;

/** Ответ заведения на отзыв — пишет управляющий из кабинета. */
export const replyReviewSchema = z.object({
  reply: z.string().trim().min(2, 'Напишите ответ').max(1000, 'Слишком длинный ответ'),
});

export type ReplyReviewDto = z.infer<typeof replyReviewSchema>;

export const reviewListQuerySchema = paginationSchema.extend({
  /** Только отзывы с этой оценкой — для фильтра по звёздам */
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

// ── Категории витрины ────────────────────────────────────────────────────────

/**
 * Категория витрины. Код (slug) задаётся один раз при создании и дальше
 * не меняется: на него ссылаются открытые ссылки и файлы картинок.
 */
const categoryFields = {
  name: z.string().trim().min(2, 'Укажите название').max(60, 'Слишком длинное название'),
  /** Слова кухонь для подбора заведений; пустой список допустим */
  cuisines: z.array(z.string().trim().min(2).max(40)).max(30),
  types: z.array(placeTypeSchema).max(10),
  imageMediaId: uuidSchema.nullish(),
  sortOrder: z.number().int().min(0).max(9999),
  isActive: z.boolean(),
};

export const createPlaceCategorySchema = z.object(categoryFields).extend({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      CATEGORY_SLUG_PATTERN,
      'Код состоит из латинских букв, цифр и дефисов: traditional, fast-food',
    ),
  cuisines: categoryFields.cuisines.default([]),
  types: categoryFields.types.default([]),
  sortOrder: categoryFields.sortOrder.default(0),
  isActive: z.boolean().default(true),
});

export type CreatePlaceCategoryDto = z.infer<typeof createPlaceCategorySchema>;

export const updatePlaceCategorySchema = z.object(categoryFields).partial();
export type UpdatePlaceCategoryDto = z.infer<typeof updatePlaceCategorySchema>;

/** Порядок плиток задаётся одним списком: перестановка — это не правка полей. */
export const reorderCategoriesSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(100),
});

export type ReorderCategoriesDto = z.infer<typeof reorderCategoriesSchema>;

// ── Промо-баннеры ────────────────────────────────────────────────────────────

export const promoPlacementSchema = z.enum(['home', 'delivery']);

const promoBannerFields = {
  placement: promoPlacementSchema,
  title: z.string().trim().min(2, 'Укажите заголовок').max(120, 'Слишком длинный заголовок'),
  subtitle: z.string().trim().max(200, 'Слишком длинный подзаголовок').nullish(),
  imageMediaId: uuidSchema.nullish(),
  targetPlaceId: uuidSchema.nullish(),
  sortOrder: z.number().int().min(0).max(9999),
  isActive: z.boolean(),
};

export const createPromoBannerSchema = z.object(promoBannerFields).extend({
  sortOrder: promoBannerFields.sortOrder.default(0),
  isActive: z.boolean().default(true),
});

export type CreatePromoBannerDto = z.infer<typeof createPromoBannerSchema>;

export const updatePromoBannerSchema = z.object(promoBannerFields).partial();
export type UpdatePromoBannerDto = z.infer<typeof updatePromoBannerSchema>;

/** Порядок карточек задаётся одним списком, отдельно для каждого места показа. */
export const reorderPromoBannersSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(100),
});

export type ReorderPromoBannersDto = z.infer<typeof reorderPromoBannersSchema>;
