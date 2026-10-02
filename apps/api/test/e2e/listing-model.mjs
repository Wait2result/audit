/**
 * Операции, цена и фильтры объявлений — сценарий на живом сервере (ТЗ
 * «Объявления», фаза 3). Запуск: node test/e2e/listing-model.mjs
 *
 *   1. Операции при подаче: жильё (продам/сдам), транспорт и техника (продам /
 *      сдам в аренду), категория без аренды, запрещённые значения.
 *   2. Единицы цены: продажа ₽, аренда ₽/мес, ₽/сут, ₽/час, ₽/нед; несовместимое
 *      отклоняется; срок выводится из единицы.
 *   3. Правка: операция и единица меняются только согласованно.
 *   4. Поиск по операции: «Купить» — только продажа, «Снять» / «Арендовать» —
 *      только аренда; единицы не смешиваются.
 *   5. Диапазоны (battery, landArea, experienceYears), комнаты «4+», текст.
 *   6. Автомобили: марка, модель, зависимость модели от марки.
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

// Каждый «человек» приходит со своего адреса: в разработке сервер доверяет
// X-Forwarded-For, а лимиты (20 объявлений в час и т. п.) считаются по адресу
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
    {
      phone,
      code: otp.body?.devCode,
      purpose: 'registration',
    },
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

console.log('\nОперации, цена и фильтры объявлений');
console.log('═══════════════════════════════════════\n');

const seller = await register('Продавец');
const cities = (await call('GET', '/cities')).body;
const cityId = cities.find((city) => city.slug === 'makhachkala').id;
const tree = (await call('GET', '/listings/categories?withAttributes=1')).body;
const leaves = tree.flatMap((root) => root.children);
const bySlug = Object.fromEntries(leaves.map((leaf) => [leaf.slug, leaf]));

/** Метка, по которой находим только свои объявления: она есть в заголовке. */
const TAG = `Прогон${Math.floor(Math.random() * 90000) + 10000}`;

/** Обязательные характеристики: первое допустимое значение, если не задано. */
async function requiredAttributes(slug, overrides = {}) {
  const result = { ...overrides };
  for (const field of bySlug[slug].attributes ?? []) {
    if (!field.required || result[field.key] !== undefined) continue;
    if (field.type === 'enum') result[field.key] = field.options[0].value;
    else if (field.type === 'number') result[field.key] = Math.max(field.min ?? 1, 1);
    else if (field.type === 'boolean') result[field.key] = true;
    else if (field.type === 'brand' || field.type === 'model') {
      const entries = (await call('GET', `/listings/dictionaries/${field.dictionary}`)).body;
      result[field.key] = entries[0].value;
    } else result[field.key] = 'Тест';
  }
  return result;
}

// Антиспам ограничивает число публикаций одного человека подряд (429), поэтому
// продавец меняется каждые несколько объявлений — как разные люди на площадке
let owner = seller;
let postedByOwner = 0;

/** Подаёт объявление; возвращает ответ целиком, чтобы проверять и ошибки. */
async function post(slug, { title, deal = {}, attributes = {}, price = 250_000_00 } = {}) {
  if (postedByOwner >= 8) {
    owner = await register('Продавец');
    postedByOwner = 0;
  }
  postedByOwner += 1;
  const response = await call(
    'POST',
    '/my/listings',
    {
      cityId,
      categoryId: bySlug[slug].id,
      title: `${title ?? 'Объект'} ${TAG}`,
      description: 'Описание объявления для проверки операций и цены.',
      ...(price === null ? {} : { price }),
      isNegotiable: false,
      attributes: await requiredAttributes(slug, attributes),
      location: { latitude: 42.9849, longitude: 47.5047, accuracy: 'point' },
      contactPhone: '+79501234567',
      allowChat: true,
      allowCalls: true,
      photoIds: [],
      ...deal,
    },
    owner.token,
  );
  // Токен автора нужен для правки этого объявления
  response.owner = owner;
  return response;
}

const ok = (response) => response.status === 201 || response.status === 200;

// ── 1. Операции при подаче ──────────────────────────────────────────────────
console.log('1. Операции при подаче');

const flatSale = await post('realty-flats', {
  title: 'Квартира продажа',
  deal: { transactionType: 'sale', priceUnit: 'total' },
  attributes: { rooms: 2, areaTotal: 54 },
});
check(ok(flatSale), 'жильё: «Продам» принимается', `статус ${flatSale.status}`);
check(
  flatSale.body?.transactionType === 'sale' && flatSale.body?.price?.unit === 'total',
  'продажа: операция sale, цена целиком',
);

