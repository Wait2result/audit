/**
 * Фильтры и выдача: смысл выбора (один вариант, несколько, диапазон, флажок),
 * И между фильтрами, ИЛИ внутри одного, цена в своей единице, пустая выдача,
 * порядок, страницы, число, карта, поиск вместе с фильтром.
 * Запуск: node test/e2e/listing-filters.mjs (сервер на :3000)
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

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'X-Forwarded-For': ipOf.get(token) ?? DEFAULT_IP,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

async function register() {
  const ip = randomIp();
  const phone = `8928${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
  const send = (path, body) =>
    fetch(BASE + path, {
      method: 'POST',
      headers: { 'X-Forwarded-For': ip, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) => res.json());
  const otp = await send('/auth/otp/request', { phone, purpose: 'registration' });
  const verified = await send('/auth/otp/verify', {
    phone,
    code: otp.devCode,
    purpose: 'registration',
  });
  const registered = await send('/auth/register', {
    verificationToken: verified.verificationToken,
    password: PASSWORD,
    firstName: 'Продавец',
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

console.log('\nФильтры и выдача объявлений');
console.log('═══════════════════════════\n');

const cities = (await call('GET', '/cities')).body;
const cityId = cities.find((city) => city.slug === 'makhachkala').id;
const tree = (await call('GET', '/listings/categories?withAttributes=1')).body;
const leaves = tree.flatMap(function leavesOf(node) {
  return node.children?.length ? node.children.flatMap(leavesOf) : [node];
});
const bySlug = Object.fromEntries(leaves.map((leaf) => [leaf.slug, leaf]));
const TAG = `Фил${Math.floor(Math.random() * 90000) + 10000}`;

let token = await register();
let posted = 0;

async function post(slug, { title, attributes, deal = {}, price = 100_000_00 }) {
  if (posted >= 6) {
    token = await register();
    posted = 0;
  }
  posted += 1;
  const response = await call(
    'POST',
    '/my/listings',
    {
      cityId,
      categoryId: bySlug[slug].id,
      title: `${title} ${TAG}`,
      description: 'Проверка фильтров и выдачи объявлений.',
      price,
      isNegotiable: false,
      transactionType: 'sale',
      priceUnit: 'total',
      ...deal,
      attributes,
      location: { latitude: 42.9849, longitude: 47.5047, accuracy: 'point' },
      contactPhone: '+79501234567',
      allowChat: true,
      allowCalls: true,
      photoIds: [],
    },
    token,
  );
  if (response.status !== 201) console.log('     ', JSON.stringify(response.body).slice(0, 300));
  return response.body?.id;
}

/** Выдача этого прогона: id по порядку, число и курсор. */
async function feed(slug, params = {}, attributes = {}) {
  const query = new URLSearchParams({
    category: slug,
    regionWide: 'true',
    limit: '50',
    search: TAG,
    ...params,
    ...(Object.keys(attributes).length > 0 ? { attributes: JSON.stringify(attributes) } : {}),
  });
  const page = (await call('GET', `/listings?${query}`)).body;
  return { ids: (page?.items ?? []).map((item) => item.id), total: page?.total, page };
}
const same = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ── 1. Автомобили LADA ──────────────────────────────────────────────────
console.log('1. LADA: марка, модели, кузов, топливо, привод, КПП');
const car = (title, model, extra, price) =>
  post('transport-cars', {
    title,
    attributes: { brand: 'lada', model, year: 2019, ...extra },
    price,
  });
const granta = await car(
  'LADA Granta седан',
  'granta',
  { bodyType: 'sedan', fuel: 'petrol', drive: 'front', gearbox: 'auto', mileage: 80_000 },
  650_000_00,
);
const vesta = await car(
  'LADA Vesta хэтчбек',
  'vesta',
  { bodyType: 'hatchback', fuel: 'gas', drive: 'front', gearbox: 'manual', mileage: 120_000 },
  900_000_00,
);
const largus = await car(
  'LADA Largus универсал',
  'largus',
  { bodyType: 'wagon', fuel: 'petrol', drive: 'front', gearbox: 'manual', mileage: 200_000 },
  800_000_00,
);
const niva = await car(
  'LADA Niva внедорожник',
  'niva_legend',
  { bodyType: 'suv', fuel: 'petrol', drive: 'full', gearbox: 'manual', mileage: 40_000 },
  900_000_00,
);
check([granta, vesta, largus, niva].every(Boolean), 'четыре LADA опубликованы');
const lada = { brand: 'lada' };

