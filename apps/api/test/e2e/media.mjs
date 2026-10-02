/**
 * Проверка загрузки файлов (пункт 34 ТЗ).
 *
 * Требует запущенного сервера и поднятого окружения (npm run infra:up).
 * Запуск: node test/e2e/media.mjs
 */

import sharp from 'sharp';

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

console.log('\nПроверка загрузки файлов');
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
  firstName: 'Тестовый',
  acceptedTerms: true,
});
const token = registered.body.tokens?.accessToken;

if (!token) {
  console.error('Не удалось подготовить пользователя:', JSON.stringify(registered.body));
  process.exit(1);
}

// ── Готовим настоящее изображение с метаданными ─────────────────────────────
// Крупная картинка с посторонними метаданными — как снимок с телефона.
const originalJpeg = await sharp({
  create: { width: 2400, height: 1600, channels: 3, background: { r: 40, g: 90, b: 60 } },
})
  .jpeg({ quality: 92 })
  .withExif({
    IFD0: {
      Copyright: 'СЕКРЕТНЫЕ МЕТАДАННЫЕ ВЛАДЕЛЬЦА',
      Artist: 'Islam',
      Software: 'Test Camera',
    },
  })
  .toBuffer();

const beforeMeta = await sharp(originalJpeg).metadata();
if (beforeMeta.exif) {
  ok('исходный файл содержит метаданные EXIF', `${beforeMeta.exif.length} байт`);
} else {
  bad('не удалось подготовить файл с EXIF');
}

console.log('\n1. Загрузка изображения');

// ── Шаг 1: ссылка на загрузку ───────────────────────────────────────────────
const ticket = await call(
  'POST',
  '/media/upload-url',
  {
    kind: 'image',
    contentType: 'image/jpeg',
    sizeBytes: originalJpeg.length,
    alt: 'Тестовое изображение',
  },
  token,
);

if (ticket.status === 201 && ticket.body.uploadUrl && ticket.body.mediaId) {
  ok('ссылка на загрузку получена', `действует ${ticket.body.expiresInSeconds} с`);
} else {
  bad('получение ссылки', `статус ${ticket.status}: ${JSON.stringify(ticket.body)}`);
  process.exit(1);
}

// ── Шаг 2: файл идёт в хранилище напрямую, минуя сервер ─────────────────────
const upload = await fetch(ticket.body.uploadUrl, {
  method: 'PUT',
  headers: ticket.body.requiredHeaders,
  body: originalJpeg,
});

if (upload.ok) {
  ok('файл загружен напрямую в хранилище', `${Math.round(originalJpeg.length / 1024)} КБ`);
} else {
  bad('загрузка в хранилище', `статус ${upload.status}`);
  process.exit(1);
}

// ── Шаг 3: подтверждение и обработка ────────────────────────────────────────
const confirmed = await call('POST', `/media/${ticket.body.mediaId}/confirm`, {}, token);

if (confirmed.status === 201 && confirmed.body.url && confirmed.body.thumbnailUrl) {
  ok('файл обработан', `${confirmed.body.width}×${confirmed.body.height}`);
} else {
  bad('подтверждение загрузки', `статус ${confirmed.status}: ${JSON.stringify(confirmed.body)}`);
  process.exit(1);
}

// ── Проверяем результат обработки ───────────────────────────────────────────
console.log('\n2. Результат обработки');

const large = Buffer.from(await (await fetch(confirmed.body.url)).arrayBuffer());
const thumb = Buffer.from(await (await fetch(confirmed.body.thumbnailUrl)).arrayBuffer());

const largeMeta = await sharp(large).metadata();
const thumbMeta = await sharp(thumb).metadata();

if (largeMeta.format === 'webp' && thumbMeta.format === 'webp') {
  ok('изображения пересобраны в WebP');
} else {
  bad('формат результата', `${largeMeta.format} / ${thumbMeta.format}`);
}

if (!largeMeta.exif && !thumbMeta.exif) {
  ok('ЗАЩИТА: метаданные EXIF удалены (координаты съёмки не утекают)');
} else {
  bad('EXIF остался в обработанном файле');
}

if (thumbMeta.width <= 320 && largeMeta.width <= 1600) {
  ok(
    'размеры копий соответствуют заданным',
    `превью ${thumbMeta.width}px, крупная ${largeMeta.width}px`,
  );
} else {
  bad('размеры копий', `${thumbMeta.width} / ${largeMeta.width}`);
}