const flatMonthly = await post('realty-flats', {
  title: 'Квартира надолго',
  deal: { transactionType: 'rent', rentPeriod: 'monthly', priceUnit: 'per_month' },
  attributes: { rooms: 2, areaTotal: 54 },
});
check(ok(flatMonthly), 'жильё: «Сдам» надолго — ₽/мес', `статус ${flatMonthly.status}`);

const flatDaily = await post('realty-flats', {
  title: 'Квартира посуточно',
  deal: { transactionType: 'rent', rentPeriod: 'daily', priceUnit: 'per_day' },
  attributes: { rooms: 1, areaTotal: 30 },
});
check(ok(flatDaily), 'жильё: «Сдам» посуточно — ₽/сут', `статус ${flatDaily.status}`);

const flatNoPeriod = await post('realty-flats', {
  title: 'Квартира без срока',
  deal: { transactionType: 'rent' },
  attributes: { rooms: 1, areaTotal: 30 },
});
check(
  flatNoPeriod.status === 400,
  'жильё: аренда без срока — отказ',
  `статус ${flatNoPeriod.status}`,
);

const flatMismatch = await post('realty-flats', {
  title: 'Квартира срок и единица',
  deal: { transactionType: 'rent', rentPeriod: 'daily', priceUnit: 'per_month' },
  attributes: { rooms: 1, areaTotal: 30 },
});
check(flatMismatch.status === 400, 'жильё: «посуточно» с ценой «в месяц» — отказ');

const flatSaleDay = await post('realty-flats', {
  title: 'Квартира продажа в сутки',
  deal: { transactionType: 'sale', priceUnit: 'per_day' },
  attributes: { rooms: 1, areaTotal: 30 },
});
check(flatSaleDay.status === 400, 'продажа с ценой «в сутки» — отказ');

const flatHourly = await post('realty-flats', {
  title: 'Квартира по часам',
  deal: { transactionType: 'rent', rentPeriod: 'daily', priceUnit: 'per_hour' },
  attributes: { rooms: 1, areaTotal: 30 },
});
check(flatHourly.status === 400, 'жильё по часам не сдаётся');

for (const transactionType of ['buy', 'rent_wanted', 'wanted']) {
  const forbidden = await post('realty-flats', {
    title: 'Квартира запрещённая операция',
    deal: { transactionType },
    attributes: { rooms: 1, areaTotal: 30 },
  });
  check(forbidden.status === 400, `«${transactionType}» (куплю / сниму) не публикуется`);
}

const carSale = await post('transport-cars', {
  title: 'Автомобиль продажа',
  deal: { transactionType: 'sale', priceUnit: 'total' },
  attributes: { year: 2020, mileage: 50_000 },
});
check(ok(carSale), 'транспорт: «Продам» принимается', `статус ${carSale.status}`);

const carDay = await post('transport-cars', {
  title: 'Автомобиль в сутки',
  deal: { transactionType: 'rent', priceUnit: 'per_day' },
  attributes: { year: 2020, mileage: 50_000 },
});
check(ok(carDay), 'транспорт: «Сдам в аренду» — ₽/сут', `статус ${carDay.status}`);
check(
  carDay.body?.transactionType === 'rent' && carDay.body?.rentPeriod === 'daily',
  'срок выведен из единицы: ₽/сут → посуточно',
  `rentPeriod = ${carDay.body?.rentPeriod}`,
);

const carHour = await post('transport-cars', {
  title: 'Автомобиль в час',
  deal: { transactionType: 'rent', priceUnit: 'per_hour' },
  attributes: { year: 2020, mileage: 50_000 },
  price: 800_00,
});
check(ok(carHour), 'транспорт: аренда ₽/час', `статус ${carHour.status}`);
check(carHour.body?.rentPeriod === null, 'почасовая аренда — без срока «посуточно / надолго»');

const carWeek = await post('transport-cars', {
  title: 'Автомобиль в неделю',
  deal: { transactionType: 'rent', priceUnit: 'per_week' },
  attributes: { year: 2020, mileage: 50_000 },
  price: 15_000_00,
});
check(ok(carWeek), 'транспорт: аренда ₽/нед', `статус ${carWeek.status}`);

