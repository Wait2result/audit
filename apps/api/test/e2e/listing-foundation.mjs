/**
 * Основа раздела «Объявления» — сценарий на живом сервере (ТЗ «Объявления»,
 * пп. 4, 12, 13, 15, 20, 37, 40).
 *
 * Требует запущенного сервера и окружения. Запуск:
 *   node test/e2e/listing-foundation.mjs
 *
 *   1. Безопасность: чужое объявление не правится, не удаляется, не
 *      поднимается; продавца, статус и просмотры не подменить.
 *   2. Просмотры: один зритель за сутки — один просмотр, свои не считаются.
 *   3. «Куплю» и «сниму» не публикуются.
 *   4. Недвижимость: «Кто разместил» обязательно и фильтруется.
 *   5. Вещи: «Получение» (самовывоз / доставка).
 *   6. Избранное: проданное не исчезает, а помечается.
 *   7. «Поделиться»: страница объявления и 404 после снятия.
 */

const ORIGIN = 'http://localhost:3000';
const BASE = `${ORIGIN}/api/v1`;
const PASSWORD = 'Gorets2024';
const POINT = { latitude: 42.9849, longitude: 47.5047, accuracy: 'point' };

let passed = 0;
let failed = 0;

const ok = (name, detail = '') => {
  passed++;
  console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
};
const bad = (name, detail = '') => {
  failed++;
  console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
};
const check = (condition, name, detail = '') => (condition ? ok(name, detail) : bad(name, detail));

async function call(method, path, body, token, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
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
    /* пустой ответ */
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
    console.log('Не удалось зарегистрировать тестового пользователя:', registered.body);
    process.exit(1);
  }
  const me = await call('GET', '/users/me', null, token);
  return { token, id: me.body?.id };
}

console.log('\nОснова раздела «Объявления»');
console.log('═══════════════════════════════════\n');

const seller = await register('Продавец');
const buyer = await register('Покупатель');
const cities = (await call('GET', '/cities')).body;
const cityId = cities.find((city) => city.slug === 'makhachkala').id;
const leaves = (await call('GET', '/listings/categories')).body.flatMap(function leavesOf(node) {
  return node.children?.length ? node.children.flatMap(leavesOf) : [node];
});
const categoryId = (slug) => leaves.find((c) => c.slug === slug).id;

const base = {
  cityId,
  categoryId: categoryId('home-dishes'),
  title: 'Сервиз фарфоровый на 12 персон',
  description: 'Полный комплект, без сколов, в коробке.',
  price: 450000,
  priceUnit: 'total',
  isNegotiable: false,
  attributes: { condition: 'used', delivery: ['pickup', 'delivery'] },
  location: POINT,
  contactPhone: '+79501234567',
  allowChat: true,
  allowCalls: true,
  photoIds: [],
};

// ── 1. Безопасность ─────────────────────────────────────────────────────────
console.log('1. Безопасность');
const created = await call(
  'POST',
  '/my/listings',
  { ...base, sellerId: buyer.id, status: 'approved', viewsCount: 999 },
  seller.token,
);
const listingId = created.body?.id;
check(created.status === 201, 'объявление создано', `статус ${created.status}`);
const details = await call('GET', `/listings/${listingId}`, null, buyer.token);
check(
  details.body?.seller?.id === seller.id,
  'продавца подменить нельзя: sellerId из тела игнорируется',
);
check(
  details.body?.viewsCount <= 1,
  'просмотры из тела запроса игнорируются',
  `${details.body?.viewsCount}`,
);

