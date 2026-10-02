import { defineConfig } from 'vitest/config';

/**
 * Настройка тестов.
 *
 * Тесты разделены на два вида:
 *   • unit  — проверяют отдельные функции без базы данных. Быстрые, запускаются
 *             при каждом изменении кода.
 *   • e2e   — поднимают приложение целиком и обращаются к настоящей базе.
 *             Требуют запущенного окружения (npm run infra:up).
 *
 * Пока Docker не установлен, работают только unit-тесты — этого достаточно,
 * чтобы проверить логику безопасности: нормализацию телефонов, шифрование,
 * проверку входных данных.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      exclude: ['src/generated/**', 'dist/**', '**/*.module.ts'],
    },
  },
  esbuild: {
    target: 'es2022',
  },
});
