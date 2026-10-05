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
const leaves = tree.flatMap(function leavesOf(node) {
  return node.children?.length ? node.children.flatMap(leavesOf) : [node];
});
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
  // Каждый запрос — с нового «адреса»: у публичной выдачи есть лимит, а сценариев больше сотни
  return (await call('GET', `/listings?${query}`, undefined, undefined, randomIp())).body;
};
// Только объявления этого прогона: поиск нечёткий, и метки прежних прогонов («Прогон78339»
// и «Прогон78636») ему почти одинаковы — оставшиеся в базе записи не должны ломать сравнение
const titles = (page) =>
  (page?.items ?? [])
    .filter((item) => item.title.includes(TAG))
    .map((item) => item.title.replace(` ${TAG}`, ''));

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

const toolBosch = await post('personal-bags', {
  title: 'Шуруповёрт',
  deal: { transactionType: 'sale' },
  attributes: { brandName: 'Bosch Professional' },
  price: 5_000_00,
});
const toolMakita = await post('personal-bags', {
  title: 'Перфоратор',
  deal: { transactionType: 'sale' },
  attributes: { brandName: 'Makita' },
  price: 7_000_00,
});
const textBosc = await search({
  category: 'personal-bags',
  attributes: attributesParam({ brandName: 'bosc' }),
});
check(
  titles(textBosc).includes('Шуруповёрт') && !titles(textBosc).includes('Перфоратор'),
  'текстовый фильтр: часть слова, без учёта регистра («bosc» → Bosch)',
  titles(textBosc).join('; '),
);
const textUpper = await search({
  category: 'personal-bags',
  attributes: attributesParam({ brandName: 'MAKITA' }),
});
check(titles(textUpper).includes('Перфоратор'), 'текстовый фильтр: регистр не важен');
const textNone = await search({
  category: 'personal-bags',
  attributes: attributesParam({ brandName: 'zzzz' }),
});
check(titles(textNone).length === 0, 'текстовый фильтр: чужое слово — пусто');
const textPercent = await search({
  category: 'personal-bags',
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

// ── 5b. Расширенный справочник: редкие и снятые с производства модели ───────
console.log('\n5b. Расширенный справочник моделей');
/** Только свои объявления этого прогона: прежние прогоны оставляют такие же заголовки. */
const mineOf = (page) =>
  (page?.items ?? []).map((item) => item.title).filter((title) => title.includes(TAG));
const modelsOf = async (brand) =>
  (await call('GET', `/listings/dictionaries/car_model?parent=${brand}`)).body ?? [];
const valueOf = (list, label) => list.find((model) => model.label === label)?.value;

const SAMPLES = [
  ['toyota', 'Succeed'],
  ['toyota', 'Corolla Fielder'],
  ['toyota', 'Premio'],
  ['toyota', 'Mark X'],
  ['nissan', 'Wingroad'],
  ['honda', 'Stepwgn'],
  ['mazda', 'Atenza'],
  ['mitsubishi', 'Delica'],
  ['subaru', 'Levorg'],
  ['suzuki', 'Escudo'],
  ['daihatsu', 'Mira'],
  ['kia', 'Stinger'],
  ['bmw', 'X4'],
  ['chery', 'Tiggo 7 Pro'],
];

const modelLists = {};
for (const brand of new Set(SAMPLES.map(([item]) => item)))
  modelLists[brand] = await modelsOf(brand);
check(
  modelLists.toyota.length > 150 && modelLists.nissan.length > 90,
  'у крупных марок сотни моделей',
  `Toyota ${modelLists.toyota.length}, Nissan ${modelLists.nissan.length}`,
);
check(
  SAMPLES.every(([brand, label]) => valueOf(modelLists[brand], label)),
  'редкие и снятые модели 10 марок отдаются списком марки',
);

const sampleListings = [];
for (const [brand, label] of SAMPLES) {
  const created = await post('transport-cars', {
    title: `Справочник ${label}`,
    deal: { transactionType: 'sale' },
    attributes: { brand, model: valueOf(modelLists[brand], label), year: 2014, mileage: 120_000 },
  });
  sampleListings.push({ brand, label, created });
}
check(
  sampleListings.every((item) => ok(item.created)),
  'объявления с новыми моделями проходят проверку при подаче',
  sampleListings
    .filter((item) => !ok(item.created))
    .map((item) => `${item.label}:${item.created.status}`)
    .join(' '),
);

let filterOk = true;
for (const { brand, label } of sampleListings) {
  const found = await search({
    category: 'transport-cars',
    attributes: attributesParam({ brand, model: valueOf(modelLists[brand], label) }),
  });
  const mine = mineOf(found);
  if (!(mine.length === 1 && mine[0].includes(`Справочник ${label}`))) {
    filterOk = false;
    console.log('    фильтр:', brand, label, mine.join('; '));
  }
}
check(filterOk, 'фильтр «марка + модель» возвращает ровно объявление этой модели');

const succeedListing = sampleListings.find((item) => item.label === 'Succeed');
const premioValue = valueOf(modelLists.toyota, 'Premio');
const editedModel = await call(
  'PATCH',
  `/my/listings/${succeedListing.created.body?.id}`,
  { attributes: { brand: 'toyota', model: premioValue, year: 2014, mileage: 120_000 } },
  succeedListing.created.owner.token,
);
check(
  ok(editedModel),
  'правка: Succeed → Premio проходит проверку',
  `статус ${editedModel.status}`,
);
const wrongEdit = await call(
  'PATCH',
  `/my/listings/${succeedListing.created.body?.id}`,
  { attributes: { brand: 'honda', model: premioValue, year: 2014, mileage: 120_000 } },
  succeedListing.created.owner.token,
);
check(wrongEdit.status === 400, 'правка: Honda + Premio (модель чужой марки) — отказ');
const afterEdit = await search({
  category: 'transport-cars',
  attributes: attributesParam({ brand: 'toyota', model: valueOf(modelLists.toyota, 'Succeed') }),
});
check(
  !mineOf(afterEdit).some((title) => title.includes('Succeed')),
  'после правки объявление не находится по прежней модели',
);
const afterEditNew = await search({
  category: 'transport-cars',
  attributes: attributesParam({ brand: 'toyota', model: premioValue }),
});
check(
  mineOf(afterEditNew).some((title) => title.includes('Succeed')),
  'и находится по новой (Premio)',
);

const byAlias = await search({ category: 'transport-cars', search: 'филдер' });
check(
  (byAlias.items ?? []).length > 0 &&
    (byAlias.items ?? []).every((item) => item.title.includes('Corolla Fielder')),
  'текстовый поиск находит модель по русскому написанию («филдер») и только её',
  (byAlias.items ?? []).map((item) => item.title).join('; '),
);
const byWingroad = await search({ category: 'transport-cars', search: 'вингроад' });
check(
  (byWingroad.items ?? []).length > 0 &&
    (byWingroad.items ?? []).every((item) => item.title.includes('Wingroad')),
  'поиск «вингроад» находит Wingroad и только его',
  (byWingroad.items ?? []).map((item) => item.title).join('; '),
);
const byLabel = await search({ category: 'transport-cars', search: 'Stepwgn' });
check(
  (byLabel.items ?? []).length > 0 &&
    (byLabel.items ?? []).every((item) => item.title.includes('Stepwgn')),
  'текстовый поиск находит модель латиницей и только её',
);

// ── 5c. Бренд → модель в других категориях (не только автомобили) ───────────
console.log('\n5c. Бренд → модель: мото, телефоны, ноутбуки, техника, грузовики, часы, фото');

const dictionaryOf = async (kind, parent) =>
  (
    await call(
      'GET',
      `/listings/dictionaries/${kind}${parent ? `?parent=${encodeURIComponent(parent)}` : ''}`,
      undefined,
      undefined,
      randomIp(),
    )
  ).body ?? [];
const labelToValue = (list, label) => list.find((entry) => entry.label === label)?.value;

const CASES = [
  {
    slug: 'transport-moto',
    brandKind: 'moto_brand',
    modelKind: 'moto_model',
    items: [
      ['kawasaki', 'Ninja 400'],
      ['yamaha', 'MT-07'],
      ['honda', 'CB400 Super Four'],
    ],
    extra: { year: 2018 },
    alias: 'ниндзя',
    aliasTitle: 'Ninja 400',
  },
  {
    slug: 'electronics-phones',
    brandKind: 'phone_brand',
    modelKind: 'phone_model',
    items: [
      ['apple', 'iPhone 6s'],
      ['samsung', 'Galaxy S10e'],
      ['xiaomi', 'Mi 9T'],
    ],
    extra: {},
    alias: 'айфон 6',
    aliasTitle: 'iPhone 6s',
  },
  {
    slug: 'electronics-laptops',
    brandKind: 'computer_brand',
    modelKind: 'laptop_model',
    items: [
      ['lenovo', 'ThinkPad T'],
      ['apple', 'MacBook Air'],
      ['asus', 'TUF Gaming F15'],
    ],
    extra: {},
    alias: 'тинкпад',
    aliasTitle: 'ThinkPad T',
  },
  {
    slug: 'transport-trucks',
    brandKind: 'truck_brand',
    modelKind: 'truck_model',
    items: [
      ['mercedes', 'Actros'],
      ['kamaz', '65115'],
      ['hyundai', 'HD78'],
    ],
    extra: { year: 2015 },
    alias: 'актрос',
    aliasTitle: 'Actros',
  },
  {
    slug: 'transport-special',
    brandKind: 'special_brand',
    modelKind: 'special_model',
    items: [
      ['caterpillar', '320'],
      ['komatsu', 'PC200'],
      ['jcb', '3CX'],
    ],
    extra: { year: 2012 },
    alias: 'катерпиллар',
    aliasTitle: '320',
  },
  {
    slug: 'electronics-watches',
    brandKind: 'watch_brand',
    modelKind: 'watch_model',
    items: [
      ['apple', 'Apple Watch Series 9'],
      ['garmin', 'Fenix 7'],
      ['amazfit', 'GTR 4'],
    ],
    extra: {},
    alias: 'эпл вотч',
    aliasTitle: 'Apple Watch Series 9',
  },
  {
    slug: 'electronics-photo',
    brandKind: 'photo_brand',
    modelKind: 'photo_model',
    items: [
      ['canon', 'EOS 5D Mark IV'],
      ['sony', 'a7 III'],
      ['dji', 'Mavic 3 Pro'],
    ],
    extra: {},
    alias: 'мавик',
    aliasTitle: 'Mavic 3 Pro',
  },
];

for (const test of CASES) {
  const brandList = await dictionaryOf(test.brandKind);
  check(
    items(
      brandList,
      test.items.map(([brand]) => brand),
    ),
    `${test.slug}: справочник брендов отдаётся, нужные бренды на месте`,
    `${brandList.length}`,
  );
  const posted = [];
  for (const [brand, label] of test.items) {
    const models = await dictionaryOf(test.modelKind, brand);
    const model = labelToValue(models, label);
    check(
      Boolean(model),
      `${test.slug}: у ${brand} в списке «${label}»`,
      `${models.length} моделей`,
    );
    const created = await post(test.slug, {
      title: `Каталог ${label}`,
      deal: { transactionType: 'sale' },
      attributes: { brand, model, ...test.extra },
    });
    posted.push({ brand, label, model, created });
  }
  check(
    posted.every((item) => ok(item.created)),
    `${test.slug}: объявления с моделями из справочника поданы`,
    posted
      .filter((item) => !ok(item.created))
      .map(
        (item) =>
          `${item.label}:${item.created.status}:${JSON.stringify(item.created.body?.message ?? '').slice(0, 80)}`,
      )
      .join(' '),
  );

  // Фильтр: бренд + модель возвращает ровно своё объявление
  let exact = true;
  for (const { brand, label, model } of posted) {
    const found = await search({
      category: test.slug,
      attributes: attributesParam({ brand, model }),
    });
    const mine = mineOf(found);
    if (!(mine.length === 1 && mine[0].includes(`Каталог ${label}`))) {
      exact = false;
      console.log('    фильтр:', test.slug, brand, label, mine.join('; '));
    }
  }
  check(exact, `${test.slug}: фильтр «бренд + модель» возвращает ровно объявление этой модели`);

  // Чужая пара: модель первого бренда с брендом второго
  const [first, second] = posted;
  const crossed = await post(test.slug, {
    title: 'Чужая пара',
    deal: { transactionType: 'sale' },
    attributes: { brand: second.brand, model: first.model, ...test.extra },
  });
  check(
    crossed.status === 400,
    `${test.slug}: модель чужого бренда — отказ`,
    `статус ${crossed.status}`,
  );
  const nothing = await search({
    category: test.slug,
    attributes: attributesParam({ brand: second.brand, model: first.model }),
  });
  check(
    mineOf(nothing).length === 0,
    `${test.slug}: фильтр «бренд ${second.brand} + модель ${first.label}» — пусто`,
  );

  // Русское написание в текстовом поиске
  const aliasFound = await search({ category: test.slug, search: test.alias });
  check(
    (aliasFound.items ?? []).some((item) => item.title.includes(`Каталог ${test.aliasTitle}`)),
    `${test.slug}: текстовый поиск по «${test.alias}» находит «${test.aliasTitle}»`,
    mineOf(aliasFound).join('; ').slice(0, 120),
  );

  // Правка: меняем бренд и модель целиком, объявление переезжает в другой фильтр
  const patched = await call(
    'PATCH',
    `/my/listings/${first.created.body?.id}`,
    {
      attributes: await requiredAttributes(test.slug, {
        brand: second.brand,
        model: second.model,
        ...test.extra,
      }),
    },
    first.created.owner.token,
  );
  check(
    ok(patched),
    `${test.slug}: правка бренда и модели проходит`,
    `статус ${patched.status} ${JSON.stringify(ok(patched) ? '' : patched.body?.details).slice(0, 300)}`,
  );
  const afterOld = await search({
    category: test.slug,
    attributes: attributesParam({ brand: first.brand, model: first.model }),
  });
  check(
    !mineOf(afterOld).some((title) => title.includes(`Каталог ${first.label}`)),
    `${test.slug}: после правки не находится по прежней модели`,
  );
  const patchedBad = await call(
    'PATCH',
    `/my/listings/${first.created.body?.id}`,
    {
      attributes: await requiredAttributes(test.slug, {
        brand: first.brand,
        model: second.model,
        ...test.extra,
      }),
    },
    first.created.owner.token,
  );
  check(patchedBad.status === 400, `${test.slug}: правка на несовместимую пару — отказ`);
}

// Категории без каталога моделей: бренд из списка + модель текстом, фильтр по бренду
const BRAND_ONLY = [
  { slug: 'home-appliances', kind: 'appliance_brand', brand: 'bosch', model: true, extra: {} },
  { slug: 'electronics-tv', kind: 'tv_brand', brand: 'samsung', model: true, extra: {} },
  { slug: 'home-tools', kind: 'tool_brand', brand: 'makita', extra: {} },
  { slug: 'transport-tires', kind: 'tire_brand', brand: 'michelin', extra: {} },
];
for (const test of BRAND_ONLY) {
  const list = await dictionaryOf(test.kind);
  check(
    list.some((entry) => entry.value === test.brand),
    `${test.slug}: в списке брендов есть ${test.brand}`,
    `${list.length}`,
  );
  const created = await post(test.slug, {
    title: `Бренд ${test.brand}`,
    deal: { transactionType: 'sale' },
    attributes: {
      brand: test.brand,
      ...(test.model ? { modelName: 'ABC-123 текстом' } : {}),
      ...test.extra,
    },
  });
  check(
    ok(created),
    `${test.slug}: объявление с брендом из списка поданo`,
    `статус ${created.status}`,
  );
  const found = await search({
    category: test.slug,
    attributes: attributesParam({ brand: test.brand }),
  });
  check(
    mineOf(found).some((title) => title.includes(`Бренд ${test.brand}`)),
    `${test.slug}: фильтр по бренду находит объявление`,
    `${(found.items ?? []).length} найдено`,
  );
  const wrong = await post(test.slug, {
    title: 'Чужой бренд',
    deal: { transactionType: 'sale' },
    attributes: { brand: 'нет_такого', ...test.extra },
  });
  check(wrong.status === 400, `${test.slug}: бренд не из списка — отказ`, `статус ${wrong.status}`);
}

function items(list, values) {
  return values.every((value) => list.some((entry) => entry.value === value));
}

console.log(`\nИтого: ${passed} пройдено, ${failed} с ошибкой`);
process.exit(failed === 0 ? 0 : 1);
