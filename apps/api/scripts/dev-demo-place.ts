/**
 * Демонстрационное заведение для локальной проверки Этапа 6.
 *
 * Каталог заведений наполняется владельцем после договоров, поэтому в базе
 * по умолчанию пусто и посмотреть на рубрику «Заказать» не на чем. Скрипт
 * создаёт одно заведение с меню и двумя аккаунтами кабинета — управляющим и
 * сотрудником — чтобы можно было пройти сценарий целиком на своём телефоне.
 *
 *   npm run dev:demo-place --workspace @dagestan/api          # создать
 *   npm run dev:demo-place --workspace @dagestan/api -- drop  # удалить
 *
 * Это инструмент разработки: пароль здесь один на всех и лежит открытым.
 * На боевом сервере запускать нельзя — скрипт откажется, если NODE_ENV
 * выставлен в production.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

import { PrismaClient } from '../src/generated/prisma/client.js';

loadEnv({ path: path.resolve(import.meta.dirname, '..', '..', '..', '.env'), quiet: true });

if (process.env.NODE_ENV === 'production') {
  throw new Error('Демо-данные нельзя заводить на боевом сервере');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PASSWORD = 'Demo-Place-2026!';
const MANAGER_PHONE = '+79990002233';
const STAFF_PHONE = '+79990003344';
const PLACE_NAME = 'Демо-шашлычная';

/** Часы: будни до 23:00, с пятницы по воскресенье до 02:00 (минуты от полуночи). */
const SCHEDULE = [
  { weekday: 1, opensMinute: 600, closesMinute: 1380 },
  { weekday: 2, opensMinute: 600, closesMinute: 1380 },
  { weekday: 3, opensMinute: 600, closesMinute: 1380 },
  { weekday: 4, opensMinute: 600, closesMinute: 1380 },
  { weekday: 5, opensMinute: 600, closesMinute: 120 },
  { weekday: 6, opensMinute: 600, closesMinute: 120 },
  { weekday: 7, opensMinute: 600, closesMinute: 120 },
];

/**
 * Демонстрационное меню: два раздела, позиции с группами выбора и одна
 * в стоп-листе — чтобы на экранах было видно все состояния, а не одно.
 */
interface DemoDish {
  name: string;
  description: string;
  price: number;
  portion: string;
  isAvailable?: boolean;
  groups?: {
    name: string;
    minChoices: number;
    maxChoices: number;
    options: { name: string; priceDelta: number }[];
  }[];
}

const MENU: { name: string; items: DemoDish[] }[] = [
  {
    name: 'Шашлыки',
    items: [
      {
        name: 'Шашлык из баранины',
        description: 'На углях, подаётся с луком и лавашом',
        price: 99_900,
        portion: '250 г',
        groups: [
          {
            name: 'Соус',
            minChoices: 1,
            maxChoices: 1,
            options: [
              { name: 'Без соуса', priceDelta: 0 },
              { name: 'Томатный', priceDelta: 5_000 },
              { name: 'Чесночный', priceDelta: 5_000 },
              { name: 'Острый', priceDelta: 5_000 },
            ],
          },
          {
            name: 'Добавить',
            minChoices: 0,
            maxChoices: 2,
            options: [
              { name: 'Лаваш', priceDelta: 3_000 },
              { name: 'Дополнительная порция лука', priceDelta: 3_000 },
            ],
          },
        ],
      },
      {
        name: 'Люля-кебаб из говядины',
        description: 'С зеленью и лавашом',
        price: 65_000,
        portion: '200 г',
      },
      {
        name: 'Шашлык из курицы',
        description: 'Филе в маринаде на гриле',
        price: 55_000,
        portion: '250 г',
        isAvailable: false,
      },
    ],
  },
  {
    name: 'Горячее',
    items: [
      {
        name: 'Хинкал аварский',
        description: 'Традиционный хинкал с мясом',
        price: 55_000,
        portion: '1 порция',
      },
      {
        name: 'Чуду с мясом',
        description: 'Тонкое тесто, сочная начинка',
        price: 28_000,
        portion: '1 шт.',
      },
    ],
  },
];

