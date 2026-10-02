// Сторож разработки: держит приложение запущенным для телефона.
//
//   node scripts/dev-supervisor.js          запустить и следить
//   node scripts/dev-supervisor.js --status показать, что сейчас работает
//   node scripts/dev-supervisor.js --stop   остановить сторожа и всё, что он поднял
//
// Телефону нужны четыре вещи сразу: база (Docker), сервер API, туннель ngrok
// к нему и сборщик Metro. Раньше каждая жила в своём окне, и стоило одному
// окну закрыться, компьютеру уснуть или туннелю отвалиться — приложение
// «не запускалось», пока кто-нибудь не перезапустит всё руками.
//
// Сторож — один процесс, который раз в 15 секунд проверяет каждую из четырёх
// и поднимает упавшую сам. Уже работающее он не трогает (подхватывает как
// есть), перезапускает только то, что не отвечает. Запускается сам при входе
// в Windows (scripts/install-autostart.js) и от окон не зависит.
//
// Журналы — в .dev-logs/: supervisor.log (что сторож делал и почему),
// api.log, metro.log, ngrok.log (вывод самих процессов).
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const { ROOT, METRO_PORT, IPV4_NODE_FLAGS, readRootEnv } = require('./lib/dev-env');

const API_PORT = 3000;
const NGROK_API_PORT = 4040;
/** Порт-замок: второй сторож не запустится, пока жив первый. */
const LOCK_PORT = 47811;
const CHECK_EVERY_MS = 15_000;
const LOG_DIR = path.join(ROOT, '.dev-logs');
const PID_FILE = path.join(LOG_DIR, 'supervisor.pid');
const DOCKER_DESKTOP = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';

fs.mkdirSync(LOG_DIR, { recursive: true });

function log(message) {
  const line = `[${new Date().toLocaleString('ru-RU')}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(LOG_DIR, 'supervisor.log'), line + '\n');
  } catch {
    /* журнал — не повод падать */
  }
}

// ── Проверки ────────────────────────────────────────────────────────────────

function httpGet(url, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const request = http.get(url, { family: 4, timeout: timeoutMs }, (response) => {
      let body = '';
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', () => resolve({ status: 0, body: '' }));
  });
}

function run(command) {
  try {
    return execSync(command, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

const publicUrl = () => (readRootEnv().API_PUBLIC_URL || '').replace(/\/+$/, '');

const checks = {
  docker: async () => run('docker ps --format "{{.Names}}"') !== null,
  infra: async () => {
    const names = run('docker ps --format "{{.Names}}"') ?? '';
    return /postgres/i.test(names) && /redis/i.test(names);
  },
  api: async () => (await httpGet(`http://127.0.0.1:${API_PORT}/health`)).status === 200,
  // Туннель жив, если агент ngrok держит соединение именно с нашим адресом
  ngrok: async () => {
    const { status, body } = await httpGet(`http://127.0.0.1:${NGROK_API_PORT}/api/tunnels`);
    return status === 200 && body.includes(publicUrl().replace(/^https?:\/\//, ''));
  },
  metro: async () =>
    (await httpGet(`http://127.0.0.1:${METRO_PORT}/status`)).body.includes(
      'packager-status:running',
    ),
};

// ── Запуск и остановка ──────────────────────────────────────────────────────

/** Кто слушает порт — чтобы перед перезапуском закрыть зависший процесс. */
function pidsOnPort(port) {
  const lines = run('netstat -ano -p tcp') ?? '';
  const pids = new Set();
  for (const line of lines.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length >= 5 && cols[1].endsWith(`:${port}`) && cols[3] === 'LISTENING') {
      pids.add(cols[4]);
    }
  }
  return [...pids];
}

function killTree(pid) {
  run(`taskkill /F /T /PID ${pid}`);
}

function ipv4Env() {
  const env = { ...process.env };
  env.NODE_OPTIONS = [env.NODE_OPTIONS, ...IPV4_NODE_FLAGS]
    .filter(Boolean)
    .filter((flag, index, all) => all.indexOf(flag) === index)
    .join(' ');
  return env;
}

/** Запустить процесс без окна, с выводом в журнал. */
function start(name, command, args, options = {}) {
  const out = fs.openSync(path.join(LOG_DIR, `${name}.log`), 'a');
  const child = spawn(command, args, {
    cwd: ROOT,
    env: ipv4Env(),
    stdio: ['ignore', out, out],
    windowsHide: true,
    ...options,
  });
  child.on('error', (error) => log(`${name}: не запустился — ${error.message}`));
  return child;
}

/**
 * Сервер читает общий пакет из собранной папки dist (Node без сборщика не
 * понимает TypeScript). Если её нет или исходники новее — собираем перед
 * запуском сервера, иначе он упадёт на первом же импорте.
 */
function buildSharedIfStale() {
  const shared = path.join(ROOT, 'packages', 'shared');
  const built = path.join(shared, 'dist', 'index.js');
  const newestSource = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).reduce((latest, entry) => {
      const full = path.join(dir, entry.name);
      const time = entry.isDirectory() ? newestSource(full) : fs.statSync(full).mtimeMs;
      return Math.max(latest, time);
    }, 0);

  let stale = true;
  try {
    stale =
      !fs.existsSync(built) || newestSource(path.join(shared, 'src')) > fs.statSync(built).mtimeMs;
  } catch {
    stale = true;
  }
  if (!stale) return;

  log('→ собираю общий пакет (исходники новее сборки)');
  if (run('npm run build --workspace @dagestan/shared') === null) {
    log(
      'Общий пакет не собрался — сервер может не запуститься. См. npm run build --workspace @dagestan/shared',
    );
  }
}

