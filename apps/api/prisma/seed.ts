/**
 * Заполнение базы начальными данными.
 *
 * Запуск: npm run db:seed
 *
 * Скрипт идемпотентен — его можно запускать сколько угодно раз: существующие
 * записи обновляются, новые добавляются, ничего не дублируется и не теряется.
 * Это важно: заполнение справочников выполняется и при каждом развёртывании
 * новой версии, когда добавились новые права доступа.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  Permission,
  ROLE_LABELS,
  RoleName,
  ATTRIBUTE_DEFINITION_LIST,
  DICTIONARY_SEEDS,
  SEED_LISTING_CATEGORIES,
  bindingsOf,
  normalizePhone,
  type SeedListingCategory,
} from '@dagestan/shared';
import { argon2id, hash as argon2Hash } from 'argon2';
import crypto from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
loadEnv({ path: path.join(REPO_ROOT, '.env'), quiet: true });
loadEnv({ path: path.join(REPO_ROOT, '.env.local'), override: true, quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Не задан DATABASE_URL. Проверьте файл .env в корне проекта.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// ═══════════════════════════════════════════════════════════════════════════
//  Описания прав для интерфейса панели управления
// ═══════════════════════════════════════════════════════════════════════════

const P = Permission;

const PERMISSION_META: Record<string, { label: string; category: string }> = {
  [P.USERS_READ]: { label: 'Просмотр пользователей', category: 'users' },
  [P.USERS_UPDATE]: { label: 'Изменение данных пользователей', category: 'users' },
  [P.USERS_BLOCK]: { label: 'Блокировка пользователей', category: 'users' },
  [P.USERS_VERIFY]: { label: 'Подтверждение верификации', category: 'users' },
  [P.USERS_DELETE]: { label: 'Удаление пользователей', category: 'users' },

  [P.ROLES_READ]: { label: 'Просмотр ролей', category: 'access' },
  [P.ROLES_MANAGE]: { label: 'Управление ролями и правами', category: 'access' },

  [P.CITIES_READ]: { label: 'Просмотр городов', category: 'catalog' },
  [P.CITIES_MANAGE]: { label: 'Управление городами', category: 'catalog' },

  [P.MODERATION_READ]: { label: 'Просмотр очереди модерации', category: 'moderation' },
  [P.MODERATION_DECIDE]: { label: 'Решения по модерации', category: 'moderation' },

  [P.REPORTS_READ]: { label: 'Просмотр жалоб', category: 'moderation' },
  [P.REPORTS_RESOLVE]: { label: 'Обработка жалоб', category: 'moderation' },

  [P.REVIEWS_READ]: { label: 'Просмотр отзывов', category: 'moderation' },
  [P.REVIEWS_MODERATE]: { label: 'Модерация отзывов', category: 'moderation' },

  [P.PARTNERS_READ]: { label: 'Просмотр партнёров', category: 'partners' },
  [P.PARTNERS_MANAGE]: { label: 'Управление партнёрами', category: 'partners' },

  [P.PLACES_READ]: { label: 'Просмотр заведений', category: 'catalog' },
  [P.PLACES_MANAGE]: { label: 'Управление заведениями', category: 'catalog' },

  [P.LISTINGS_MANAGE]: { label: 'Категории объявлений и продвижение', category: 'catalog' },

  [P.ORDERS_READ]: { label: 'Просмотр заказов', category: 'orders' },
  [P.ORDERS_MANAGE]: { label: 'Управление заказами', category: 'orders' },

  [P.NEWS_READ]: { label: 'Просмотр новостей', category: 'content' },
  [P.NEWS_MANAGE]: { label: 'Редактирование новостей', category: 'content' },
  [P.NEWS_PUBLISH]: { label: 'Публикация новостей', category: 'content' },

  [P.ADS_READ]: { label: 'Просмотр рекламы', category: 'ads' },
  [P.ADS_MANAGE]: { label: 'Управление рекламой', category: 'ads' },

  [P.FINANCE_READ]: { label: 'Просмотр финансов и комиссий', category: 'finance' },
  [P.FINANCE_MANAGE]: { label: 'Управление финансами и выплатами', category: 'finance' },

  [P.ANALYTICS_READ]: { label: 'Доступ к аналитике', category: 'analytics' },

  [P.SYSTEM_LOGS_READ]: { label: 'Просмотр технических логов', category: 'system' },
  [P.SYSTEM_ERRORS_READ]: { label: 'Просмотр ошибок приложения', category: 'system' },
  [P.SYSTEM_SETTINGS_MANAGE]: { label: 'Изменение системных настроек', category: 'system' },
  [P.SYSTEM_AUDIT_READ]: { label: 'Просмотр журнала действий', category: 'system' },

  [P.PARTNER_CABINET]: { label: 'Доступ в кабинет партнёра', category: 'partners' },
};

// ═══════════════════════════════════════════════════════════════════════════
//  Города первого этапа
// ═══════════════════════════════════════════════════════════════════════════

const CITIES = [
  {
    name: 'Махачкала',
    slug: 'makhachkala',
    latitude: 42.9849,
    longitude: 47.5047,
    sortOrder: 1,
  },
  {
    name: 'Каспийск',
    slug: 'kaspiysk',
    latitude: 42.8817,
    longitude: 47.639,
    sortOrder: 2,
  },
  {
    name: 'Дербент',
    slug: 'derbent',
    latitude: 42.0578,
    longitude: 48.29,
    sortOrder: 3,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
//  Районы
//
//  Только Махачкала официально делится на административные районы —
//  Каспийск и Дербент такого деления не имеют, придумывать районы для них
//  означало бы показывать в форме объявления несуществующие данные.
// ═══════════════════════════════════════════════════════════════════════════

const DISTRICTS = [
  { citySlug: 'makhachkala', name: 'Ленинский район', slug: 'leninsky' },
  { citySlug: 'makhachkala', name: 'Кировский район', slug: 'kirovsky' },
  { citySlug: 'makhachkala', name: 'Советский район', slug: 'sovetsky' },
];

// ═══════════════════════════════════════════════════════════════════════════
//  Кинотеатры (Этап 4 ТЗ)
//
//  Реальные кинотеатры, найденные и проверенные вручную (см.
//  docs/ADR/0004-кино-kinoplan.md). Все, кроме Дербента, работают на
//  платформе Kinoplan — идентификаторы и токены получены через её же
//  публичный API (`/api/v2/app`) с сайта каждого кинотеатра.
//  У Дербента (кинотеатр «Hayal Cinema») собственного сайта нет — записи
//  для него пока не заводим, экран корректно покажет «сеансов нет».
// ═══════════════════════════════════════════════════════════════════════════

const CINEMAS = [
  {
    citySlug: 'makhachkala',
    name: 'Парамакс',
    address: 'просп. Имама Шамиля, 64',
    websiteUrl: 'https://kino-paramax.ru',
    kinoplanToken: 'lHwxOYbbKyDx0qFPo6D7mCRBM6slPcDV',
    kinoplanCinemaId: 488,
    kinoplanCityId: 173,
    sortOrder: 1,
  },
  {
    citySlug: 'makhachkala',
    name: 'Синема Холл',
    address: 'ул. Хаджи Булача, 4А',
    websiteUrl: 'https://cinemahall24.ru',
    kinoplanToken: 'v2Zfwn4zgTD5m0Qss5WaHcLYvq1wFDFS',
    kinoplanCinemaId: 2366,
    kinoplanCityId: 173,
    sortOrder: 2,
  },
  {
    citySlug: 'makhachkala',
    name: 'Октябрь',
    address: 'ул. Коркмасова, 11',
    websiteUrl: 'https://october-kino.ru',
    kinoplanToken: 'XQ4vkxMgjWmB0moK2hxyQyyxwmTbFIAM',
    kinoplanCinemaId: 567,
    kinoplanCityId: 173,
    sortOrder: 3,
  },
  {
    citySlug: 'kaspiysk',
    name: 'Москва',
    address: 'ул. М.Халилова, 12-А',
    websiteUrl: 'https://xn--80adxajmmk6b.xn--p1ai',
    kinoplanToken: 'ONVbQyjtZDDnaO62fll116gfy1sb561H',
    kinoplanCinemaId: 731,
    kinoplanCityId: 280,
    sortOrder: 1,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
//  Настройки, которые владелец меняет без программиста (пункты 14, 19 ТЗ)
// ═══════════════════════════════════════════════════════════════════════════

const SETTINGS = [
  {
    key: 'commission.restaurant.percent',
    value: '10',
    valueType: 'number' as const,
    category: 'finance',
    label: 'Комиссия с заказов в ресторанах, %',
    description: 'Процент, удерживаемый платформой с оборота заказов ресторана за месяц.',
    isPublic: false,
  },
  {
    key: 'commission.ride.percent',
    value: '2',
    valueType: 'number' as const,
    category: 'finance',
    label: 'Комиссия с бронирования поездок, %',
    description: 'Процент с каждого оплаченного пассажирского места.',
    isPublic: false,
  },
  {
    key: 'moderation.property.required',
    value: 'true',
    valueType: 'boolean' as const,
    category: 'moderation',
    label: 'Проверять объявления недвижимости перед публикацией',
    isPublic: false,
  },
  {
    key: 'ads.rotation.seconds',
    value: '5',
    valueType: 'number' as const,
    category: 'ads',
    label: 'Интервал смены рекламных карточек, секунд',
    isPublic: true,
  },
  {
    key: 'app.terms.version',
    value: '1.0',
    valueType: 'string' as const,
    category: 'legal',
    label: 'Текущая версия условий использования',
    description:
      'При изменении версии у пользователей будет запрошено повторное согласие (требование 152-ФЗ).',
    isPublic: true,
  },
  {
    key: 'app.min_supported_version',
    value: '1.0.0',
    valueType: 'string' as const,
    category: 'app',
    label: 'Минимальная поддерживаемая версия приложения',
    description: 'Более старым версиям будет предложено обновиться.',
    isPublic: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════

async function seedPermissions(): Promise<void> {
  console.log('→ Права доступа...');

  for (const name of ALL_PERMISSIONS) {
    const meta = PERMISSION_META[name] ?? { label: name, category: 'other' };
    await prisma.permission.upsert({
      where: { name },
      create: { name, label: meta.label, category: meta.category },
      update: { label: meta.label, category: meta.category },
    });
  }

  console.log(`  создано/обновлено прав: ${ALL_PERMISSIONS.length}`);
}

async function seedRoles(): Promise<void> {
  console.log('→ Роли...');

  for (const [roleName, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: {
        name: roleName,
        label: ROLE_LABELS[roleName as RoleName],
        isSystem: true,
      },
      update: { label: ROLE_LABELS[roleName as RoleName], isSystem: true },
    });

    const permissionRecords = await prisma.permission.findMany({
      where: { name: { in: permissions } },
      select: { id: true },
    });

    // Права роли переустанавливаются целиком: так удалённое из кода право
    // исчезает и в базе, а не остаётся висеть навсегда.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissionRecords.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionRecords.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }

    console.log(`  ${ROLE_LABELS[roleName as RoleName]}: прав ${permissionRecords.length}`);
  }
}

async function seedCities(): Promise<void> {
  console.log('→ Города...');

  for (const city of CITIES) {
    await prisma.city.upsert({
      where: { slug: city.slug },
      create: city,
      // Название и координаты можно править в панели управления, поэтому
      // при повторном запуске мы их не перетираем — обновляем только порядок.
      update: { sortOrder: city.sortOrder },
    });
    console.log(`  ${city.name}`);
  }
}

async function seedDistricts(): Promise<void> {
  console.log('→ Районы...');

  for (const district of DISTRICTS) {
    const city = await prisma.city.findUnique({ where: { slug: district.citySlug } });
    if (!city) {
      console.warn(`  ! город «${district.citySlug}» не найден — пропускаем «${district.name}»`);
      continue;
    }

    await prisma.district.upsert({
      where: { cityId_slug: { cityId: city.id, slug: district.slug } },
      create: { cityId: city.id, name: district.name, slug: district.slug },
      update: { name: district.name },
    });
    console.log(`  ${district.name}`);
  }
}

async function seedCinemas(): Promise<void> {
  console.log('→ Кинотеатры...');

  for (const cinema of CINEMAS) {
    const city = await prisma.city.findUnique({ where: { slug: cinema.citySlug } });
    if (!city) {
      console.warn(`  ! город «${cinema.citySlug}» не найден — пропускаем «${cinema.name}»`);
      continue;
    }

    await prisma.cinema.upsert({
      where: { kinoplanToken: cinema.kinoplanToken },
      create: {
        cityId: city.id,
        name: cinema.name,
        address: cinema.address,
        websiteUrl: cinema.websiteUrl,
        kinoplanToken: cinema.kinoplanToken,
        kinoplanCinemaId: cinema.kinoplanCinemaId,
        kinoplanCityId: cinema.kinoplanCityId,
        sortOrder: cinema.sortOrder,
      },
      // Адрес и координаты Kinoplan можно поправить в панели управления —
      // при повторном запуске не перетираем, обновляем только порядок.
      update: { sortOrder: cinema.sortOrder },
    });
    console.log(`  ${cinema.name} (${city.name})`);
  }
}

async function seedSettings(): Promise<void> {
  console.log('→ Настройки системы...');

  for (const setting of SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      create: setting,
      // Значение НЕ перетираем: если владелец изменил ставку комиссии,
      // развёртывание новой версии не должно вернуть её к исходной.
      update: {
        label: setting.label,
        description: setting.description ?? null,
        category: setting.category,
        isPublic: setting.isPublic,
      },
    });
  }

  console.log(`  настроек: ${SETTINGS.length}`);
}

async function seedSuperAdmin(): Promise<void> {
  const rawPhone = process.env.SEED_ADMIN_PHONE ?? '+79280000000';
  const normalized = normalizePhone(rawPhone);

  if (!normalized.ok) {
    throw new Error(`Некорректный SEED_ADMIN_PHONE: ${rawPhone}`);
  }

  const phone = normalized.phone;
  const existing = await prisma.user.findUnique({ where: { phone } });

  if (existing) {
    console.log(`→ Владелец системы уже существует (${phone}) — пропускаем`);
    return;
  }

  console.log('→ Учётная запись владельца системы...');

  // Пароль генерируется случайно и показывается ОДИН раз.
  // Заранее известного пароля по умолчанию в системе быть не должно:
  // именно так взламывают большинство панелей управления.
  const password = process.env.SEED_ADMIN_PASSWORD ?? generatePassword();

  const user = await prisma.user.create({
    data: {
      phone,
      passwordHash: await argon2Hash(password, {
        type: argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      }),
      firstName: 'Владелец',
      status: 'active',
      isVerified: true,
      verifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      termsVersion: '1.0',
    },
  });

  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { name: RoleName.SUPER_ADMIN },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: superAdminRole.id } });
  await prisma.notificationPreference.create({ data: { userId: user.id } });

  console.log('');
  console.log('  ┌───────────────────────────────────────────────────────────');
  console.log('  │  СОЗДАНА УЧЁТНАЯ ЗАПИСЬ ВЛАДЕЛЬЦА СИСТЕМЫ');
  console.log('  │');
  console.log(`  │  Телефон: ${phone}`);
  console.log(`  │  Пароль:  ${password}`);
  console.log('  │');
  console.log('  │  Сохраните пароль в менеджере паролей — он больше');
  console.log('  │  нигде не отображается. Смените его после первого входа.');
  console.log('  │  Перед запуском в production обязательно включите');
  console.log('  │  двухфакторную авторизацию.');
  console.log('  └───────────────────────────────────────────────────────────');
  console.log('');
}

function generatePassword(): string {
  // Без символов, которые легко перепутать при переписывании: 0/O, 1/l/I
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(20);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/**
 * Дерево категорий объявлений.
 *
 * Названия и порядок обновляются при каждом запуске, а вот `isActive` и
 * картинку не трогаем: владелец мог выключить категорию или поставить ей
 * свою плитку, и развёртывание новой версии не должно это отменять.
 */