const foreignEdit = await call(
  'PATCH',
  `/my/listings/${listingId}`,
  { title: 'Взлом заголовка' },
  buyer.token,
);
check(
  [403, 404].includes(foreignEdit.status),
  'чужое объявление не правится',
  `статус ${foreignEdit.status}`,
);
const foreignDelete = await call('DELETE', `/my/listings/${listingId}`, null, buyer.token);
check(
  [403, 404].includes(foreignDelete.status),
  'чужое объявление не удаляется',
  `статус ${foreignDelete.status}`,
);
const foreignArchive = await call(
  'POST',
  `/my/listings/${listingId}/archive`,
  { reason: 'sold' },
  buyer.token,
);
check(
  [403, 404].includes(foreignArchive.status),
  'чужое объявление не снять «продано»',
  `статус ${foreignArchive.status}`,
);
const guestEdit = await call('PATCH', `/my/listings/${listingId}`, { title: 'Гость правит' });
check(guestEdit.status === 401, 'без входа правка невозможна', `статус ${guestEdit.status}`);

const sneaky = await call(
  'PATCH',
  `/my/listings/${listingId}`,
  { status: 'approved', sellerId: buyer.id, viewsCount: 5000, promotedUntil: '2099-01-01' },
  seller.token,
);
const afterSneaky = await call('GET', `/my/listings/${listingId}`, null, seller.token);
check(
  sneaky.status === 200 && afterSneaky.body?.viewsCount < 5000 && !afterSneaky.body?.promotedUntil,
  'служебные поля правкой не меняются: статус, продавец, просмотры, продвижение',
);
const resubmitActive = await call('POST', `/my/listings/${listingId}/resubmit`, null, seller.token);
check(
  resubmitActive.status === 400,
  'активное «на проверку» не отправить — только снятое',
  `статус ${resubmitActive.status}`,
);

// ── 2. Просмотры ────────────────────────────────────────────────────────────
console.log('\n2. Просмотры');
const viewsBefore = (await call('GET', `/my/listings/${listingId}`, null, seller.token)).body
  .viewsCount;
await call('GET', `/listings/${listingId}`, null, buyer.token);
await call('GET', `/listings/${listingId}`, null, buyer.token);
await call('GET', `/listings/${listingId}`, null, seller.token);
const viewsAfter = (await call('GET', `/my/listings/${listingId}`, null, seller.token)).body
  .viewsCount;
check(
  viewsAfter === viewsBefore,
  'повторные открытия того же покупателя и свои — не новые просмотры',
  `${viewsBefore} → ${viewsAfter}`,
);
const listed = await call(
  'GET',
  `/listings?${new URLSearchParams({ cityId, sellerId: seller.id, regionWide: 'true', latitude: '42.98', longitude: '47.5' })}`,
);
const inFeed = listed.body?.items?.find((item) => item.id === listingId);
check(
  typeof inFeed?.viewsCount === 'number',
  'просмотры есть в карточке ленты',
  `${inFeed?.viewsCount}`,
);

// ── 3. Запросы покупателей ──────────────────────────────────────────────────
console.log('\n3. «Куплю» и «сниму»');
for (const title of ['Куплю квартиру в Каспийске', 'Сниму дом на лето']) {
  const request = await call('POST', '/my/listings', { ...base, title }, seller.token);
  check(
    request.status === 400 && request.body?.code === 'LISTING_REQUEST_NOT_ALLOWED',
    `«${title}» → 400`,
    request.body?.message,
  );
}
const renamed = await call(
  'PATCH',
  `/my/listings/${listingId}`,
  { title: 'Куплю сервиз' },
  seller.token,
);
check(
  renamed.status === 400,
  'и правкой заголовок-запрос не поставить',
  `статус ${renamed.status}`,
);