const services = [
  {
    name: 'docker',
    title: 'Docker',
    check: checks.docker,
    failuresToRestart: 2,
    graceMs: 120_000,
    start: () => {
      if (!fs.existsSync(DOCKER_DESKTOP)) {
        log('Docker Desktop не найден — запустите его вручную.');
        return null;
      }
      return spawn(DOCKER_DESKTOP, [], { detached: true, stdio: 'ignore' });
    },
  },
  {
    name: 'infra',
    title: 'база, Redis, хранилище',
    needs: ['docker'],
    check: checks.infra,
    failuresToRestart: 1,
    graceMs: 60_000,
    start: () => start('infra', 'npm', ['run', 'infra:up'], { shell: true }),
  },
  {
    name: 'api',
    title: 'сервер API',
    needs: ['infra'],
    check: checks.api,
    // Сервер в режиме слежения сам перезапускается при правке кода и
    // секунд двадцать не отвечает — это не повод его убивать
    failuresToRestart: 5,
    graceMs: 180_000,
    port: API_PORT,
    start: () => {
      buildSharedIfStale();
      return start('api', 'npm', ['run', 'dev:api'], { shell: true });
    },
  },
  {
    name: 'ngrok',
    title: 'туннель',
    needs: ['api'],
    check: checks.ngrok,
    failuresToRestart: 2,
    graceMs: 30_000,
    beforeStart: () => run('taskkill /F /IM ngrok.exe'),
    start: () => {
      const url = publicUrl();
      if (!url || /localhost|127\.0\.0\.1/.test(url)) {
        log('В .env нет адреса туннеля (API_PUBLIC_URL) — туннель не запущен.');
        return null;
      }
      return start('ngrok', 'ngrok', [
        'http',
        `--url=${url.replace(/^https?:\/\//, '')}`,
        String(API_PORT),
        '--log=stdout',
      ]);
    },
  },
  {
    name: 'metro',
    title: 'сборщик приложения (Metro)',
    needs: ['api'],
    check: checks.metro,
    failuresToRestart: 4,
    graceMs: 240_000,
    port: METRO_PORT,
    start: () =>
      start('metro', process.execPath, [path.join(ROOT, 'scripts', 'start-mobile.js'), '--tunnel']),
  },
];

