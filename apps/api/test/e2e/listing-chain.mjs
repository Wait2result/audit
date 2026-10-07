/**
 * Сквозная связка характеристики: форма → сохранение → фильтр → поиск →
 * карточка → страница объявления → правка. Одно и то же значение должно
 * пройти всю цепочку без потерь, второго масштабирования и чужих полей.
 * Запуск: node test/e2e/listing-chain.mjs (сервер на :3000)
 */
import { attributeValueLabel, isAttributeVisible, storedToInput } from '@dagestan/shared';

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

console.log('\nСвязка характеристики: форма → фильтр → карточка → страница');
console.log('═══════════════════════════════════════════════════════════\n');

const cities = (await call('GET', '/cities')).body;
const cityId = cities.find((city) => city.slug === 'makhachkala').id;
const tree = (await call('GET', '/listings/categories?withAttributes=1')).body;
const leaves = tree.flatMap(function leavesOf(node) {
  return node.children?.length ? node.children.flatMap(leavesOf) : [node];
});
const bySlug = Object.fromEntries(leaves.map((leaf) => [leaf.slug, leaf]));
const TAG = `Цеп${Math.floor(Math.random() * 90000) + 10000}`;
const plain = (text) => String(text ?? '').replace(/\u00a0/g, ' ');

let token = await register();
let posted = 0;

/** Подаёт объявление; у подачи суточный предел — каждые шесть новый продавец. */
async function post(slug, { title, attributes, deal = {}, part, price = 100_000_00 }) {
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
      description: 'Проверка связки характеристик от формы до страницы.',
      price,
      isNegotiable: false,
      transactionType: 'sale',
      priceUnit: 'total',
      ...deal,
      attributes,
      ...(part ? { part } : {}),
      location: { latitude: 42.9849, longitude: 47.5047, accuracy: 'point' },
      contactPhone: '+79501234567',
      allowChat: true,
      allowCalls: true,
      photoIds: [],
    },
    token,
  );
  if (response.status !== 201) console.log('     ', JSON.stringify(response.body).slice(0, 300));
  return { ...response, id: response.body?.id, token };
}

/** Найдено ли объявление фильтром выдачи (только объявления этого прогона). */
async function found(slug, id, attributes = {}, extra = '') {
  const query = new URLSearchParams({
    category: slug,
    regionWide: 'true',
    limit: '50',
    search: TAG,
    attributes: JSON.stringify(attributes),
  });
  const page = (await call('GET', `/listings?${query}${extra}`)).body;
  return (page?.items ?? []).some((item) => item.id === id);
}

async function cardOf(slug, id) {
  const query = new URLSearchParams({
    category: slug,
    regionWide: 'true',
    limit: '50',
    search: TAG,
  });
  const page = (await call('GET', `/listings?${query}`)).body;
  return plain(page?.items?.find((item) => item.id === id)?.attributesSummary);
}

/** Строки «Характеристики» страницы объявления — как их рисует приложение. */
async function detailOf(slug, id) {
  const listing = (await call('GET', `/listings/${id}`)).body;
  const rows = {};
  for (const attribute of bySlug[slug].attributes ?? []) {
    const value = listing?.attributes?.[attribute.key];
    if (value === undefined) continue;
    if (!isAttributeVisible(attribute, listing.attributes, listing)) continue;
    rows[attribute.key] = plain(attributeValueLabel(attribute, value, listing.attributeLabels));
  }
  return { listing, rows };
}

/** Правка без изменений через форму (единицы ввода) трижды — числа те же. */
async function roundTrip(slug, id, owner) {
  const before = (await call('GET', `/my/listings/${id}`, undefined, owner)).body?.attributes;
  for (let round = 0; round < 3; round += 1) {
    const current = (await call('GET', `/my/listings/${id}`, undefined, owner)).body;
    const form = storedToInput(bySlug[slug].attributes, current.attributes);
    const saved = await call('PATCH', `/my/listings/${id}`, { attributes: form }, owner);
    if (saved.status !== 200) return `статус ${saved.status}`;
  }
  const after = (await call('GET', `/my/listings/${id}`, undefined, owner)).body?.attributes;
  return JSON.stringify(before) === JSON.stringify(after)
    ? null
    : JSON.stringify({ before, after });
}