let r = await feed('transport-cars', {}, { ...lada, bodyType: ['sedan', 'hatchback'] });
check(
  same(r.ids, [granta, vesta]) && r.total === 2,
  'кузов «Седан или Хэтчбек» — Granta и Vesta',
  `${r.total}`,
);
r = await feed('transport-cars', {}, { ...lada, bodyType: ['sedan', 'hatchback', 'suv', 'wagon'] });
check(r.total === 4, 'четыре кузова — все четыре');
r = await feed('transport-cars', {}, { ...lada, model: ['granta', 'vesta'] });
check(same(r.ids, [granta, vesta]), 'модели «Granta или Vesta»');
r = await feed('transport-cars', {}, { ...lada, model: 'granta' });
check(same(r.ids, [granta]), 'одна модель — только Granta');
r = await feed('transport-cars', {}, lada);
check(r.total === 4, 'модель снята — снова все модели LADA');
r = await feed('transport-cars', {}, { ...lada, drive: ['front', 'full'] });
check(r.total === 4, 'привод «Передний или Полный» — все');
r = await feed('transport-cars', {}, { ...lada, drive: ['full'] });
check(same(r.ids, [niva]), 'привод «Полный» — Niva');
r = await feed('transport-cars', {}, { ...lada, gearbox: ['auto', 'variator'] });
check(same(r.ids, [granta]), 'КПП «Автомат или Вариатор» — Granta');
r = await feed('transport-cars', {}, { ...lada, fuel: ['petrol', 'gas'] });
check(r.total === 4, 'топливо «Бензин или Газ» — все');
r = await feed(
  'transport-cars',
  {},
  { ...lada, bodyType: ['sedan', 'hatchback'], fuel: ['petrol'] },
);
check(same(r.ids, [granta]), 'И между фильтрами: (Седан или Хэтчбек) и Бензин — Granta');
r = await feed(
  'transport-cars',
  {},
  { ...lada, bodyType: ['sedan', 'hatchback'], fuel: ['petrol'], mileage: { to: 150_000 } },
);
check(same(r.ids, [granta]), '… и пробег до 150 000');
r = await feed('transport-cars', {}, { ...lada, fuel: 'petrol' });
check(r.total === 3, 'одно значение строкой (умный поиск) — тоже работает');
r = await feed('transport-cars', {}, { ...lada, mileage: { from: 50_000, to: 150_000 } });
check(same(r.ids, [granta, vesta]), 'пробег 50–150 тыс. — диапазон, а не точное число');
r = await feed(
  'transport-cars',
  { priceFrom: String(700_000_00), priceTo: String(850_000_00) },
  lada,
);
check(same(r.ids, [largus]), 'цена 700–850 тыс. — Largus');

// ── 2. Пустая выдача ────────────────────────────────────────────────────
console.log('\n2. Пустая выдача');
r = await feed('transport-cars', {}, { ...lada, bodyType: ['pickup'] });
check(r.total === 0 && r.ids.length === 0, '«Пикап» — ноль, а не весь каталог');
const unknownModel = await feed(
  'transport-cars',
  {},
  { ...lada, model: 'granta', drive: ['full'] },
);
check(unknownModel.total === 0, 'Granta с полным приводом — ноль');
const emptyNoTag = (
  await call(
    'GET',
    `/listings?category=transport-cars&regionWide=true&limit=5&attributes=${encodeURIComponent(JSON.stringify({ bodyType: ['pickup'], brand: 'lada', model: 'granta' }))}`,
  )
).body;
check(emptyNoTag?.total === 0 && emptyNoTag.items.length === 0, 'без поиска тоже ноль');

// ── 3. Поиск вместе с фильтром ──────────────────────────────────────────
console.log('\n3. Поиск + фильтр');
const searchFeed = async (text, attributes) => {
  const query = new URLSearchParams({
    category: 'transport-cars',
    regionWide: 'true',
    limit: '50',
    search: `${text} ${TAG}`,
    attributes: JSON.stringify(attributes),
  });
  return ((await call('GET', `/listings?${query}`)).body?.items ?? []).map((item) => item.id);
};
check(
  same(await searchFeed('Granta', { fuel: ['petrol'] }), [granta]),
  '«Granta» + бензин — Granta',
);
check(
  (await searchFeed('Granta', { fuel: ['gas'] })).length === 0,
  '«Granta» + газ — ничего, а не весь раздел',
);
// Поиск нечёткий (опечатки), поэтому без фильтра важен порядок: найденное по слову — первым
check((await searchFeed('Vesta', {}))[0] === vesta, 'только поиск — Vesta первой');

