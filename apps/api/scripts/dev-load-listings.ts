/**
 * Нагрузочный набор объявлений — для проверки миграций, индексов и
 * EXPLAIN ANALYZE на объёме, близком к реальному.
 *
 *   npm run dev:load-listings --workspace @dagestan/api -- 100000
 *   npm run dev:load-listings --workspace @dagestan/api -- drop
 *
 * Данные синтетические, но распределены как настоящие: больше всего вещей и
 * недвижимости, у половины объявлений своя точка на карте, у части — район.
 * Пишутся пачками напрямую в базу, а производные (таблица значений,
 * поисковый текст) считаются той же функцией, что и у настоящей подачи.
 * Инструмент разработки: на боевом сервере откажется.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import {
  LISTING_LIFETIME_DAYS,
  attributesSchemaFor,
  defaultPriceUnit,
  transactionCardLabel,
  type AttributeValue,
  type ListingAttribute,
  type ListingRentPeriod,
  type ListingTransactionType,
} from '@dagestan/shared';
import { argon2id, hash } from 'argon2';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { prepareAttributes } from '../src/modules/listings/listing-attribute-store.js';
import {
  loadCatalogue,
  type CategoryRecord,
  type ListingCatalogue,
} from '../src/modules/listings/listing-categories.service.js';

loadEnv({ path: path.resolve(import.meta.dirname, '..', '..', '..', '.env'), quiet: true });

if (process.env.NODE_ENV === 'production') {
  throw new Error('Нагрузочные данные нельзя заводить на боевом сервере');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SELLER_PHONE_PREFIX = '+7999100';
const SELLERS = 200;
const BATCH = 500;

/** Детерминированный генератор: один и тот же набор при каждом запуске. */
let seed = 20260929;
function random(): number {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}
function between(min: number, max: number): number {
  return Math.floor(min + random() * (max - min + 1));
}

const WORDS = [
  'срочно',
  'торг',
  'отличное состояние',
  'один владелец',
  'новый',
  'без пробега по РФ',
  'рядом с морем',
  'центр',
  'обмен',
  'гарантия',
];

/** Вес подкатегории в общем потоке: вещей и жилья больше, франшиз — меньше. */
function weight(category: CategoryRecord): number {
  if (category.slug.startsWith('realty-')) return 6;
  if (category.slug.startsWith('transport-cars')) return 8;
  if (category.slug.startsWith('electronics-phones')) return 5;
  if (category.slug.startsWith('services-')) return 2;
  if (category.slug.startsWith('business-')) return 1;
  return 3;
}

function randomValue(
  attribute: ListingAttribute,
  catalogue: ListingCatalogue,
  values: Record<string, unknown>,
): AttributeValue | undefined {
  if (random() < 0.25 && !attribute.required) return undefined;

  switch (attribute.type) {
    case 'boolean':
      return random() < 0.5;
    case 'enum':
    case 'multiEnum':
      return attribute.options ? pick(attribute.options).value : undefined;
    case 'brand': {
      const entries = attribute.dictionary
        ? catalogue.dictionaryEntries(attribute.dictionary, '')
        : [];
      return entries.length > 0 ? pick(entries).value : undefined;
    }
    case 'model': {
      const parent = attribute.parentKey ? values[attribute.parentKey] : undefined;
      const entries =
        attribute.dictionary && typeof parent === 'string'
          ? catalogue.dictionaryEntries(attribute.dictionary, parent)
          : [];
      return entries.length > 0 ? pick(entries).value : undefined;
    }
    case 'number':
    case 'date': {
      const min = attribute.min ?? 0;
      const max = Math.min(attribute.max ?? 1000, min + 400);
      if (attribute.key === 'year') return between(1995, 2025);
      if (attribute.key === 'mileage') return between(0, 300) * 1000;
      if (attribute.key === 'rooms') return between(0, 5);
      if (attribute.key === 'areaTotal') return between(18, 180);
      if (attribute.key === 'floor') return between(1, 16);
      if (attribute.key === 'floorsTotal') return between(5, 20);
      return between(min, max);
    }
    case 'string':
      return pick(['чёрный', 'белый', 'серый', 'синий']);
  }
}

async function ensureSellers(cityIds: string[]): Promise<string[]> {
  const passwordHash = await hash('Load-Listings-2026!', { type: argon2id });
  const ids: string[] = [];
  for (let index = 0; index < SELLERS; index += 1) {
    const phone = `${SELLER_PHONE_PREFIX}${String(index).padStart(4, '0')}`;
    const user = await prisma.user.upsert({
      where: { phone },
      create: {
        phone,
        passwordHash,
        firstName: `Продавец ${index}`,
        status: 'active',
        cityId: pick(cityIds),
        isVerified: random() < 0.5,
      },
      update: {},
    });
    ids.push(user.id);
  }
  return ids;
}

