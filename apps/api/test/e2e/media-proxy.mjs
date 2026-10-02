/**
 * Загрузка файла через API (режим proxy, S3_UPLOAD_MODE) — защита адреса
 * загрузки. Запуск: node test/e2e/media-proxy.mjs (сервер запущен).
 *
 *   - подделанная или устаревшая подпись → 403;
 *   - тип файла не совпадает с заявленным → 400;
 *   - файл, присланный на любой другой адрес, → 415 до чтения тела;
 *   - честная загрузка → 204, повтор после обработки → 409.
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

/** Упрощённый PNG 1×1 — валидная картинка. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

console.log('\nЗагрузка файла через API');
console.log('═══════════════════════════════\n');

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
  firstName: 'Загрузка',
  acceptedTerms: true,
});
const token = registered.body?.tokens?.accessToken;
if (!token) {
  console.log('Не удалось подготовить пользователя:', registered.body);
  process.exit(1);
}

const ticket = await call(
  'POST',
  '/media/upload-url',
  { kind: 'image', contentType: 'image/png', sizeBytes: PNG.length, isPrivate: false },
  token,
);
const url = new URL(ticket.body.uploadUrl);
check(url.pathname.includes('/api/v1/media/upload/'), 'ссылка ведёт в API (режим proxy)');
// Проверяем через локальный адрес: туннель здесь не нужен
const local = `http://localhost:3000${url.pathname}`;
const put = (search, contentType = 'image/png', body = PNG, path = local) =>
  fetch(`${path}?${search}`, { method: 'PUT', headers: { 'Content-Type': contentType }, body });

const params = url.searchParams;
const forged = new URLSearchParams(params);
forged.set('signature', '0'.repeat(64));
check((await put(forged)).status === 403, 'подделанная подпись → 403');

const expired = new URLSearchParams(params);
expired.set('expires', String(Math.floor(Date.now() / 1000) - 10));
check((await put(expired)).status === 403, 'чужой срок в подписи → 403');

check((await put(params, 'image/jpeg')).status === 400, 'тип не совпадает с заявленным → 400');

const elsewhere = await fetch(`${BASE}/listings/categories`, {
  method: 'POST',
  headers: { 'Content-Type': 'image/png' },
  body: PNG,
});
check(
  elsewhere.status === 415,
  'файл на другой адрес не принимается → 415',
  `статус ${elsewhere.status}`,
);

check((await put(params)).status === 204, 'честная загрузка → 204');
const confirmed = await call('POST', `/media/${ticket.body.mediaId}/confirm`, {}, token);
check(
  confirmed.status === 201 || confirmed.status === 200,
  'подтверждение после загрузки',
  `статус ${confirmed.status}`,
);
check((await put(params)).status === 409, 'повторная загрузка обработанного файла → 409');

console.log(`\nИтого: ${passed} пройдено, ${failed} с ошибкой`);
process.exit(failed > 0 ? 1 : 0);
