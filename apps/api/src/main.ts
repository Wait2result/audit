import 'reflect-metadata';

import { Logger, RequestMethod, UnsupportedMediaTypeException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import crypto from 'node:crypto';
import http, { type IncomingMessage } from 'node:http';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { APP_CONFIG, loadConfig, type AppConfig } from './config/env.js';

async function bootstrap(): Promise<void> {
  // Конфигурация читается ДО создания приложения: если в .env ошибка,
  // мы падаем сразу с понятным сообщением, а не на середине запуска.
  const config = loadConfig();

  const adapter = new FastifyAdapter({
    /**
     * Доверие обратному прокси.
     *
     * Когда перед сервером стоит Nginx (а в production он стоит всегда),
     * все запросы приходят с его адреса. Настоящий адрес клиента
     * передаётся в заголовке X-Forwarded-For.
     *
     * ⚠️ ВАЖНО: доверять этому заголовку можно ТОЛЬКО от собственного прокси.
     * Если доверять всем, любой сможет подставить произвольный адрес и обойти
     * ограничения частоты запросов — то есть отключить защиту от перебора
     * и от атаки на бюджет SMS.
     *
     * В production сюда подставляется список адресов своего Nginx
     * и фильтрующего сервиса.
     */
    trustProxy: config.isProduction ? ['127.0.0.1', '::1'] : true,

    /**
     * Идентификатор запроса.
     *
     * Проставляется каждому запросу и проходит через все логи и ответы
     * об ошибках. Когда пользователь пишет «у меня не открылось», по этому
     * номеру за секунду находится вся история конкретного запроса (пункт 33 ТЗ).
     */
    genReqId: (req: IncomingMessage) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && incoming.length <= 64 ? incoming : crypto.randomUUID();
    },

    /**
     * Ограничение размера тела запроса — 1 МБ.
     *
     * Защита от простейшей атаки: отправить сервер «переваривать»
     * стомегабайтный JSON. Загрузка файлов идёт мимо этого ограничения —
     * напрямую в хранилище по временной ссылке.
     */
    bodyLimit: 1_048_576,
  });

  /**
   * Разбор тела запроса в формате JSON.
   *
   * Заменяем стандартный обработчик по одной причине: он отклоняет запрос
   * с заголовком «Content-Type: application/json» и пустым телом, отвечая
   * невнятной ошибкой ещё ДО проверки прав доступа.
   *
   * Это не теоретическая мелочь: HTTP-клиенты мобильных приложений сплошь и
   * рядом проставляют этот заголовок всем запросам подряд, включая DELETE,
   * у которых тела нет по определению. Со стандартным обработчиком любое
   * удаление с телефона возвращало бы «Body cannot be empty» вместо результата.
   */
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });

  const fastify = app.getHttpAdapter().getInstance();

  /**
   * Запросы с заголовком «Content-Type: application/json», но без тела.
   *
   * Fastify по умолчанию отвечает на такие запросы ошибкой «Body cannot be
   * empty» — причём ещё ДО проверки прав доступа, так что клиент вместо
   * понятного «требуется авторизация» получает невнятную ошибку разбора.
   *
   * Это не теоретическая мелочь: HTTP-клиенты мобильных приложений сплошь и
   * рядом проставляют этот заголовок всем запросам подряд, включая DELETE,
   * у которых тела нет по определению. Без этой правки любое удаление
   * с телефона возвращало бы ошибку вместо результата.
   *
   * Решение: если тела действительно нет, просто убираем заголовок — тогда
   * Fastify пропускает разбор и сразу передаёт запрос дальше. Сам разбор JSON
   * остаётся стандартным, мы в него не вмешиваемся.
   */
  fastify.addHook('onRequest', (request, _reply, done) => {
    const contentType = request.headers['content-type'];
    const contentLength = request.headers['content-length'];
    const isChunked = request.headers['transfer-encoding'] !== undefined;

    const hasNoBody = !isChunked && (contentLength === undefined || contentLength === '0');

    if (hasNoBody && contentType?.includes('json')) {
      delete request.headers['content-type'];
    }

    done();
  });

  /**
   * Тело-файл для загрузки через API (режим proxy, см. S3_UPLOAD_MODE):
   * PUT /api/v1/media/upload/:id. Принимается как Buffer и только на этом
   * адресе — остальные маршруты по-прежнему не берут больше 1 МБ, и файл,
   * присланный куда-то ещё, отклоняется до чтения тела.
   */
  const UPLOAD_PATH = '/api/v1/media/upload/';
  fastify.addContentTypeParser(
    /^(image|video)\/|^application\/pdf$/,
    { parseAs: 'buffer', bodyLimit: 100 * 1024 * 1024 },
    (request, body, done) => {
      if (!request.url.startsWith(UPLOAD_PATH)) {
        done(
          new UnsupportedMediaTypeException('Файлы принимаются только адресом загрузки'),
          undefined,
        );
        return;
      }
      done(null, body);
    },
  );

  app.useLogger(app.get(PinoLogger));

  // Заголовки безопасности: запрет встраивания в чужие страницы,
  // запрет угадывания типа содержимого браузером и прочее.
  await app.register(helmet, {
    // Политика содержимого нужна для страницы документации Swagger;
    // само API отдаёт JSON, для которого она неприменима.
    contentSecurityPolicy: config.isProduction ? undefined : false,
  });

  /**
   * CORS — список сайтов, которым разрешено обращаться к API из браузера.
   *
   * Мобильному приложению это не нужно (оно не браузер), но нужно админ-панели
   * и веб-сборке приложения при разработке (localhost:8081 и :8082).
   * Список задаётся явно: разрешать «всем» означает позволить любому сайту
   * делать запросы к нашему API от имени вошедшего пользователя.
   */
  app.enableCors({
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'Idempotency-Key',
      // Заголовки, которыми клиент отключает заглушку туннеля в разработке
      // (см. apps/mobile/src/api/client.ts). Браузер считает их «непростыми»
      // и без этого разрешения даже не отправит сам запрос.
      'ngrok-skip-browser-warning',
      'Bypass-Tunnel-Reminder',
    ],
    maxAge: 86_400,
  });

  // Версия в адресе: когда потребуется изменить формат ответов, появится
  // /api/v2, а старые версии приложения продолжат работать с /api/v1.
  // Без этого выпуск обновления ломал бы приложение у всех, кто не обновился.
  app.setGlobalPrefix('api/v1', {
    // /l/:id — короткая ссылка «Поделиться» на объявление: её видят люди
    exclude: ['health', 'health/ready', { path: 'l/:id', method: RequestMethod.GET }],
  });

  app.enableShutdownHooks();

  // ── Проброс на Metro через единственный туннель (только разработка) ───────
  //
  // Бесплатный ngrok даёт один туннель на аккаунт, а телефону в разработке
  // нужен доступ и к API, и к сборщику Metro (JS-бандл для Expo Go). Вместо
  // второго туннеля (упирается в лимит аккаунта — см.
  // docs/ADR/0009-туннель-разработки.md) всё, что не адресовано самому API,
  // перенаправляется на Metro тем же портом: обычные запросы и WebSocket
  // горячей перезагрузки. Включается только явной переменной окружения и
  // никогда не активен в production.
  const metroPort = Number(process.env.MOBILE_TUNNEL_PROXY_PORT);
  const metroProxy = !config.isProduction && Number.isInteger(metroPort) && metroPort > 0;
  const skipPrefixes = ['/api', '/docs', '/health'];
  if (metroProxy) {
    // Без OPTIONS: этот метод для '*' уже регистрирует CORS-плагин
    // (preflight-ответы), повторная регистрация — ошибка Fastify при старте,
    // а не мирное сосуществование двух обработчиков
    fastify.route({
      method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
      url: '/*',
      handler: (request, reply) => {
        const url = request.raw.url ?? '/';
        if (skipPrefixes.some((prefix) => url.startsWith(prefix))) {
          reply.callNotFound();
          return;
        }

        const proxyRequest = http.request(
          {
            host: '127.0.0.1',
            port: metroPort,
            path: url,
            method: request.raw.method,
            headers: { ...request.raw.headers, host: `localhost:${metroPort}` },
          },
          (proxyResponse) => {
            reply.raw.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
            proxyResponse.pipe(reply.raw);
          },
        );
        proxyRequest.on('error', () => {
          if (!reply.raw.headersSent) reply.raw.writeHead(502);
          reply.raw.end('Metro недоступен');
        });
        request.raw.pipe(proxyRequest);
      },
    });
  }

  // ── Документация ──────────────────────────────────────────────────────────
  // В production закрыта: подробная карта всех эндпоинтов сильно облегчает
  // работу тому, кто ищет уязвимости.
  if (!config.isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('API платформы «Дагестан»')
      .setDescription(
        'Единый интерфейс между мобильным приложением, панелью управления и сервером.\n\n' +
          'Эндпоинты, помеченные замком, требуют токен: получите его через ' +
          '`POST /auth/login` и нажмите «Authorize» вверху страницы.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });

  // WebSocket Metro (горячая перезагрузка, меню разработчика) — тем же
  // путём. HTTP-маршрут выше его не ловит: Upgrade идёт мимо маршрутизатора
  if (metroProxy) {
    fastify.server.on('upgrade', (request, socket, head) => {
      const url = request.url ?? '/';
      if (skipPrefixes.some((prefix) => url.startsWith(prefix))) {
        socket.destroy();
        return;
      }
      const proxyRequest = http.request({
        host: '127.0.0.1',
        port: metroPort,
        path: url,
        method: 'GET',
        headers: { ...request.headers, host: `localhost:${metroPort}` },
      });
      proxyRequest.on('upgrade', (proxyResponse, proxySocket, proxyHead) => {
        const lines = [`HTTP/1.1 101 Switching Protocols`];
        for (const [name, value] of Object.entries(proxyResponse.headers)) {
          for (const item of Array.isArray(value) ? value : [value]) {
            if (item !== undefined) lines.push(`${name}: ${item}`);
          }
        }
        socket.write(lines.join('\r\n') + '\r\n\r\n');
        if (proxyHead.length > 0) socket.write(proxyHead);
        if (head.length > 0) proxySocket.write(head);
        proxySocket.pipe(socket).pipe(proxySocket);
        proxySocket.on('error', () => socket.destroy());
        socket.on('error', () => proxySocket.destroy());
      });
      proxyRequest.on('error', () => socket.destroy());
      proxyRequest.end();
    });
  }

  const logger = new Logger('Bootstrap');
  logger.log(`Сервер запущен: ${config.API_PUBLIC_URL} (окружение: ${config.NODE_ENV})`);
  if (!config.isProduction) {
    logger.log(`Документация API: ${config.API_PUBLIC_URL}/docs`);
  }
  if (config.SMS_PROVIDER === 'console') {
    logger.warn('SMS не отправляются: коды подтверждения печатаются в эту консоль');
  }
}

void bootstrap().catch((err: unknown) => {
  // Ошибку старта печатаем максимально просто: на этом этапе логгер
  // может быть ещё не инициализирован.
  console.error('\nНе удалось запустить сервер:\n');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

// Экспорт для интеграционных тестов
export type { AppConfig };
export { APP_CONFIG };
