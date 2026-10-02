/**
 * Настройка сборщика Metro для монорепозитория.
 *
 * По умолчанию Metro ищет исходники и зависимости только внутри своей папки.
 * В нашем случае приложение лежит в apps/mobile, а общий пакет с типами
 * и схемами — в packages/shared, и зависимости установлены в корне проекта.
 * Без этих настроек сборка не найдёт ни того, ни другого.
 */

const { getDefaultConfig } = require('expo/metro-config');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');
const sharedSource = path.resolve(workspaceRoot, 'packages', 'shared', 'src');

const config = getDefaultConfig(projectRoot);

// Следить за изменениями во всём репозитории: правка в packages/shared
// должна сразу подхватываться приложением
config.watchFolders = [workspaceRoot];

// Искать зависимости и в своей папке, и в корневой
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Запрещаем Metro «подниматься» по папкам в поисках зависимостей:
// иначе он может случайно взять другую копию React из соседнего приложения,
// а две копии React в одной сборке — это гарантированные необъяснимые сбои.
config.resolver.disableHierarchicalLookup = true;

/**
 * Общий пакет — из исходников, а не из собранной папки dist.
 *
 * Раньше приложение брало @dagestan/shared из dist, и это ломалось само
 * собой: новый файл в shared появлялся в dist только после сборки, а уже
 * запущенный Metro его не видел — телефон показывал «Unable to resolve
 * module ./constants/…js». Из исходников Metro читает то же, что лежит в
 * репозитории прямо сейчас: без сборки, без устаревшего dist.
 *
 * Внутри shared импорты написаны с `.js` (так требует Node для сервера), а
 * файлы — `.ts`: `./constants/geo.js` → `./constants/geo.ts`, папка —
 * `./dictionaries/index.js` → `index.ts`.
 */
const sameFile = (a, b) => a.toLowerCase() === b.toLowerCase();
const insideShared = (file) => file.toLowerCase().startsWith(sharedSource.toLowerCase() + path.sep);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@dagestan/shared') {
    return { type: 'sourceFile', filePath: path.join(sharedSource, 'index.ts') };
  }

  if (
    insideShared(context.originModulePath) &&
    moduleName.startsWith('.') &&
    moduleName.endsWith('.js')
  ) {
    const base = path.resolve(path.dirname(context.originModulePath), moduleName.slice(0, -3));
    for (const candidate of [`${base}.ts`, `${base}.tsx`]) {
      if (fs.existsSync(candidate) && !sameFile(candidate, context.originModulePath)) {
        return { type: 'sourceFile', filePath: candidate };
      }
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
