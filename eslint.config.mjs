// @ts-check
/**
 * Настройка линтера.
 *
 * Линтер — это автоматический проверяющий, который читает код и находит
 * подозрительные места ДО запуска: забытый await, недостижимая ветка,
 * неиспользуемая переменная, случайно проглоченная ошибка.
 *
 * Здесь включены правила, требующие информации о типах: они находят
 * настоящие ошибки, а не только огрехи оформления. За оформление отвечает
 * отдельный инструмент — Prettier (`npm run format`).
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      // Служебные файлы сборки Next.js — не наш код
      '**/.next/**',
      // Код, сгенерированный Prisma из schema.prisma, мы не пишем и не правим
      'apps/api/src/generated/**',
      // Служебные скрипты запуска: обычный CommonJS вне проектов TypeScript,
      // печатать в консоль — их прямая задача
      'scripts/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Файлов настроек в монорепозитории больше, чем восемь по умолчанию
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 30,
          // Файлы настроек не входят ни в один tsconfig проекта,
          // но проверять их всё равно нужно.
          allowDefaultProject: [
            '*.mjs',
            '*.js',
            'apps/*/vitest.config.ts',
            'apps/*/prisma.config.ts',
            'apps/*/test/e2e/*.mjs',
            'apps/*/*.config.mjs',
            'apps/*/*.config.js',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // NestJS создаёт объекты через внедрение зависимостей — пустой
      // конструктор с параметрами-свойствами это норма, а не ошибка.
      '@typescript-eslint/no-empty-function': ['error', { allow: ['constructors'] }],

      // Неиспользуемые аргументы допустимы, если начинаются с подчёркивания:
      // так помечают «параметр нужен по сигнатуре, но здесь не используется».
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // Забытый await — источник ошибок, которые невозможно поймать в тестах:
      // код идёт дальше, не дождавшись записи в базу.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Приведение к any обходит всю систему типов. Иногда необходимо
      // (например, для типов сторонних библиотек), но должно быть заметно.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // Шаблонные строки с числами и логическими значениями — обычное дело
      // в сообщениях об ошибках.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],

      // console допустим только для предупреждений и ошибок: всё остальное
      // должно идти через логгер, иначе не попадёт в систему мониторинга.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // В скриптах и конфигурации вывод в консоль — основной способ общения
  {
    files: [
      'apps/api/prisma/seed.ts',
      'apps/api/scripts/**/*.ts',
      '**/*.config.ts',
      '**/*.config.mjs',
      'apps/api/src/main.ts',
    ],
    rules: { 'no-console': 'off' },
  },

  // Конфигурация сборщиков мобильного приложения — обычные файлы Node
  // в формате CommonJS: require и module.exports здесь норма, а не ошибка.
  {
    files: ['apps/*/*.config.js', 'apps/*/babel.config.js', 'apps/*/metro.config.js'],
    languageOptions: {
      globals: { require: 'readonly', module: 'writable', __dirname: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  // Картинки в React Native подключаются через require: сборщик должен
  // видеть путь статически, чтобы положить файл в бандл.
  {
    files: ['apps/mobile/src/components/CategoryTile.tsx'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  // Сценарные проверки — это самостоятельные скрипты для Node, а не часть
  // сервера: они общаются с запущенным API снаружи и отчитываются в консоль.
  {
    files: ['apps/*/test/e2e/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },

  // В тестах допустимы приёмы, неуместные в рабочем коде
  {
    files: ['**/*.spec.ts', '**/test/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