const carMonth = await post('transport-cars', {
  title: 'Автомобиль в месяц',
  deal: { transactionType: 'rent', priceUnit: 'per_month' },
  attributes: { year: 2020, mileage: 50_000 },
  price: 50_000_00,
});
check(ok(carMonth), 'транспорт: аренда ₽/мес', `статус ${carMonth.status}`);
check(carMonth.body?.rentPeriod === 'monthly', 'срок выведен из единицы: ₽/мес → надолго');

const carRentTotal = await post('transport-cars', {
  title: 'Автомобиль аренда целиком',
  deal: { transactionType: 'rent', priceUnit: 'total' },
  attributes: { year: 2020, mileage: 50_000 },
});
check(carRentTotal.status === 400, 'аренда с ценой «целиком» — отказ');

const carSaleDay = await post('transport-cars', {
  title: 'Автомобиль продажа в сутки',
  deal: { transactionType: 'sale', priceUnit: 'per_day' },
  attributes: { year: 2020, mileage: 50_000 },
});
check(carSaleDay.status === 400, 'продажа автомобиля «в сутки» — отказ');

const carPeriodUnit = await post('transport-cars', {
  title: 'Автомобиль срок и единица',
  deal: { transactionType: 'rent', rentPeriod: 'daily', priceUnit: 'per_week' },
  attributes: { year: 2020, mileage: 50_000 },
});
check(carPeriodUnit.status === 400, '«посуточно» с ценой «в неделю» — отказ');

const toolRent = await post('home-tools', {
  title: 'Инструмент аренда',
  deal: { transactionType: 'rent', priceUnit: 'per_day' },
  price: 1_500_00,
});
check(ok(toolRent), 'инструмент: аренда включена', `статус ${toolRent.status}`);

const phoneRent = await post('electronics-phones', {
  title: 'Телефон аренда',
  deal: { transactionType: 'rent', priceUnit: 'per_day' },
});
check(phoneRent.status === 400, 'категория без аренды (телефоны): «Сдам» — отказ');

const phoneSale = await post('electronics-phones', {
  title: 'Телефон продажа',
  deal: { transactionType: 'sale' },
  attributes: { battery: 95 },
});
check(ok(phoneSale), 'категория без аренды: «Продам» принимается', `статус ${phoneSale.status}`);

// ── 2. Правка ───────────────────────────────────────────────────────────────
console.log('\n2. Правка объявления');
const edited = await call(
  'PATCH',
  `/my/listings/${carSale.body?.id}`,
  { transactionType: 'rent', priceUnit: 'per_week', price: 12_000_00 },
  carSale.owner.token,
);
check(ok(edited), 'продажа → аренда ₽/нед', `статус ${edited.status}`);
check(
  edited.body?.transactionType === 'rent' && edited.body?.price?.unit === 'per_week',
  'после правки: аренда, цена в неделю',
);
const editedBad = await call(
  'PATCH',
  `/my/listings/${carSale.body?.id}`,
  { transactionType: 'sale', priceUnit: 'per_week' },
  carSale.owner.token,
);
check(editedBad.status === 400, 'правка: продажа с ценой «в неделю» — отказ');
const editedForbidden = await call(
  'PATCH',
  `/my/listings/${carSale.body?.id}`,
  { transactionType: 'buy' },
  carSale.owner.token,
);
check(editedForbidden.status === 400, 'правка: «buy» — отказ');

// Объявление, которое остаётся продажей: прежнее «Автомобиль продажа» правкой стало арендой
const carSale2 = await post('transport-cars', {
  title: 'Автомобиль только продажа',
  deal: { transactionType: 'sale', priceUnit: 'total' },
  attributes: { year: 2018, mileage: 90_000 },
});
check(ok(carSale2), 'продажа автомобиля подана ещё раз', `статус ${carSale2.status}`);

// ── 3. Поиск по операции ────────────────────────────────────────────────────
console.log('\n3. Поиск по операции');
const search = async (params) => {
  const query = new URLSearchParams({
    search: TAG,
    regionWide: 'true',
    latitude: '42.9849',
    longitude: '47.5047',
    limit: '50',
    ...params,
  });
  return (await call('GET', `/listings?${query}`)).body;
};
const titles = (page) => (page?.items ?? []).map((item) => item.title.replace(` ${TAG}`, ''));

