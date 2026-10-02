/**
 * Проверка двухфакторной авторизации (пункт 4 ТЗ).
 *
 * Требует запущенного сервера. Запуск: node test/e2e/two-factor.mjs
 */

import { generateSync } from 'otplib';

const BASE = 'http://localhost:3000/api/v1';
const PHONE = `8928${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
const PASSWORD = 'Gorets2024';

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

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* пустой ответ */
  }
  return { status: res.status, body: json };
}

console.log('\nПроверка двухфакторной авторизации');
console.log('═══════════════════════════════════\n');

// ── Готовим пользователя ────────────────────────────────────────────────────
const otp = await call('POST', '/auth/otp/request', { phone: PHONE, purpose: 'registration' });
const verified = await call('POST', '/auth/otp/verify', {
  phone: PHONE,
  code: otp.body.devCode,
  purpose: 'registration',
});
const registered = await call('POST', '/auth/register', {
  verificationToken: verified.body.verificationToken,
  password: PASSWORD,
  firstName: 'Двухфакторный',
  acceptedTerms: true,
});

const token = registered.body.tokens?.accessToken;
if (!token) {
  console.error('Не удалось подготовить пользователя:', JSON.stringify(registered.body));
  process.exit(1);
}

console.log('1. Настройка');

const status = await call('GET', '/auth/2fa/status', undefined, token);
if (status.status === 200 && status.body.enabled === false) {
  ok('изначально двухфакторная авторизация выключена');
} else {
  bad('исходное состояние', JSON.stringify(status.body));
}

const setup = await call('POST', '/auth/2fa/setup', {}, token);
if (setup.status === 200 && setup.body.secret && setup.body.otpauthUrl?.startsWith('otpauth://')) {
  ok('секрет создан, ссылка для QR-кода получена');
} else {
  bad('создание секрета', `статус ${setup.status}: ${JSON.stringify(setup.body)}`);
  process.exit(1);
}
const secret = setup.body.secret;

// Ключевая проверка: пока код не подтверждён, защита НЕ включена.
// Иначе не успевший добавить секрет в приложение потерял бы доступ навсегда.
const statusAfterSetup = await call('GET', '/auth/2fa/status', undefined, token);
if (statusAfterSetup.body.enabled === false) {
  ok('ЗАЩИТА: до подтверждения кодом защита не включается');
} else {
  bad('защита включилась преждевременно');
}

const wrongEnable = await call('POST', '/auth/2fa/enable', { code: '000000' }, token);
if (wrongEnable.status === 401 && wrongEnable.body.code === 'AUTH_2FA_INVALID') {
  ok('ЗАЩИТА: неверный код при включении отклонён');
} else {
  bad('включение неверным кодом', `статус ${wrongEnable.status}`);
}

const enableCode = generateSync({ secret });
const enable = await call('POST', '/auth/2fa/enable', { code: enableCode }, token);
if (enable.status === 200) {
  ok('двухфакторная авторизация включена');
} else {
  bad('включение', `статус ${enable.status}: ${JSON.stringify(enable.body)}`);
  process.exit(1);
}

// ── Вход в два шага ─────────────────────────────────────────────────────────
console.log('\n2. Вход в два шага');

const step1 = await call('POST', '/auth/login', { phone: PHONE, password: PASSWORD });
if (step1.status === 200 && step1.body.status === '2fa_required' && step1.body.twoFactorToken) {
  ok('шаг 1: пароль принят, выдан временный пропуск', `аккаунт ${step1.body.maskedPhone}`);
} else {
  bad('первый шаг входа', `статус ${step1.status}: ${JSON.stringify(step1.body)}`);
  process.exit(1);
}

if (!step1.body.tokens && !step1.body.user) {
  ok('ЗАЩИТА: на первом шаге сессия ещё не открывается');
} else {
  bad('на первом шаге уже выданы токены');
}

const challenge = step1.body.twoFactorToken;

const wrongCode = await call('POST', '/auth/login/2fa', {
  twoFactorToken: challenge,
  code: '123456',
});
if (wrongCode.status === 401 && wrongCode.body.code === 'AUTH_2FA_INVALID') {
  ok('ЗАЩИТА: неверный код отклонён');
} else {
  bad('неверный код', `статус ${wrongCode.status}: ${JSON.stringify(wrongCode.body)}`);
}

const forgedToken = await call('POST', '/auth/login/2fa', {
  twoFactorToken: 'поддельный-пропуск',
  code: generateSync({ secret }),
});
if (forgedToken.status === 401) {
  ok('ЗАЩИТА: поддельный пропуск не принимается');
} else {
  bad('поддельный пропуск', `статус ${forgedToken.status}`);
}

// Главное, ради чего всё затевалось: на втором шаге телефон и пароль
// повторно НЕ передаются — только пропуск и код.
const loginCode = generateSync({ secret });
const good = await call('POST', '/auth/login/2fa', {
  twoFactorToken: challenge,
  code: loginCode,
});
if (good.status === 200 && good.body.tokens?.accessToken) {
  ok('шаг 2: вход выполнен без повторного ввода телефона и пароля');
} else {
  bad('второй шаг входа', `статус ${good.status}: ${JSON.stringify(good.body)}`);
  process.exit(1);
}

// Пропуск одноразовый: даже со свежим верным кодом второй раз не сработает
const reusedChallenge = await call('POST', '/auth/login/2fa', {
  twoFactorToken: challenge,
  code: generateSync({ secret }),
});
if (reusedChallenge.status === 401) {
  ok('ЗАЩИТА: пропуск одноразовый');
} else {
  bad('повторное использование пропуска', `статус ${reusedChallenge.status}`);
}

// Тот же код повторно — на новом пропуске. Код живёт 30 секунд, и всё это время
// подсмотренный через плечо код не должен работать второй раз.
const step1again = await call('POST', '/auth/login', { phone: PHONE, password: PASSWORD });
const replay = await call('POST', '/auth/login/2fa', {
  twoFactorToken: step1again.body.twoFactorToken,
  code: loginCode,
});
if (replay.status === 401 && replay.body.code === 'AUTH_2FA_INVALID') {
  ok('ЗАЩИТА: повторное использование того же кода запрещено');
} else {
  bad('повторное использование кода', `статус ${replay.status}: ${JSON.stringify(replay.body)}`);
}

// ── Ограничение попыток по одному пропуску ──────────────────────────────────
console.log('\n3. Перебор кода');

const brute = await call('POST', '/auth/login', { phone: PHONE, password: PASSWORD });
const bruteToken = brute.body.twoFactorToken;

let invalidatedAt = 0;
for (let attempt = 1; attempt <= 7; attempt++) {
  const res = await call('POST', '/auth/login/2fa', {
    twoFactorToken: bruteToken,
    code: String(attempt).padStart(6, '0'),
  });
  if (res.body?.message?.includes('Войдите заново')) {
    invalidatedAt = attempt;
    break;
  }
}

if (invalidatedAt > 0 && invalidatedAt <= 6) {
  ok('ЗАЩИТА: после серии неверных кодов пропуск аннулируется', `на попытке ${invalidatedAt}`);
} else {
  bad('перебор кода не ограничен', `пропуск пережил 7 попыток`);
}

console.log('\n4. Отключение');

const newToken = good.body.tokens?.accessToken;
const wrongDisable = await call('POST', '/auth/2fa/disable', { code: '000000' }, newToken);
if (wrongDisable.status === 401) {
  ok('ЗАЩИТА: снять защиту без действующего кода нельзя');
} else {
  bad('отключение без кода', `статус ${wrongDisable.status}`);
}

console.log('\n═══════════════════════════════════');
console.log(`Успешно: ${passed}   Провалено: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
