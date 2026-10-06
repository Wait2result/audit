/**
 * Карточки объявлений: 2–5 характеристик по приоритетам категории — сценарий
 * на живом сервере (ТЗ «Умное отображение характеристик»).
 * Запуск: node test/e2e/listing-cards.mjs
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
const TAG = `Карт${Math.floor(Math.random() * 90000) + 10000}`;

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
const plain = (text) => String(text ?? '').replace(/\u00a0/g, ' ');

/** Строка карточки объявления в выдаче категории. */
async function cardOf(slug, id) {
  const page = (
    await call(
      'GET',
      `/listings?category=${slug}&regionWide=true&limit=30&search=${encodeURIComponent(TAG)}`,
    )
  ).body;
  return plain(page?.items?.find((item) => item.id === id)?.attributesSummary);
}

console.log('1. Ноутбук: процессор, видеокарта, память, накопитель');
const laptop = await post('electronics-laptops', {
  title: 'ASUS TUF Gaming A15',
  deal: { transactionType: 'sale', priceUnit: 'total' },
  attributes: {
    brand: 'asus',
    cpu: 'Ryzen 7',
    gpu: 'RTX 4060',
    ram: '16',
    storageSize: '1024',
    storage: 'ssd',
    screenSize: 15.6,
    condition: 'used',
  },
});
check(ok(laptop), 'опубликован', `статус ${laptop.status}`);
const laptopCard = await cardOf('electronics-laptops', laptop.body?.id);
check(
  laptopCard.startsWith('Ryzen 7 · RTX 4060 · 16 ГБ · 1 ТБ SSD · 15,6″'),
  'карточка ноутбука',
  laptopCard,
);
check(!/Wi-?Fi|Bluetooth|USB|HDMI/i.test(laptopCard), 'без портов и Wi-Fi');

console.log('\n2. Запчасть: несколько применяемостей и донор');
const number = `45510-${Math.floor(Math.random() * 90000) + 10000}`;
const models = [
  ['succeed', 'NCP160'],
  ['succeed', 'NCP165'],
  ['probox', 'NCP160'],
  ['probox', 'NCP165'],
  ['ist', 'NCP110'],
];
const part = await post('transport-parts', {
  title: 'Рулевая рейка',
  deal: { transactionType: 'sale', priceUnit: 'total' },
  attributes: {
    partGroup: 'steering',
    partItem: 'steering_rack',
    partManufacturer: 'kyb',
    partCondition: 'used',
    partOriginality: 'analog',
    donorVehicle: 'Toyota Succeed NCP165',
  },
  extra: {
    part: {
      numbers: [{ kind: 'manufacturer', value: number }],
      compatibility: models.map(([model, chassis]) => ({ brand: 'toyota', model, chassis })),
    },
  },
});
check(ok(part), 'опубликована', `статус ${part.status}`);
const partCard = await cardOf('transport-parts', part.body?.id);
check(
  partCard.includes(`KYB · Б/У аналог · ${number}`),
  'производитель, состояние, номер',
  partCard,
);
check(
  partCard.includes('Succeed NCP160/NCP165, Probox +1'),
  'применяемость коротко и реальное «+1»',
  partCard,
);
check(partCard.includes('Снята с: Toyota Succeed NCP165'), 'донор отдельно', partCard);
const details = (await call('GET', `/listings/${part.body?.id}`)).body;
check(
  (details?.part?.compatibility ?? []).length === 5,
  'на странице объявления — все 5 применяемостей',
);
check(
  details?.attributes?.donorVehicle === 'Toyota Succeed NCP165',
  'донор — отдельным полем, не в «Подходит к»',
);

console.log('\n3. Поиск запчасти по применяемости и номеру');
const smart = await call('POST', '/smart-search', {
  text: 'NCP165 рулевая рейка',
  limit: 1,
  context: { screen: 'listings', listingCategory: 'transport-parts' },
});
const conditions = (smart.body?.parts?.[0]?.query?.conditions ?? []).map((item) => item.field);
check(
  conditions.includes('partItem') && conditions.includes('compatChassis'),
  '«NCP165 рулевая рейка» = деталь + кузов в применяемости',
  conditions.join(','),
);
const byChassis = (
  await call('GET', '/listings?category=transport-parts&regionWide=true&limit=50&search=NCP165')
).body;
check(
  (byChassis?.items ?? []).some((item) => item.id === part.body?.id),
  'поиск по кузову находит деталь через применяемость',
);
const byNumber = (
  await call('GET', `/listings?category=transport-parts&regionWide=true&limit=20&search=${number}`)
).body;
check(
  (byNumber?.items ?? []).some((item) => item.id === part.body?.id),
  'поиск по номеру',
);

console.log('\n4. Шины и квартира');
const tires = await post('transport-tires', {
  title: 'Yokohama Geolandar',
  deal: { transactionType: 'sale', priceUnit: 'total' },
  attributes: {
    tireType: 'tires',
    tireWidth: 215,
    tireProfile: 65,
    diameter: 16,
    season: 'summer',
    quantity: 4,
    condition: 'used',
  },
});
const tiresCard = await cardOf('transport-tires', tires.body?.id);
check(
  tiresCard.startsWith('215/65 R16 · Летние · 4 шт'),
  'шины: размер как на боковине',
  tiresCard,
);
const flat = await post('realty-flats', {
  title: 'Квартира в центре',
  deal: { transactionType: 'rent', rentPeriod: 'monthly', priceUnit: 'per_month' },
  attributes: { rooms: 2, areaTotal: 46, floor: 5, floorsTotal: 9 },
  price: 45_000_00,
});
const flatCard = await cardOf('realty-flats', flat.body?.id);
check(flatCard.includes('2 комн. · 46 м² · 5/9 эт.'), 'квартира: комнаты, площадь, этаж', flatCard);
check(!/45 000|₽/.test(flatCard), 'цена не дублируется в характеристиках');

console.log(`\nИтого: ${passed} ✅, ${failed} ❌\n`);
process.exit(failed === 0 ? 0 : 1);
