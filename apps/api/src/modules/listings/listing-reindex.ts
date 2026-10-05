import {
  FILTER_ONLY_ATTRIBUTES,
  attributesSchemaFor,
  defaultPriceUnit,
  isAttributeVisible,
  storedToInput,
  transactionCardLabel,
  type AttributeValue,
  type ListingAttribute,
  type ListingAttributeColumns,
  type ListingPriceUnit,
  type ListingRentPeriod,
  type ListingTransactionType,
} from '@dagestan/shared';

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { prepareAttributes } from './listing-attribute-store.js';
import type { CategoryRecord, ListingCatalogue } from './listing-categories.service.js';

/**
 * Пересборка производных данных объявления из того, что в нём хранится:
 * строки таблицы значений, поисковый текст, цена за м², сделка и единица
 * цены по правилам категории.
 *
 * Нужна миграции (старые объявления), демо-данным и панели («переиндексировать
 * после правки справочника»).
 *
 * ГЛАВНОЕ ПРАВИЛО: характеристики объявления не теряются молча. Значение,
 * которое нынешняя проверка не узнала (вариант убрали из справочника, поле
 * отвязали от категории), остаётся в объявлении как есть — его просто нет в
 * фильтре, пока продавец не поправит. Удаление — только флагом
 * `dropInvalid`, и план заранее говорит, что именно будет удалено.
 *
 * Раньше одно неверное поле обнуляло ВСЕ характеристики объявления, а числа с
 * масштабом (площадь участка, объём двигателя) умножались на 10 при каждом
 * прогоне, пока не выходили за предел, — так демо-объявление «Дача обмен
 * №99552» осталось без характеристик (2026-10-07).
 */

type ListingClient = Pick<PrismaClient, 'listing' | 'listingAttributeValue' | 'district'>;

/** Что происходит со значением характеристики. */
export type AttributeChangeKind =
  /** Значение приведено к справочнику или перенесено в колонку */
  | 'converted'
  /** Значение удаляется (только с флагом dropInvalid) */
  | 'removed'
  /** Значение не прошло проверку, но сохраняется как есть */
  | 'kept';

export interface AttributeChange {
  key: string;
  before: unknown;
  after: unknown;
  kind: AttributeChangeKind;
  reason: string;
}

/** Изменение полей самого объявления: сделка, срок аренды, единица цены. */
export interface FieldChange {
  field: 'transactionType' | 'rentPeriod' | 'priceUnit';
  before: unknown;
  after: unknown;
  reason: string;
}

export interface ReindexOptions {
  /** Удалять значения, которые не прошли проверку. По умолчанию — сохранять */
  dropInvalid?: boolean;
}

export interface ReindexSource {
  id: string;
  categoryId: string;
  attributes: unknown;
  transactionType: ListingTransactionType | null;
  rentPeriod: ListingRentPeriod | null;
  priceUnit: ListingPriceUnit;
  price: number | null;
  rooms: number | null;
  areaTotal: number | null;
  floor: number | null;
  floorsTotal: number | null;
  year: number | null;
  mileage: number | null;
  condition: string | null;
  city: { name: string };
  district: { name: string } | null;
}

export interface ReindexPlan {
  listingId: string;
  category: string;
  changes: AttributeChange[];
  fieldChanges: FieldChange[];
  /** Сколько хранимых значений остаются как были */
  unchanged: number;
  /** Объявление меняется по существу (значения, сделка, цена), а не только индекс */
  changed: boolean;
  data: Prisma.ListingUpdateInput;
}

