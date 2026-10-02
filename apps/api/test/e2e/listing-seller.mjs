/**
 * Профиль продавца и раздельное избранное — сценарий на живом сервере.
 * Запуск: node test/e2e/listing-seller.mjs
 *
 *   1. Публичный профиль: только разрешённые поля, без телефона и почты.
 *   2. «Активные» → «Продано» → «Завершённые»: объявление не исчезает.
 *   3. Проданное открывается как история: без номера и без «Поделиться».
 *   4. Сводка избранного — по типам: объявления отдельно от заведений.
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
    /* пусто */
  }
  return { status: res.status, body: json };
}

async function register(name) {
  const phone = `8928${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
  const otp = await call('POST', '/auth/otp/request', { phone, purpose: 'registration' });
  const verified = await call('POST', '/auth/otp/verify', {
    phone,
    code: otp.body?.devCode,
    purpose: 'registration',
  });
  const registered = await call('POST', '/auth/register', {
    verificationToken: verified.body?.verificationToken,
    password: PASSWORD,
    firstName: name,
    acceptedTerms: true,
  });
  const token = registered.body?.tokens?.accessToken;
  if (!token) {
    console.log('Не удалось зарегистрировать пользователя:', registered.body);
    process.exit(1);
  }
  const me = await call('GET', '/users/me', null, token);
  return { token, id: me.body?.id };
}

console.log('\nПрофиль продавца и избранное');
console.log('═══════════════════════════════════\n');

const seller = await register('Амина');
const buyer = await register('Покупатель');
const cities = (await call('GET', '/cities')).body;
const cityId = cities.find((city) => city.slug === 'makhachkala').id;
const leaves = (await call('GET', '/listings/categories')).body.flatMap((root) => root.children);
const categoryId = leaves.find((c) => c.slug === 'home-dishes').id;

const listing = (
  await call(
    'POST',
    '/my/listings',
    {
      cityId,
      categoryId,
      title: 'Чайный сервиз на шесть персон',
      description: 'Фарфор, без сколов, полный комплект.',
      price: 300000,
      priceUnit: 'total',
      isNegotiable: false,
      attributes: { condition: 'used' },
      location: { latitude: 42.9849, longitude: 47.5047, accuracy: 'point' },
      contactPhone: '+79501234567',
      allowChat: true,
      allowCalls: true,
      photoIds: [],
    },
    seller.token,
  )
).body;

// ── 1. Профиль ──────────────────────────────────────────────────────────────
console.log('1. Публичный профиль');
const profile = await call('GET', `/sellers/${seller.id}`);
check(profile.status === 200 && profile.body?.name === 'Амина', 'профиль открывается без входа');
const keys = Object.keys(profile.body ?? {}).sort();
check(
  JSON.stringify(keys) ===
    JSON.stringify(
      [
        'activeCount',
        'avatar',
        'completedCount',
        'id',
        'isVerified',
        'memberSince',
        'name',
        'rating',
      ].sort(),
    ),
  'только разрешённые поля — ни телефона, ни почты, ни фамилии',
  keys.join(', '),
);
const raw = JSON.stringify(profile.body);
check(!raw.includes('+7') && !raw.includes('@'), 'в ответе нет номера и почты');
check(
  profile.body?.activeCount === 1 && profile.body?.completedCount === 0,
  'счёт: 1 активное, 0 завершённых',
);
const missing = await call('GET', '/sellers/00000000-0000-4000-8000-000000000000');
check(missing.status === 404, 'несуществующий продавец → 404');

// ── 2. Активные → продано → завершённые ─────────────────────────────────────
console.log('\n2. Активные и завершённые');
const activeBefore = await call('GET', `/sellers/${seller.id}/listings?status=active`);
check(
  activeBefore.body?.items?.some((item) => item.id === listing.id),
  'объявление в «Активных»',
);

await call('POST', `/my/listings/${listing.id}/archive`, { reason: 'sold' }, seller.token);
const activeAfter = await call('GET', `/sellers/${seller.id}/listings?status=active`);
const completed = await call('GET', `/sellers/${seller.id}/listings?status=completed`);
check(
  !activeAfter.body?.items?.some((item) => item.id === listing.id),
  'после продажи — не в «Активных»',
);
const soldItem = completed.body?.items?.find((item) => item.id === listing.id);
check(soldItem?.availability === 'sold', 'в «Завершённых» с пометкой «продано»');
const counts = (await call('GET', `/sellers/${seller.id}`)).body;
check(counts?.activeCount === 0 && counts?.completedCount === 1, 'счёт обновился: 0 и 1');

// ── 3. Проданное — история ──────────────────────────────────────────────────
console.log('\n3. Проданное открывается как история');
const soldPage = await call('GET', `/listings/${listing.id}`, null, buyer.token);
check(
  soldPage.status === 200 && soldPage.body?.availability === 'sold',
  'страница открывается, статус «продано»',
);
const phone = await call('POST', `/listings/${listing.id}/phone`, null, buyer.token);
check(phone.status === 404, 'номер проданного не показывается', `статус ${phone.status}`);
const share = await fetch(`${ORIGIN}/l/${listing.id}`);
check(
  share.status === 404,
  '«Поделиться» проданным не работает — только живым',
  `статус ${share.status}`,
);

// ── 4. Избранное по типам ───────────────────────────────────────────────────
console.log('\n4. Избранное по типам');
const another = (
  await call(
    'POST',
    '/my/listings',
    {
      cityId,
      categoryId,
      title: 'Набор кастрюль из нержавейки',
      description: 'Три кастрюли с крышками, почти новые.',
      price: 250000,
      priceUnit: 'total',
      isNegotiable: false,
      attributes: { condition: 'used' },
      location: { latitude: 42.9849, longitude: 47.5047, accuracy: 'point' },
      contactPhone: '+79501234567',
      allowChat: true,
      allowCalls: true,
      photoIds: [],
    },
    seller.token,
  )
).body;
await call('POST', `/listings/${another.id}/favorite`, null, buyer.token);
const summary = await call('GET', `/favorites/summary?cityId=${cityId}`, null, buyer.token);
check(
  summary.body?.listings === 1 && summary.body?.places === 0 && summary.body?.dishes === 0,
  'сводка: 1 объявление, заведений и блюд 0',
  JSON.stringify(summary.body),
);
const favoritePlaces = await call(
  'GET',
  `/places?cityId=${cityId}&favoritesOnly=true`,
  null,
  buyer.token,
);
check(
  (favoritePlaces.body?.items ?? []).length === 0,
  'объявление не попало в избранное «Доставки»',
);
const favoriteListings = await call('GET', '/listings/favorites', null, buyer.token);
check(
  favoriteListings.body?.items?.length === 1 && favoriteListings.body.items[0].id === another.id,
  'избранное «Объявлений» — ровно это объявление, без дублей',
);

console.log(`\nИтого: ${passed} пройдено, ${failed} с ошибкой`);
process.exit(failed > 0 ? 1 : 0);
