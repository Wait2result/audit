/**
 * Запчасти и комплектующие — сценарий на живом сервере.
 * Запуск: node test/e2e/listing-parts.mjs
 *
 *   1. Дерево: у каждого типа техники свой раздел запчастей, нет общего «Все запчасти».
 *   2. Подача запчасти с совместимостью и номерами; карточка и «моё объявление».
 *   3. Поиск по номеру (с дефисом, без дефиса, кириллицей, по префиксу) — без названия.
 *   4. Совместимость: марка + модель + год + кузов совпадают в ОДНОЙ строке.
 *   5. Обычное объявление без слоя запчасти по-прежнему создаётся и находится.
 *   6. Проверка отказов: плохой год, пустая совместимость, номер без знаков.
 *   7. Умный поиск на локальном разборе: «рейка на суксид», номер, неоднозначное «экран».
 */

const ORIGIN = 'http://localhost:3000';
const BASE = `${ORIGIN}/api/v1`;
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

async function call(method, path, body, token, ip) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'X-Forwarded-For': ip ?? ipOf.get(token) ?? DEFAULT_IP,
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

async function register(name) {
  const ip = randomIp();
  const phone = `8928${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
  const otp = await call(
    'POST',
    '/auth/otp/request',
    { phone, purpose: 'registration' },
    undefined,
    ip,
  );
  const verified = await call(
    'POST',
    '/auth/otp/verify',
    { phone, code: otp.body?.devCode, purpose: 'registration' },
    undefined,
    ip,
  );
  const registered = await call(
    'POST',
    '/auth/register',
    {
      verificationToken: verified.body?.verificationToken,
      password: PASSWORD,
      firstName: name,
      acceptedTerms: true,
    },
    undefined,
    ip,
  );
  const token = registered.body?.tokens?.accessToken;
  if (!token) {
    console.log('Не удалось зарегистрировать пользователя:', registered.body);
    process.exit(1);
  }
  ipOf.set(token, ip);
  return { token };
}

console.log('\nЗапчасти и комплектующие');
console.log('════════════════════════\n');

const cities = (await call('GET', '/cities')).body;
const cityId = cities.find((city) => city.slug === 'makhachkala').id;
const tree = (await call('GET', '/listings/categories?withAttributes=1')).body;
const leaves = tree.flatMap((root) => root.children);
const bySlug = Object.fromEntries(leaves.map((leaf) => [leaf.slug, leaf]));
const TAG = `Прогон${Math.floor(Math.random() * 90000) + 10000}`;
/** Номер, которого нет в базе: уникален для прогона, чтобы не путать с чужими объявлениями. */
const RUN = String(Math.floor(Math.random() * 9000) + 1000);
const OEM = `45510-${RUN}-AB`;
const OEM_PLAIN = `45510${RUN}AB`;

// ── 1. Дерево ───────────────────────────────────────────────────────────────
console.log('1. Дерево разделов');
const PARTS_SLUGS = [
  'transport-parts',
  'transport-moto-parts',
  'transport-truck-parts',
  'transport-special-parts',
  'transport-water-parts',
  'electronics-phone-parts',
  'electronics-laptop-parts',
  'electronics-components',
  'electronics-tv-parts',
  'home-appliance-parts',
  'home-climate-parts',
  'business-parts',
];
const missing = PARTS_SLUGS.filter((slug) => !bySlug[slug]);
check(missing.length === 0, '12 разделов запчастей по типам техники', missing.join(', '));
check(
  !leaves.some((leaf) => /^(all-parts|parts)$/.test(leaf.slug)),
  'общего раздела «Все запчасти» нет',
);
const carFields = (bySlug['transport-parts']?.attributes ?? []).map((field) => field.key);
check(
  ['partGroup', 'partItem', 'partOriginality', 'partCondition'].every((key) =>
    carFields.includes(key),
  ),
  'у автозапчастей есть группа, деталь, оригинальность, состояние',
  carFields.join(','),
);
const phoneGroups = (await call('GET', '/listings/dictionaries/part_group_phone')).body;
check(
  Array.isArray(phoneGroups) && phoneGroups.length >= 5,
  'справочник групп деталей телефонов',
  `${phoneGroups?.length}`,
);

// ── 2. Подача ───────────────────────────────────────────────────────────────
console.log('\n2. Подача запчасти');
const seller = await register('Продавец');

const rack = await call(
  'POST',
  '/my/listings',
  {
    cityId,
    categoryId: bySlug['transport-parts'].id,
    title: `Рулевая рейка Toyota Succeed ${TAG}`,
    description: 'Рулевая рейка в сборе, снята с автомобиля, состояние хорошее.',
    price: 18_000_00,
    isNegotiable: false,
    transactionType: 'sale',
    priceUnit: 'total',
    attributes: {
      partGroup: 'steering',
      partItem: 'steering_rack',
      partCondition: 'used',
      partOriginality: 'original',
    },
    part: {
      numbers: [
        { kind: 'oem', value: OEM },
        { kind: 'manufacturer', value: `TR-${RUN}` },
      ],
      compatibility: [
        {
          brand: 'toyota',
          model: 'succeed',
          chassis: 'NCP165',
          yearFrom: 2014,
          yearTo: 2020,
          engine: '1NZ-FE',
        },
        { brand: 'toyota', model: 'probox', chassis: 'NCP160', yearFrom: 2014 },
      ],
    },
    location: { latitude: 42.9849, longitude: 47.5047, accuracy: 'point' },
    contactPhone: '+79501234567',
    allowChat: true,
    allowCalls: true,
    photoIds: [],
  },
  seller.token,
);
check(
  rack.status === 201 || rack.status === 200,
  'запчасть с совместимостью создана',
  `статус ${rack.status} ${JSON.stringify(rack.body?.message ?? '')}`,
);
const rackId = rack.body?.id;

const card = await call('GET', `/listings/${rackId}`);
check(card.body?.part?.compatibility?.length === 2, 'в карточке две строки совместимости');
check(card.body?.part?.numbers?.length === 2, 'в карточке два номера');
check(
  card.body?.part?.compatibility?.[0]?.brandLabel === 'Toyota',
  'подпись марки из справочника',
  card.body?.part?.compatibility?.[0]?.brandLabel,
);

const mine = await call('GET', `/my/listings/${rackId}`, undefined, seller.token);
check(
  mine.body?.part?.numbers?.length === 2,
  'в «моём объявлении» номера и совместимость возвращаются для правки',
);

// ── 3. Поиск по номеру ──────────────────────────────────────────────────────
console.log('\n3. Поиск по номеру');
const search = async (query) =>
  (await call('GET', `/listings?cityId=${cityId}&regionWide=true&limit=50&${query}`)).body?.items ??
  [];
const hit = (items) => items.some((item) => item.id === rackId);

check(hit(await search(`search=${encodeURIComponent(OEM)}`)), 'точный номер с дефисами');
check(hit(await search(`search=${OEM_PLAIN}`)), 'номер без дефисов');
check(hit(await search(`search=${encodeURIComponent(OEM.toLowerCase())}`)), 'номер строчными');
check(
  hit(await search(`search=${encodeURIComponent(`TR-${RUN}`)}`)),
  'второй номер (производителя)',
);
check(hit(await search(`search=45510${RUN}`)), 'начало номера (префикс)');
check(!hit(await search('search=45510-0000-ZZ')), 'чужой номер не находит');

// ── 4. Совместимость ────────────────────────────────────────────────────────
console.log('\n4. Совместимость');
const byAttrs = async (attributes) =>
  search(`category=transport-parts&attributes=${encodeURIComponent(JSON.stringify(attributes))}`);
check(hit(await byAttrs({ compatBrand: 'toyota', compatModel: 'succeed' })), 'Toyota Succeed');
check(
  hit(await byAttrs({ compatBrand: 'toyota', compatModel: 'probox' })),
  'Toyota Probox (вторая строка)',
);
check(
  !hit(await byAttrs({ compatBrand: 'toyota', compatModel: 'camry' })),
  'Toyota Camry — не подходит',
);
check(hit(await byAttrs({ compatChassis: 'NCP165' })), 'кузов NCP165');
check(hit(await byAttrs({ compatEngine: '1NZ' })), 'двигатель 1NZ (начало)');
check(
  hit(await byAttrs({ compatModel: 'succeed', compatYear: 2016 })),
  'Succeed 2016 — в промежутке',
);
check(
  !hit(await byAttrs({ compatModel: 'succeed', compatYear: 2023 })),
  'Succeed 2023 — вне промежутка',
);
check(
  hit(await byAttrs({ compatModel: 'probox', compatYear: 2023 })),
  'Probox 2023 — «с 2014» без верхней границы',
);
check(
  !hit(await byAttrs({ compatModel: 'probox', compatChassis: 'NCP165' })),
  'модель и кузов берутся из ОДНОЙ строки (Probox + NCP165 — нет)',
);
check(
  hit(await byAttrs({ partGroup: 'steering', partItem: 'steering_rack' })),
  'фильтр по группе и детали',
);

// ── 5. Обычное объявление ───────────────────────────────────────────────────
console.log('\n5. Обычное объявление не пострадало');
const goods = bySlug['home-appliances'] ?? bySlug['goods-other'];
if (goods) {
  const plain = await call(
    'POST',
    '/my/listings',
    {
      cityId,
      categoryId: goods.id,
      title: `Стиральная машина ${TAG}`,
      description: 'Стиральная машина в рабочем состоянии, самовывоз.',
      price: 9_000_00,
      isNegotiable: false,
      transactionType: 'sale',
      priceUnit: 'total',
      attributes: Object.fromEntries(
        (goods.attributes ?? [])
          .filter((field) => field.required)
          .map((field) => [
            field.key,
            field.type === 'enum' ? field.options[0].value : field.type === 'number' ? 1 : 'Тест',
          ]),
      ),
      location: { latitude: 42.9849, longitude: 47.5047, accuracy: 'point' },
      contactPhone: '+79501234567',
      allowChat: true,
      allowCalls: true,
      photoIds: [],
    },
    seller.token,
  );
  check(
    plain.status === 201 || plain.status === 200,
    'объявление без слоя запчасти создаётся',
    `статус ${plain.status}`,
  );
  const plainCard = await call('GET', `/listings/${plain.body?.id}`);
  check(plainCard.body?.part === null, 'у него part = null');
}

// ── 6. Отказы ───────────────────────────────────────────────────────────────
console.log('\n6. Проверка данных');
const bad = (part, attributes = { partGroup: 'steering' }) =>
  call(
    'POST',
    '/my/listings',
    {
      cityId,
      categoryId: bySlug['transport-parts'].id,
      title: `Проверка ${TAG}`,
      description: 'Проверка отказа при неверных данных запчасти.',
      price: 1000_00,
      isNegotiable: false,
      transactionType: 'sale',
      priceUnit: 'total',
      attributes,
      part,
      location: { latitude: 42.9849, longitude: 47.5047, accuracy: 'point' },
      contactPhone: '+79501234567',
      allowChat: true,
      allowCalls: true,
      photoIds: [],
    },
    seller.token,
  );
check(
  (await bad({ compatibility: [{ yearFrom: 2020, yearTo: 2010, model: 'succeed' }] })).status ===
    400,
  'год «от» больше «до» — отказ',
);
check(
  (await bad({ compatibility: [{ yearFrom: 2020 }] })).status === 400,
  'совместимость без марки/модели/кузова — отказ',
);
check(
  (await bad({ numbers: [{ kind: 'oem', value: '---' }] })).status === 400,
  'номер без букв и цифр — отказ',
);
check((await bad({}, {})).status === 400, 'без группы запчастей (обязательное поле) — отказ');
// Справочник моделей неполон (нет поколений и редких моделей): незнакомая модель хранится текстом
check(
  (await bad({ compatibility: [{ brand: 'toyota', model: 'Редкая модель X' }] })).status === 201,
  'модель вне справочника принимается как текст',
);

// ── 7. Умный поиск ──────────────────────────────────────────────────────────
console.log('\n7. Умный поиск (локальный разбор)');
const smart = (text) =>
  call('POST', '/smart-search', { text, context: { cityId, screen: 'home' } });
const s1 = await smart('рейка на суксид');
check(s1.body?.status === 'results', '«рейка на суксид» — результаты', s1.body?.status);
const q1 = s1.body?.parts?.[0]?.query;
check(
  q1?.params?.category === 'transport-parts',
  'раздел «Автозапчасти»',
  `${q1?.params?.category}`,
);
const s2 = await smart(OEM);
check(s2.body?.status === 'results', 'номер без названия — результаты', s2.body?.status);
const s3 = await smart('экран');
check(s3.body?.status === 'clarification', '«экран» — уточнение, а не угадывание', s3.body?.status);

console.log(`\nИтого: ${passed} ✅, ${failed} ❌\n`);
process.exit(failed === 0 ? 0 : 1);