const flatsBuy = await search({ category: 'realty-flats', transactionType: 'sale' });
check(
  titles(flatsBuy).includes('Квартира продажа') &&
    !titles(flatsBuy).some((title) => title.includes('надолго') || title.includes('посуточно')),
  '«Купить» (жильё): только продажа',
  titles(flatsBuy).join('; '),
);
const flatsRent = await search({ category: 'realty-flats', transactionType: 'rent' });
check(
  titles(flatsRent).includes('Квартира надолго') &&
    titles(flatsRent).includes('Квартира посуточно') &&
    !titles(flatsRent).includes('Квартира продажа'),
  '«Снять» (жильё): только аренда',
  titles(flatsRent).join('; '),
);
const flatsDaily = await search({
  category: 'realty-flats',
  transactionType: 'rent',
  rentPeriod: 'daily',
});
check(
  titles(flatsDaily).includes('Квартира посуточно') &&
    !titles(flatsDaily).includes('Квартира надолго'),
  '«Снять посуточно»: сутки без «надолго»',
);

const carsBuy = await search({ category: 'transport-cars', transactionType: 'sale' });
check(
  titles(carsBuy).every((title) => !title.includes('в сутки') && !title.includes('в месяц')),
  '«Купить» (транспорт): аренды нет в выдаче',
  titles(carsBuy).join('; '),
);
const carsRent = await search({ category: 'transport-cars', transactionType: 'rent' });
check(
  ['Автомобиль в сутки', 'Автомобиль в час', 'Автомобиль в месяц'].every((title) =>
    titles(carsRent).includes(title),
  ),
  '«Арендовать» (транспорт): вся аренда во всех единицах',
  titles(carsRent).join('; '),
);
check(!titles(carsRent).includes('Автомобиль только продажа'), '«Арендовать»: продажи нет');
check(
  titles(carsRent).includes('Автомобиль продажа') &&
    !titles(carsBuy).includes('Автомобиль продажа'),
  'объявление, переведённое правкой в аренду, ушло из «Купить» в «Арендовать»',
);
check(titles(carsBuy).includes('Автомобиль только продажа'), '«Купить»: продажа на месте');

const carsHour = await search({
  category: 'transport-cars',
  transactionType: 'rent',
  priceUnit: 'per_hour',
});
check(
  titles(carsHour).length === 1 && titles(carsHour)[0] === 'Автомобиль в час',
  'единица ₽/час — только почасовая аренда',
  titles(carsHour).join('; '),
);
const carsPriceMonth = await search({
  category: 'transport-cars',
  transactionType: 'rent',
  priceUnit: 'per_month',
  priceTo: '6000000',
});
check(
  titles(carsPriceMonth).length === 1 && titles(carsPriceMonth)[0] === 'Автомобиль в месяц',
  '«до 60 000 ₽/мес» не подмешивает суточную и почасовую аренду',
  titles(carsPriceMonth).join('; '),
);
const carsPriceDay = await search({
  category: 'transport-cars',
  transactionType: 'rent',
  priceUnit: 'per_day',
  priceTo: '100000000',
});
check(
  titles(carsPriceDay).includes('Автомобиль в сутки') &&
    !titles(carsPriceDay).includes('Автомобиль в месяц') &&
    !titles(carsPriceDay).includes('Автомобиль в час'),
  'то же число в другой единице — другая выдача',
);

const badOperation = await call('GET', '/listings?transactionType=kupliu&regionWide=true');
check(badOperation.status === 400, 'поиск с неизвестной операцией — отказ');

// ── 4. Диапазоны, комнаты, текст ────────────────────────────────────────────
console.log('\n4. Диапазоны, «4+», текст');
const phoneLow = await post('electronics-phones', {
  title: 'Телефон батарея 70',
  deal: { transactionType: 'sale' },
  attributes: { battery: 70 },
});
const phoneHigh = await post('electronics-phones', {
  title: 'Телефон батарея 95',
  deal: { transactionType: 'sale' },
  attributes: { battery: 95 },
});
const attributesParam = (value) => JSON.stringify(value);
const battHigh = await search({
  category: 'electronics-phones',
  attributes: attributesParam({ battery: { from: 90 } }),
});
check(
  titles(battHigh).includes('Телефон батарея 95') &&
    !titles(battHigh).includes('Телефон батарея 70'),
  'battery «от 90»',
  titles(battHigh).join('; '),
);
const battLow = await search({
  category: 'electronics-phones',
  attributes: attributesParam({ battery: { to: 80 } }),
});
check(
  titles(battLow).includes('Телефон батарея 70') && !titles(battLow).includes('Телефон батарея 95'),
  'battery «до 80»',
);
const battBoth = await search({
  category: 'electronics-phones',
  attributes: attributesParam({ battery: { from: 60, to: 99 } }),
});
check(
  titles(battBoth).includes('Телефон батарея 70') &&
    titles(battBoth).includes('Телефон батарея 95'),
  'battery «от 60 до 99»: оба',
);
check(ok(phoneLow) && ok(phoneHigh), 'телефоны поданы');

