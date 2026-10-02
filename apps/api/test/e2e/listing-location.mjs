/**
 * Место объявления и поиск по радиусу — сценарий целиком (ADR-0010).
 *
 * Требует запущенного сервера (с доступом в интернет — геокодер) и
 * окружения (npm run infra:up). Запуск: node test/e2e/listing-location.mjs
 *
 * Сценарий:
 *   1. Подсказки: «Махачкала Батыра» → улица, «Манаск» → сёла.
 *   2. Адрес по точке: район города определяется сам.
 *   3. Три объявления: в Махачкале (адрес из подсказки), в Манаскенте
 *      (точка на карте + адрес по ней), в соседнем Манасе (одна точка —
 *      адрес определяет сервер).
 *   4. Сохранилось ли место и телефон, что видно покупателю.
 *   5. Радиусы 1/5/10/25/50/100 км вокруг Манаскента и «Весь Дагестан».
 *   6. «Ближе ко мне»: порядок и страницы.
 *   7. Правка места, неверные координаты, телефоны в разных форматах.
 */

const BASE = 'http://localhost:3000/api/v1';
const PHONE = `8928${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
const PASSWORD = 'Gorets2024';

/** Центр Манаскента и соседний Манас (~3 км). */
const MANASKENT = { latitude: 42.74, longitude: 47.6919 };
const MANAS_POINT = { latitude: 42.7245, longitude: 47.6801 };
const MANASKENT_PIN = { latitude: 42.744053, longitude: 47.699827 };

let passed = 0;
let failed = 0;
const created = [];

const ok = (name, detail = '') => {
  passed++;
  console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
};
const bad = (name, detail = '') => {
  failed++;
  console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
};
const check = (condition, name, detail = '') => (condition ? ok(name, detail) : bad(name, detail));

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* пустой ответ */
  }
  return { status: res.status, body: json };
}

const qs = (params) => new URLSearchParams(params).toString();

/** Место для формы из ответа геокодера — так делает приложение. */
function fromPlace(place, accuracy = place.accuracy, point = place) {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy,
    address: place.title,
    formattedAddress: place.formattedAddress,
    ...place.components,
  };
}

console.log('\nМесто объявления и поиск по радиусу');
console.log('═══════════════════════════════════════\n');

// ── Пользователь и категория ────────────────────────────────────────────────
const otp = await call('POST', '/auth/otp/request', { phone: PHONE, purpose: 'registration' });
const verified = await call('POST', '/auth/otp/verify', {
  phone: PHONE,
  code: otp.body.devCode,
  purpose: 'registration',
});
const registered = await call('POST', '/auth/register', {
  verificationToken: verified.body.verificationToken,
  password: PASSWORD,
  firstName: 'Проверка',
  acceptedTerms: true,
});
const token = registered.body?.tokens?.accessToken;
if (!token) {
  console.log('Не удалось зарегистрировать тестового пользователя:', registered);
  process.exit(1);
}
const cities = (await call('GET', '/cities')).body;
const makhachkala = cities.find((city) => city.slug === 'makhachkala');
const tree = (await call('GET', '/listings/categories')).body;
const dishes = tree.flatMap((root) => root.children).find((c) => c.slug === 'home-dishes');

// ── 1. Подсказки ────────────────────────────────────────────────────────────
console.log('1. Подсказки адреса');
const streets = await call(
  'GET',
  `/geo/suggest?${qs({ q: 'Махачкала Батыра', ...{ latitude: 42.98, longitude: 47.5 } })}`,
);
const batyraya = streets.body?.find?.((p) => /Батырая/i.test(p.title));
check(
  streets.status === 200 && batyraya,
  '«Махачкала Батыра» → улица Батырая',
  batyraya
    ? `${batyraya.title}, ${batyraya.subtitle}`
    : JSON.stringify(streets.body)?.slice(0, 200),
);

const houses = await call(
  'GET',
  `/geo/suggest?${qs({ q: 'Махачкала Батырая 10', latitude: 42.98, longitude: 47.5 })}`,
);
check(
  houses.status === 200 && houses.body.length > 0,
  '«Махачкала Батырая 10» → варианты с домом',
  houses.body
    ?.slice?.(0, 3)
    .map((p) => p.title)
    .join(' | '),
);

const villages = await call('GET', `/geo/suggest?${qs({ q: 'Манаск', kind: 'settlement' })}`);
const manaskent = villages.body?.find?.((p) => p.title === 'Манаскент');
check(
  manaskent &&
    manaskent.components.settlement === 'Манаскент' &&
    manaskent.components.city === null,
  '«Манаск» → село Манаскент (без города)',
  manaskent ? manaskent.subtitle : '',
);
check(
  villages.body?.every?.((p) => p.kind === 'settlement'),
  'в режиме «населённый пункт» — только населённые пункты',
);

const tooShort = await call('GET', `/geo/suggest?${qs({ q: 'М' })}`);
check(tooShort.status === 400, 'одна буква — 400, а не нагрузка на геокодер');

const nothing = await call('GET', `/geo/suggest?${qs({ q: 'Qwxzzv Жщщщъ 777' })}`);
check(
  nothing.status === 200 && Array.isArray(nothing.body) && nothing.body.length === 0,
  'ничего не нашлось — пустой список, не ошибка',
);

// ── 2. Адрес по точке ───────────────────────────────────────────────────────
console.log('\n2. Адрес по точке');
const batyrayaPoint = batyraya ?? { latitude: 42.9757, longitude: 47.5042 };
const reverseCity = await call(
  'GET',
  `/geo/reverse?${qs({ latitude: batyrayaPoint.latitude, longitude: batyrayaPoint.longitude })}`,
);
check(
  reverseCity.status === 200 &&
    reverseCity.body?.components?.city === 'Махачкала' &&
    /район/.test(reverseCity.body?.components?.cityDistrict ?? ''),
  'точка в Махачкале → город и район города сами',
  reverseCity.body ? `${reverseCity.body.title}, ${reverseCity.body.components.cityDistrict}` : '',
);

const reverseVillage = await call('GET', `/geo/reverse?${qs(MANASKENT_PIN)}`);
check(
  reverseVillage.status === 200 &&
    reverseVillage.body?.components?.settlement === 'Манаскент' &&
    reverseVillage.body?.components?.district === 'Карабудахкентский район',
  'точка в Манаскенте → село и Карабудахкентский район',
  reverseVillage.body?.formattedAddress ?? '',
);
check(
  reverseVillage.body?.latitude === MANASKENT_PIN.latitude,
  'адрес по точке сохраняет точку человека, а не ближайшего дома',
);

const sea = await call('GET', `/geo/reverse?${qs({ latitude: 42.5, longitude: 49.8 })}`);
check(sea.status === 200 && sea.body === null, 'точка в море → null, без ошибки');

const badPoint = await call('GET', `/geo/reverse?${qs({ latitude: 95, longitude: 47.5 })}`);
check(badPoint.status === 400, 'широта 95 → 400');

// ── 3. Три объявления ───────────────────────────────────────────────────────
console.log('\n3. Подача: город, село, соседнее село');
const base = {
  cityId: makhachkala.id,
  categoryId: dishes.id,
  description: 'Проверка места объявления: сервиз в хорошем состоянии',
  price: 150_000,
  attributes: {},
};

const inCity = await call(
  'POST',
  '/my/listings',
  {
    ...base,
    title: 'Сервиз на Батырая',
    location: fromPlace(reverseCity.body),
    contactPhone: '89501234567',
  },
  token,
);
check(
  inCity.status === 201,
  'объявление в Махачкале создано',
  inCity.status === 201 ? '' : JSON.stringify(inCity.body),
);
if (inCity.body?.id) created.push(inCity.body.id);

const inVillage = await call(
  'POST',
  '/my/listings',
  {
    ...base,
    title: 'Сервиз в Манаскенте',
    location: fromPlace(reverseVillage.body, 'point', MANASKENT_PIN),
    contactPhone: '9501234567',
  },
  token,
);
check(
  inVillage.status === 201,
  'объявление в Манаскенте создано',
  inVillage.status === 201 ? '' : JSON.stringify(inVillage.body),
);
if (inVillage.body?.id) created.push(inVillage.body.id);

// Только точка — как если бы адрес по ней не определился у приложения
const inNeighbour = await call(
  'POST',
  '/my/listings',
  {
    ...base,
    title: 'Сервиз в Манасе',
    location: { ...MANAS_POINT, accuracy: 'point' },
    contactPhone: '+79501234567',
  },
  token,
);
check(
  inNeighbour.status === 201,
  'объявление в Манасе (одна точка) создано',
  inNeighbour.status === 201 ? '' : JSON.stringify(inNeighbour.body),
);
if (inNeighbour.body?.id) created.push(inNeighbour.body.id);

const noPoint = await call(
  'POST',
  '/my/listings',
  { ...base, title: 'Без места вовсе', contactPhone: '9501234567' },
  token,
);
check(noPoint.status === 400, 'без точки опубликовать нельзя → 400');

// ── 4. Что сохранилось ──────────────────────────────────────────────────────
console.log('\n4. Что сохранилось и что видно другим');
const mine = await call('GET', `/my/listings/${inCity.body?.id}`, null, token);
const loc = mine.body?.location;
check(
  loc &&
    Math.abs(loc.latitude - reverseCity.body.latitude) < 1e-9 &&
    loc.city === 'Махачкала' &&
    loc.cityDistrict === reverseCity.body.components.cityDistrict,
  'координаты, город и район города сохранены',
  loc ? `${loc.latitude}, ${loc.longitude}; ${loc.city}, ${loc.cityDistrict}` : '',
);
check(
  mine.body?.contactPhone === '+79501234567',
  'телефон «89501234567» → +79501234567',
  mine.body?.contactPhone,
);
check(
  mine.body?.addressVisibility === 'approximate',
  'частный продавец — адрес скрыт по умолчанию',
);

const villageMine = await call('GET', `/my/listings/${inVillage.body?.id}`, null, token);
check(
  villageMine.body?.location?.settlement === 'Манаскент' &&
    villageMine.body?.location?.city === null,
  'село сохранено без города',
  JSON.stringify({
    settlement: villageMine.body?.location?.settlement,
    district: villageMine.body?.location?.district,
  }),
);
check(villageMine.body?.contactPhone === '+79501234567', 'телефон «9501234567» → +79501234567');

const neighbourMine = await call('GET', `/my/listings/${inNeighbour.body?.id}`, null, token);
check(
  neighbourMine.body?.location?.latitude === MANAS_POINT.latitude &&
    (neighbourMine.body?.location?.settlement || neighbourMine.body?.location?.city),
  'одна точка → сервер сам определил населённый пункт',
  `${neighbourMine.body?.location?.settlement ?? neighbourMine.body?.location?.city}, ${neighbourMine.body?.location?.district}`,
);
check(neighbourMine.body?.contactPhone === '+79501234567', 'телефон «+79501234567» → +79501234567');

const publicCard = await call('GET', `/listings/${inCity.body?.id}`);
const pub = publicCard.body?.location;
check(
  pub &&
    pub.isApproximate &&
    pub.point &&
    pub.point.latitude === Math.round(loc.latitude * 100) / 100,
  'покупатель видит округлённую точку',
  pub ? `${pub.point.latitude}, ${pub.point.longitude}` : '',
);
check(
  pub && !/\d/.test(pub.address ?? ''),
  'покупатель видит улицу без дома',
  pub?.address ?? '(нет улицы)',
);
check(
  publicCard.body?.placeLabel?.startsWith('Махачкала'),
  'подпись места в карточке',
  publicCard.body?.placeLabel,
);

// ── 5. Радиусы ──────────────────────────────────────────────────────────────
console.log('\n5. Радиусы вокруг Манаскента');
const ids = { city: inCity.body?.id, village: inVillage.body?.id, neighbour: inNeighbour.body?.id };
const feed = async (params) =>
  call(
    'GET',
    `/listings?${qs({ category: 'home-dishes', sort: 'date', limit: '100', ...params })}`,
  );
let previousTotal = -1;
for (const radius of [1, 5, 10, 25, 50, 100]) {
  const page = await feed({ ...MANASKENT, radiusKm: String(radius) });
  const found = new Set(page.body?.items?.map((item) => item.id));
  const expected = {
    village: radius >= 1,
    neighbour: radius >= 5,
    city: radius >= 50,
  };
  const right =
    found.has(ids.village) === expected.village &&
    found.has(ids.neighbour) === expected.neighbour &&
    found.has(ids.city) === expected.city;
  check(
    page.status === 200 && right && page.body.total >= previousTotal,
    `${radius} км: Манаскент ${found.has(ids.village) ? '✓' : '—'}, Манас ${found.has(ids.neighbour) ? '✓' : '—'}, Махачкала ${found.has(ids.city) ? '✓' : '—'}`,
    `всего ${page.body?.total}`,
  );
  previousTotal = page.body?.total ?? previousTotal;
}

const whole = await feed({ ...MANASKENT, radiusKm: '1', regionWide: 'true' });
const wholeIds = new Set(whole.body?.items?.map((item) => item.id));
check(
  whole.status === 200 &&
    wholeIds.has(ids.city) &&
    wholeIds.has(ids.village) &&
    whole.body.total >= previousTotal,
  '«Весь Дагестан» — без ограничения по месту',
  `всего ${whole.body?.total}`,
);

// Цена в запросе — в копейках, как и в базе: до 2 000 ₽
const withFilters = await feed({
  ...MANASKENT,
  radiusKm: '10',
  priceTo: '200000',
  search: 'сервиз',
});
const filtered = new Set(withFilters.body?.items?.map((item) => item.id));
check(
  withFilters.status === 200 && filtered.has(ids.village) && !filtered.has(ids.city),
  'радиус вместе с ценой и текстовым поиском',
  `всего ${withFilters.body?.total}`,
);

const byName = await feed({ regionWide: 'true', search: 'Манаскент' });
check(
  new Set(byName.body?.items?.map((item) => item.id)).has(ids.village),
  'поиск словом «Манаскент» находит объявление из Манаскента',
);

// ── 6. «Ближе ко мне» ───────────────────────────────────────────────────────
console.log('\n6. «Ближе ко мне»: порядок и страницы');
const seen = new Set();
const distances = [];
let cursor;
let total;
let duplicate = false;
for (let pageNo = 0; pageNo < 4; pageNo++) {
  const page = await call(
    'GET',
    `/listings?${qs({ ...MANASKENT, radiusKm: '50', sort: 'distance', limit: '20', ...(cursor ? { cursor } : {}) })}`,
  );
  if (pageNo === 0) total = page.body?.total;
  for (const item of page.body?.items ?? []) {
    if (seen.has(item.id)) duplicate = true;
    seen.add(item.id);
    if (item.distanceKm !== null) distances.push(item.distanceKm);
  }
  cursor = page.body?.nextCursor;
  if (!cursor) break;
}
const sorted = distances.every(
  (value, index) => index === 0 || value >= distances[index - 1] - 0.001,
);
check(!duplicate, 'четыре страницы без повторов', `${seen.size} карточек из ${total}`);
check(
  sorted,
  'расстояния по возрастанию через все страницы',
  distances
    .slice(0, 5)
    .map((d) => d.toFixed(1))
    .join(' → '),
);

// ── 7. Правка и проверки ────────────────────────────────────────────────────
console.log('\n7. Правка места и проверки данных');
const moved = await call(
  'PATCH',
  `/my/listings/${inCity.body?.id}`,
  { location: fromPlace(reverseVillage.body, 'point', MANASKENT_PIN) },
  token,
);
const afterMove = await call('GET', `/my/listings/${inCity.body?.id}`, null, token);
check(
  moved.status === 200 &&
    afterMove.body?.location?.settlement === 'Манаскент' &&
    afterMove.body?.location?.cityDistrict === null,
  'точку перенесли — адрес и район обновились',
  afterMove.body?.location?.formattedAddress,
);

const erase = await call('PATCH', `/my/listings/${inCity.body?.id}`, { location: null }, token);
check(erase.status === 400, 'стереть место правкой нельзя → 400');

for (const { label, point } of [
  { label: 'широта 91', point: { latitude: 91, longitude: 47 } },
  { label: 'долгота строкой', point: { latitude: 42.9, longitude: '47.5' } },
  { label: 'широта null', point: { latitude: null, longitude: 47.5 } },
]) {
  const result = await call(
    'POST',
    '/my/listings',
    {
      ...base,
      title: 'Неверная точка',
      location: { ...point, accuracy: 'point' },
      contactPhone: '9501234567',
    },
    token,
  );
  check(result.status === 400, `${label} → 400`);
}

for (const raw of ['950', '8950']) {
  const result = await call(
    'POST',
    '/my/listings',
    {
      ...base,
      title: 'Неполный номер',
      location: { ...MANAS_POINT, accuracy: 'point' },
      contactPhone: raw,
    },
    token,
  );
  const message = result.body?.message ?? JSON.stringify(result.body);
  check(
    result.status === 400 && /неполный/i.test(JSON.stringify(result.body)),
    `телефон «${raw}» → 400, понятное сообщение`,
    message,
  );
}

// ── Уборка ──────────────────────────────────────────────────────────────────
for (const id of created) await call('DELETE', `/my/listings/${id}`, null, token);

console.log(`\nИтого: ${passed} пройдено, ${failed} с ошибкой\n`);
process.exit(failed > 0 ? 1 : 0);
