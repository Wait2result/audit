import { z } from 'zod';

import {
  FILTER_ONLY_ATTRIBUTES,
  isAttributeVisible,
  type ListingAttribute,
  type ListingAttributeColumn,
} from '../constants/listing-attributes.js';
import { ListingAddressVisibility } from '../constants/geo.js';
import {
  LISTING_MAX_RADIUS_KM,
  ListingArchiveReason,
  ListingPriceUnit,
  ListingReportReason,
  ListingSort,
} from '../constants/listings.js';
import { ModerationStatus } from '../constants/moderation.js';
import {
  ListingRentPeriod,
  ListingTransactionType,
  TRANSACTION_QUERY_ALIASES,
} from '../constants/transactions.js';
import {
  latitudeSchema,
  longitudeSchema,
  paginationSchema,
  phoneSchema,
  uuidSchema,
} from './common.schema.js';
import { addressVisibilitySchema, listingLocationSchema } from './geo.schema.js';
import { listingPartInputSchema } from './listing-part.schema.js';

/**
 * Проверка данных объявлений (Этап 7, версия 2).
 *
 * Как и у заведений: поля описаны БЕЗ умолчаний, умолчания живут только в
 * схеме создания. Иначе `.partial()` для правки не помогает — Zod подставит
 * умолчание в отсутствующее поле, и сохранение одного заголовка сбросит
 * согласие на звонки и переписку.
 *
 * Соответствие сделки и единицы цены здесь НЕ проверяется: оно зависит от
 * категории, которую знает только сервер (см. `validatePrice` в
 * price-config.ts и `ListingsLifecycleService`).
 */

/** Деньги приходят в копейках: целое неотрицательное число. */
const moneySchema = z
  .number()
  .int('Цена указывается в копейках, без дробной части')
  .min(0, 'Цена не может быть отрицательной')
  .max(100_000_000_000, 'Слишком большая цена');

export const priceUnitSchema = z.enum(
  Object.values(ListingPriceUnit) as [ListingPriceUnit, ...ListingPriceUnit[]],
);

export const transactionTypeSchema = z.enum(
  Object.values(ListingTransactionType) as [ListingTransactionType, ...ListingTransactionType[]],
);

export const rentPeriodSchema = z.enum(
  Object.values(ListingRentPeriod) as [ListingRentPeriod, ...ListingRentPeriod[]],
);

const archiveReasonSchema = z.enum([ListingArchiveReason.SOLD, ListingArchiveReason.WITHDRAWN]);

const sortSchema = z.enum(Object.values(ListingSort) as [ListingSort, ...ListingSort[]]);

/** Поля объявления без умолчаний — основа и для создания, и для правки. */
const listingFields = {
  /**
   * Город приложения, из которого подают. Для объявления с точкой сервер
   * сам заменяет его ближайшим городом справочника — см. ADR-0010.
   */
  cityId: uuidSchema,
  categoryId: uuidSchema,

  /**
   * Что делает продавец. Обязательность зависит от категории и проверяется
   * сервером: у квартиры сделка нужна, у дивана её нет.
   */
  transactionType: transactionTypeSchema.nullish(),
  rentPeriod: rentPeriodSchema.nullish(),

  title: z
    .string()
    .trim()
    .min(5, 'Заголовок слишком короткий')
    .max(120, 'Заголовок длиннее 120 символов'),
  description: z
    .string()
    .trim()
    .min(10, 'Опишите, что вы предлагаете')
    .max(8000, 'Описание слишком длинное'),

  price: moneySchema.nullish(),
  priceMax: moneySchema.nullish(),
  priceUnit: priceUnitSchema,
  isNegotiable: z.boolean(),

  /**
   * Характеристики одним объектом. Что именно допустимо — зависит от
   * категории и проверяется отдельно, схемой набора: на уровне этой схемы
   * категория ещё неизвестна.
   */
  attributes: z.record(z.string(), z.unknown()),

  /**
   * Запчасть: номера (OEM, артикул) и совместимость. Только у подкатегорий
   * запчастей; у остальных объявлений слоя нет (docs/ADR/0012-запчасти.md).
   */
  part: listingPartInputSchema,

  /**
   * Где находится: точка, адрес и его части. Район — не выбор человека, а
   * то, что геокодер определил по точке (см. geo.schema.ts).
   */
  location: listingLocationSchema.nullish(),
  /** Показывать ли другим точный адрес. Координаты для поиска хранятся всегда */
  addressVisibility: addressVisibilitySchema,
  contactPhone: phoneSchema,
  contactName: z.string().trim().max(60).nullish(),
  allowChat: z.boolean(),
  allowCalls: z.boolean(),

  /** Фотографии в нужном порядке; первая становится обложкой */
  photoIds: z.array(uuidSchema).max(10, 'Не больше 10 фотографий'),
};