// ── 4. «Кто разместил» ──────────────────────────────────────────────────────
console.log('\n4. Недвижимость: «Кто разместил»');
const flat = {
  ...base,
  categoryId: categoryId('realty-flats'),
  title: 'Двухкомнатная квартира у моря',
  transactionType: 'sale',
  priceUnit: 'total',
  price: 590000000,
  attributes: { rooms: 2, areaTotal: 54 },
};
const noSeller = await call('POST', '/my/listings', flat, seller.token);
check(noSeller.status === 400, 'без «Кто разместил» не публикуется', `статус ${noSeller.status}`);
const agencyFlat = await call(
  'POST',
  '/my/listings',
  { ...flat, attributes: { ...flat.attributes, sellerType: 'agency' } },
  seller.token,
);
check(agencyFlat.status === 201, 'с «Агентство» публикуется');
const feed = (sellerType) =>
  call(
    'GET',
    `/listings?${new URLSearchParams({
      cityId,
      category: 'realty-flats',
      sellerId: seller.id,
      regionWide: 'true',
      latitude: '42.98',
      longitude: '47.5',
      attributes: JSON.stringify({ sellerType }),
    })}`,
  );
const agencies = await feed('agency');
const owners = await feed('owner');
check(
  agencies.body?.items?.some((item) => item.id === agencyFlat.body?.id) &&
    !owners.body?.items?.some((item) => item.id === agencyFlat.body?.id),
  'фильтр «Агентство» находит, «Собственник» — нет',
);

// ── 5. Получение ────────────────────────────────────────────────────────────
console.log('\n5. Вещи: «Получение»');
const deliveryDetails = await call('GET', `/listings/${listingId}`, null, buyer.token);
check(
  JSON.stringify(deliveryDetails.body?.attributes?.delivery) ===
    JSON.stringify(['pickup', 'delivery']),
  'самовывоз и доставка сохранены',
);
const wrongDelivery = await call(
  'POST',
  '/my/listings',
  {
    ...base,
    title: 'Сервиз с курьером на драконе',
    attributes: { condition: 'used', delivery: ['dragon'] },
  },
  seller.token,
);
check(
  wrongDelivery.status === 400,
  'неизвестный способ получения → 400',
  `статус ${wrongDelivery.status}`,
);

// ── 6. Избранное ────────────────────────────────────────────────────────────
console.log('\n6. Избранное');
await call('POST', `/listings/${listingId}/favorite`, null, buyer.token);
const favorites = await call('GET', '/listings/favorites', null, buyer.token);
check(
  favorites.body?.items?.[0]?.id === listingId && favorites.body.items[0].availability === 'active',
  'в избранном, «в продаже»',
);
const guestFavorites = await call('GET', '/listings/favorites');
check(guestFavorites.status === 401, 'без входа избранного нет', `статус ${guestFavorites.status}`);

const sold = await call(
  'POST',
  `/my/listings/${listingId}/archive`,
  { reason: 'sold' },
  seller.token,
);
check(sold.status === 201 || sold.status === 200, 'продавец отметил «продано»');
const afterSold = await call('GET', '/listings/favorites', null, buyer.token);
check(
  afterSold.body?.items?.find((item) => item.id === listingId)?.availability === 'sold',
  'проданное осталось в избранном с пометкой «Продано»',
);

// ── 7. «Поделиться» ─────────────────────────────────────────────────────────
console.log('\n7. «Поделиться»');
const live = await fetch(`${ORIGIN}/l/${agencyFlat.body?.id}`);
const html = await live.text();
check(
  live.status === 200 && html.includes('og:title') && html.includes('dagestan://listings/'),
  'страница объявления: превью и переход в приложение',
);
const gone = await fetch(`${ORIGIN}/l/${listingId}`);
check(
  gone.status === 404,
  'снятое объявление — «недоступно», а не ошибка',
  `статус ${gone.status}`,
);
const hostile = await call(
  'POST',
  '/my/listings',
  { ...base, title: 'Сервиз <script>alert(1)</script> фарфор' },
  seller.token,
);
if (hostile.status === 201) {
  const page = await (await fetch(`${ORIGIN}/l/${hostile.body.id}`)).text();
  check(!page.includes('<script>alert(1)'), 'заголовок на странице экранирован');
} else {
  ok('заголовок с разметкой отклонён при подаче', `статус ${hostile.status}`);
}

console.log(`\nИтого: ${passed} пройдено, ${failed} с ошибкой`);
process.exit(failed > 0 ? 1 : 0);