async function seedListingAttributes(): Promise<void> {
  console.log('→ Поля объявлений...');

  let order = 0;
  for (const definition of ATTRIBUTE_DEFINITION_LIST) {
    const data = {
      label: definition.label,
      type: definition.type,
      shortLabel: definition.shortLabel ?? null,
      unit: definition.unit ?? null,
      min: definition.min ?? null,
      max: definition.max ?? null,
      scale: definition.scale ?? null,
      options: definition.options ? JSON.parse(JSON.stringify(definition.options)) : undefined,
      dictionaryKind: definition.dictionary ?? null,
      parentKey: definition.parentKey ?? null,
      column: definition.column ?? null,
      visibleWhen: definition.visibleWhen
        ? JSON.parse(JSON.stringify(definition.visibleWhen))
        : undefined,
      filter: definition.filter,
      searchable: definition.searchable,
      filterable: definition.filterable,
      sortable: definition.sortable,
      showInCard: definition.showInCard,
      showInDetails: definition.showInDetails,
      sortOrder: order,
      isActive: true,
    };

    await prisma.listingAttributeDefinition.upsert({
      where: { key: definition.key },
      create: { key: definition.key, ...data },
      // Подписи и флаги правятся из панели, поэтому при повторном запуске
      // перезаписываем только структурное: тип, варианты, хранение
      update: {
        type: data.type,
        options: data.options,
        dictionaryKind: data.dictionaryKind,
        parentKey: data.parentKey,
        column: data.column,
        visibleWhen: data.visibleWhen ?? undefined,
        min: data.min,
        max: data.max,
        scale: data.scale,
        unit: data.unit,
      },
    });
    order += 10;
  }

  console.log(`  определений: ${ATTRIBUTE_DEFINITION_LIST.length}`);
}