const priceRangeRefine = (
  value: { price?: number | null; priceMax?: number | null },
  ctx: z.RefinementCtx,
): void => {
  if (value.priceMax != null && value.price != null && value.priceMax < value.price) {
    ctx.addIssue({
      code: 'custom',
      path: ['priceMax'],
      message: 'Верхняя граница цены меньше нижней',
    });
  }
};

export const createListingSchema = z
  .object(listingFields)
  .extend({
    // Без единицы категория подставит свою: «целиком» у вещи, «в месяц» у
    // вакансии. Единица по умолчанию «целиком» не годилась бы для вакансии
    priceUnit: priceUnitSchema.optional(),
    isNegotiable: z.boolean().default(false),
    attributes: z.record(z.string(), z.unknown()).default({}),
    // Запчасть: номера и совместимость; у остальных объявлений слоя нет
    part: listingPartInputSchema.optional(),
    // Опубликованное объявление без точки не найдётся поиском по радиусу —
    // точка обязательна. Адрес и его части — нет
    location: listingLocationSchema,
    addressVisibility: addressVisibilitySchema.default(ListingAddressVisibility.APPROXIMATE),
    allowChat: z.boolean().default(true),
    allowCalls: z.boolean().default(true),
    photoIds: z.array(uuidSchema).max(10).default([]),
  })
  .superRefine(priceRangeRefine);

export type CreateListingDto = z.infer<typeof createListingSchema>;

/**
 * Черновик: форма заполняется в несколько шагов, и человек может выйти на
 * середине. Обязательны только город и категория — остальное дописывается.
 * Публикация черновика проходит полную схему создания.
 */
export const draftListingSchema = z
  .object({
    ...listingFields,
    title: z.string().trim().max(120).nullish(),
    description: z.string().trim().max(8000).nullish(),
    contactPhone: phoneSchema.nullish(),
  })
  .partial()
  .extend({ cityId: uuidSchema, categoryId: uuidSchema })
  .superRefine(priceRangeRefine);

export type DraftListingDto = z.infer<typeof draftListingSchema>;

/**
 * Что автор может изменить у своего объявления. Города и категории здесь нет
 * намеренно: перенос объявления между категориями — это действие модератора,
 * иначе «квартира» легко окажется в «Работе», где её никто не ищет.
 */
export const updateMyListingSchema = z
  .object(listingFields)
  .omit({ cityId: true, categoryId: true })
  .partial()
  // Место правкой меняют, но не стирают: объявление без точки выпадает
  // из поиска по радиусу
  .extend({ location: listingLocationSchema.optional() });

export type UpdateMyListingDto = z.infer<typeof updateMyListingSchema>;

/** Полная правка — для сотрудника платформы. */
export const updateListingSchema = z.object(listingFields).partial();

export type UpdateListingDto = z.infer<typeof updateListingSchema>;

/** Снятие объявления автором: продано или просто снято. */
export const archiveListingSchema = z.object({ reason: archiveReasonSchema });

export type ArchiveListingDto = z.infer<typeof archiveListingSchema>;