if (thumb.length < originalJpeg.length / 10) {
  const saving = Math.round((1 - thumb.length / originalJpeg.length) * 100);
  ok('превью весит существенно меньше исходника', `экономия ${saving}%`);
} else {
  bad('превью почти не уменьшилось', `${thumb.length} против ${originalJpeg.length}`);
}

// Исходник должен быть стёрт из хранилища
const originalStillThere = await fetch(confirmed.body.url.replace(/large\.webp$/, 'original.jpg'));
if (!originalStillThere.ok) {
  ok('ЗАЩИТА: исходный файл удалён из хранилища');
} else {
  bad('исходный файл всё ещё доступен');
}

// ── Защита ──────────────────────────────────────────────────────────────────
console.log('\n3. Защита');

const tooBig = await call(
  'POST',
  '/media/upload-url',
  { kind: 'image', contentType: 'image/jpeg', sizeBytes: 50 * 1024 * 1024 },
  token,
);
if (tooBig.status === 400 && tooBig.body.code === 'FILE_TOO_LARGE') {
  ok('ЗАЩИТА: слишком большой файл отклонён заранее', tooBig.body.message);
} else {
  bad('проверка размера', `статус ${tooBig.status}`);
}

const badType = await call(
  'POST',
  '/media/upload-url',
  { kind: 'image', contentType: 'application/x-msdownload', sizeBytes: 1000 },
  token,
);
if (badType.status === 400 && badType.body.code === 'FILE_TYPE_NOT_ALLOWED') {
  ok('ЗАЩИТА: недопустимый тип отклонён заранее');
} else {
  bad('проверка типа', `статус ${badType.status}`);
}

// Самое важное: файл, ПРИТВОРЯЮЩИЙСЯ картинкой
const fakeTicket = await call(
  'POST',
  '/media/upload-url',
  { kind: 'image', contentType: 'image/jpeg', sizeBytes: 200 },
  token,
);
await fetch(fakeTicket.body.uploadUrl, {
  method: 'PUT',
  headers: fakeTicket.body.requiredHeaders,
  // Содержимое — исполняемый скрипт, а не изображение
  body: Buffer.from('#!/bin/sh\nrm -rf /\n' + 'A'.repeat(150)),
});
const fakeConfirm = await call('POST', `/media/${fakeTicket.body.mediaId}/confirm`, {}, token);

if (fakeConfirm.status === 400 && fakeConfirm.body.code === 'FILE_TYPE_NOT_ALLOWED') {
  ok('ЗАЩИТА: файл, притворяющийся картинкой, распознан по содержимому');
} else {
  bad(
    'подделка типа файла не обнаружена',
    `статус ${fakeConfirm.status}: ${JSON.stringify(fakeConfirm.body)}`,
  );
}

// Повторное подтверждение уже обработанного файла
const doubleConfirm = await call('POST', `/media/${ticket.body.mediaId}/confirm`, {}, token);
if (doubleConfirm.status === 409) {
  ok('ЗАЩИТА: повторная обработка того же файла запрещена');
} else {
  bad('повторное подтверждение', `статус ${doubleConfirm.status}`);
}

// Чужой файл
const otherPhone = `8928${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
const otp2 = await call('POST', '/auth/otp/request', {
  phone: otherPhone,
  purpose: 'registration',
});
const ver2 = await call('POST', '/auth/otp/verify', {
  phone: otherPhone,
  code: otp2.body.devCode,
  purpose: 'registration',
});
const reg2 = await call('POST', '/auth/register', {
  verificationToken: ver2.body.verificationToken,
  password: PASSWORD,
  firstName: 'Другой',
  acceptedTerms: true,
});
const otherToken = reg2.body.tokens?.accessToken;

const stealAttempt = await call('DELETE', `/media/${ticket.body.mediaId}`, null, otherToken);
if (stealAttempt.status === 403) {
  ok('ЗАЩИТА: чужой файл удалить нельзя');
} else {
  bad('удаление чужого файла', `статус ${stealAttempt.status}`);
}

const anonUpload = await call('POST', '/media/upload-url', {
  kind: 'image',
  contentType: 'image/jpeg',
  sizeBytes: 1000,
});
if (anonUpload.status === 401) {
  ok('ЗАЩИТА: аноним не может загружать файлы');
} else {
  bad('загрузка без авторизации', `статус ${anonUpload.status}`);
}

console.log('\n═══════════════════════════════════');
console.log(`Успешно: ${passed}   Провалено: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
