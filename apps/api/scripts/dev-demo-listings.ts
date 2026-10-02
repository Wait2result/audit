/**
 * Демонстрационные объявления для локальной проверки Этапа 7.
 *
 * Доска наполняется людьми, поэтому в базе по умолчанию пусто и смотреть
 * рубрику не на чем. Скрипт заводит одного продавца и несколько объявлений
 * в разных категориях — чтобы пройти сценарий целиком на своём телефоне:
 * лента, фильтры, карточка, избранное, жалоба.
 *
 *   npm run dev:demo-listings --workspace @dagestan/api          # создать
 *   npm run dev:demo-listings --workspace @dagestan/api -- drop  # удалить
 *
 * Это инструмент разработки: пароль здесь один и лежит открытым. На боевом
 * сервере запускать нельзя — скрипт откажется, если NODE_ENV = production.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { LISTING_LIFETIME_DAYS } from '@dagestan/shared';
import { argon2id, hash } from 'argon2';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { loadCatalogue } from '../src/modules/listings/listing-categories.service.js';
import { reindexListing } from '../src/modules/listings/listing-reindex.js';

loadEnv({ path: path.resolve(import.meta.dirname, '..', '..', '..', '.env'), quiet: true });

if (process.env.NODE_ENV === 'production') {
  throw new Error('Демо-данные нельзя заводить на боевом сервере');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PASSWORD = 'Demo-Listings-2026!';
const SELLER_PHONE = '+79990004455';

interface DemoListing {
  categorySlug: string;
  title: string;
  description: string;
  /** Цена в рублях — в копейки переводит скрипт */
  priceRub: number;
  priceUnit?: 'total' | 'per_month' | 'per_day' | 'per_hour';
  transactionType?: 'sale' | 'rent' | 'free' | 'mating';
  rentPeriod?: 'daily' | 'monthly';
  columns?: Record<string, number | string>;
  attributes?: Record<string, string | number | boolean>;
  /**
   * Точка на карте. Есть не у всех намеренно: в жизни половина продавцов
   * ограничивается районом, и выдача обязана работать и с такими —
   * иначе «Ближе ко мне» проверено только на удобных данных.
   */
  point?: { latitude: number; longitude: number };
}

const DEMO: DemoListing[] = [
  {
    categorySlug: 'transport-cars',
    title: 'Toyota Camry, 2021',
    description: 'Один владелец, обслуживалась у дилера, вложений не требует.',
    priceRub: 2_890_000,
    transactionType: 'sale',
    columns: { year: 2021, mileage: 68_000 },
    attributes: {
      brand: 'toyota',
      model: 'camry',
      gearbox: 'auto',
      fuel: 'petrol',
      drive: 'front',
    },
  },
  {
    categorySlug: 'realty-flats',
    title: 'Квартира 2-комн. 65 м²',
    description: 'Светлая квартира в новом доме, рядом школа и парк.',
    priceRub: 5_800_000,
    transactionType: 'sale',
    columns: { rooms: 2, areaTotal: 650, floor: 3, floorsTotal: 9 },
    attributes: { renovation: 'euro', buildingType: 'monolith', balcony: true },
    // Центр Махачкалы
    point: { latitude: 42.9764, longitude: 47.5024 },
  },
  {
    categorySlug: 'realty-flats',
    title: 'Квартира-студия посуточно',
    description: 'Чистая студия у моря, есть всё необходимое. Заезд в любое время.',
    priceRub: 2_500,
    priceUnit: 'per_day',
    transactionType: 'rent',
    rentPeriod: 'daily',
    columns: { rooms: 0, areaTotal: 280, floor: 5, floorsTotal: 12 },
    attributes: { renovation: 'cosmetic', furniture: true },
    // Каспийск: проверка радиуса — в свой город не попадает, в «до 25 км» попадает
    point: { latitude: 42.8807, longitude: 47.6383 },
  },
  {
    categorySlug: 'electronics-phones',
    title: 'iPhone 15 Pro 256 ГБ',
    description: 'Состояние отличное, полный комплект, ёмкость батареи 96%.',
    priceRub: 89_990,
    columns: { condition: 'used' },
    transactionType: 'sale',
    attributes: {
      brand: 'apple',
      modelName: 'iPhone 15 Pro',
      memory: '256',
      battery: 96,
      warranty: false,
    },
    // Северная окраина Махачкалы
    point: { latitude: 43.0203, longitude: 47.4581 },
  },
  {
    categorySlug: 'home-furniture',
    title: 'Диван раскладной',
    description: 'Механизм еврокнижка, ткань рогожка. Забрать самовывозом.',
    priceRub: 25_000,
    transactionType: 'sale',
    columns: { condition: 'used' },
  },
  {
    categorySlug: 'job-vacancies',
    title: 'Требуется повар в кафе',
    description: 'Кавказская кухня, сменный график, оформление по трудовой книжке.',
    priceRub: 70_000,
    priceUnit: 'per_month',
    attributes: { employment: 'full', schedule: 'two_two', experience: 'year' },
  },
];