/** Порядок фотографий: полный список, а не «добавить одну». */
export const setListingPhotosSchema = z.object({
  photoIds: z.array(uuidSchema).max(10, 'Не больше 10 фотографий'),
});

export type SetListingPhotosDto = z.infer<typeof setListingPhotosSchema>;

// ─────────────────────────────────────────────────────────────────────────────
//  Запросы списков
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Числовой диапазон из строки запроса: `priceFrom`, `areaTo`. Значения
 * приходят строками, поэтому `coerce`.
 */
const rangeNumber = z.coerce.number().int().optional();

/**
 * Флаг из строки запроса. `z.coerce.boolean()` считает строку «false»
 * истиной — поэтому разбор свой: истина только у «true» и «1».
 */
const queryFlag = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true' || value === '1')
  .optional();

/**
 * Сделка глазами покупателя: «buy» — синоним «sale». Ничего нового в базу
 * такие синонимы не заводят, см. transactions.ts.
 */
const transactionQuerySchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value, ctx) => {
    const type = TRANSACTION_QUERY_ALIASES[value];
    if (!type) {
      ctx.addIssue({ code: 'custom', message: 'Неизвестный тип сделки' });
      return z.NEVER;
    }
    return type;
  })
  .optional();

export const listingListQuerySchema = paginationSchema.extend({
  /**
   * Город — только для старого поведения «лента своего города», когда нет
   * ни точки, ни «Весь Дагестан». Основной механизм — точка и радиус.
   */
  cityId: uuidSchema.optional(),
  /** Код категории; поиск идёт по ней и всем её подкатегориям */
  category: z.string().trim().max(60).optional(),
  search: z.string().trim().max(120).optional(),
  /** Район города как дополнительный фильтр; в интерфейсе поиска его нет */
  districtId: uuidSchema.optional(),
  transactionType: transactionQuerySchema,
  rentPeriod: rentPeriodSchema.optional(),
  priceFrom: rangeNumber,
  priceTo: rangeNumber,
  /**
   * Единица, в которой сравнивается цена. Без неё сервер выводит единицу из
   * категории и сделки; сравнивать «в сутки» с «целиком» нельзя.
   */
  priceUnit: priceUnitSchema.optional(),
  onlyWithPhoto: queryFlag,
  favoritesOnly: queryFlag,
  sellerId: uuidSchema.optional(),
  sort: sortSchema.optional(),
  /**
   * Характеристики фильтра одной строкой JSON: `{"gearbox":"auto","rooms":[2,3]}`.
   * Строкой, а не отдельными параметрами, потому что набор полей зависит от
   * категории и заранее неизвестен.
   */
  attributes: z.string().max(2000).optional(),
  /**
   * Снимок ленты: показывать только то, что было поднято не позже этого
   * момента. Пока человек листает, кто-то поднимает своё объявление, и без
   * этого условия карточка либо повторится, либо потеряется.
   *
   * Этот же момент — «сейчас» для ранжирования: иначе оценка свежести
   * менялась бы между страницами и порядок расползался бы на ходу.
   */
  freshBefore: z.coerce.date().optional(),

  /**
   * Центр поиска: выбранный населённый пункт, адрес, точка на карте или
   * место человека. От него считаются радиус, расстояние в карточке и
   * «Ближе ко мне».
   */
  latitude: z.coerce.number().pipe(latitudeSchema).optional(),
  longitude: z.coerce.number().pipe(longitudeSchema).optional(),
  /**
   * Искать в пределах стольких километров от точки. Работает только вместе
   * с координатами и заменяет собой ограничение по городу: 25 км от
   * Манаскента — это и Манас, и Карабудахкент, и объявления оттуда должны
   * находиться, как бы ни назывался их населённый пункт.
   */
  radiusKm: z.coerce.number().int().min(1).max(LISTING_MAX_RADIUS_KM).optional(),
  /** «Весь Дагестан»: без ограничения по месту, остальные фильтры работают */
  regionWide: queryFlag,
});

export type ListingListQuery = z.infer<typeof listingListQuerySchema>;