const state = Object.fromEntries(
  services.map((service) => [
    service.name,
    { healthy: false, failures: 0, startedAt: 0, child: null, everHealthy: false },
  ]),
);

async function tick() {
  for (const service of services) {
    const current = state[service.name];
    const healthy = await service.check().catch(() => false);

    if (healthy) {
      if (!current.healthy) log(`✓ ${service.title} работает`);
      Object.assign(current, { healthy: true, failures: 0, everHealthy: true });
      continue;
    }

    if (current.healthy) log(`✗ ${service.title} перестал отвечать`);
    current.healthy = false;
    current.failures += 1;

    // Ждём тех, от кого зависим: сервер без базы поднимать бессмысленно
    if ((service.needs ?? []).some((name) => !state[name].healthy)) continue;
    // Только что запущенному даём время подняться
    if (current.startedAt && Date.now() - current.startedAt < service.graceMs) continue;
    // То, что уже работало (или запущено нами), перезапускаем не по первому
    // же сбою, а когда оно молчит несколько проверок подряд. То, что ни разу
    // не отвечало, запускаем сразу
    const wasAlive = current.everHealthy || current.startedAt !== 0;
    if (wasAlive && current.failures < service.failuresToRestart) continue;

    log(`→ запускаю: ${service.title}`);
    if (current.child && current.child.pid) killTree(current.child.pid);
    if (service.port) pidsOnPort(service.port).forEach(killTree);
    service.beforeStart?.();
    current.child = service.start();
    current.startedAt = Date.now();
    current.failures = 0;
  }
}

// ── Команды ─────────────────────────────────────────────────────────────────

async function status() {
  let allOk = true;
  for (const service of services) {
    const ok = await service.check().catch(() => false);
    allOk = allOk && ok;
    console.log(`${ok ? '✓' : '✗'} ${service.title}`);
  }
  const watching = await new Promise((resolve) => {
    const socket = net.connect({ port: LOCK_PORT, host: '127.0.0.1' });
    socket.on('connect', () => (socket.destroy(), resolve(true)));
    socket.on('error', () => resolve(false));
  });
  console.log(`${watching ? '✓' : '✗'} сторож ${watching ? 'следит' : 'не запущен'}`);
  if (allOk) console.log(`\nАдрес для телефона: exp://${publicUrl().replace(/^https?:\/\//, '')}`);
  process.exit(allOk && watching ? 0 : 1);
}

function stop() {
  if (fs.existsSync(PID_FILE)) {
    killTree(fs.readFileSync(PID_FILE, 'utf8').trim());
    fs.rmSync(PID_FILE, { force: true });
  }
  run('taskkill /F /IM ngrok.exe');
  [API_PORT, METRO_PORT].forEach((port) => pidsOnPort(port).forEach(killTree));
  console.log('Сторож, сервер, туннель и Metro остановлены. База (Docker) оставлена.');
}

function main() {
  if (process.argv.includes('--status')) return void status();
  if (process.argv.includes('--stop')) return stop();

  // Замок: порт занят — сторож уже работает, второй не нужен
  const lock = net.createServer();
  lock.on('error', () => {
    console.log('Сторож уже запущен — второй не нужен.');
    process.exit(0);
  });
  lock.listen(LOCK_PORT, '127.0.0.1', () => {
    fs.writeFileSync(PID_FILE, String(process.pid));
    log('Сторож запущен: слежу за Docker, базой, сервером, туннелем и Metro');

    let busy = false;
    const loop = async () => {
      if (busy) return;
      busy = true;
      try {
        await tick();
      } catch (error) {
        log(`Ошибка проверки: ${error.message}`);
      }
      busy = false;
    };
    void loop();
    setInterval(loop, CHECK_EVERY_MS);
  });
}

main();