async function seedListingDictionaries(): Promise<void> {
  console.log('→ Справочники значений...');

  let total = 0;
  for (const dictionary of DICTIONARY_SEEDS) {
    let order = 0;
    for (const entry of dictionary.entries) {
      const parentValue = entry.parent ?? '';
      await prisma.listingDictionaryEntry.upsert({
        where: {
          kind_parentValue_value: { kind: dictionary.kind, parentValue, value: entry.value },
        },
        create: {
          kind: dictionary.kind,
          value: entry.value,
          label: entry.label,
          parentValue,
          sortOrder: order,
          aliases: [...(entry.aliases ?? [])],
          meta: entry.meta ? { ...entry.meta } : undefined,
        },
        update: {
          label: entry.label,
          sortOrder: order,
          isActive: true,
          aliases: [...(entry.aliases ?? [])],
          meta: entry.meta ? { ...entry.meta } : undefined,
        },
      });
      order += 10;
      total += 1;
    }
  }

  console.log(`  записей: ${total}`);
}

async function seedListingCategories(): Promise<void> {
  console.log('→ Категории объявлений...');

  let count = 0;
  const idBySlug = new Map<string, string>();

  async function upsertCategory(
    category: SeedListingCategory,
    parentId: string | null,
    sortOrder: number,
  ): Promise<void> {
    const hasChildren = (category.children?.length ?? 0) > 0;

    const config = {
      name: category.name,
      parentId,
      itemLabel: category.itemLabel ?? null,
      iconKey: category.iconKey ?? null,
      allowedTransactions: [...(category.transactions ?? [])],
      defaultTransaction: category.defaultTransaction ?? null,
      defaultRentPeriod: category.defaultRentPeriod ?? null,
      allowedPriceUnits: [...(category.priceUnits ?? ['total'])],
      defaultPriceUnit: category.defaultPriceUnit ?? 'total',
      cardLayout: category.cardLayout ?? 'grid',
      shortcutFilter: category.shortcut ? JSON.parse(JSON.stringify(category.shortcut)) : undefined,
      isLeaf: !hasChildren,
      sortOrder,
    };

    const saved = await prisma.listingCategory.upsert({
      where: { slug: category.slug },
      create: { slug: category.slug, ...config },
      update: {
        ...config,
        // Снятие ярлыка — явное: пустой shortcut в исходнике убирает его
        shortcutFilter: config.shortcutFilter ?? undefined,
      },
    });
    idBySlug.set(category.slug, saved.id);
    count += 1;

    // Привязки полей: заново по исходнику. Лишние отвязываются — значения
    // у объявлений при этом остаются в базе и вернутся, если поле вернуть
    const bindings = bindingsOf(category);
    await prisma.listingCategoryAttribute.deleteMany({
      where: { categoryId: saved.id, attributeKey: { notIn: bindings.map((b) => b.key) } },
    });
    let bindingOrder = 0;
    for (const binding of bindings) {
      const data = {
        required: binding.required ?? false,
        label: binding.label ?? null,
        dictionaryKind: binding.dictionary ?? null,
        min: binding.min ?? null,
        max: binding.max ?? null,
        sortOrder: bindingOrder,
      };
      await prisma.listingCategoryAttribute.upsert({
        where: { categoryId_attributeKey: { categoryId: saved.id, attributeKey: binding.key } },
        create: { categoryId: saved.id, attributeKey: binding.key, ...data },
        update: data,
      });
      bindingOrder += 10;
    }

    let childOrder = 0;
    for (const child of category.children ?? []) {
      await upsertCategory(child, saved.id, childOrder);
      childOrder += 10;
    }
  }

  let order = 0;
  const slugs: string[] = [];
  const deprecated: { slug: string; to: string }[] = [];
  const collect = (category: SeedListingCategory): void => {
    slugs.push(category.slug);
    if (category.deprecatedTo) deprecated.push({ slug: category.slug, to: category.deprecatedTo });
    for (const child of category.children ?? []) collect(child);
  };

  for (const category of SEED_LISTING_CATEGORIES) {
    collect(category);
    await upsertCategory(category, null, order);
    order += 10;
  }

  // Снятые категории: выключаются и указывают на преемника. Объявления
  // переносит отдельный скрипт (scripts/migrate-listings-v2.ts)
  for (const item of deprecated) {
    const toId = idBySlug.get(item.to);
    if (!toId) continue;
    await prisma.listingCategory.update({
      where: { slug: item.slug },
      data: { isActive: false, deprecatedToId: toId },
    });
  }

  // Категории, которых больше нет в справочнике, выключаем, а не удаляем:
  // в них могут лежать уже поданные объявления, и удаление оставило бы их
  // без категории. Выключенная не показывается в приложении, но открывается
  // по прямой ссылке — и сотрудник может перенести объявления из неё.
  const removed = await prisma.listingCategory.updateMany({
    where: { slug: { notIn: slugs }, isActive: true },
    data: { isActive: false },
  });

  console.log(`  создано/обновлено категорий: ${count}`);
  if (deprecated.length > 0) console.log(`  снятых с преемником: ${deprecated.length}`);
  if (removed.count > 0) console.log(`  выключено устаревших: ${removed.count}`);
}

async function main(): Promise<void> {
  console.log('');
  console.log('Заполнение базы данных начальными данными');
  console.log('═════════════════════════════════════════');

  await seedPermissions();
  await seedRoles();
  await seedCities();
  await seedDistricts();
  await seedCinemas();
  await seedListingAttributes();
  await seedListingDictionaries();
  await seedListingCategories();
  await seedSettings();
  await seedSuperAdmin();

  console.log('Готово.');
  console.log('');
}

main()
  .catch((err: unknown) => {
    console.error('Ошибка при заполнении базы:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