// ── 1. Автомобиль: числа с масштабом, списки, привод ─────────────────────
console.log('1. Автомобиль');
const models = (await call('GET', '/listings/dictionaries/car_model?parent=toyota')).body ?? [];
const succeed = models.find((model) => model.label === 'Succeed')?.value;
const car = await post('transport-cars', {
  title: 'Toyota Succeed',
  attributes: {
    brand: 'toyota',
    model: succeed,
    year: 2015,
    mileage: 125_000,
    engineVolume: 1.5,
    fuel: 'petrol',
    gearbox: 'variator',
    drive: 'full',
    color: 'white',
  },
});
check(car.status === 201, 'опубликован', `статус ${car.status}`);
check(
  await found('transport-cars', car.id, { mileage: { to: 150_000 } }),
  'пробег «до 150 000» находит 125 000',
);
check(
  !(await found('transport-cars', car.id, { mileage: { to: 100_000 } })),
  'пробег «до 100 000» — нет',
);
check(
  await found('transport-cars', car.id, { engineVolume: { from: 1.4, to: 1.6 } }),
  'объём 1,4–1,6 л находит 1,5 (масштаб один раз)',
);
check(
  !(await found('transport-cars', car.id, { engineVolume: { from: 1.6 } })),
  'объём от 1,6 л — нет',
);
check(await found('transport-cars', car.id, { year: { from: 2014, to: 2016 } }), 'год 2014–2016');
check(await found('transport-cars', car.id, { fuel: ['petrol'] }), 'топливо: бензин');
check(!(await found('transport-cars', car.id, { fuel: ['diesel'] })), 'топливо: дизель — нет');
check(await found('transport-cars', car.id, { drive: 'full' }), 'привод: полный');
check(await found('transport-cars', car.id, { gearbox: 'variator' }), 'КПП: вариатор');
check(await found('transport-cars', car.id, { brand: 'toyota', model: succeed }), 'марка и модель');
const carCard = await cardOf('transport-cars', car.id);
check(/2015 · 125 000 км · 1,5 л/.test(carCard), 'карточка: год, пробег, объём', carCard);
const carDetail = await detailOf('transport-cars', car.id);
check(
  carDetail.rows.mileage === '125 000 км' &&
    carDetail.rows.engineVolume === '1,5 л' &&
    carDetail.rows.year === '2015' &&
    carDetail.rows.drive === 'Полный' &&
    carDetail.rows.model === 'Succeed',
  'страница: пробег, объём, год, привод, модель',
  JSON.stringify(carDetail.rows),
);
check(
  (await roundTrip('transport-cars', car.id, car.token)) === null,
  'правка ×3 — значения те же',
);

// ── 2. Шины, диски: свои поля, единицы маркировки ────────────────────────
console.log('\n2. Шины и диски');
const rims = await post('transport-tires', {
  title: 'Диски литые',
  attributes: {
    tireType: 'rims',
    diameter: 17,
    pcd: '5x114_3',
    rimWidth: 6.5,
    rimEt: 45,
    quantity: 4,
    condition: 'used',
    season: 'winter',
  },
});
check(rims.status === 201, 'диски опубликованы', `статус ${rims.status}`);
const rimsDetail = await detailOf('transport-tires', rims.id);
check(rimsDetail.listing?.attributes?.season === undefined, 'сезон шин у дисков не сохраняется');
check(
  rimsDetail.rows.diameter === 'R17' &&
    rimsDetail.rows.rimWidth === '6.5J' &&
    rimsDetail.rows.rimEt === '45' &&
    rimsDetail.rows.quantity === '4 шт',
  'страница: R17, 6.5J, вылет 45, 4 шт',
  JSON.stringify(rimsDetail.rows),
);
const rimsCard = await cardOf('transport-tires', rims.id);
check(
  rimsCard.startsWith('R17 · 5x114.3 · 6.5J · ET45 · 4 шт'),
  'карточка: те же единицы',
  rimsCard,
);
check(await found('transport-tires', rims.id, { diameter: [17] }), 'фильтр: диаметр R17');
check(
  await found('transport-tires', rims.id, { rimWidth: { from: 6, to: 7 } }),
  'фильтр: ширина 6–7J',
);
check(
  !(await found('transport-tires', rims.id, { rimWidth: { from: 7 } })),
  'фильтр: ширина от 7J — нет',
);
check(
  await found('transport-tires', rims.id, { rimEt: { from: 40, to: 50 } }),
  'фильтр: вылет 40–50',
);
check(
  !(await found('transport-tires', rims.id, { season: 'winter' })),
  'фильтр «зимние» диски не находит',
);
check(
  (await roundTrip('transport-tires', rims.id, rims.token)) === null,
  'правка дисков ×3 — 6.5J остаётся 6.5J',
);

