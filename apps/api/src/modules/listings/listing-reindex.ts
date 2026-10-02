import {
  attributesSchemaFor,
  defaultPriceUnit,
  transactionCardLabel,
  type AttributeValue,
  type ListingPriceUnit,
  type ListingRentPeriod,
  type ListingTransactionType,
} from '@dagestan/shared';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { prepareAttributes } from './listing-attribute-store.js';
import type { ListingCatalogue } from './listing-categories.service.js';

/**
 * Пересборка производных данных объявления из того, что в нём хранится:
 * строки таблицы значений, поисковый текст, цена за м², сделка и единица
 * цены по правилам категории.
 *
 * Нужна миграции (старые объявления), демо-данным и панели («переиндексировать
 * после правки справочника»). Проверка здесь мягкая: старое объявление с
 * неполными данными не должно упасть — оно должно снова стать находимым.
 */

type ListingClient = Pick<PrismaClient, 'listing' | 'listingAttributeValue' | 'district'>;

export interface ReindexResult {
  changed: boolean;
  notes: string[];
}

export async function reindexListing(
  prisma: ListingClient,
  catalogue: ListingCatalogue,
  listingId: string,
): Promise<ReindexResult> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      city: { select: { name: true } },
      district: { select: { name: true } },
    },
  });
  if (!listing) return { changed: false, notes: ['не найдено'] };

  const category = catalogue.findById(listing.categoryId);
  if (!category) return { changed: false, notes: ['категория не найдена'] };

  const notes: string[] = [];
  const attributes = catalogue.attributesOf(category.id);

  // Сделка: категория с одной возможной сделкой подставляет её сама
  let transactionType: ListingTransactionType | null = listing.transactionType;
  if (!transactionType && category.allowedTransactions.length > 0) {
    // Старое объявление без сделки: одна возможная — она, несколько —
    // умолчание категории (у машины и квартиры это продажа)
    transactionType =
      category.allowedTransactions.length === 1
        ? (category.allowedTransactions[0] ?? null)
        : category.defaultTransaction;
    if (transactionType) notes.push(`сделка: ${transactionType}`);
  }
  if (transactionType && !category.allowedTransactions.includes(transactionType)) {
    transactionType = null;
    notes.push('сделка снята: в категории её нет');
  }

  let rentPeriod: ListingRentPeriod | null = listing.rentPeriod;
  if (transactionType !== 'rent') rentPeriod = null;
  else if (!rentPeriod && category.defaultRentPeriod) rentPeriod = category.defaultRentPeriod;

  const rules = catalogue.priceRules(category);
  let priceUnit: ListingPriceUnit = listing.priceUnit;
  const allowed = new Set(rules.allowedPriceUnits);
  if (!allowed.has(priceUnit) || (transactionType === 'rent' && priceUnit === 'total')) {
    priceUnit = defaultPriceUnit(rules, transactionType, rentPeriod);
    notes.push(`единица цены: ${priceUnit}`);
  }

  // Характеристики: старые значения приводятся к справочнику (модель
  // «Camry» → «camry»), неизвестные ключи отбрасываются
  const raw = { ...(listing.attributes as Record<string, unknown>) };
  for (const attribute of attributes) {
    const value = raw[attribute.key];
    if (typeof value !== 'string' || !attribute.dictionary) continue;
    const parent =
      attribute.parentKey && typeof raw[attribute.parentKey] === 'string'
        ? (raw[attribute.parentKey] as string)
        : undefined;
    const entries = catalogue.dictionaryEntries(attribute.dictionary, parent ?? '');
    const byLabel = entries.find(
      (entry) => entry.label.toLowerCase() === value.toLowerCase() && entry.value !== value,
    );
    if (byLabel) {
      raw[attribute.key] = byLabel.value;
      notes.push(`${attribute.key}: «${value}» → ${byLabel.value}`);
    }
  }

  const lenient = attributes.map((attribute) => ({ ...attribute, required: false }));
  const parsed = attributesSchemaFor(lenient).safeParse(raw);
  const values: Record<string, AttributeValue> = parsed.success ? parsed.data : {};
  if (!parsed.success) notes.push('часть характеристик не прошла проверку и сброшена');

  // Колонки — как есть, если в JSON их нет
  for (const attribute of attributes) {
    if (!attribute.column || values[attribute.key] !== undefined) continue;
    const column = listing[attribute.column];
    if (column !== null && column !== undefined) values[attribute.key] = column;
  }

  const parent = category.parentId ? catalogue.findById(category.parentId) : null;
  const prepared = prepareAttributes(attributes, values, catalogue.labelsFor(attributes, values), [
    category.name,
    parent?.name,
    listing.city.name,
    listing.district?.name,
    transactionCardLabel(transactionType, rentPeriod, category.slug),
    ...catalogue.aliasesFor(attributes, values),
  ]);

  const area = typeof prepared.columns.areaTotal === 'number' ? prepared.columns.areaTotal : null;
  const pricePerSqm =
    listing.price !== null &&
    area &&
    area > 0 &&
    priceUnit === 'total' &&
    transactionType !== 'rent'
      ? Math.round(listing.price / (area / 10))
      : null;

  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      transactionType,
      rentPeriod,
      priceUnit,
      pricePerSqm,
      attributes: prepared.json,
      searchText: prepared.searchText,
      attributeValues: { deleteMany: {}, createMany: { data: prepared.values } },
    },
  });

  return { changed: true, notes };
}
