// Ждёт, пока вся цепочка «туннель → сервер → Metro» будет готова принять
// телефон, и только тогда открывает картинку с QR-кодом.
//
// Проверяется не «процесс запустился», а ровно то, что сделает Expo Go на
// телефоне: запрос манифеста приложения через туннель. Если он проходит —
// телефон откроет приложение; если нет — здесь же написано, какое звено
// не готово и что с ним делать.
const { execFile } = require('child_process');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');

const { ROOT, METRO_PORT, readRootEnv } = require('./lib/dev-env');

const OUT_FILE = path.join(ROOT, 'expo-qr.png');
const NGROK_ADMIN_PORTS = [4040, 4041, 4042, 4043, 4044, 4045];
const TIMEOUT_MS = 180_000;
const TUNNEL_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Запрос строго по IPv4. Встроенный fetch здесь не годится: у домена ngrok
 * есть IPv6-адреса, Node пробует их первыми, а IPv6 на этом компьютере не
 * ходит — запрос висит до таймаута, и проверка вечно «ждёт сервер», хотя
 * curl и телефон отвечают сразу.
 */
function request(url, headers = {}) {
  return new Promise((resolve) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.request(url, { headers, family: 4, timeout: 10_000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, body }));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function fetchOk(url, init = {}) {
  const res = await request(url, init.headers);
  return res && res.ok ? res : null;
}

/** Туннель ngrok к серверу поднят и ведёт именно на наш адрес. */
async function tunnelUp(publicUrl) {
  for (const port of NGROK_ADMIN_PORTS) {
    const res = await fetchOk(`http://127.0.0.1:${port}/api/tunnels`);
    if (!res) continue;
    let data = {};
    try {
      data = JSON.parse(res.body);
    } catch {
      /* агент ещё поднимается */
    }
    if ((data.tunnels || []).some((t) => (t.public_url || '').replace(/\/+$/, '') === publicUrl)) {
      return true;
    }
  }
  return false;
}

async function apiUp(publicUrl) {
  return Boolean(await fetchOk(`${publicUrl}/health`, { headers: TUNNEL_HEADERS }));
}

async function metroUp() {
  const res = await fetchOk(`http://127.0.0.1:${METRO_PORT}/status`);
  return Boolean(res && res.body.includes('packager-status:running'));
}

/** То, что запросит Expo Go: манифест через туннель со ссылкой на бандл. */
async function manifestUp(publicUrl) {
  const res = await fetchOk(`${publicUrl}/`, {
    headers: {
      ...TUNNEL_HEADERS,
      accept: 'application/expo+json,application/json',
      'expo-platform': 'ios',
    },
  });
  if (!res) return false;
  try {
    return Boolean(JSON.parse(res.body)?.launchAsset?.url?.startsWith(publicUrl));
  } catch {
    return false;
  }
}

const STEPS = [
  {
    name: 'туннель к серверу (окно «Dagestan API Tunnel»)',
    check: tunnelUp,
    hint:
      'ngrok не поднял туннель. Посмотрите окно «Dagestan API Tunnel»: если там ' +
      'ERR_NGROK_334 — где-то ещё запущен ngrok, закройте его и запустите файл снова.',
  },
  {
    name: 'сервер API через туннель (окно «Dagestan API»)',
    check: apiUp,
    hint: 'сервер не отвечает через туннель. Ошибка должна быть в окне «Dagestan API».',
  },
  {
    name: 'сборщик приложения Metro (окно «Dagestan Mobile»)',
    check: metroUp,
    hint: 'Metro не запустился. Причина — в окне «Dagestan Mobile».',
  },
  {
    name: 'манифест приложения через туннель',
    check: manifestUp,
    hint:
      'сервер не пробрасывает Metro в туннель. Проверьте, что в .env есть строка ' +
      'MOBILE_TUNNEL_PROXY_PORT=8081, и перезапустите этот файл.',
  },
];

async function waitFor(step, publicUrl, deadline) {
  process.stdout.write(`  ${step.name}… `);
  while (Date.now() < deadline) {
    if (await step.check(publicUrl)) {
      console.log('готово');
      return true;
    }
    await sleep(2000);
  }
  console.log('НЕ ГОТОВО');
  console.error(`\n${step.hint}\n`);
  return false;
}

async function main() {
  const publicUrl = (readRootEnv().API_PUBLIC_URL || '').replace(/\/+$/, '');
  if (!publicUrl || /localhost|127\.0\.0\.1/.test(publicUrl)) {
    console.error('В .env переменная API_PUBLIC_URL должна быть адресом туннеля.');
    process.exit(1);
  }

  console.log('Проверяю, что телефон сможет открыть приложение:');
  const deadline = Date.now() + TIMEOUT_MS;
  for (const step of STEPS) {
    if (!(await waitFor(step, publicUrl, deadline))) process.exit(1);
  }

  const expUrl = 'exp://' + publicUrl.replace(/^https?:\/\//, '');
  console.log('\nВсё готово. Адрес для Expo Go:', expUrl);

  // Прошлая картинка может быть ещё открыта в просмотрщике — Windows тогда не
  // даёт её перезаписать. Не повод падать: рисуем рядом под другим именем
  let file = OUT_FILE;
  try {
    await QRCode.toFile(file, expUrl, { width: 600, margin: 2 });
  } catch {
    file = path.join(os.tmpdir(), `dagestan-expo-qr-${Date.now()}.png`);
    await QRCode.toFile(file, expUrl, { width: 600, margin: 2 });
  }
  console.log('QR сохранён:', file);
  execFile('cmd', ['/c', 'start', '', file]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