async function main(): Promise<void> {
  const drop = process.argv.includes('drop');

  const seller = await prisma.user.findUnique({ where: { phone: SELLER_PHONE } });

  if (drop) {
    if (seller) {
      const removed = await prisma.listing.deleteMany({ where: { sellerId: seller.id } });
      console.log(`Удалено объявлений: ${removed.count}`);
    }
    console.log('Готово.');
    return;
  }

  const city = await prisma.city.findFirst({
    where: { isActive: true, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
  });
  if (!city) throw new Error('Нет ни одного города — сначала запустите npm run db:seed');

  const passwordHash = await hash(PASSWORD, { type: argon2id });
  const user =
    seller ??
    (await prisma.user.create({
      data: {
        phone: SELLER_PHONE,
        passwordHash,
        firstName: 'Демо-продавец',
        status: 'active',
        cityId: city.id,
        isVerified: true,
      },
    }));

  const catalogue = await loadCatalogue(prisma);
  const now = new Date();
  let created = 0;

  for (const [index, demo] of DEMO.entries()) {
    const category = await prisma.listingCategory.findUnique({
      where: { slug: demo.categorySlug },
    });
    if (!category) {
      console.warn(`  категория ${demo.categorySlug} не найдена — пропускаю`);
      continue;
    }

    const existing = await prisma.listing.findFirst({
      where: { sellerId: user.id, title: demo.title },
      select: { id: true },
    });
    if (existing) continue;

    // Объявления «стареют» по одному часу: иначе все с одинаковым временем,
    // и порядок ленты не проверить
    const bumpedAt = new Date(now.getTime() - index * 60 * 60 * 1000);

    const listing = await prisma.listing.create({
      data: {
        cityId: city.id,
        categoryId: category.id,
        sellerId: user.id,
        title: demo.title,
        description: demo.description,
        price: demo.priceRub * 100,
        priceUnit: demo.priceUnit ?? 'total',
        transactionType: demo.transactionType ?? null,
        rentPeriod: demo.rentPeriod ?? null,
        contactPhone: SELLER_PHONE,
        contactName: 'Демо-продавец',
        status: 'approved',
        publishedAt: bumpedAt,
        bumpedAt,
        expiresAt: new Date(bumpedAt.getTime() + LISTING_LIFETIME_DAYS * 24 * 60 * 60 * 1000),
        attributes: demo.attributes ?? {},
        latitude: demo.point?.latitude ?? null,
        longitude: demo.point?.longitude ?? null,
        ...(demo.columns ?? {}),
      },
    });
    // Таблица значений, поисковый текст и цена за м² — как у настоящей подачи
    await reindexListing(prisma, catalogue, listing.id);
    created += 1;
  }

  console.log('');
  console.log(`Город: ${city.name}`);
  console.log(`Продавец: ${SELLER_PHONE} / ${PASSWORD}`);
  console.log(`Создано объявлений: ${created} (всего в наборе: ${DEMO.length})`);
  console.log('');
}

main()
  .catch((err: unknown) => {
    console.error('Ошибка:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