const tires = await post('transport-tires', {
  title: 'Шины Yokohama',
  attributes: {
    tireType: 'tires',
    tireWidth: 215,
    tireProfile: 65,
    diameter: 16,
    season: 'summer',
    quantity: 4,
    condition: 'used',
    pcd: '5x114_3',
  },
});
check(tires.status === 201, 'шины опубликованы', `статус ${tires.status}`);
check(
  (await detailOf('transport-tires', tires.id)).listing?.attributes?.pcd === undefined,
  'разболтовка дисков у шин не сохраняется',
);
check(
  await found('transport-tires', tires.id, { season: 'summer', diameter: [16] }),
  'фильтр: летние R16',
);
check(
  (await cardOf('transport-tires', tires.id)).startsWith('215/65 R16 · Летние'),
  'карточка: 215/65 R16',
);

// ── 3. Обувь: мультивыбор числа с масштабом ──────────────────────────────
console.log('\n3. Обувь');
const shoes = await post('personal-shoes', {
  title: 'Кроссовки Nike',
  attributes: { gender: 'male', shoeSize: 43, condition: 'new', brandName: 'Nike' },
});
check(shoes.status === 201, 'опубликованы', `статус ${shoes.status}`);
check(await found('personal-shoes', shoes.id, { shoeSize: [43] }), 'фильтр: размер 43 находит 43');
check(await found('personal-shoes', shoes.id, { shoeSize: [42, 43] }), 'фильтр: размеры 42 и 43');
check(!(await found('personal-shoes', shoes.id, { shoeSize: [44] })), 'фильтр: размер 44 — нет');
check((await detailOf('personal-shoes', shoes.id)).rows.shoeSize === '43', 'страница: размер 43');

// ── 4. Электроника: boolean, диапазоны, проценты ─────────────────────────
console.log('\n4. Электроника');
const tv = await post('electronics-tv', {
  title: 'Телевизор TCL',
  attributes: { screenSize: 55, resolution: '4k', smartTv: true, condition: 'used' },
});
check(tv.status === 201, 'телевизор опубликован', `статус ${tv.status}`);
check(await found('electronics-tv', tv.id, { smartTv: true }), 'фильтр: Smart TV');
check(
  await found('electronics-tv', tv.id, { screenSize: { from: 50, to: 60 } }),
  'фильтр: диагональ 50–60″',
);
check((await detailOf('electronics-tv', tv.id)).rows.screenSize === '55″', 'страница: 55″');

const tabletLte = await post('electronics-tablets', {
  title: 'Планшет с SIM',
  attributes: { brand: 'apple', memory: '256', screenSize: 11, cellular: true, condition: 'used' },
});
const tabletWifi = await post('electronics-tablets', {
  title: 'Планшет Wi-Fi',
  attributes: { brand: 'apple', memory: '64', screenSize: 10.9, condition: 'used' },
});
check(tabletLte.status === 201 && tabletWifi.status === 201, 'планшеты опубликованы');
check(
  await found('electronics-tablets', tabletLte.id, { cellular: true }),
  'фильтр SIM находит планшет с SIM',
);
check(
  !(await found('electronics-tablets', tabletWifi.id, { cellular: true })),
  'и не находит Wi-Fi',
);
check(
  !(await cardOf('electronics-tablets', tabletWifi.id)).includes('SIM'),
  'карточка Wi-Fi без «SIM»',
);
check(
  (await detailOf('electronics-tablets', tabletWifi.id)).rows.screenSize === '10,9″',
  'страница: 10,9″',
);

const phone = await post('electronics-phones', {
  title: 'Смартфон Samsung',
  attributes: { brand: 'samsung', memory: '256', battery: 92, condition: 'used' },
});
check(phone.status === 201, 'телефон опубликован', `статус ${phone.status}`);
check(
  await found('electronics-phones', phone.id, { battery: { from: 90 } }),
  'фильтр: аккумулятор от 90%',
);
check((await detailOf('electronics-phones', phone.id)).rows.battery === '92%', 'страница: 92%');
const noBattery = await post('electronics-phones', {
  title: 'Смартфон без аккумулятора',
  attributes: { brand: 'samsung', memory: '128', condition: 'used' },
});
check(
  !(await cardOf('electronics-phones', noBattery.id)).includes('Аккумулятор'),
  'без аккумулятора — без «100%»',
);

