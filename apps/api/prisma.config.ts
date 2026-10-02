/**
 * Конфигурация Prisma CLI (начиная с Prisma 7 обязательна).
 *
 * Главное, что здесь делается — загрузка переменных окружения из корневого
 * файла .env. Prisma 7 больше не читает .env сам, и без этого команды
 * `prisma migrate` / `prisma generate` не найдут адрес базы данных.
 *
 * Единый .env в корне проекта — сознательное решение: один файл с настройками
 * на весь проект вместо трёх, которые легко рассинхронизировать.
 */

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

// Сначала общий .env, затем локальные переопределения разработчика (если есть).
loadEnv({ path: path.join(REPO_ROOT, '.env'), quiet: true });
loadEnv({ path: path.join(REPO_ROOT, '.env.local'), override: true, quiet: true });

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    path: path.join(import.meta.dirname, 'prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
