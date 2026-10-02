import {
  LISTING_RANKING,
  ListingSort,
  type GeoPoint,
  type ListingAttribute,
  type ListingListQuery,
  type ListingPriceUnit,
} from '@dagestan/shared';

import { Prisma } from '../../generated/prisma/client.js';

/**
 * Сборка запроса к ленте объявлений — SQL, а не объект Prisma.
 *
 * Три вещи объект Prisma не выражает: полнотекстовый поиск с опечатками
 * (`search_vector @@ …`, триграммы), настоящий круг вокруг точки
 * (`ST_DWithin` по geography) и сравнение цены только внутри одной единицы
 * с курсором по цене «пустые — в конец». Всё остальное здесь тоже, чтобы
 * условия ленты жили в одном месте, а не в двух с расхождениями.
 *
 * Правило, общее с заведениями: всё фильтруется ЗАПРОСОМ, а не отсевом
 * полученных строк. Отсев после выборки ломает постраничную выдачу —
 * страница приходит неполной, и «показать ещё» пропускает записи.
 *
 * Строки идентификаторов уходят наружу; сами карточки потом добираются
 * обычным `findMany` по списку id с сохранением порядка.
 */

const { sql, join, empty } = Prisma;

/** Разбор `attributes` из строки запроса: `{"gearbox":"auto","rooms":[2,3]}`. */
export function parseAttributeFilter(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    // Неразбираемая строка — это не повод отказывать в выдаче: человек
    // увидит ленту без фильтра, а не пустой экран с ошибкой
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Характеристики
// ─────────────────────────────────────────────────────────────────────────────

/** Граница диапазона с учётом масштаба поля: «54,5 м²» → 545. */
function scaled(attribute: ListingAttribute, raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = Math.round(Number(raw) * (attribute.scale ?? 1));
  return Number.isFinite(value) ? value : undefined;
}

function bounds(attribute: ListingAttribute, value: object): { from?: number; to?: number } {
  const { from, to } = value as { from?: unknown; to?: unknown };
  const result: { from?: number; to?: number } = {};
  const low = scaled(attribute, from);
  const high = scaled(attribute, to);
  if (low !== undefined) result.from = low;
  if (high !== undefined) result.to = high;
  return result;
}

/**
 * Список выбранных значений числового поля с вариантами. «4+» у комнат
 * означает «от четырёх», а не «ровно четыре» — это последний вариант с
 * плюсом в подписи, и он превращается в нижнюю границу.
 */
function numericChoices(
  attribute: ListingAttribute,
  values: unknown[],
): { exact: number[]; atLeast?: number } {
  const openEnded = attribute.options?.find((option) => option.label.trim().endsWith('+'));
  const result: { exact: number[]; atLeast?: number } = { exact: [] };

  for (const item of values) {
    const numeric = Number(item);
    if (!Number.isFinite(numeric)) continue;
    if (openEnded && String(item) === openEnded.value) {
      result.atLeast = numeric;
      continue;
    }
    result.exact.push(numeric);
  }

  return result;
}

/** Имя колонки в базе по имени поля. */
const COLUMN_NAMES: Record<string, Prisma.Sql> = {
  rooms: sql`l."rooms"`,
  areaTotal: sql`l."area_total"`,
  floor: sql`l."floor"`,
  floorsTotal: sql`l."floors_total"`,
  year: sql`l."year"`,
  mileage: sql`l."mileage"`,
  condition: sql`l."condition"`,
};

function rangeSql(column: Prisma.Sql, range: { from?: number; to?: number }): Prisma.Sql | null {
  const parts: Prisma.Sql[] = [];
  if (range.from !== undefined) parts.push(sql`${column} >= ${range.from}`);
  if (range.to !== undefined) parts.push(sql`${column} <= ${range.to}`);
  return parts.length > 0 ? join(parts, ' AND ') : null;
}

/** Условие по колонке: список значений, «от N», диапазон или равенство. */
function columnSql(attribute: ListingAttribute, value: unknown): Prisma.Sql | null {
  const column = COLUMN_NAMES[attribute.column as string];
  if (!column) return null;
  const numeric = attribute.type === 'number' || attribute.type === 'date';

  if (Array.isArray(value)) {
    const items = value.filter((item) => item !== null && item !== undefined && item !== '');
    if (items.length === 0) return null;

    if (numeric) {
      const choices = numericChoices(attribute, items);
      const parts: Prisma.Sql[] = [];
      if (choices.exact.length > 0) parts.push(sql`${column} IN (${join(choices.exact)})`);
      if (choices.atLeast !== undefined) parts.push(sql`${column} >= ${choices.atLeast}`);
      if (parts.length === 0) return null;
      return parts.length === 1 ? (parts[0] as Prisma.Sql) : sql`(${join(parts, ' OR ')})`;
    }

    if (attribute.column === 'condition') {
      return sql`${column} IN (${join(items.map((item) => sql`${String(item)}::"ListingCondition"`))})`;
    }
    return sql`${column} IN (${join(items.map(String))})`;
  }

  if (typeof value === 'object' && value !== null) {
    return numeric ? rangeSql(column, bounds(attribute, value)) : null;
  }

  if (numeric) {
    const exact = scaled(attribute, value);
    return exact === undefined ? null : sql`${column} = ${exact}`;
  }

  if (attribute.column === 'condition')
    return sql`${column} = ${String(value)}::"ListingCondition"`;
  return sql`${column} = ${String(value)}`;
}

/**
 * Часть слова для поиска по тексту: без пробелов по краям, не длиннее
 * разумного, со спецсимволами LIKE (`%`, `_`, `\`) в виде обычных букв — иначе
 * человек, набравший «50%», получил бы «всё».
 */
export function textNeedle(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().slice(0, 60);
  if (text.length === 0) return null;
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Условие через таблицу значений: EXISTS строки с нужным ключом и значением. */
function valueSql(attribute: ListingAttribute, value: unknown): Prisma.Sql | null {
  const numeric = attribute.type === 'number' || attribute.type === 'date';
  const exists = (condition: Prisma.Sql): Prisma.Sql =>
    sql`EXISTS (SELECT 1 FROM "listing_attribute_values" v WHERE v."listing_id" = l."id" AND v."key" = ${attribute.key} AND ${condition})`;

  // Текстовое поле (производитель «своими словами», порода, процессор):
  // человек пишет часть слова, и равенство не нашло бы «Camry» по «cam».
  // Перечисления сюда не попадают — у них точное значение из набора
  if (attribute.filter === 'text') {
    const needle = textNeedle(value);
    return needle ? exists(sql`v."text_value" ILIKE ${`%${needle}%`}`) : null;
  }

  if (Array.isArray(value)) {
    const items = value.filter((item) => item !== null && item !== undefined && item !== '');
    if (items.length === 0) return null;

    if (numeric) {
      const choices = numericChoices(attribute, items);
      const parts: Prisma.Sql[] = [];
      if (choices.exact.length > 0) parts.push(sql`v."num_value" IN (${join(choices.exact)})`);
      if (choices.atLeast !== undefined) parts.push(sql`v."num_value" >= ${choices.atLeast}`);
      return parts.length > 0 ? exists(sql`(${join(parts, ' OR ')})`) : null;
    }

    return exists(sql`v."text_value" IN (${join(items.map(String))})`);
  }

  if (typeof value === 'object' && value !== null) {
    if (!numeric) return null;
    const range = rangeSql(sql`v."num_value"`, bounds(attribute, value));
    return range ? exists(range) : null;
  }

  if (attribute.type === 'boolean') {
    const truthy = value === true || value === 'true' || value === '1';
    return exists(sql`v."num_value" = ${truthy ? 1 : 0}`);
  }

  if (numeric) {
    const exact = scaled(attribute, value);
    return exact === undefined ? null : exists(sql`v."num_value" = ${exact}`);
  }

  return exists(sql`v."text_value" = ${String(value)}`);
}

/**
 * Условия по характеристикам категории: колоночные — напрямую, остальные —
 * через таблицу значений. Поле, которого нет в фильтрах (`filterable: false`)
 * или которого нет у категории, пропускается.
 */
export function attributeSql(
  attributes: readonly ListingAttribute[],
  filter: Record<string, unknown>,
): Prisma.Sql[] {
  const result: Prisma.Sql[] = [];

  for (const attribute of attributes) {
    const value = filter[attribute.key];
    if (value === undefined || value === null || value === '') continue;
    if (!attribute.filterable) continue;

    const condition = attribute.column ? columnSql(attribute, value) : valueSql(attribute, value);
    if (condition) result.push(condition);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Поиск
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Слова запроса для префиксного поиска: «диван раскл» → «диван:* & раскл:*».
 * Всё, что не буква и не цифра, выбрасывается — в синтаксис tsquery попадают
 * только слова.
 */
export function prefixQuery(search: string): string {
  return search
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length >= 2)
    .map((word) => `${word}:*`)
    .join(' & ');
}

/**
 * Условие поиска. Три способа, объединённые «или»:
 *   • полнотекстовый с морфологией («диваны» находит «диван») — по вектору
 *     из заголовка, поискового текста и описания;
 *   • префиксный — недописанное слово («раскл» → «раскладной»);
 *   • по словам-триграммам — опечатки («дивaн», «камри» ~ «камри»).
 * Все три идут по индексам; совсем короткий запрос (одна буква) — только
 * подстрокой по заголовку.
 */
export function searchSql(search: string): Prisma.Sql | null {
  const query = search.trim();
  if (query.length === 0) return null;

  if (query.length < 2) {
    return sql`l."title" ILIKE ${`${query}%`}`;
  }

  const prefix = prefixQuery(query);
  const parts: Prisma.Sql[] = [
    sql`l."search_vector" @@ websearch_to_tsquery('russian', ${query})`,
    sql`${query} <% l."title"`,
    sql`${query} <% l."search_text"`,
  ];
  if (prefix) parts.push(sql`l."search_vector" @@ to_tsquery('russian', ${prefix})`);

  return sql`(${join(parts, ' OR ')})`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Где искать
// ─────────────────────────────────────────────────────────────────────────────

/** Центр поиска из запроса: выбранное место или место человека. */
export function searchPoint(
  query: Pick<ListingListQuery, 'latitude' | 'longitude'>,
): GeoPoint | null {
  return query.latitude !== undefined && query.longitude !== undefined
    ? { latitude: query.latitude, longitude: query.longitude }
    : null;
}

function pointSql(point: GeoPoint): Prisma.Sql {
  return sql`ST_SetSRID(ST_MakePoint(${point.longitude}::float8, ${point.latitude}::float8), 4326)::geography`;
}

/** Центр города справочника — точка для объявлений без своей. */
const CITY_POINT = sql`ST_SetSRID(ST_MakePoint(c."longitude", c."latitude"), 4326)::geography`;

/**
 * Круг вокруг точки, «весь Дагестан» или (для старых клиентов) город.
 *
 * Круг — по координатам объявлений, а не по названиям: 25 км от Манаскента
 * накрывают Манас, Каспийск и окраину Махачкалы, и объявления оттуда
 * находятся, как бы ни назывался их населённый пункт (ADR-0010).
 *
 * Объявление со своей точкой проверяется по GIST-индексу `geom`. У старых,
 * поданных без точки, её нет — они попадают в круг по центру своего города:
 * сначала выбираются города в круге (их единицы), потом объявления по
 * `city_id` — через частичный индекс, а не перебором таблицы. Расстояние им
 * при этом не показывается.
 */
export function areaSql(query: ListingListQuery): Prisma.Sql | null {
  // «Весь Дагестан»: места не ограничиваем, остальные фильтры работают
  if (query.regionWide) return null;

  const point = searchPoint(query);
  if (point && query.radiusKm !== undefined) {
    const meters = query.radiusKm * 1000;
    const center = pointSql(point);
    return sql`(ST_DWithin(l."geom", ${center}, ${meters}) OR (l."geom" IS NULL AND l."city_id" IN (SELECT ac."id" FROM "cities" ac WHERE ST_DWithin(ST_SetSRID(ST_MakePoint(ac."longitude", ac."latitude"), 4326)::geography, ${center}, ${meters}))))`;
  }

  // Старое поведение «лента своего города» — для клиента без точки
  if (query.cityId) return sql`l."city_id" = ${query.cityId}::uuid`;

  return null;
}

/**
 * Расстояние в метрах для «Ближе ко мне». Объявление без своей точки
 * стоит по центру своего города с надбавкой за неизвестность: иначе
 * наверх встают карточки, у которых расстояние даже не показано.
 */
export function distanceSql(point: GeoPoint): Prisma.Sql {
  const center = pointSql(point);
  const uncertainty = LISTING_RANKING.locationCityUncertaintyKm * 1000;
  return sql`COALESCE(ST_Distance(l."geom", ${center}), ST_Distance(${CITY_POINT}, ${center}) + ${uncertainty}::float8)`;
}

/** Курсор ленты «Ближе ко мне»: расстояние последней карточки и её id. */
export interface DistanceCursor {
  distance: number;
  id: string;
}

/**
 * Страница «Ближе ко мне» — порядок знает база, курсор по (расстояние, id).
 * Раньше по расстоянию раскладывалось только окно из 400 свежих объявлений,
 * а дальше лента шла по дате: при поиске в радиусе с тысячами объявлений
 * «ближе» переставало значить «ближе» уже на восемнадцатой странице.
 */
export function feedIdsByDistanceSql(
  where: Prisma.Sql,
  point: GeoPoint,
  limit: number,
  cursor?: DistanceCursor,
): Prisma.Sql {
  const distance = distanceSql(point);
  const after = cursor
    ? sql` AND (${distance} > ${cursor.distance}::float8 OR (${distance} = ${cursor.distance}::float8 AND l."id" > ${cursor.id}::uuid))`
    : empty;
  return sql`SELECT l."id", ${distance} AS "distance" FROM "listings" l JOIN "cities" c ON c."id" = l."city_id" WHERE ${where}${after} ORDER BY "distance" ASC, l."id" ASC LIMIT ${limit}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Лента целиком
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedContext {
  /** Категория и все её подкатегории. Пусто — фильтра по категории нет */
  categoryIds: readonly string[];
  /** Поля, по которым можно фильтровать: объединение наборов поддерева */
  attributes: readonly ListingAttribute[];
  /**
   * Единица, в которой сравнивается цена. Применяется, когда есть фильтр
   * или сортировка по цене: «в сутки» и «целиком» — разные шкалы.
   */
  priceUnit?: ListingPriceUnit;
  /** Кто спрашивает. Нужен только для «только избранное» */
  userId?: string;
}

/**
 * Условия ленты: видно только опубликованное и неудалённое. Черновики,
 * снятое и архив в общей ленте не показываются никому, включая автора —
 * своё он смотрит в кабинете.
 */
export function feedWhere(query: ListingListQuery, context: FeedContext): Prisma.Sql {
  const parts: Prisma.Sql[] = [sql`l."deleted_at" IS NULL`, sql`l."status" = 'approved'`];

  if (context.categoryIds.length > 0) {
    parts.push(
      sql`l."category_id" IN (${join(context.categoryIds.map((id) => sql`${id}::uuid`))})`,
    );
  }
  if (query.districtId) parts.push(sql`l."district_id" = ${query.districtId}::uuid`);
  if (query.sellerId) parts.push(sql`l."seller_id" = ${query.sellerId}::uuid`);
  if (query.transactionType) {
    parts.push(sql`l."transaction_type" = ${query.transactionType}::"ListingTransactionType"`);
  }
  if (query.rentPeriod) parts.push(sql`l."rent_period" = ${query.rentPeriod}::"ListingRentPeriod"`);
  if (query.onlyWithPhoto) parts.push(sql`l."cover_media_id" IS NOT NULL`);
  // Избранное — тоже условие запроса: отсев после выборки ломает «показать ещё»
  if (query.favoritesOnly && context.userId) {
    parts.push(
      sql`EXISTS (SELECT 1 FROM "favorite_listings" f WHERE f."listing_id" = l."id" AND f."user_id" = ${context.userId}::uuid)`,
    );
  }

  const priceSorted = query.sort === ListingSort.PRICE_ASC || query.sort === ListingSort.PRICE_DESC;
  const priceFiltered = query.priceFrom !== undefined || query.priceTo !== undefined;
  // Цена сравнивается только внутри одной единицы: без этого «до 5 000»
  // ставит рядом квартиру за сутки и стул целиком
  // Явно выбранная единица — тоже условие: «₽/сут» показывает посуточное, а не всё
  if ((priceSorted || priceFiltered || query.priceUnit !== undefined) && context.priceUnit) {
    parts.push(sql`l."price_unit" = ${context.priceUnit}::"ListingPriceUnit"`);
  }
  if (query.priceFrom !== undefined) parts.push(sql`l."price" >= ${query.priceFrom}`);
  if (query.priceTo !== undefined) parts.push(sql`l."price" <= ${query.priceTo}`);

  // Снимок ленты на момент открытия: пока человек листает, кто-то поднимает
  // своё объявление, и без этого условия карточка повторится или потеряется
  if (query.freshBefore) parts.push(sql`l."bumped_at" <= ${query.freshBefore}`);

  const area = areaSql(query);
  if (area) parts.push(area);

  const search = query.search ? searchSql(query.search) : null;
  if (search) parts.push(search);

  parts.push(...attributeSql(context.attributes, parseAttributeFilter(query.attributes)));

  return join(parts, ' AND ');
}

/** Значения ключей сортировки у строки-курсора. */
export interface FeedCursorRow {
  id: string;
  bumpedAt: Date;
  price: number | null;
}

/**
 * Порядок выдачи. `id` последним ключом — не украшение: без однозначного
 * порядка курсор показывает одну запись дважды, а другую пропускает.
 * Объявления без цены уходят вниз, а не наверх: отсутствие цены — не
 * «самое дешёвое».
 */
export function orderSql(sort: ListingListQuery['sort']): Prisma.Sql {
  switch (sort) {
    case ListingSort.PRICE_ASC:
      return sql`l."price" ASC NULLS LAST, l."id" ASC`;
    case ListingSort.PRICE_DESC:
      return sql`l."price" DESC NULLS LAST, l."id" ASC`;
    default:
      return sql`l."bumped_at" DESC, l."id" ASC`;
  }
}

/**
 * Продолжение после курсора — по значениям ключей сортировки, а не по
 * смещению: смещение съезжает, когда между страницами что-то добавили.
 */
export function keysetSql(sort: ListingListQuery['sort'], cursor: FeedCursorRow): Prisma.Sql {
  if (sort === ListingSort.PRICE_ASC || sort === ListingSort.PRICE_DESC) {
    if (cursor.price === null) {
      return sql`(l."price" IS NULL AND l."id" > ${cursor.id}::uuid)`;
    }
    const beyond =
      sort === ListingSort.PRICE_ASC
        ? sql`l."price" > ${cursor.price}`
        : sql`l."price" < ${cursor.price}`;
    return sql`(${beyond} OR (l."price" = ${cursor.price} AND l."id" > ${cursor.id}::uuid) OR l."price" IS NULL)`;
  }

  return sql`(l."bumped_at" < ${cursor.bumpedAt} OR (l."bumped_at" = ${cursor.bumpedAt} AND l."id" > ${cursor.id}::uuid))`;
}

/** Запрос идентификаторов страницы. */
export function feedIdsSql(
  where: Prisma.Sql,
  sort: ListingListQuery['sort'],
  limit: number,
  cursor?: FeedCursorRow,
): Prisma.Sql {
  const after = cursor ? sql` AND ${keysetSql(sort, cursor)}` : empty;
  return sql`SELECT l."id" FROM "listings" l JOIN "cities" c ON c."id" = l."city_id" WHERE ${where}${after} ORDER BY ${orderSql(sort)} LIMIT ${limit}`;
}

/** Общее число объявлений под условия — для подписи «1 284 объявления». */
export function feedCountSql(where: Prisma.Sql): Prisma.Sql {
  return sql`SELECT count(*)::int AS "count" FROM "listings" l JOIN "cities" c ON c."id" = l."city_id" WHERE ${where}`;
}

/**
 * Точки для карты: только объявления со своей точкой в видимой области —
 * по GIST-индексу `geom`, а не перебором широты и долготы.
 */
export function mapPointsSql(
  where: Prisma.Sql,
  box: { south: number; north: number; west: number; east: number },
  limit: number,
): Prisma.Sql {
  const envelope = sql`ST_MakeEnvelope(${box.west}::float8, ${box.south}::float8, ${box.east}::float8, ${box.north}::float8, 4326)::geography`;
  return sql`SELECT l."id", l."latitude", l."longitude", l."address_visibility" AS "addressVisibility", l."price", l."price_unit" AS "priceUnit", l."cover_media_id" AS "coverMediaId", l."title" FROM "listings" l JOIN "cities" c ON c."id" = l."city_id" WHERE ${where} AND l."geom" && ${envelope} ORDER BY l."bumped_at" DESC LIMIT ${limit}`;
}

/** Текст запроса для тестов и отладки: параметры подставлены как есть. */
export function renderSql(fragment: Prisma.Sql): string {
  let index = 0;
  return fragment.sql.replace(/\?/g, () => {
    const value = fragment.values[index];
    index += 1;
    return typeof value === 'string' ? `'${value}'` : String(value);
  });
}