const landSmall = await post('realty-land', {
  title: 'Участок малый',
  deal: { transactionType: 'sale' },
  attributes: { landArea: 8 },
});
const landBig = await post('realty-land', {
  title: 'Участок большой',
  deal: { transactionType: 'sale' },
  attributes: { landArea: 30 },
});
const landMid = await search({
  category: 'realty-land',
  attributes: attributesParam({ landArea: { from: 10, to: 50 } }),
});
check(
  titles(landMid).includes('Участок большой') && !titles(landMid).includes('Участок малый'),
  'landArea «10–50 соток»',
  titles(landMid).join('; '),
);
check(ok(landSmall) && ok(landBig), 'участки поданы');

const resumeJunior = await post('job-resume', {
  title: 'Резюме новичка',
  attributes: { experienceYears: 2 },
  price: null,
});
const resumeSenior = await post('job-resume', {
  title: 'Резюме опытного',
  attributes: { experienceYears: 10 },
  price: null,
});
const expFrom = await search({
  category: 'job-resume',
  attributes: attributesParam({ experienceYears: { from: 5 } }),
});
check(
  titles(expFrom).includes('Резюме опытного') && !titles(expFrom).includes('Резюме новичка'),
  'experienceYears «от 5»',
  titles(expFrom).join('; '),
);
const expTo = await search({
  category: 'job-resume',
  attributes: attributesParam({ experienceYears: { to: 5 } }),
});
check(
  titles(expTo).includes('Резюме новичка') && !titles(expTo).includes('Резюме опытного'),
  'experienceYears «до 5»',
);
check(
  ok(resumeJunior) && ok(resumeSenior),
  'резюме поданы',
  `${resumeJunior.status}: ${JSON.stringify(resumeJunior.body?.message ?? resumeJunior.body?.errors ?? '').slice(0, 200)}`,
);

const flat3 = await post('realty-flats', {
  title: 'Три комнаты',
  deal: { transactionType: 'sale' },
  attributes: { rooms: 3, areaTotal: 70 },
});
const flat4 = await post('realty-flats', {
  title: 'Четыре комнаты',
  deal: { transactionType: 'sale' },
  attributes: { rooms: 4, areaTotal: 90 },
});
const flat6 = await post('realty-flats', {
  title: 'Шесть комнат',
  deal: { transactionType: 'sale' },
  attributes: { rooms: 6, areaTotal: 160 },
});
const roomsPlus = await search({
  category: 'realty-flats',
  transactionType: 'sale',
  attributes: attributesParam({ rooms: [4] }),
});
check(
  titles(roomsPlus).includes('Четыре комнаты') &&
    titles(roomsPlus).includes('Шесть комнат') &&
    !titles(roomsPlus).includes('Три комнаты'),
  'комнаты «4+»: четыре и шесть, не три',
  titles(roomsPlus).join('; '),
);
const roomsExact = await search({
  category: 'realty-flats',
  transactionType: 'sale',
  attributes: attributesParam({ rooms: [3] }),
});
check(
  titles(roomsExact).includes('Три комнаты') && !titles(roomsExact).includes('Четыре комнаты'),
  'комнаты «3» — ровно три',
);
check(ok(flat3) && ok(flat4) && ok(flat6), 'квартиры поданы');

const toolBosch = await post('home-tools', {
  title: 'Шуруповёрт',
  deal: { transactionType: 'sale' },
  attributes: { brandName: 'Bosch Professional' },
  price: 5_000_00,
});
const toolMakita = await post('home-tools', {
  title: 'Перфоратор',
  deal: { transactionType: 'sale' },
  attributes: { brandName: 'Makita' },
  price: 7_000_00,
});
const textBosc = await search({
  category: 'home-tools',
  attributes: attributesParam({ brandName: 'bosc' }),
});
check(
  titles(textBosc).includes('Шуруповёрт') && !titles(textBosc).includes('Перфоратор'),
  'текстовый фильтр: часть слова, без учёта регистра («bosc» → Bosch)',
  titles(textBosc).join('; '),
);
const textUpper = await search({
  category: 'home-tools',
  attributes: attributesParam({ brandName: 'MAKITA' }),
});
check(titles(textUpper).includes('Перфоратор'), 'текстовый фильтр: регистр не важен');
const textNone = await search({
  category: 'home-tools',
  attributes: attributesParam({ brandName: 'zzzz' }),
});
check(titles(textNone).length === 0, 'текстовый фильтр: чужое слово — пусто');
const textPercent = await search({
  category: 'home-tools',
  attributes: attributesParam({ brandName: '%' }),
});
check(titles(textPercent).length === 0, 'текстовый фильтр: «%» — обычный символ, а не «всё»');
check(ok(toolBosch) && ok(toolMakita), 'инструменты поданы');