// ── 4. Порядок и страницы ───────────────────────────────────────────────
console.log('\n4. Порядок и страницы');
const prices = {
  [granta]: 650_000_00,
  [vesta]: 900_000_00,
  [largus]: 800_000_00,
  [niva]: 900_000_00,
};
r = await feed('transport-cars', { sort: 'price_asc' }, lada);
check(
  r.ids.every((id, i) => i === 0 || prices[r.ids[i - 1]] <= prices[id]),
  'цена по возрастанию',
  r.ids.map((id) => prices[id] / 100).join(' → '),
);
r = await feed('transport-cars', { sort: 'price_desc' }, lada);
check(
  r.ids.every((id, i) => i === 0 || prices[r.ids[i - 1]] >= prices[id]),
  'цена по убыванию',
);
for (const sort of ['recommended', 'date', 'price_asc', 'price_desc']) {
  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const query = new URLSearchParams({
      category: 'transport-cars',
      regionWide: 'true',
      limit: '1',
      search: TAG,
      sort,
      attributes: JSON.stringify(lada),
      freshBefore: new Date().toISOString(),
      ...(cursor ? { cursor } : {}),
    });
    const page = (await call('GET', `/listings?${query}`)).body;
    seen.push(...(page?.items ?? []).map((item) => item.id));
    cursor = page?.nextCursor ?? null;
    pages += 1;
  } while (cursor && pages < 10);
  check(
    seen.length === 4 && new Set(seen).size === 4 && pages === 4,
    `«${sort}»: 4 страницы по одной — без повторов и пропусков, конец`,
    `${seen.length}/${new Set(seen).size}, страниц ${pages}`,
  );
}
// Длинная лента: страницы стыкуются и на настоящих данных
const longSeen = new Set();
let longCursor = null;
let longPages = 0;
let longTotal = 0;
let duplicates = 0;
const fresh = new Date().toISOString();
do {
  const query = new URLSearchParams({
    category: 'realty-flats',
    regionWide: 'true',
    limit: '20',
    sort: 'price_asc',
    transactionType: 'rent',
    rentPeriod: 'daily',
    priceTo: String(3_000_00),
    freshBefore: fresh,
    ...(longCursor ? { cursor: longCursor } : {}),
  });
  const page = (await call('GET', `/listings?${query}`)).body;
  if (longPages === 0) longTotal = page?.total ?? 0;
  for (const item of page?.items ?? []) {
    if (longSeen.has(item.id)) duplicates += 1;
    longSeen.add(item.id);
  }
  longCursor = page?.nextCursor ?? null;
  longPages += 1;
} while (longCursor && longPages < 60);
check(
  duplicates === 0 && longSeen.size === longTotal && longCursor === null,
  'посуточные квартиры до 3 000 ₽ по цене: все страницы, без повторов, число совпало',
  `${longSeen.size} из ${longTotal}, страниц ${longPages}`,
);

// ── 5. Цена аренды в своей единице ──────────────────────────────────────
console.log('\n5. Цена аренды');
const daily = await post('realty-flats', {
  title: 'Квартира посуточно',
  attributes: { rooms: 1, areaTotal: 35, sellerType: 'owner' },
  deal: { transactionType: 'rent', rentPeriod: 'daily', priceUnit: 'per_day' },
  price: 2_500_00,
});
const monthly = await post('realty-flats', {
  title: 'Квартира надолго',
  attributes: { rooms: 1, areaTotal: 35, sellerType: 'owner' },
  deal: { transactionType: 'rent', rentPeriod: 'monthly', priceUnit: 'per_month' },
  price: 60_000_00,
});
r = await feed('realty-flats', {
  transactionType: 'rent',
  rentPeriod: 'daily',
  priceFrom: String(2_000_00),
  priceTo: String(3_000_00),
});
check(same(r.ids, [daily]), 'посуточно 2 000–3 000 ₽/сут — только посуточная');
r = await feed('realty-flats', {
  transactionType: 'rent',
  rentPeriod: 'monthly',
  priceFrom: String(50_000_00),
  priceTo: String(70_000_00),
});
check(same(r.ids, [monthly]), 'надолго 50 000–70 000 ₽/мес — только помесячная');
r = await feed('realty-flats', {
  transactionType: 'rent',
  rentPeriod: 'daily',
  priceFrom: String(50_000_00),
  priceTo: String(70_000_00),
});
check(r.total === 0, '60 000 ₽/мес не попадает в «посуточно до 70 000»');
r = await feed('realty-flats', {
  transactionType: 'rent',
  priceUnit: 'per_day',
  priceTo: String(70_000_00),
});
check(same(r.ids, [daily]), 'единица ₽/сут — помесячная не смешивается');
r = await feed('realty-flats', { transactionType: 'sale' }, { petsAllowed: true });
check(
  r.total === 0 || r.ids.every((id) => id !== daily && id !== monthly),
  'продажа: аренда не появляется',
);
r = await feed('realty-flats', { transactionType: 'rent' });
const rentCount = r.total;
r = await feed('realty-flats', { transactionType: 'sale' }, { petsAllowed: true });
const saleWithPets = r.total;
r = await feed('realty-flats', { transactionType: 'sale' });
check(
  saleWithPets === r.total && rentCount === 2,
  '«Купить» + «можно с животными» — условие аренды на продажу не влияет',
);
const carRent = await post('transport-cars', {
  title: 'LADA Granta в аренду',
  attributes: { brand: 'lada', model: 'granta', year: 2020, mileage: 30_000 },
  deal: { transactionType: 'rent', priceUnit: 'per_hour' },
  price: 500_00,
});
r = await feed('transport-cars', {
  transactionType: 'rent',
  priceUnit: 'per_hour',
  priceTo: String(1_000_00),
});
check(same(r.ids, [carRent]), 'аренда машины: 500 ₽/час находится в «₽/час до 1 000»');
r = await feed('transport-cars', {
  transactionType: 'rent',
  priceUnit: 'per_day',
  priceTo: String(1_000_00),
});
check(!r.ids.includes(carRent), 'и не находится в «₽/сут»: часы не пересчитываются в сутки');