/**
 * Точки для карты: те же условия, что у ленты, плюс видимая область
 * «юг,запад,север,восток». Без курсора и сортировки — карта показывает
 * всё, что попало в область, до разумного предела.
 */
export const listingMapQuerySchema = listingListQuerySchema
  .omit({ cursor: true, limit: true, sort: true, freshBefore: true })
  .extend({
    bbox: z.string().transform((value, ctx) => {
      const parts = value.split(',').map(Number);
      const [south, west, north, east] = parts;
      if (
        parts.length !== 4 ||
        parts.some((part) => !Number.isFinite(part)) ||
        south === undefined ||
        west === undefined ||
        north === undefined ||
        east === undefined ||
        south > north ||
        west > east
      ) {
        ctx.addIssue({ code: 'custom', message: 'Область карты: юг,запад,север,восток' });
        return z.NEVER;
      }
      return { south, west, north, east };
    }),
  });

export type ListingMapQuery = z.infer<typeof listingMapQuerySchema>;

/** Подсказки: строка от двух символов. */
export const listingSuggestQuerySchema = z.object({
  cityId: uuidSchema,
  q: z.string().trim().min(1).max(60),
});

/**
 * Точка человека отдельным разбором — для карточки объявления, где из всего
 * запроса нужны только координаты. Пусто, если пришла лишь одна из двух
 * или мусор: половина точки бесполезна, а ошибка ради необязательной
 * подписи «3 км» закрыла бы человеку всё объявление.
 */
export const pointQuerySchema = z
  .object({
    latitude: z.coerce.number().pipe(latitudeSchema).optional().catch(undefined),
    longitude: z.coerce.number().pipe(longitudeSchema).optional().catch(undefined),
  })
  .transform((value) =>
    value.latitude !== undefined && value.longitude !== undefined
      ? { latitude: value.latitude, longitude: value.longitude }
      : null,
  );

const listingStatusSchema = z.enum(
  Object.values(ModerationStatus) as [ModerationStatus, ...ModerationStatus[]],
);

/** Свои объявления в кабинете: по статусу. */
export const myListingsQuerySchema = paginationSchema.extend({
  status: listingStatusSchema.optional(),
  /**
   * Группа статусов для вкладки кабинета. `review` — всё, что ждёт решения
   * или снято модератором: ждёт проверки, снято, отклонено. Отдельной
   * вкладкой, иначе снятое объявление с причиной человек просто не найдёт.
   */
  group: z.enum(['review']).optional(),
});

export type MyListingsQuery = z.infer<typeof myListingsQuerySchema>;

/** Объявления продавца на его публичной странице. */
export const sellerListingsQuerySchema = paginationSchema.extend({
  /** active — опубликованные; completed — проданные и снятые автором */
  status: z.enum(['active', 'completed']).default('active'),
});

export type SellerListingsQuery = z.infer<typeof sellerListingsQuerySchema>;

/** Список для панели: с поиском, статусом и «сначала те, на кого жалуются». */
export const adminListingsQuerySchema = paginationSchema.extend({
  cityId: uuidSchema.optional(),
  status: listingStatusSchema.optional(),
  search: z.string().trim().max(120).optional(),
  /** Только те, на кого есть нерассмотренные жалобы */
  reportedOnly: queryFlag,
  /** Только правленные после публикации — очередь повторной проверки */
  needsReviewOnly: queryFlag,
});

export type AdminListingsQuery = z.infer<typeof adminListingsQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────────
//  Модерация и жалобы
// ─────────────────────────────────────────────────────────────────────────────

export const suspendListingSchema = z.object({
  /** Причина обязательна: её видит автор, и «снято без объяснений» — повод
   *  для спора, который нечем закрыть */
  reason: z.string().trim().min(3, 'Укажите причину').max(500),
});

export type SuspendListingDto = z.infer<typeof suspendListingSchema>;

export const promoteListingSchema = z.object({
  promotedUntil: z.coerce.date().nullish(),
  highlightedUntil: z.coerce.date().nullish(),
});

