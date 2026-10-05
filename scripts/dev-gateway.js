// Шлюз разработки: единственная дверь туннеля к телефону.
//
//   node scripts/dev-gateway.js        (запускает сторож, см. dev-supervisor.js)
//
// Бесплатный ngrok даёт один туннель, а телефону нужны и сервер API, и
// сборщик Metro. Раньше Metro проксировал сам сервер API — и у этого было две
// беды (docs/ADR/0009-туннель-разработки.md, «Шлюз»):
//
//   1. Сервер перезапускается при каждой правке кода (nest --watch) — в эти
//      секунды телефон не мог даже скачать приложение: «Could not connect to
//      development server».
//   2. Metro сжимает 9-мегабайтную сборку на лету 40–45 секунд (без сжатия
//      отдаёт за 0,8 с). Телефон и ngrok просят сжатую — и ждут, пока Expo Go
//      не сдастся.
//
// Шлюз — отдельный маленький процесс без зависимостей, который почти никогда
// не перезапускается: /api, /docs, /health и /l/ уходят на сервер, всё
// остальное (сборка, ресурсы, WebSocket горячей перезагрузки) — на Metro.
// Сборку у Metro он берёт несжатой и сжимает сам, быстро (gzip/brotli
// средней степени — доли секунды).
const http = require('http');
const zlib = require('zlib');

const { METRO_PORT, readRootEnv } = require('./lib/dev-env');

const env = readRootEnv();
const GATEWAY_PORT = Number(process.env.DEV_GATEWAY_PORT || env.DEV_GATEWAY_PORT || 3080);
const API_PORT = Number(env.API_PORT || 3000);

/** Пути самого сервера API; остальное — сборщику приложения. */
const API_PREFIXES = ['/api', '/docs', '/health', '/l/'];
/** Что сжимать: текст сборки, карты, JSON, HTML. Картинки уже сжаты. */
const COMPRESSIBLE = /javascript|json|text|xml|html|css|svg|source-map|multipart\/mixed/i;

const isApi = (url) => API_PREFIXES.some((prefix) => url === prefix || url.startsWith(prefix));

function log(message) {
  console.log(`[${new Date().toLocaleString('ru-RU')}] ${message}`);
}

/** Кодировка, которую понимает клиент: brotli лучше, gzip — запасной. */
function pickEncoding(acceptEncoding) {
  const value = String(acceptEncoding || '').toLowerCase();
  if (/\bbr\b/.test(value)) return 'br';
  if (/\bgzip\b/.test(value)) return 'gzip';
  return null;
}

function compressor(encoding) {
  return encoding === 'br'
    ? zlib.createBrotliCompress({
        params: {
          // Пятая степень: в 4–5 раз меньше исходника, сжатие — доли секунды
          [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
          [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
        },
      })
    : zlib.createGzip({ level: 6 });
}

function proxyHttp(request, response) {
  const url = request.url || '/';
  const toApi = isApi(url);
  const port = toApi ? API_PORT : METRO_PORT;
  const encoding = toApi ? null : pickEncoding(request.headers['accept-encoding']);

  const headers = { ...request.headers, host: `localhost:${port}` };
  // У Metro просим несжатое: его собственное сжатие — те самые 40 секунд
  if (!toApi) headers['accept-encoding'] = 'identity';

  const upstream = http.request(
    { host: '127.0.0.1', port, path: url, method: request.method, headers, family: 4 },
    (upstreamResponse) => {
      const outHeaders = { ...upstreamResponse.headers };
      const type = String(outHeaders['content-type'] || '');
      const compress =
        encoding !== null &&
        !outHeaders['content-encoding'] &&
        request.method !== 'HEAD' &&
        upstreamResponse.statusCode !== 204 &&
        upstreamResponse.statusCode !== 304 &&
        COMPRESSIBLE.test(type) &&
        // Потоковые многочастные ответы Metro (прогресс сборки) не сжимаем:
        // клиент читает их по кускам, а сжатие копит данные
        !/multipart\/mixed/i.test(type);
      if (compress) {
        delete outHeaders['content-length'];
        outHeaders['content-encoding'] = encoding;
        outHeaders.vary = outHeaders.vary
          ? `${outHeaders.vary}, Accept-Encoding`
          : 'Accept-Encoding';
        response.writeHead(upstreamResponse.statusCode || 502, outHeaders);
        upstreamResponse.pipe(compressor(encoding)).pipe(response);
      } else {
        response.writeHead(upstreamResponse.statusCode || 502, outHeaders);
        upstreamResponse.pipe(response);
      }
    },
  );
  upstream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    }
    response.end(
      JSON.stringify({
        code: toApi ? 'API_RESTARTING' : 'METRO_UNAVAILABLE',
        message: toApi
          ? 'Сервер перезапускается — повторите через несколько секунд'
          : 'Сборщик приложения недоступен',
      }),
    );
  });
  request.pipe(upstream);
}

function proxyUpgrade(request, socket, head) {
  const url = request.url || '/';
  const port = isApi(url) ? API_PORT : METRO_PORT;
  const upstream = http.request({
    host: '127.0.0.1',
    port,
    path: url,
    method: 'GET',
    headers: { ...request.headers, host: `localhost:${port}` },
    family: 4,
  });
  upstream.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
    const lines = ['HTTP/1.1 101 Switching Protocols'];
    for (const [name, value] of Object.entries(upstreamResponse.headers)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== undefined) lines.push(`${name}: ${item}`);
      }
    }
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    if (upstreamHead.length > 0) socket.write(upstreamHead);
    if (head.length > 0) upstreamSocket.write(head);
    upstreamSocket.pipe(socket).pipe(upstreamSocket);
    upstreamSocket.on('error', () => socket.destroy());
    socket.on('error', () => upstreamSocket.destroy());
  });
  upstream.on('response', (upstreamResponse) => {
    socket.end(`HTTP/1.1 ${upstreamResponse.statusCode || 502} Upgrade Refused\r\n\r\n`);
  });
  upstream.on('error', () => socket.destroy());
  upstream.end();
}

const server = http.createServer((request, response) => {
  // Проверка сторожа: шлюз жив сам по себе, независимо от сервера и Metro
  if (request.url === '/__gateway') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('dev-gateway:ok');
    return;
  }
  proxyHttp(request, response);
});
server.on('upgrade', proxyUpgrade);
// Сборка большая, а телефон через туннель может читать медленно
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
server.requestTimeout = 0;

server.on('error', (error) => {
  log(`Шлюз не запустился: ${error.message}`);
  process.exit(1);
});
server.listen(GATEWAY_PORT, '0.0.0.0', () => {
  log(`Шлюз слушает :${GATEWAY_PORT} → API :${API_PORT}, Metro :${METRO_PORT}`);
});

module.exports = { isApi, pickEncoding };