// ── 5. Автомобили ───────────────────────────────────────────────────────────
console.log('\n5. Автомобили: марка и модель');
const brands = (await call('GET', '/listings/dictionaries/car_brand')).body;
check(
  Array.isArray(brands) && brands.length > 30,
  'справочник марок отдаётся',
  `${brands?.length}`,
);
const toyotaModels = (await call('GET', '/listings/dictionaries/car_model?parent=toyota')).body;
const camry = toyotaModels?.find((model) => /camry/i.test(model.label));
check(Boolean(camry), 'модели выбранной марки отдаются отдельно (Toyota → Camry)');
const cheryModels = (await call('GET', '/listings/dictionaries/car_model?parent=chery')).body;
check(
  cheryModels?.length > 0 && !cheryModels.some((model) => model.value === camry?.value),
  'у Chery нет моделей Toyota: модель зависит от марки',
);

const carToyota = await post('transport-cars', {
  title: 'Тойота',
  deal: { transactionType: 'sale' },
  attributes: { brand: 'toyota', model: camry?.value, year: 2019, mileage: 80_000 },
});
const carChery = await post('transport-cars', {
  title: 'Чери',
  deal: { transactionType: 'sale' },
  attributes: { brand: 'chery', model: cheryModels?.[0]?.value, year: 2021, mileage: 30_000 },
});
check(
  ok(carToyota) && ok(carChery),
  'автомобили с маркой и моделью поданы',
  `${carToyota.status}/${carChery.status}`,
);

const wrongModel = await post('transport-cars', {
  title: 'Чужая модель',
  deal: { transactionType: 'sale' },
  attributes: { brand: 'chery', model: camry?.value, year: 2021, mileage: 30_000 },
});
check(
  wrongModel.status === 400,
  'модель чужой марки (Chery + Camry) — отказ',
  `статус ${wrongModel.status}`,
);

const byBrand = await search({
  category: 'transport-cars',
  attributes: attributesParam({ brand: 'toyota' }),
});
check(
  titles(byBrand).includes('Тойота') && !titles(byBrand).includes('Чери'),
  'фильтр по марке',
  titles(byBrand).join('; '),
);
const byBrandModel = await search({
  category: 'transport-cars',
  attributes: attributesParam({ brand: 'toyota', model: camry?.value }),
});
check(
  titles(byBrandModel).includes('Тойота') && !titles(byBrandModel).includes('Чери'),
  'фильтр по марке и модели',
);
const byOtherModel = await search({
  category: 'transport-cars',
  attributes: attributesParam({ brand: 'toyota', model: cheryModels?.[0]?.value }),
});
check(titles(byOtherModel).length === 0, 'марка Toyota + модель Chery — пусто');
const byText = await search({ category: 'transport-cars', search: `Тойота ${TAG}` });
check(titles(byText).includes('Тойота'), 'поиск текстом по заголовку находит автомобиль');

const card = (await search({ category: 'transport-cars', search: `Тойота ${TAG}` })).items?.[0];
check(
  /Toyota/.test(card?.attributesSummary ?? '') && /Camry/i.test(card?.attributesSummary ?? ''),
  'в карточке марка и модель словами',
  card?.attributesSummary,
);
const details = await call('GET', `/listings/${carToyota.body?.id}`);
check(
  details.body?.attributeLabels?.toyota === 'Toyota' &&
    /Camry/i.test(details.body?.attributeLabels?.[camry?.value] ?? ''),
  'на странице объявления — подписи марки и модели из справочника',
  JSON.stringify(details.body?.attributeLabels),
);

console.log(`\nИтого: ${passed} пройдено, ${failed} с ошибкой`);
process.exit(failed === 0 ? 0 : 1);