// ── 5. Недвижимость: продажа и аренда ────────────────────────────────────
console.log('\n5. Недвижимость');
const flatSale = await post('realty-flats', {
  title: 'Квартира 4 комнаты',
  attributes: {
    rooms: 4,
    areaTotal: 90.5,
    floor: 5,
    floorsTotal: 9,
    newBuilding: true,
    petsAllowed: true,
    sellerType: 'owner',
  },
  price: 9_000_000_00,
});
check(flatSale.status === 201, 'продажа опубликована', `статус ${flatSale.status}`);
const saleDetail = await detailOf('realty-flats', flatSale.id);
check(
  saleDetail.listing?.attributes?.petsAllowed === undefined,
  'у продажи «можно с животными» не сохраняется',
);
check(
  saleDetail.rows.rooms === '4' && saleDetail.rows.areaTotal === '90,5 м²',
  'страница: 4 комнаты, 90,5 м²',
  JSON.stringify(saleDetail.rows),
);
const flatCard = await cardOf('realty-flats', flatSale.id);
check(flatCard.includes('4 комн. · 90,5 м² · 5/9 эт.'), 'карточка: 4 комн.', flatCard);
check(await found('realty-flats', flatSale.id, { rooms: [4] }), 'фильтр «4+» находит 4 комнаты');
check(
  await found('realty-flats', flatSale.id, { areaTotal: { from: 90, to: 91 } }),
  'фильтр: площадь 90–91 м²',
);
check(await found('realty-flats', flatSale.id, { newBuilding: true }), 'фильтр: новостройка');

const flatRent = await post('realty-flats', {
  title: 'Квартира на длительный срок',
  attributes: {
    rooms: 2,
    areaTotal: 46,
    petsAllowed: true,
    childrenAllowed: true,
    utilitiesIncluded: true,
    sellerType: 'owner',
  },
  deal: { transactionType: 'rent', rentPeriod: 'monthly', priceUnit: 'per_month' },
  price: 25_000_00,
});
check(flatRent.status === 201, 'аренда опубликована', `статус ${flatRent.status}`);
const rentRows = (await detailOf('realty-flats', flatRent.id)).rows;
check(
  rentRows.petsAllowed === 'Да' && rentRows.childrenAllowed === 'Да',
  'страница аренды: животные и дети',
);
check(
  await found('realty-flats', flatRent.id, { petsAllowed: true }, '&transactionType=rent'),
  'фильтр аренды: можно с животными',
);
const toSale = await call(
  'PATCH',
  `/my/listings/${flatRent.id}`,
  {
    transactionType: 'sale',
    rentPeriod: null,
    priceUnit: 'total',
    price: 6_000_000_00,
    attributes: { rooms: 2, areaTotal: 46, sellerType: 'owner' },
  },
  flatRent.token,
);
check(
  toSale.status === 200,
  'Сдам → Продам сохраняется',
  `статус ${toSale.status} ${JSON.stringify(toSale.body).slice(0, 200)}`,
);
const afterSale = (await call('GET', `/my/listings/${flatRent.id}`, undefined, flatRent.token))
  .body;
check(
  afterSale?.attributes?.petsAllowed === undefined &&
    afterSale?.attributes?.childrenAllowed === undefined &&
    afterSale?.attributes?.utilitiesIncluded === undefined,
  'после «Продам» условий аренды в объявлении нет',
  JSON.stringify(afterSale?.attributes),
);
check(
  !(await found('realty-flats', flatRent.id, { petsAllowed: true })),
  'и фильтр «можно с животными» его не находит',
);
const sneaky = await call(
  'PATCH',
  `/my/listings/${flatSale.id}`,
  {
    attributes: {
      rooms: 4,
      areaTotal: 90.5,
      floor: 5,
      floorsTotal: 9,
      newBuilding: true,
      sellerType: 'owner',
      childrenAllowed: true,
    },
  },
  flatSale.token,
);
const sneakyAfter = (await call('GET', `/my/listings/${flatSale.id}`, undefined, flatSale.token))
  .body;
