/**
 * Правка объявления не портит числа с масштабом — сценарий на живом сервере.
 * Запуск: node test/e2e/listing-edit-roundtrip.mjs
 *
 * Площадь, сотки, объём двигателя, диагональ хранятся умноженными (54,5 м²
 * → 545). Экран правки получает хранимые значения; если отправить их обратно
 * как есть, сервер умножит ещё раз (545 → 5450). Приложение переводит их в
 * единицы ввода общей функцией `storedToInput` — здесь проверяется, что с
 * ней «сохранить без изменений» оставляет те же числа (регрессия 2026-10-07).
 */
import { storedToInput } from '@dagestan/shared';

const BASE = 'http://localhost:3000/api/v1';
const ip = `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

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
      'X-Forwarded-For': ip,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

console.log('\nПравка объявления: числа с масштабом');
console.log('════════════════════════════════════\n');

const phone = `8928${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
const otp = await call('POST', '/auth/otp/request', { phone, purpose: 'registration' });
const verified = await call('POST', '/auth/otp/verify', {
  phone,
  code: otp.body?.devCode,
  purpose: 'registration',
});
const registered = await call('POST', '/auth/register', {
  verificationToken: verified.body?.verificationToken,
  password: 'Gorets2024',
  firstName: 'Продавец',
  acceptedTerms: true,
});
const token = registered.body?.tokens?.accessToken;
const cityId = (await call('GET', '/cities')).body.find((c) => c.slug === 'makhachkala').id;
const tree = (await call('GET', '/listings/categories?withAttributes=1')).body;
const leaf = tree.flatMap((root) => root.children).find((c) => c.slug === 'realty-houses');

const created = await call(
  'POST',
  '/my/listings',
  {
    cityId,
    categoryId: leaf.id,
    title: 'Дом для проверки правки',
    description: 'Проверка: площадь и сотки не меняются при правке.',
    price: 5_000_000_00,
    isNegotiable: false,
    transactionType: 'sale',
    priceUnit: 'total',
    attributes: { sellerType: 'owner', areaTotal: 54.5, landArea: 6.5 },
    location: { latitude: 42.9849, longitude: 47.5047, accuracy: 'point' },
    contactPhone: '+79501234567',
    allowChat: true,
    allowCalls: true,
    photoIds: [],
  },
  token,
);
check(created.status === 201, 'дом 54,5 м², 6,5 сотки создан', `статус ${created.status}`);
const id = created.body?.id;

const mine = (await call('GET', `/my/listings/${id}`, undefined, token)).body;
const fields = leaf.attributes;
const form = storedToInput(fields, mine.attributes);
check(form.areaTotal === 54.5 && form.landArea === 6.5, 'форма правки показывает 54,5 и 6,5');

for (let round = 1; round <= 3; round += 1) {
  const current = (await call('GET', `/my/listings/${id}`, undefined, token)).body;
  const saved = await call(
    'PATCH',
    `/my/listings/${id}`,
    { attributes: storedToInput(fields, current.attributes) },
    token,
  );
  check(saved.status === 200, `сохранение без изменений №${round}`, `статус ${saved.status}`);
}
const after = (await call('GET', `/my/listings/${id}`, undefined, token)).body;
check(
  after.attributes.areaTotal === 545 && after.attributes.landArea === 65,
  'после трёх сохранений: те же 54,5 м² и 6,5 сотки',
  JSON.stringify({ areaTotal: after.attributes.areaTotal, landArea: after.attributes.landArea }),
);
await call('DELETE', `/my/listings/${id}`, undefined, token);

console.log(`\nИтого: ${passed} ✅, ${failed} ❌\n`);
process.exit(failed === 0 ? 0 : 1);