// ── 6. Карта — те же условия ────────────────────────────────────────────
console.log('\n6. Карта');
const mapQuery = new URLSearchParams({
  category: 'transport-cars',
  regionWide: 'true',
  search: TAG,
  attributes: JSON.stringify({ ...lada, bodyType: ['sedan', 'hatchback'] }),
  bbox: '42.8,47.3,43.2,47.7',
});
const points = (await call('GET', `/listings/map?${mapQuery}`)).body ?? [];
check(
  same(
    points.map((point) => point.id),
    [granta, vesta],
  ),
  'на карте — те же Granta и Vesta',
  `${points.length}`,
);

// ── 7. Несколько категорий: мультивыбор по смыслу ───────────────────────
console.log('\n7. Другие категории');
const winter = await post('transport-tires', {
  title: 'Шины зимние',
  attributes: {
    tireType: 'tires',
    tireWidth: 205,
    tireProfile: 55,
    diameter: 16,
    season: 'winter',
    quantity: 4,
    condition: 'used',
  },
});
const allSeason = await post('transport-tires', {
  title: 'Шины всесезонные',
  attributes: {
    tireType: 'tires',
    tireWidth: 205,
    tireProfile: 55,
    diameter: 17,
    season: 'all_season',
    quantity: 4,
    condition: 'used',
  },
});
r = await feed('transport-tires', {}, { season: ['winter', 'all_season'] });
check(same(r.ids, [winter, allSeason]), 'шины «Зимние или Всесезонные»');
r = await feed('transport-tires', {}, { diameter: [16, 17], season: ['winter'] });
check(same(r.ids, [winter]), 'диаметр R16 или R17 и зимние — одна');
const panel = await post('realty-flats', {
  title: 'Квартира панель',
  attributes: {
    rooms: 2,
    areaTotal: 50,
    buildingType: 'panel',
    renovation: 'euro',
    sellerType: 'owner',
  },
  price: 5_000_000_00,
});
const brick = await post('realty-flats', {
  title: 'Квартира кирпич',
  attributes: {
    rooms: 3,
    areaTotal: 70,
    buildingType: 'brick',
    renovation: 'cosmetic',
    sellerType: 'owner',
  },
  price: 6_000_000_00,
});
r = await feed('realty-flats', { transactionType: 'sale' }, { buildingType: ['panel', 'brick'] });
check(same(r.ids, [panel, brick]), 'дом «Панельный или Кирпичный»');
r = await feed(
  'realty-flats',
  { transactionType: 'sale' },
  { buildingType: ['panel', 'brick'], renovation: ['euro'] },
);
check(same(r.ids, [panel]), '… и евроремонт — одна');
r = await feed('realty-flats', { transactionType: 'sale' }, { rooms: [2, 3] });
check(same(r.ids, [panel, brick]), 'комнаты 2 или 3');

const vacancyA = await post('job-vacancies', {
  title: 'Водитель',
  attributes: { sphere: 'driver', employment: 'full', schedule: 'five_two' },
  deal: { transactionType: undefined, priceUnit: 'per_month' },
  price: 60_000_00,
});
const vacancyB = await post('job-vacancies', {
  title: 'Курьер',
  attributes: { sphere: 'driver', employment: 'part', schedule: 'free' },
  deal: { transactionType: undefined, priceUnit: 'per_month' },
  price: 40_000_00,
});
if (vacancyA && vacancyB) {
  r = await feed('job-vacancies', {}, { employment: ['full', 'part'] });
  check(same(r.ids, [vacancyA, vacancyB]), 'вакансии: «Полная или Частичная» занятость');
  r = await feed('job-vacancies', {}, { employment: ['part'] });
  check(same(r.ids, [vacancyB]), 'только частичная — одна');
} else {
  check(false, 'вакансии опубликованы');
}

console.log(`\nИтого: ${passed} ✅, ${failed} ❌\n`);
process.exit(failed === 0 ? 0 : 1);