check(
  sneaky.status === 200 && sneakyAfter?.attributes?.childrenAllowed === undefined,
  'правка продажи с условием аренды — условие не сохраняется',
);
check(
  (await roundTrip('realty-flats', flatSale.id, flatSale.token)) === null,
  'правка ×3 — 90,5 м² остаются',
);

// ── 6. Запчасть: применяемость, номера, донор ───────────────────────────
console.log('\n6. Запчасть');
const main = `48510-${Math.floor(Math.random() * 90000) + 10000}`;
const replacement = `48510-R${Math.floor(Math.random() * 90000) + 10000}`;
const partListing = await post('transport-parts', {
  title: 'Амортизатор передний',
  attributes: {
    partGroup: 'suspension',
    partItem: 'shock_absorber',
    partManufacturer: 'kyb',
    partCondition: 'used',
    partOriginality: 'analog',
    donorVehicle: 'Toyota Probox NCP51',
  },
  part: {
    numbers: [
      { kind: 'manufacturer', value: main },
      { kind: 'replacement', value: replacement },
    ],
    compatibility: [{ brand: 'toyota', model: 'succeed', chassis: 'NCP165', engine: '1NZ-FE' }],
  },
});
check(partListing.status === 201, 'опубликована', `статус ${partListing.status}`);
const partDetail = (await detailOf('transport-parts', partListing.id)).listing;
check(
  partDetail?.title === `Амортизатор передний ${TAG}`,
  'название — как у продавца, номер его не заменил',
);
check(
  (partDetail?.part?.compatibility ?? []).length === 1 &&
    partDetail.part.compatibility[0].chassis === 'NCP165',
  'применяемость — только то, что указано (донор в неё не попал)',
  JSON.stringify(partDetail?.part?.compatibility),
);
check(partDetail?.attributes?.donorVehicle === 'Toyota Probox NCP51', 'донор — отдельным полем');
check(
  await found('transport-parts', partListing.id, { compatModel: 'succeed' }),
  'фильтр применяемости: Succeed',
);
check(
  await found('transport-parts', partListing.id, { compatChassis: 'NCP165' }),
  'фильтр применяемости: кузов NCP165',
);
check(
  !(await found('transport-parts', partListing.id, { compatModel: 'probox' })),
  'донор Probox в фильтр совместимости не попал',
);
check(
  !(await found('transport-parts', partListing.id, { compatChassis: 'NCP51' })),
  'кузов донора — тоже нет',
);
check(
  await found('transport-parts', partListing.id, { partNumber: main }),
  'фильтр по основному номеру',
);
check(
  await found('transport-parts', partListing.id, {
    partOriginality: 'analog',
    partManufacturer: 'kyb',
  }),
  'фильтр: аналог KYB',
);
check(
  !(await found('transport-parts', partListing.id, { partOriginality: 'original' })),
  'фильтр: оригинал — нет',
);
const searchFor = async (text) => {
  const query = new URLSearchParams({
    category: 'transport-parts',
    regionWide: 'true',
    limit: '50',
    search: text,
  });
  return ((await call('GET', `/listings?${query}`)).body?.items ?? []).some(
    (item) => item.id === partListing.id,
  );
};
check(await searchFor(main), 'поиск по основному номеру');
check(await searchFor(replacement), 'поиск по номеру замены');
check(await searchFor(main.replace('-', '')), 'поиск по номеру без дефиса');
check(await searchFor('NCP165'), 'поиск по кузову NCP165');
check(await searchFor('1NZ'), 'поиск по двигателю 1NZ');
check(!(await searchFor('NCP51')), 'поиск по кузову донора её не находит как применяемость');
const partCard = await cardOf('transport-parts', partListing.id);
check(
  partCard.includes(`KYB · Б/У аналог · ${main} · Succeed NCP165`) &&
    !partCard.includes(replacement),
  'карточка: производитель, состояние, основной номер, применяемость',
  partCard,
);
check(partCard.endsWith('Снята с: Toyota Probox NCP51'), 'карточка: донор отдельно', partCard);

