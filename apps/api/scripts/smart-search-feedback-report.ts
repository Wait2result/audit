/**
 * Отчёт по исправлениям «Я имел в виду другое» (ADR-0011).
 *
 * Только читает базу и печатает предложения: какие слова модель раз за разом
 * понимает неверно и во что это стоит превратить (правило справочника или
 * нормализатора, пример подсказки, регрессионный тест). Ничего не применяет и
 * статусы записей не меняет — решение и правка кода остаются за человеком.
 *
 *   npm run smart-search:feedback-report --workspace @dagestan/api [-- --min 3 --all]
 *
 * По умолчанию — только новые (status = new), группа от трёх повторов.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { RecurringWordAnalyzer } from '../src/modules/smart-search/feedback/feedback-analyzer.js';

loadEnv({ path: path.resolve(import.meta.dirname, '..', '..', '..', '.env'), quiet: true });

const args = process.argv.slice(2);
const minIndex = args.indexOf('--min');
const minOccurrences = minIndex >= 0 ? Number(args[minIndex + 1]) || 3 : 3;
const all = args.includes('--all');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  const rows = await prisma.smartSearchFeedback.findMany({
    where: all ? {} : { status: 'new' },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  });
  const proposals = new RecurringWordAnalyzer(minOccurrences).analyze(
    rows.map((row) => ({
      id: row.id,
      originalQuery: row.originalQuery,
      userCorrection: row.userCorrection,
      modelIntent: row.modelIntent,
      failureType: row.failureType,
      domain: row.domain,
    })),
  );

  const byType = new Map<string, number>();
  for (const row of rows) byType.set(row.failureType, (byType.get(row.failureType) ?? 0) + 1);

  console.log(
    JSON.stringify(
      {
        records: rows.length,
        byFailureType: Object.fromEntries(byType),
        minOccurrences,
        proposals,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