export type PromoteListingDto = z.infer<typeof promoteListingSchema>;

export const createReportSchema = z
  .object({
    reason: z.enum(
      Object.values(ListingReportReason) as [ListingReportReason, ...ListingReportReason[]],
    ),
    comment: z.string().trim().max(1000).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.reason === ListingReportReason.OTHER && !value.comment?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['comment'],
        message: 'Опишите, что не так — без этого жалобу не разобрать',
      });
    }
  });

export type CreateReportDto = z.infer<typeof createReportSchema>;

export const resolveReportSchema = z.object({
  /** Подтвердить жалобу (снять объявление) или отклонить её */
  action: z.enum(['confirm', 'reject']),
  comment: z.string().trim().max(500).nullish(),
});

export type ResolveReportDto = z.infer<typeof resolveReportSchema>;

// ─────────────────────────────────────────────────────────────────────────────
//  Характеристики: проверка по полям категории
// ─────────────────────────────────────────────────────────────────────────────

export type AttributeValue = string | number | boolean | string[];

/**
 * Значения справочников для проверки марки и модели. Ключ — вид справочника,
 * значение — множество допустимых значений (у модели — «марка:модель»).
 */
export type DictionaryLookup = (kind: string, value: string, parent?: string) => boolean;

/**
 * Родитель «любой» в проверке справочника: есть ли такое значение хотя бы у
 * какой-то марки. Нужен, чтобы отличить «модель чужой марки» (в справочнике
 * есть, но не у этой марки) от «своей модели» (в справочнике нет совсем).
 */
export const ANY_DICTIONARY_PARENT = '*';

function enumValues(attribute: ListingAttribute): [string, ...string[]] | null {
  const values = (attribute.options ?? []).map((option) => option.value);
  return values.length > 0 ? (values as [string, ...string[]]) : null;
}

function schemaForAttribute(attribute: ListingAttribute): z.ZodType<unknown> {
  switch (attribute.type) {
    case 'boolean':
      return z
        .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
        .transform((value) => value === true || value === 'true' || value === '1');
    case 'number':
    case 'date': {
      let schema = z.coerce.number();
      if (attribute.min !== undefined) schema = schema.min(attribute.min);
      if (attribute.max !== undefined) schema = schema.max(attribute.max);
      return schema;
    }
    case 'enum': {
      const values = enumValues(attribute);
      return values ? z.enum(values) : z.string().trim().min(1).max(120);
    }
    case 'multiEnum': {
      const values = enumValues(attribute);
      const item = values ? z.enum(values) : z.string().trim().min(1).max(120);
      return z
        .union([item, z.array(item).max(50)])
        .transform((value) => (Array.isArray(value) ? [...new Set(value)] : [value]));
    }
    case 'brand':
    case 'model':
      return z.string().trim().min(1).max(120);
    case 'string':
      return z.string().trim().min(1).max(120);
  }
}

/**
 * Схема характеристик категории.
 *
 * Неизвестные ключи отбрасываются молча: приложение старой версии может
 * прислать поле, которого уже нет, и отказывать ему в публикации из-за этого
 * неправильно. А вот неверное ЗНАЧЕНИЕ известного поля — ошибка: именно по
 * нему потом фильтруют.
 *
 * Марка и модель проверяются по справочнику, если он передан (`lookup`):
 * сервер знает справочник из базы, тесты обходятся без него.
 */
