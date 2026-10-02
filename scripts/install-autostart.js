// Автозапуск сторожа при входе в Windows.
//
//   node scripts/install-autostart.js            включить и запустить сейчас
//   node scripts/install-autostart.js --remove   выключить
//
// Кладёт в папку «Автозагрузка» текущего пользователя маленький файл .vbs,
// который запускает scripts/dev-supervisor.js без окна. Прав администратора
// не требует и ничего в системе не меняет: удалите файл — автозапуска нет.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const { ROOT } = require('./lib/dev-env');

const STARTUP_DIR = path.join(
  process.env.APPDATA ?? '',
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Startup',
);
const LAUNCHER = path.join(STARTUP_DIR, 'Dagestan Dev.vbs');

if (process.platform !== 'win32' || !process.env.APPDATA) {
  console.error('Автозапуск настроен только для Windows.');
  process.exit(1);
}

if (process.argv.includes('--remove')) {
  fs.rmSync(LAUNCHER, { force: true });
  console.log('Автозапуск выключен. Уже работающий сторож останавливает npm run dev:stop.');
  process.exit(0);
}

const quote = (value) => `""${value}""`;
// 0 — без окна, False — не ждать завершения
const script = [
  "' Запускает сторожа разработки «Дагестан» без окна (scripts/install-autostart.js).",
  'Set shell = CreateObject("WScript.Shell")',
  `shell.CurrentDirectory = "${ROOT}"`,
  `shell.Run "cmd /c ${quote(process.execPath)} scripts\\dev-supervisor.js >> .dev-logs\\supervisor.out 2>&1", 0, False`,
  '',
].join('\r\n');

fs.mkdirSync(path.join(ROOT, '.dev-logs'), { recursive: true });
fs.writeFileSync(LAUNCHER, script, 'utf8');
console.log(`Автозапуск включён: ${LAUNCHER}`);

// И сразу запустить — тем же способом, каким это сделает Windows при входе
spawn('wscript.exe', [LAUNCHER], { detached: true, stdio: 'ignore' }).unref();
console.log('Сторож запущен. Состояние: npm run dev:status');
