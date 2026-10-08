// Запуск мобильного приложения (сборщик Metro) — один вход для двух режимов.
//
//   node scripts/start-mobile.js            телефон в той же Wi-Fi сети
//   node scripts/start-mobile.js --tunnel   телефон через интернет
//
// Остальные аргументы уходят в `expo start` как есть (--web, -c и т. п.).
//
// Почему не `expo start --tunnel`: встроенный в Expo ngrok — старой версии,
// он создаёт туннель через локальный API агента, который ngrok убрал в
// третьей версии, поэтому туннель просто не поднимается. А бесплатный ngrok
// даёт один туннель на аккаунт — второй, отдельный для Metro, завести
// нельзя. Поэтому Metro ходит в интернет через туннель сервера: сервер
// пробрасывает к нему всё, что не адресовано самому API (см.
// docs/ADR/0009-туннель-разработки.md), а Expo через EXPO_PACKAGER_PROXY_URL
// узнаёт, какой адрес печатать в QR-код и в манифест.
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { ROOT, METRO_PORT, IPV4_NODE_FLAGS, readRootEnv } = require('./lib/dev-env');

const MOBILE = path.join(ROOT, 'apps', 'mobile');

function fail(message) {
  console.error('\nНе могу запустить приложение:\n  ' + message + '\n');
  process.exit(1);
}

/**
 * Освобождает порт Metro от процесса прошлого запуска.
 *
 * Без этого Expo молча берёт следующий свободный порт (8082), а сервер
 * пробрасывает туннель на 8081 — телефон получает «Metro недоступен», и
 * причина не видна ни в одном окне.
 */
function freePort(port) {
  if (process.platform !== 'win32') {
    try {
      execSync(`lsof -ti tcp:${port} | xargs -r kill -9`, { stdio: 'ignore' });
    } catch {
      /* ничего не слушало */
    }
    return;
  }
  let lines = '';
  try {
    lines = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of lines.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    // Proto  Local address  Foreign address  State  PID
    if (cols.length >= 5 && cols[1].endsWith(`:${port}`) && cols[3] === 'LISTENING') {
      pids.add(cols[4]);
    }
  }
  for (const pid of pids) {
    console.log(`Порт ${port} занят процессом ${pid} с прошлого запуска — закрываю.`);
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } catch {
      /* уже завершился */
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const tunnel = args.includes('--tunnel');
  const expoArgs = args.filter((arg) => arg !== '--tunnel');
  const env = { ...process.env };

  // Node на этом компьютере не может ходить в интернет по IPv6, а пробует его
  // первым и ждёт до таймаута — так падают походы Expo CLI на свои серверы.
  // Эти флаги велят брать IPv4 сразу (см. docs/ADR/0009-туннель-разработки.md)
  env.NODE_OPTIONS = [env.NODE_OPTIONS, ...IPV4_NODE_FLAGS]
    .filter(Boolean)
    .filter((flag, index, all) => all.indexOf(flag) === index)
    .join(' ');

  if (tunnel) {
    const rootEnv = readRootEnv();
    const publicUrl = (rootEnv.API_PUBLIC_URL || '').replace(/\/+$/, '');

    if (!publicUrl || /localhost|127\.0\.0\.1/.test(publicUrl)) {
      fail(
        'в .env переменная API_PUBLIC_URL должна быть адресом туннеля ' +
          '(https://…ngrok-free.dev), а не localhost.',
      );
    }
    if (rootEnv.MOBILE_TUNNEL_PROXY_PORT !== String(METRO_PORT)) {
      fail(
        `в .env нужна строка MOBILE_TUNNEL_PROXY_PORT=${METRO_PORT} — без неё сервер ` +
          'не пробрасывает Metro в туннель и телефон не сможет скачать приложение.',
      );
    }

    // Какой адрес Expo напишет в QR-код и в манифест приложения
    env.EXPO_PACKAGER_PROXY_URL = publicUrl;
    // Куда приложение ходит за данными
    env.EXPO_PUBLIC_API_URL = `${publicUrl}/api/v1`;

    // Без --offline: с Expo SDK 57 Expo Go на iPhone открывает только приложение,
    // подписанное аккаунтом Expo (тем же, что вошёл в Expo Go), — а подпись
    // требует связи с серверами Expo, чтобы получить и обновить сертификат
    // разработки (он живёт ~30 дней). Нет связи — Expo CLI берёт сертификат из
    // кеша. Прежнее зависание «Opening project…» было из-за IPv6 у Node, его
    // снимают флаги IPV4_NODE_FLAGS выше. Нужны `npx expo login` на компьютере
    // и extra.eas.projectId в app.json (docs/ADR/0009-туннель-разработки.md)
    // Порт фиксирован: именно на него смотрит прокси сервера
    if (!expoArgs.includes('--port') && !expoArgs.includes('-p')) {
      expoArgs.push('--port', String(METRO_PORT));
    }

    freePort(METRO_PORT);

    console.log('Режим: телефон через интернет');
    console.log(`Адрес приложения для телефона: exp://${publicUrl.replace(/^https?:\/\//, '')}`);
    console.log('');
  } else {
    // Wi-Fi: адрес сервера приложение определяет само по адресу компьютера в
    // сети (см. apps/mobile/src/api/config.ts). Пустое значение перекрывает
    // всё, что могло остаться в apps/mobile/.env от режима туннеля
    if (!env.EXPO_PUBLIC_API_URL) env.EXPO_PUBLIC_API_URL = '';
  }

  // Кеш Metro — с чистого листа при каждом запуске: устаревший кеш и
  // список файлов прошлого запуска давали на телефоне «Unable to resolve
  // module» для файлов, которые на диске есть. Первая сборка дольше на
  // полминуты — зато без загадочных ошибок
  if (!expoArgs.includes('-c') && !expoArgs.includes('--clear')) expoArgs.push('--clear');

  // Expo запускается напрямую, минуя npm: на Windows npm — это .cmd, который
  // без оболочки не запустить, а с оболочкой Node предупреждает о небезопасной
  // склейке аргументов. Прямой запуск делает ровно то же, что `expo start`
  const expoCli = path.join(ROOT, 'node_modules', 'expo', 'bin', 'cli');
  if (!fs.existsSync(expoCli)) fail('не найден Expo CLI — выполните npm install.');

  const child = spawn(process.execPath, [expoCli, 'start', ...expoArgs], {
    cwd: MOBILE,
    env,
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main();