export interface ReindexResult {
  changed: boolean;
  notes: string[];
  plan: ReindexPlan | null;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Колонка, в которой лежит значение поля, — в виде, пригодном для сравнения. */
function columnValue(source: ReindexSource, column: keyof ListingAttributeColumns): unknown {
  return source[column];
}

/**
 * План пересборки одного объявления — без записи. Чистая функция: её
 * проверяют тесты и ею же пользуется пробный прогон миграции (`--dry-run`).
 */
export function planReindex(
  source: ReindexSource,
  category: CategoryRecord,
  catalogue: ListingCatalogue,
  options: ReindexOptions = {},
): ReindexPlan {
  const attributes = catalogue.attributesOf(category.id);
  const changes: AttributeChange[] = [];
  const fieldChanges: FieldChange[] = [];

  // ── Сделка и единица цены по правилам категории ───────────────────────────
  let transactionType: ListingTransactionType | null = source.transactionType;
  if (!transactionType && category.allowedTransactions.length > 0) {
    // Старое объявление без сделки: одна возможная — она, несколько —
    // умолчание категории (у машины и квартиры это продажа)
    transactionType =
      category.allowedTransactions.length === 1
        ? (category.allowedTransactions[0] ?? null)
        : category.defaultTransaction;
  }
  if (transactionType && !category.allowedTransactions.includes(transactionType)) {
    transactionType = null;
  }
  if (transactionType !== source.transactionType) {
    fieldChanges.push({
      field: 'transactionType',
      before: source.transactionType,
      after: transactionType,
      reason: transactionType ? 'сделка по умолчанию категории' : 'в категории такой сделки нет',
    });
  }

  let rentPeriod: ListingRentPeriod | null = source.rentPeriod;
  if (transactionType !== 'rent') rentPeriod = null;
  else if (!rentPeriod && category.defaultRentPeriod) rentPeriod = category.defaultRentPeriod;
  if (rentPeriod !== source.rentPeriod) {
    fieldChanges.push({
      field: 'rentPeriod',
      before: source.rentPeriod,
      after: rentPeriod,
      reason: 'срок аренды по сделке',
    });
  }

  const rules = catalogue.priceRules(category);
  let priceUnit: ListingPriceUnit = source.priceUnit;
  if (
    !new Set(rules.allowedPriceUnits).has(priceUnit) ||
    (transactionType === 'rent' && priceUnit === 'total')
  ) {
    priceUnit = defaultPriceUnit(rules, transactionType, rentPeriod);
    fieldChanges.push({
      field: 'priceUnit',
      before: source.priceUnit,
      after: priceUnit,
      reason: 'единица цены не подходит категории или сделке',
    });
  }

  // ── Характеристики ────────────────────────────────────────────────────────
  const stored = { ...((source.attributes as Record<string, unknown> | null) ?? {}) };
  // Хранимые числа — в долях (54,5 м² → 545); схема снова умножит, поэтому делим
  const input = storedToInput(attributes, stored);

  // Подпись вместо кода («Camry» → «camry») — к справочнику
  for (const attribute of attributes) {
    const value = input[attribute.key];
    if (typeof value !== 'string' || !attribute.dictionary) continue;
    const parent =
      attribute.parentKey && typeof input[attribute.parentKey] === 'string'
        ? (input[attribute.parentKey] as string)
        : undefined;
    const byLabel = catalogue
      .dictionaryEntries(attribute.dictionary, parent ?? '')
      .find((entry) => entry.label.toLowerCase() === value.toLowerCase() && entry.value !== value);
    if (byLabel) input[attribute.key] = byLabel.value;
  }

  const byKey = new Map(attributes.map((attribute) => [attribute.key, attribute]));
  const lenient: ListingAttribute[] = attributes.map((attribute) => ({
    ...attribute,
    required: false,
  }));

  // Проверка по полю, а не «всё или ничего»: неверное поле не тянет за собой остальные
  const schema = attributesSchemaFor(lenient);
  const invalid = new Set<string>();
  let parsed = schema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string') invalid.add(key);
    }
    const rest = Object.fromEntries(Object.entries(input).filter(([key]) => !invalid.has(key)));
    parsed = schema.safeParse(rest);
  }
  const values: Record<string, AttributeValue> = parsed.success ? { ...parsed.data } : {};

  // Колоночные поля: если в JSON их нет — из колонок как есть
  for (const attribute of attributes) {
    if (!attribute.column || values[attribute.key] !== undefined) continue;
    const column = columnValue(source, attribute.column);
    if (column !== null && column !== undefined) values[attribute.key] = column as AttributeValue;
  }

  const parent = category.parentId ? catalogue.findById(category.parentId) : null;
  const prepared = prepareAttributes(attributes, values, catalogue.labelsFor(attributes, values), [
    category.name,
    parent?.name,
    source.city.name,
    source.district?.name,
    transactionCardLabel(transactionType, rentPeriod, category.slug),
    ...catalogue.aliasesFor(attributes, values),
  ]);

  // Итоговый JSON: проверенное + то, что проверку не прошло (сохраняется как есть)
  const json: Record<string, unknown> = { ...prepared.json };
  const columns: Partial<Record<keyof ListingAttributeColumns, unknown>> = {};
  let unchanged = 0;

  for (const [key, before] of Object.entries(stored)) {
    const attribute = byKey.get(key);
    const reason = !attribute
      ? 'поля нет у категории'
      : FILTER_ONLY_ATTRIBUTES.has(key)
        ? 'поле хранится слоем запчасти, а не характеристикой'
        : invalid.has(key)
          ? 'значение не прошло проверку (нет в справочнике или вне пределов)'
          : !isAttributeVisible(attribute, input)
            ? 'поле скрыто условием показа'
            : null;

    if (reason) {
      if (options.dropInvalid) {
        changes.push({ key, before, after: undefined, kind: 'removed', reason });
      } else {
        json[key] = before;
        changes.push({ key, before, after: before, kind: 'kept', reason });
      }
      continue;
    }

    // Колоночное поле в JSON: значение переезжает в колонку, если она пуста
    if (attribute?.column) {
      const current = columnValue(source, attribute.column);
      const next = prepared.columns[attribute.column];
      if ((current === null || current === undefined) && next !== undefined && next !== null) {
        columns[attribute.column] = next;
        changes.push({
          key,
          before,
          after: next,
          kind: 'converted',
          reason: 'перенесено в колонку',
        });
      } else {
        // Колонка уже заполнена — значение остаётся в JSON как было
        json[key] = before;
        unchanged += 1;
      }
      continue;
    }

    const after = json[key];
    if (after === undefined) {
      // Значение пустое по смыслу («», [] ): его и не было
      if (before === '' || before === null || (Array.isArray(before) && before.length === 0)) {
        unchanged += 1;
        continue;
      }
      // Сюда попадать не должно: проверенное поле без значения — сохраняем как было
      json[key] = before;
      changes.push({ key, before, after: before, kind: 'kept', reason: 'значение не разобрано' });
      continue;
    }
    if (same(before, after)) unchanged += 1;
    else {
      changes.push({ key, before, after, kind: 'converted', reason: 'приведено к справочнику' });
    }
  }

  const area =
    typeof prepared.columns.areaTotal === 'number' ? prepared.columns.areaTotal : source.areaTotal;
  const pricePerSqm =
    source.price !== null && area && area > 0 && priceUnit === 'total' && transactionType !== 'rent'
      ? Math.round(source.price / (area / 10))
      : null;

  const changed =
    fieldChanges.length > 0 ||
    changes.some((change) => change.kind === 'converted' || change.kind === 'removed');

  return {
    listingId: source.id,
    category: category.slug,
    changes,
    fieldChanges,
    unchanged,
    changed,
    data: {
      transactionType,
      rentPeriod,
      priceUnit,
      pricePerSqm,
      ...(columns as Prisma.ListingUpdateInput),
      attributes: json as Prisma.InputJsonObject,
      searchText: prepared.searchText,
      attributeValues: { deleteMany: {}, createMany: { data: prepared.values } },
    },
  };
}

