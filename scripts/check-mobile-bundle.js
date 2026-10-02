// Проверка сборки приложения ровно так, как её получает телефон.
//
//   node scripts/check-mobile-bundle.js            iOS и Android с Metro на 8081
//   node scripts/check-mobile-bundle.js --port 8082
//
// Запрашивает у запущенного Metro настоящий бандл (тот же адрес, что Expo Go)
// и падает, если сборка не проходит: «Unable to resolve module», синтаксис,
// отсутствующий файл. Нужна, потому что проверка в браузере идёт через
// другой экземпляр Metro и не видит того, что видит телефон.
//
// Код выхода: 0 — сборки проходят, 1 — ошибка сборки, 2 — Metro не запущен.
const http = require('http');

const { METRO_PORT } = require('./lib/dev-env');

const portIndex = process.argv.indexOf('--port');
const port = portIndex > -1 ? Number(process.argv[portIndex + 1]) : METRO_PORT;
const PLATFORMS = ['ios', 'android'];
const TIMEOUT_MS = 5 * 60 * 1000;

function fetchBundle(platform) {
  const query = new URLSearchParams({
    platform,
    dev: 'true',
    hot: 'false',
    minify: 'false',
    lazy: 'true',
    'transform.engine': 'hermes',
    'transform.routerRoot': 'app',
  });
  const url = `http://127.0.0.1:${port}/node_modules/expo-router/entry.bundle?${query}`;

  return new Promise((resolve) => {
    const request = http.get(url, { family: 4, timeout: TIMEOUT_MS }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', (error) => resolve({ status: 0, body: error.message }));
  });
}

/** Короткая причина из ответа Metro: он отдаёт JSON с message при ошибке. */
function reason(body) {
  try {
    const json = JSON.parse(body);
    return String(json.message ?? json.type ?? body)
      .split('\n')
      .slice(0, 3)
      .join('\n');
  } catch {
    return body.slice(0, 400);
  }
}

async function main() {
  let failed = false;
  for (const platform of PLATFORMS) {
    const started = Date.now();
    const { status, body } = await fetchBundle(platform);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    if (status === 0) {
      console.error(`Metro на порту ${port} не отвечает: ${body}`);
      process.exit(2);
    }
    if (status !== 200) {
      failed = true;
      console.error(
        `✗ ${platform}: сборка не проходит (${status}, ${seconds} с)\n  ${reason(body)}`,
      );
      continue;
    }
    console.log(
      `✓ ${platform}: сборка проходит (${(body.length / 1024 / 1024).toFixed(1)} МБ, ${seconds} с)`,
    );
  }
  process.exit(failed ? 1 : 0);
}

void main();