export function attributesSchemaFor(
  attributes: readonly ListingAttribute[],
  lookup?: DictionaryLookup,
) {
  return z.record(z.string(), z.unknown()).transform((raw, ctx) => {
    const result: Record<string, AttributeValue> = {};

    for (const attribute of attributes) {
      // Скрытое поле («Face ID» не у Apple) не проверяется и не сохраняется:
      // форма его не показывала, значение — след прежнего выбора
      // Совместимость и номер запчасти хранятся отдельным слоем, не атрибутами
      if (FILTER_ONLY_ATTRIBUTES.has(attribute.key)) continue;
      if (!isAttributeVisible(attribute, raw)) continue;

      const value = raw[attribute.key];

      const empty =
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);

      if (empty) {
        if (attribute.required) {
          ctx.addIssue({
            code: 'custom',
            path: [attribute.key],
            message: `Укажите: ${attribute.label.toLowerCase()}`,
          });
        }
        continue;
      }

      const parsed = schemaForAttribute(attribute).safeParse(value);
      if (!parsed.success) {
        ctx.addIssue({
          code: 'custom',
          path: [attribute.key],
          message: `Неверное значение: ${attribute.label.toLowerCase()}`,
        });
        continue;
      }

      let clean = parsed.data as AttributeValue;

      // Площадь хранится в десятых: 54,5 м² — это 545
      if (
        (attribute.type === 'number' || attribute.type === 'date') &&
        attribute.scale &&
        typeof clean === 'number'
      ) {
        clean = Math.round(clean * attribute.scale);
      }

      // Строго по справочнику проверяется только марка: модель может быть
      // своей («Использовать «Camry Hybrid»»), если марка известна, а
      // нужной комплектации в списке нет
      if (
        attribute.type === 'brand' &&
        attribute.dictionary &&
        lookup &&
        typeof clean === 'string'
      ) {
        const parent =
          attribute.parentKey && typeof raw[attribute.parentKey] === 'string'
            ? (raw[attribute.parentKey] as string)
            : undefined;
        if (!lookup(attribute.dictionary, clean, parent)) {
          ctx.addIssue({
            code: 'custom',
            path: [attribute.key],
            message: `Нет в справочнике: ${attribute.label.toLowerCase()}`,
          });
          continue;
        }
      }

      // Модель из справочника должна принадлежать выбранной марке: «Camry» у
      // Chery — ошибка выбора, а не особенность. Модель, которой в справочнике
      // нет вовсе, остаётся допустимой («своя» комплектация)
      if (
        attribute.type === 'model' &&
        attribute.dictionary &&
        lookup &&
        typeof clean === 'string' &&
        attribute.parentKey &&
        typeof raw[attribute.parentKey] === 'string'
      ) {
        const parent = raw[attribute.parentKey] as string;
        if (
          !lookup(attribute.dictionary, clean, parent) &&
          lookup(attribute.dictionary, clean, ANY_DICTIONARY_PARENT)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: [attribute.key],
            message: 'Эта модель относится к другой марке',
          });
          continue;
        }
      }

      result[attribute.key] = clean;
    }

    return result;
  });
}

/** Колонки таблицы, в которые раскладываются диапазонные характеристики.
 *  null — колонка набора очищена и должна быть обнулена в базе. */
export type ListingAttributeColumns = Partial<
  Record<ListingAttributeColumn, number | string | null>
>;

export interface SplitAttributes {
  /** Значения, которые уходят в отдельные колонки таблицы */
  columns: ListingAttributeColumns;
  /** Всё остальное — в поле `attributes` (и в таблицу значений для фильтра) */
  attributes: Record<string, AttributeValue>;
}

/**
 * Раскладывает проверенные характеристики: колоночные — по колонкам,
 * остальные — в `attributes`. Почему надвое — docs/ADR/0008-объявления.md.
 *
 * Колонки набора, которых нет среди значений, явно выставляются в null:
 * иначе при правке очищенный «пробег» остался бы старым.
 */
export function splitAttributes(
  attributes: readonly ListingAttribute[],
  values: Record<string, AttributeValue>,
): SplitAttributes {
  const columns: ListingAttributeColumns = {};
  const json: Record<string, AttributeValue> = {};

  for (const attribute of attributes) {
    const value = values[attribute.key];

    if (attribute.column) {
      columns[attribute.column] = value === undefined ? null : (value as number | string);
      continue;
    }

    if (value !== undefined) json[attribute.key] = value;
  }

  return { columns, attributes: json };
}