const unknownFit = await post('transport-parts', {
  title: 'Генератор',
  attributes: {
    partGroup: 'electrics',
    partItem: 'alternator',
    partCondition: 'used',
    partOriginality: 'original',
  },
});
const unknownDetail = (await detailOf('transport-parts', unknownFit.id)).listing;
check(
  unknownFit.status === 201 &&
    (unknownDetail?.part?.compatibility ?? []).length === 0 &&
    !/Подходит/.test(await cardOf('transport-parts', unknownFit.id)),
  'применяемость не указана — не придумывается',
  `статус ${unknownFit.status}`,
);

// ── 7. Смена категории и типа товара ─────────────────────────────────────
console.log('\n7. Смена категории и типа');
const toTablet = await call(
  'PATCH',
  `/my/listings/${phone.id}`,
  {
    categoryId: bySlug['electronics-tablets'].id,
    attributes: { brand: 'samsung', memory: '256', condition: 'used' },
  },
  phone.token,
);
const moved = (await call('GET', `/my/listings/${phone.id}`, undefined, phone.token)).body;
check(
  toTablet.status === 200 &&
    moved?.attributes?.memory === '256' &&
    moved?.attributes?.battery === undefined,
  'телефон → планшет: память осталась, аккумулятора нет',
  `статус ${toTablet.status} ${JSON.stringify(moved?.attributes)}`,
);
const withForeign = await call(
  'PATCH',
  `/my/listings/${phone.id}`,
  { attributes: { brand: 'samsung', memory: '256', condition: 'used', mileage: 1000 } },
  phone.token,
);
const foreignAfter = (await call('GET', `/my/listings/${phone.id}`, undefined, phone.token)).body;
check(
  withForeign.status === 400 || foreignAfter?.attributes?.mileage === undefined,
  'пробег у планшета не сохраняется',
  `статус ${withForeign.status}`,
);
const rimsToTires = await call(
  'PATCH',
  `/my/listings/${rims.id}`,
  {
    attributes: {
      tireType: 'tires',
      tireWidth: 225,
      tireProfile: 45,
      diameter: 17,
      season: 'winter',
      quantity: 4,
      condition: 'used',
      rimWidth: 6.5,
      pcd: '5x114_3',
    },
  },
  rims.token,
);
const rimsAfter = (await call('GET', `/my/listings/${rims.id}`, undefined, rims.token)).body
  ?.attributes;
check(
  rimsToTires.status === 200 &&
    rimsAfter?.season === 'winter' &&
    rimsAfter?.rimWidth === undefined &&
    rimsAfter?.pcd === undefined,
  'диски → шины: сезон появился, ширина диска и разболтовка убраны',
  JSON.stringify(rimsAfter),
);
check(
  !(await found('transport-tires', rims.id, { rimWidth: { from: 6, to: 7 } })),
  'и фильтр ширины диска их больше не находит',
);

// ── 8. Старое объявление без новых полей ─────────────────────────────────
console.log('\n8. Старое объявление');
const legacy = await post('home-furniture', {
  title: 'Диван',
  attributes: { furnitureType: 'sofa', condition: 'used' },
});
const legacyCard = await cardOf('home-furniture', legacy.id);
check(
  legacy.status === 201 && !/undefined|null|NaN/.test(legacyCard),
  'без размеров карточка цела',
  legacyCard,
);
check(
  Object.values((await detailOf('home-furniture', legacy.id)).rows).every(
    (text) => text && !/undefined|null/.test(text),
  ),
  'страница без пустых строк',
);

// ── 9. Умный поиск внутри категории ──────────────────────────────────────
console.log('\n9. Умный поиск в открытой категории');
const smart = async (text, listingCategory) =>
  (
    await call('POST', '/smart-search', {
      text,
      context: { cityId, screen: 'listings', listingCategory },
    })
  ).body?.parts?.[0]?.query?.params ?? {};
for (const [text, category] of [
  ['NCP165', 'transport-parts'],
  ['1NZ', 'transport-parts'],
  [main, 'transport-parts'],
  ['Succeed NCP165', 'transport-parts'],
  ['iPhone', 'electronics-phones'],
  ['Galaxy', 'electronics-phones'],
]) {
  const params = await smart(text, category);
  check(
    params.category === category,
    `«${text}» в «${category}» остаётся в категории`,
    JSON.stringify(params),
  );
}

console.log(`\nИтого: ${passed} ✅, ${failed} ❌\n`);
process.exit(failed === 0 ? 0 : 1);
