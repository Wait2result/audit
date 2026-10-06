/**
 * Публикация объявления от начала до конца — сценарий на живом сервере
 * (аудит, п. 36–40). Запуск: node test/e2e/listing-publish.mjs
 *
 *   1. Основные категории публикуются: автомобиль, квартира (продажа, аренда
 *      посуточно и надолго), дом, телефон, запчасть.
 *   2. Повторная отправка той же формы (тот же ключ повтора) не создаёт
 *      дубликат; два нажатия подряд — тоже.
 *   3. Битое фото: объявление не создаётся вовсе (раньше публиковалось без
 *      фото, а повтор создавал второе).
 *   4. Ошибка проверки называет поле, а не «проверьте данные».
 *   5. Продажа — без «можно с животными / с детьми», аренда — с ними; цена
 *      аренды в ₽/мес и ₽/сут.
 *   6. Санузел дома: «В доме», «На улице», «В доме + На улице»; фильтр.
 *   7. Запчасть: номер запчасти и номер замены; поиск по обоим и по кузову
 *      из «Подходит к»; в карточке — номер без «OEM».
 */

const BASE = 'http://localhost:3000/api/v1';
const PASSWORD = 'Gorets2024';

let passed = 0;
let failed = 0;
const check = (condition, name, detail = '') => {
  if (condition) passed++;
  else failed++;
  console.log(`  ${condition ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

const ipOf = new Map();
const randomIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const DEFAULT_IP = randomIp();

async function call(method, path, body, token, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'X-Forwarded-For': ipOf.get(token) ?? DEFAULT_IP,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* пусто */
  }
  return { status: res.status, body: json };
}

async function register(name) {
  const ip = randomIp();
  const phone = `8928${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
  const withIp = (method, path, body) =>
    fetch(BASE + path, {
      method,
      headers: { 'X-Forwarded-For': ip, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) => res.json());
  const otp = await withIp('POST', '/auth/otp/request', { phone, purpose: 'registration' });
  const verified = await withIp('POST', '/auth/otp/verify', {
    phone,
    code: otp.devCode,
    purpose: 'registration',
  });
  const registered = await withIp('POST', '/auth/register', {
    verificationToken: verified.verificationToken,
    password: PASSWORD,
    firstName: name,
    acceptedTerms: true,
  });
  const token = registered.tokens?.accessToken;
  if (!token) {
    console.log('Не удалось зарегистрировать пользователя:', registered);
    process.exit(1);
  }
  ipOf.set(token, ip);
  return token;
}

console.log('\nПубликация объявления');
console.log('═════════════════════\n');

const cities = (await call('GET', '/cities')).body;
const cityId = cities.find((city) => city.slug === 'makhachkala').id;
const tree = (await call('GET', '/listings/categories?withAttributes=1')).body;
const leaves = tree.flatMap(function leavesOf(node) {
  return node.children?.length ? node.children.flatMap(leavesOf) : [node];
});
const bySlug = Object.fromEntries(leaves.map((leaf) => [leaf.slug, leaf]));
const TAG = `Публ${Math.floor(Math.random() * 90000) + 10000}`;

/** Обязательные характеристики: первое допустимое значение, если не задано. */
async function requiredAttributes(slug, overrides = {}) {
  const result = { ...overrides };
  for (const field of bySlug[slug].attributes ?? []) {
    if (!field.required || result[field.key] !== undefined) continue;
    if (field.type === 'enum') result[field.key] = field.options[0].value;
    else if (field.type === 'multiEnum') result[field.key] = [field.options[0].value];
    else if (field.type === 'number') result[field.key] = Math.max(field.min ?? 1, 1);
    else if (field.type === 'boolean') result[field.key] = true;
    else if (field.type === 'brand' || field.type === 'model') {
      const parent = field.parentKey ? result[field.parentKey] : undefined;
      const query = parent ? `?parent=${encodeURIComponent(parent)}` : '';
      const entries = (await call('GET', `/listings/dictionaries/${field.dictionary}${query}`))
        .body;
      result[field.key] = entries[0].value;
    } else result[field.key] = 'Тест';
  }
  return result;
}

let token = await register('Продавец');
let postedByOwner = 0;

async function body(slug, { title, deal = {}, attributes = {}, price = 250_000_00, extra = {} }) {
  return {
    cityId,
    categoryId: bySlug[slug].id,
    title: `${title} ${TAG}`,
    description: 'Описание объявления для проверки публикации.',
    ...(price === null ? {} : { price }),
    isNegotiable: false,
    attributes: await requiredAttributes(slug, attributes),
    location: { latitude: 42.9849, longitude: 47.5047, accuracy: 'point' },
    contactPhone: '+79501234567',
    allowChat: true,
    allowCalls: true,
    photoIds: [],
    ...deal,
    ...extra,
  };
}

/** Подаёт объявление. Каждые несколько — новый продавец: у подачи суточный предел. */
async function post(slug, options, headers = {}) {
  if (postedByOwner >= 7) {
    token = await register('Продавец');
    postedByOwner = 0;
  }
  postedByOwner += 1;
  const response = await call('POST', '/my/listings', await body(slug, options), token, headers);
  response.token = token;
  return response;
}

const ok = (response) => response.status === 201 || response.status === 200;
const repeatKey = () => `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// ── 1. Основные категории ────────────────────────────────────────────────
console.log('1. Основные категории публикуются');
const car = await post('transport-cars', {
  title: 'Toyota Succeed',
  deal: { transactionType: 'sale', priceUnit: 'total' },
  attributes: { year: 2016, mileage: 120_000 },
});
check(ok(car), 'автомобиль', `статус ${car.status}`);
const phoneListing = await post('electronics-phones', {
  title: 'Телефон',
  deal: { transactionType: 'sale', priceUnit: 'total' },
});
check(ok(phoneListing), 'телефон', `статус ${phoneListing.status}`);

// ── 2. Повтор без дубликата ──────────────────────────────────────────────
console.log('\n2. Повторная отправка не создаёт дубликат');
const key = repeatKey();
const first = await post(
  'electronics-phones',
  { title: 'Повтор', deal: { transactionType: 'sale', priceUnit: 'total' } },
  { 'Idempotency-Key': key },
);
const again = await call(
  'POST',
  '/my/listings',
  await body('electronics-phones', {
    title: 'Повтор',
    deal: { transactionType: 'sale', priceUnit: 'total' },
  }),
  first.token,
  { 'Idempotency-Key': key },
);
check(ok(first) && ok(again), 'обе отправки успешны', `${first.status} / ${again.status}`);
check(first.body?.id === again.body?.id, 'вторая отправка вернула то же объявление');
const mine = (await call('GET', '/my/listings?limit=50', undefined, first.token)).body;
const copies = (mine?.items ?? []).filter((item) => item.title === `Повтор ${TAG}`);
check(copies.length === 1, 'в «Моих объявлениях» одно, а не два', `найдено ${copies.length}`);

// Два нажатия подряд, без ожидания ответа
const twinKey = repeatKey();
const twinBody = await body('electronics-phones', {
  title: 'Двойное нажатие',
  deal: { transactionType: 'sale', priceUnit: 'total' },
});
const [tapA, tapB] = await Promise.all([
  call('POST', '/my/listings', twinBody, token, { 'Idempotency-Key': twinKey }),
  call('POST', '/my/listings', twinBody, token, { 'Idempotency-Key': twinKey }),
]);
postedByOwner += 1;
const created = [tapA, tapB].filter(ok);
check(
  created.length >= 1 && new Set(created.map((r) => r.body.id)).size === 1,
  'два нажатия подряд — одно объявление',
  `${tapA.status} / ${tapB.status}`,
);
const busy = [tapA, tapB].find((r) => r.status === 409);
if (busy) check(/публикуется/.test(busy.body?.message ?? ''), 'второе нажатие: «уже публикуется»');

// ── 3. Битое фото ────────────────────────────────────────────────────────
console.log('\n3. Битое фото — объявление не создаётся');
const before = (await call('GET', '/my/listings?limit=50', undefined, token)).body?.total;
const broken = await post('electronics-phones', {
  title: 'С битым фото',
  deal: { transactionType: 'sale', priceUnit: 'total' },
  extra: { photoIds: ['00000000-0000-4000-8000-000000000000'] },
});
check(broken.status === 400, 'ответ 400', `статус ${broken.status}`);
check(
  /фотограф/i.test(broken.body?.message ?? ''),
  'понятная причина про фото',
  broken.body?.message,
);
const after = (await call('GET', '/my/listings?limit=50', undefined, broken.token)).body?.total;
check(after === before, 'объявление без фото не появилось', `${before} → ${after}`);

// ── 4. Ошибка называет поле ──────────────────────────────────────────────
console.log('\n4. Ошибка проверки называет поле');
const badMileage = await post('transport-cars', {
  title: 'Пробег вне пределов',
  deal: { transactionType: 'sale', priceUnit: 'total' },
  attributes: { year: 2016, mileage: -5 },
});
check(badMileage.status === 400, 'ответ 400', `статус ${badMileage.status}`);
check(
  (badMileage.body?.details ?? []).some((item) => String(item.field).includes('mileage')),
  'в подробностях — поле «пробег»',
  JSON.stringify(badMileage.body?.details ?? null).slice(0, 120),
);

// ── 5. Продажа и аренда ──────────────────────────────────────────────────
console.log('\n5. Недвижимость: продажа и аренда');
const RENT_TERMS = { petsAllowed: true, childrenAllowed: true };
const flatSale = await post('realty-flats', {
  title: 'Квартира продажа',
  deal: { transactionType: 'sale', priceUnit: 'total' },
  attributes: { rooms: 2, areaTotal: 54, ...RENT_TERMS },
  price: 6_000_000_00,
});
check(ok(flatSale), 'продажа опубликована', `статус ${flatSale.status}`);
const saleDetails = (
  await call('GET', `/my/listings/${flatSale.body?.id}`, undefined, flatSale.token)
).body;
check(
  saleDetails?.attributes?.petsAllowed === undefined &&
    saleDetails?.attributes?.childrenAllowed === undefined,
  'у продажи «можно с животными / с детьми» не сохранено',
);
const flatMonth = await post('realty-flats', {
  title: 'Квартира надолго',
  deal: { transactionType: 'rent', rentPeriod: 'monthly', priceUnit: 'per_month' },
  attributes: { rooms: 1, areaTotal: 35, ...RENT_TERMS },
  price: 25_000_00,
});
check(ok(flatMonth), 'аренда надолго опубликована', `статус ${flatMonth.status}`);
const monthDetails = (
  await call('GET', `/my/listings/${flatMonth.body?.id}`, undefined, flatMonth.token)
).body;
check(
  monthDetails?.attributes?.petsAllowed === true &&
    monthDetails?.attributes?.childrenAllowed === true,
  'у аренды условия сохранены',
);
check(
  monthDetails?.price?.unit === 'per_month',
  'цена аренды надолго — ₽/мес',
  monthDetails?.price?.unit,
);
const flatDay = await post('realty-flats', {
  title: 'Квартира посуточно',
  deal: { transactionType: 'rent', rentPeriod: 'daily', priceUnit: 'per_day' },
  attributes: { rooms: 1, areaTotal: 30 },
  price: 2_500_00,
});
check(ok(flatDay), 'посуточная аренда опубликована', `статус ${flatDay.status}`);
check(flatDay.body?.price?.unit === 'per_day', 'цена посуточно — ₽/сут', flatDay.body?.price?.unit);
const wrongUnit = await post('realty-flats', {
  title: 'Посуточно за месяц',
  deal: { transactionType: 'rent', rentPeriod: 'daily', priceUnit: 'per_month' },
  attributes: { rooms: 1, areaTotal: 30 },
  price: 2_500_00,
});
check(wrongUnit.status === 400, 'посуточно с ценой за месяц — отказ', `статус ${wrongUnit.status}`);

// ── 6. Санузел ───────────────────────────────────────────────────────────
console.log('\n6. Санузел дома');
const houses = {};
for (const [name, value] of [
  ['в доме', ['inside']],
  ['на улице', ['outside']],
  ['в доме и на улице', ['inside', 'outside']],
]) {
  const house = await post('realty-houses', {
    title: `Дом санузел ${name}`,
    deal: { transactionType: 'sale', priceUnit: 'total' },
    attributes: { areaTotal: 120, landArea: 6, bathroomLocation: value },
    price: 9_000_000_00,
  });
  check(ok(house), `санузел ${name}: опубликован`, `статус ${house.status}`);
  const saved = (await call('GET', `/my/listings/${house.body?.id}`, undefined, house.token)).body;
  check(
    JSON.stringify(saved?.attributes?.bathroomLocation) === JSON.stringify(value),
    `санузел ${name}: сохранено ${JSON.stringify(value)}`,
    JSON.stringify(saved?.attributes?.bathroomLocation),
  );
  houses[name] = house.body?.id;
}
const insideFilter = encodeURIComponent(JSON.stringify({ bathroomLocation: ['inside'] }));
const found = (
  await call(
    'GET',
    `/listings?category=realty-houses&regionWide=true&limit=50&search=${encodeURIComponent(TAG)}&attributes=${insideFilter}`,
  )
).body;
const foundIds = new Set((found?.items ?? []).map((item) => item.id));
check(
  foundIds.has(houses['в доме']) && foundIds.has(houses['в доме и на улице']),
  'фильтр «В доме» находит и «в доме», и «в доме и на улице»',
);
check(!foundIds.has(houses['на улице']), 'и не находит «только на улице»');

// ── 7. Запчасть: номера и кузов ──────────────────────────────────────────
console.log('\n7. Запчасть: номер, номер замены, кузов');
const main = `45510-${Math.floor(Math.random() * 90000) + 10000}`;
const replacement = `45510-${Math.floor(Math.random() * 90000) + 10000}`;
const part = await post('transport-parts', {
  title: 'Рулевая рейка',
  deal: { transactionType: 'sale', priceUnit: 'total' },
  attributes: {
    partGroup: 'steering',
    partItem: 'steering_rack',
    partCondition: 'used',
    partOriginality: 'analog',
    partManufacturer: 'kyb',
  },
  extra: {
    part: {
      numbers: [
        { kind: 'manufacturer', value: main },
        { kind: 'replacement', value: replacement },
      ],
      compatibility: [
        { brand: 'toyota', model: 'succeed', chassis: 'NCP165', yearFrom: 2015, yearTo: 2020 },
      ],
    },
  },
});
check(ok(part), 'запчасть с номером и номером замены опубликована', `статус ${part.status}`);
const search = async (text) =>
  (
    await call(
      'GET',
      `/listings?category=transport-parts&regionWide=true&limit=20&search=${encodeURIComponent(text)}`,
    )
  ).body?.items ?? [];
check(
  (await search(main)).some((item) => item.id === part.body?.id),
  'находится по номеру запчасти',
);
check(
  (await search(replacement)).some((item) => item.id === part.body?.id),
  'находится по номеру замены',
);
check(
  (await search('NCP165')).some((item) => item.id === part.body?.id),
  'находится по номеру кузова',
);
const card = (await search(main)).find((item) => item.id === part.body?.id);
check(
  Boolean(card?.attributesSummary?.includes(main)),
  'в карточке номер',
  card?.attributesSummary,
);
check(!/OEM/.test(card?.attributesSummary ?? ''), 'в карточке нет «OEM»');
check(
  /Succeed NCP165 2015–2020/.test(card?.attributesSummary ?? ''),
  'совместимость в карточке коротко',
  card?.attributesSummary,
);
check(!/Подходит:/.test(card?.attributesSummary ?? ''), 'без длинного «Подходит: Toyota …»');

console.log(`\nИтого: ${passed} ✅, ${failed} ❌\n`);
process.exit(failed === 0 ? 0 : 1);