async function main(): Promise<void> {
  const arg = process.argv[2];

  if (arg === 'drop') {
    const sellers = await prisma.user.findMany({
      where: { phone: { startsWith: SELLER_PHONE_PREFIX } },
      select: { id: true },
    });
    const removed = await prisma.listing.deleteMany({
      where: { sellerId: { in: sellers.map((seller) => seller.id) } },
    });
    console.log(`Удалено объявлений: ${removed.count}`);
    return;
  }

  const total = Number(arg ?? 100_000);
  const catalogue = await loadCatalogue(prisma);
  const cities = await prisma.city.findMany({ where: { isActive: true, deletedAt: null } });
  const districts = await prisma.district.findMany({ where: { deletedAt: null } });
  const sellerIds = await ensureSellers(cities.map((city) => city.id));

  const leaves = catalogue.categories.filter(
    (category) =>
      category.isLeaf && category.isActive && !category.shortcut && !category.deprecatedToId,
  );
  const weighted = leaves.flatMap((category) =>
    Array.from({ length: weight(category) }, () => category),
  );

  const now = Date.now();
  let created = 0;

  while (created < total) {
    const size = Math.min(BATCH, total - created);
    const rows: Prisma.ListingCreateManyInput[] = [];
    const valueRows: {
      listingId: string;
      key: string;
      numValue: number | null;
      textValue: string | null;
    }[] = [];

    for (let index = 0; index < size; index += 1) {
      const category = pick(weighted);
      const city = pick(cities);
      const attributes = catalogue.attributesOf(category.id);
      const raw: Record<string, unknown> = {};
      for (const attribute of attributes) {
        const value = randomValue(attribute, catalogue, raw);
        if (value !== undefined) raw[attribute.key] = value;
      }
      const parsed = attributesSchemaFor(attributes).safeParse(raw);
      const values = parsed.success ? parsed.data : {};

      const transactionType: ListingTransactionType | null =
        category.allowedTransactions.length > 0 ? pick(category.allowedTransactions) : null;
      const rentPeriod: ListingRentPeriod | null =
        transactionType === 'rent'
          ? (category.defaultRentPeriod ?? pick(['daily', 'monthly'] as const))
          : null;
      const priceUnit = defaultPriceUnit(
        catalogue.priceRules(category),
        transactionType,
        rentPeriod,
      );
      const price =
        transactionType === 'free' || transactionType === 'mating'
          ? null
          : priceUnit === 'per_day'
            ? between(15, 80) * 100 * 100
            : priceUnit === 'per_month'
              ? between(150, 900) * 100 * 100
              : between(5, 900) * 1000 * 100;

      const districtPool = districts.filter((district) => district.cityId === city.id);
      const district = districtPool.length > 0 && random() < 0.5 ? pick(districtPool) : null;
      const hasPoint = random() < 0.5;
      const latitude = hasPoint ? city.latitude + (random() - 0.5) * 0.12 : null;
      const longitude = hasPoint ? city.longitude + (random() - 0.5) * 0.16 : null;

      const prepared = prepareAttributes(
        attributes,
        values,
        catalogue.labelsFor(attributes, values),
        [
          category.name,
          city.name,
          district?.name,
          transactionCardLabel(transactionType, rentPeriod),
        ],
      );

      const id = crypto.randomUUID();
      const bumpedAt = new Date(now - between(0, 30 * 24) * 60 * 60 * 1000);
      // Колонки уже в десятых квадратного метра — схема умножила при разборе
      const area =
        typeof prepared.columns.areaTotal === 'number' ? prepared.columns.areaTotal : null;

      rows.push({
        id,
        cityId: city.id,
        districtId: district?.id ?? null,
        categoryId: category.id,
        sellerId: pick(sellerIds),
        title: `${category.itemLabel ?? category.name} ${pick(WORDS)} №${created + index}`,
        description: `${pick(WORDS)}, ${pick(WORDS)}. ${category.name} в городе ${city.name}.`,
        transactionType,
        rentPeriod,
        price,
        priceUnit,
        isNegotiable: random() < 0.3,
        pricePerSqm:
          price !== null && area && priceUnit === 'total' ? Math.round(price / (area / 10)) : null,
        contactPhone: `+79991${String(between(0, 999_999)).padStart(6, '0')}`,
        attributes: prepared.json,
        searchText: prepared.searchText,
        rooms: numberOrNull(prepared.columns.rooms),
        areaTotal: area,
        floor: numberOrNull(prepared.columns.floor),
        floorsTotal: numberOrNull(prepared.columns.floorsTotal),
        year: numberOrNull(prepared.columns.year),
        mileage: numberOrNull(prepared.columns.mileage),
        condition: (prepared.columns.condition as 'new' | 'used' | null | undefined) ?? null,
        latitude,
        longitude,
        status: 'approved',
        publishedAt: bumpedAt,
        bumpedAt,
        expiresAt: new Date(bumpedAt.getTime() + LISTING_LIFETIME_DAYS * 24 * 60 * 60 * 1000),
        viewsCount: between(0, 300),
        phoneViewsCount: between(0, 20),
      });

      for (const value of prepared.values) valueRows.push({ listingId: id, ...value });
    }

    await prisma.listing.createMany({ data: rows });
    if (valueRows.length > 0) await prisma.listingAttributeValue.createMany({ data: valueRows });

    created += size;
    if (created % 10_000 === 0 || created === total) console.log(`  ${created} / ${total}`);
  }

  console.log(`Готово: ${created} объявлений.`);
}

/** Площадь в колонке хранится в десятых, а generator даёт целые метры. */
function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

main()
  .catch((err: unknown) => {
    console.error('Ошибка:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