async function drop(): Promise<void> {
  const place = await prisma.place.findFirst({ where: { name: PLACE_NAME } });

  if (place) {
    // Заказы держат заведение через onDelete: Restrict — это правильно для
    // боевых данных, но демонстрационные убираем целиком
    await prisma.order.deleteMany({ where: { placeId: place.id } });
    await prisma.place.delete({ where: { id: place.id } });
  }

  for (const phone of [MANAGER_PHONE, STAFF_PHONE]) {
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) continue;

    await prisma.order.deleteMany({ where: { userId: user.id } });
    await prisma.placeMember.deleteMany({ where: { userId: user.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }

  console.log('Демо-данные удалены');
}

async function create(): Promise<void> {
  const city = await prisma.city.findFirstOrThrow({ where: { slug: 'makhachkala' } });
  const passwordHash = await hash(PASSWORD, { type: argon2id });

  const accounts = [
    { phone: MANAGER_PHONE, firstName: 'Демо Управляющий', role: 'manager' as const },
    { phone: STAFF_PHONE, firstName: 'Демо Сотрудник', role: 'staff' as const },
  ];

  const place = await prisma.place.create({
    data: {
      cityId: city.id,
      type: 'restaurant',
      name: PLACE_NAME,
      description: 'Заведение для проверки рубрики «Заказать». Настоящих заказов не принимает.',
      address: 'проспект Имама Шамиля, 1',
      phone: '+79280000001',
      cuisines: ['кавказская', 'шашлык'],
      averageCheck: 80_000,
      ordersEnabled: true,
      hasDelivery: true,
      hasPickup: true,
      deliveryFee: 15_000,
      freeDeliveryFrom: 150_000,
      minOrderAmount: 50_000,
      deliveryMinutes: 45,
      schedules: { create: SCHEDULE },
    },
  });

  // placeId у позиции дублируется намеренно: так проверка «все позиции заказа
  // из одного заведения» делается одним запросом
  for (const [index, group] of MENU.entries()) {
    const category = await prisma.menuCategory.create({
      data: { placeId: place.id, name: group.name, sortOrder: index },
    });

    for (const [position, dish] of group.items.entries()) {
      await prisma.menuItem.create({
        data: {
          placeId: place.id,
          categoryId: category.id,
          name: dish.name,
          description: dish.description,
          price: dish.price,
          portion: dish.portion,
          sortOrder: position,
          isAvailable: dish.isAvailable ?? true,
          groups: dish.groups
            ? {
                create: dish.groups.map((optionGroup, groupIndex) => ({
                  name: optionGroup.name,
                  minChoices: optionGroup.minChoices,
                  maxChoices: optionGroup.maxChoices,
                  sortOrder: groupIndex,
                  options: {
                    create: optionGroup.options.map((option, optionIndex) => ({
                      name: option.name,
                      priceDelta: option.priceDelta,
                      sortOrder: optionIndex,
                    })),
                  },
                })),
              }
            : undefined,
        },
      });
    }
  }

  for (const account of accounts) {
    const user = await prisma.user.upsert({
      where: { phone: account.phone },
      update: { passwordHash, status: 'active', isVerified: true },
      create: {
        phone: account.phone,
        passwordHash,
        firstName: account.firstName,
        status: 'active',
        isVerified: true,
        verifiedAt: new Date(),
        termsAcceptedAt: new Date(),
        termsVersion: '1.0',
      },
    });

    await prisma.placeMember.create({
      data: { placeId: place.id, userId: user.id, role: account.role },
    });

    console.log(`${account.firstName}: ${account.phone} / ${PASSWORD}`);
  }

  console.log(`Заведение «${PLACE_NAME}» создано: ${place.id}`);
}

const command = process.argv[2];

await (command === 'drop' ? drop() : drop().then(create));
await prisma.$disconnect();
