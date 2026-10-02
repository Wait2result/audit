/**
 * Проверка основных пользовательских сценариев (пункт 44 ТЗ).
 * Проверяет не только «работает ли», но и «срабатывает ли защита».
 */

const BASE = 'http://localhost:3000/api/v1';
const PHONE = `8928${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
const PASSWORD = 'Gorets2024';

let passed = 0;
let failed = 0;

function ok(name, detail = '') {
  passed++;
  console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
}
function bad(name, detail = '') {
  failed++;
  console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
}

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

console.log('\nПроверка пользовательских сценариев');
console.log('═══════════════════════════════════');
console.log(`Тестовый номер: ${PHONE}\n`);

// ── 1. Запрос кода ──────────────────────────────────────────────────────────
console.log('1. Регистрация');

const r1 = await call('POST', '/auth/otp/request', { phone: PHONE, purpose: 'registration' });
if (r1.status === 200 && r1.body.devCode) {
  ok('код запрошен', `код ${r1.body.devCode}, пауза ${r1.body.cooldownSeconds} с`);
} else {
  bad('запрос кода', `статус ${r1.status}: ${JSON.stringify(r1.body)}`);
  process.exit(1);
}
const code = r1.body.devCode;

if (r1.body.maskedPhone && !r1.body.maskedPhone.includes(PHONE.slice(4, 10))) {
  ok('номер в ответе замаскирован', r1.body.maskedPhone);
} else {
  bad('маскирование номера', r1.body.maskedPhone);
}

// ── 2. Защита: повторный запрос сразу ───────────────────────────────────────
const r2 = await call('POST', '/auth/otp/request', { phone: PHONE, purpose: 'registration' });
if (r2.status === 429 && r2.body.code === 'OTP_COOLDOWN') {
  ok('ЗАЩИТА: повторная отправка SMS заблокирована', r2.body.message);
} else {
  bad('пауза между отправками SMS не сработала', `статус ${r2.status}`);
}

// ── 3. Защита: неверный код ─────────────────────────────────────────────────
const r3 = await call('POST', '/auth/otp/verify', {
  phone: PHONE,
  code: '000000',
  purpose: 'registration',
});
if (r3.status === 400 && r3.body.code === 'OTP_INVALID') {
  ok('ЗАЩИТА: неверный код отклонён', r3.body.message);
} else {
  bad('проверка неверного кода', `статус ${r3.status}: ${JSON.stringify(r3.body)}`);
}

// ── 4. Верный код ───────────────────────────────────────────────────────────
const r4 = await call('POST', '/auth/otp/verify', { phone: PHONE, code, purpose: 'registration' });
if (r4.status === 200 && r4.body.verificationToken) {
  ok('код подтверждён, выдан временный токен');
} else {
  bad('проверка верного кода', `статус ${r4.status}: ${JSON.stringify(r4.body)}`);
  process.exit(1);
}
const verificationToken = r4.body.verificationToken;

// ── 5. Защита: код сгорает после использования ──────────────────────────────
const r5 = await call('POST', '/auth/otp/verify', { phone: PHONE, code, purpose: 'registration' });
if (r5.status === 400) {
  ok('ЗАЩИТА: использованный код повторно не принимается', r5.body.code);
} else {
  bad('код принят повторно', `статус ${r5.status}`);
}

// ── 6. Защита: регистрация без согласия с условиями ─────────────────────────
const r6 = await call('POST', '/auth/register', {
  verificationToken,
  password: PASSWORD,
  firstName: 'Ислам',
  acceptedTerms: false,
});
if (r6.status === 400 && r6.body.code === 'VALIDATION_FAILED') {
  ok('ЗАЩИТА: регистрация без согласия отклонена (152-ФЗ)');
} else {
  bad('согласие с условиями не проверяется', `статус ${r6.status}`);
}

// ── 7. Завершение регистрации ───────────────────────────────────────────────
const r7 = await call('POST', '/auth/register', {
  verificationToken,
  password: PASSWORD,
  firstName: 'Ислам',
  acceptedTerms: true,
});
if (r7.status === 201 && r7.body.tokens?.accessToken) {
  ok('пользователь зарегистрирован', `роли: ${r7.body.user.roles.join(', ') || 'нет'}`);
} else {
  bad('регистрация', `статус ${r7.status}: ${JSON.stringify(r7.body)}`);
  process.exit(1);
}
const userToken = r7.body.tokens.accessToken;
let refreshToken = r7.body.tokens.refreshToken;

if (r7.body.user.phone === '+7' + PHONE.slice(1)) {
  ok('номер приведён к международному формату', r7.body.user.phone);
} else {
  bad('нормализация номера', r7.body.user.phone);
}

// ── 8. Вход ─────────────────────────────────────────────────────────────────
console.log('\n2. Вход');

const r8 = await call('POST', '/auth/login', { phone: PHONE, password: 'НеверныйПароль1' });
if (r8.status === 401 && r8.body.code === 'AUTH_INVALID_CREDENTIALS') {
  ok('ЗАЩИТА: неверный пароль отклонён');
} else {
  bad('проверка пароля', `статус ${r8.status}`);
}

const r9 = await call('POST', '/auth/login', { phone: PHONE, password: PASSWORD });
if (r9.status === 200 && r9.body.status === 'ok' && r9.body.tokens?.accessToken) {
  ok('вход выполнен', `токен живёт ${r9.body.tokens.expiresIn} с`);
} else {
  bad('вход', `статус ${r9.status}: ${JSON.stringify(r9.body)}`);
}

// Вход в другой формат записи того же номера
const r10 = await call('POST', '/auth/login', { phone: '+7' + PHONE.slice(1), password: PASSWORD });
if (r10.status === 200) {
  ok('вход работает при любой записи номера (8… и +7…)');
} else {
  bad('вход по другой записи номера', `статус ${r10.status}`);
}

// ── 9. Обновление токена и обнаружение кражи ────────────────────────────────
console.log('\n3. Сессии');

const r11 = await call('POST', '/auth/refresh', { refreshToken });
if (r11.status === 200 && r11.body.tokens?.refreshToken) {
  ok('токен обновлён');
} else {
  bad('обновление токена', `статус ${r11.status}: ${JSON.stringify(r11.body)}`);
}
const oldRefresh = refreshToken;
refreshToken = r11.body.tokens?.refreshToken;

const r12 = await call('POST', '/auth/refresh', { refreshToken: oldRefresh });
if (r12.status === 401 && r12.body.code === 'AUTH_TOKEN_REUSE_DETECTED') {
  ok('ЗАЩИТА: повторное использование токена распознано как кража');
} else {
  bad('обнаружение кражи токена', `статус ${r12.status}: ${JSON.stringify(r12.body)}`);
}

const r13 = await call('POST', '/auth/refresh', { refreshToken });
if (r13.status === 401) {
  ok('ЗАЩИТА: после кражи вся цепочка сессий аннулирована');
} else {
  bad('цепочка сессий не аннулирована', `статус ${r13.status}`);
}

// ── 10. Права доступа ───────────────────────────────────────────────────────
console.log('\n4. Права доступа');

const r14 = await call('GET', '/cities/all');
if (r14.status === 401) {
  ok('ЗАЩИТА: закрытый раздел требует авторизации');
} else {
  bad('закрытый раздел доступен гостю', `статус ${r14.status}`);
}

const r15 = await call('GET', '/cities/all', null, userToken);
if (r15.status === 403 && r15.body.code === 'FORBIDDEN') {
  ok('ЗАЩИТА: обычному пользователю отказано в админском разделе');
} else {
  bad('проверка прав', `статус ${r15.status}: ${JSON.stringify(r15.body)}`);
}

const r16 = await call(
  'POST',
  '/cities',
  { name: 'Взлом', slug: 'hack', latitude: 0, longitude: 0 },
  userToken,
);
if (r16.status === 403) {
  ok('ЗАЩИТА: создание города обычным пользователем запрещено');
} else {
  bad('создание города доступно пользователю', `статус ${r16.status}`);
}

// ── 11. Вход владельца системы ──────────────────────────────────────────────
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminPassword) {
  const r17 = await call('POST', '/auth/login', { phone: '+79280000000', password: adminPassword });

  if (r17.status === 200 && r17.body.status === '2fa_required') {
    // Так и должно быть, если владелец включил второй фактор. Код лежит
    // в его телефоне, поэтому автоматически довести вход до конца нельзя —
    // но сам факт запроса кода уже подтверждает, что защита работает.
    ok('ЗАЩИТА: у владельца включён второй фактор, пароля недостаточно');
  } else if (r17.status === 200 && r17.body.status === 'ok') {
    ok('владелец системы вошёл', `прав: ${r17.body.user.permissions.length}`);

    const r18 = await call('GET', '/cities/all', null, r17.body.tokens.accessToken);
    if (r18.status === 200) {
      ok('владельцу доступен админский раздел', `городов: ${r18.body.length}`);
    } else {
      bad('доступ владельца', `статус ${r18.status}`);
    }
  } else {
    bad('вход владельца', `статус ${r17.status}: ${JSON.stringify(r17.body)}`);
  }
}

// ── 12. Отбрасывание лишних полей ───────────────────────────────────────────
console.log('\n5. Прочее');

const r19 = await call('GET', '/cities/несуществующий-город');
if (r19.status === 404 && r19.body.code === 'CITY_NOT_FOUND' && r19.body.requestId) {
  ok('ошибки приходят в едином формате', `requestId: ${r19.body.requestId.slice(0, 8)}…`);
} else {
  bad('формат ошибки', `статус ${r19.status}: ${JSON.stringify(r19.body)}`);
}

console.log('\n═══════════════════════════════════');
console.log(`Успешно: ${passed}   Провалено: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