/** Объявление со всем, что нужно плану. */
export async function loadReindexSource(
  prisma: ListingClient,
  listingId: string,
): Promise<ReindexSource | null> {
  return prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      categoryId: true,
      attributes: true,
      transactionType: true,
      rentPeriod: true,
      priceUnit: true,
      price: true,
      rooms: true,
      areaTotal: true,
      floor: true,
      floorsTotal: true,
      year: true,
      mileage: true,
      condition: true,
      city: { select: { name: true } },
      district: { select: { name: true } },
    },
  });
}

/** Человеческие заметки к плану — для журнала миграции. */
export function planNotes(plan: ReindexPlan): string[] {
  return [
    ...plan.fieldChanges.map((change) => `${change.field}: ${String(change.after)}`),
    ...plan.changes.map((change) =>
      change.kind === 'kept'
        ? `${change.key}: сохранено как есть (${change.reason})`
        : change.kind === 'removed'
          ? `${change.key}: удалено (${change.reason})`
          : `${change.key}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`,
    ),
  ];
}

export async function reindexListing(
  prisma: ListingClient,
  catalogue: ListingCatalogue,
  listingId: string,
  options: ReindexOptions & { dryRun?: boolean } = {},
): Promise<ReindexResult> {
  const source = await loadReindexSource(prisma, listingId);
  if (!source) return { changed: false, notes: ['не найдено'], plan: null };

  const category = catalogue.findById(source.categoryId);
  if (!category) return { changed: false, notes: ['категория не найдена'], plan: null };

  const plan = planReindex(source, category, catalogue, options);
  if (!options.dryRun) {
    await prisma.listing.update({ where: { id: source.id }, data: plan.data });
  }
  return { changed: plan.changed, notes: planNotes(plan), plan };
}
