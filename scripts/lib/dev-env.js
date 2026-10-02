// Общее для скриптов запуска: где корень проекта и что написано в .env.
//
// Скрипты здесь запускаются обычным `node` без сборки, поэтому — CommonJS
// и никаких зависимостей сверх того, что уже есть в node_modules.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/**
 * Читает файл вида KEY=VALUE. Комментарии и пустые строки пропускаются,
 * кавычки вокруг значения снимаются. Ничего не подставляет в process.env —
 * вызывающий сам решает, что с этим делать.
 */
function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const result = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** Настройки сервера из корневого .env — там живёт адрес туннеля. */
function readRootEnv() {
  return readEnvFile(path.join(ROOT, '.env'));
}

/** Порт, на котором Metro отдаёт приложение телефону. Совпадает с прокси в API. */
const METRO_PORT = 8081;

/**
 * Флаги Node, с которыми исходящие запросы идут по IPv4 сразу. Без них Node
 * на этом компьютере пробует IPv6 первым и висит до таймаута — так
 * «отваливаются» походы Expo CLI на его серверы. Те же флаги ставят
 * файлы запуска через NODE_OPTIONS для всех окон.
 */
const IPV4_NODE_FLAGS = ['--dns-result-order=ipv4first', '--no-network-family-autoselection'];

module.exports = { ROOT, METRO_PORT, IPV4_NODE_FLAGS, readEnvFile, readRootEnv };
