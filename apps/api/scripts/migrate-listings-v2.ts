/**
 * Перенос объявлений на модель версии 2 (сделка, единица цены, таблица
 * значений, поисковый текст).
 *
 *   npm run db:migrate:listings-v2 --workspace @dagestan/api
 *
 * Запускается один раз после миграции `listings_v2_core` и `npm run db:seed`
 * (нужны определения полей и справочники). Повторный запуск безопасен:
 * пересчитываются только производные данные, ничего не удаляется.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { loadCatalogue } from '../src/modules/listings/listing-categories.service.js';
import { reindexListing } from '../src/modules/listings/listing-reindex.js';

loadEnv({ path: path.resolve(import.meta.dirname, '..', '..', '..', '.env'), quiet: true });

/** Куда везти объявления из ярлыка на целый раздел, если вид неизвестен. */
const SECTION_FALLBACK: Readonly<Record<string, string>> = {
  animals: 'animals-other',
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const catalogue = await loadCatalogue(prisma);

  // Снятые категории: объявления переезжают к преемнику
  let moved = 0;
  for (const category of catalogue.categories) {
    if (!category.deprecatedToId) continue;
    const result = await prisma.listing.updateMany({
      where: { categoryId: category.id },
      data: { categoryId: category.deprecatedToId },
    });
    moved += result.count;
  }

  // Ярлыки («Посуточная аренда» → квартиры со сделкой «Сдам посуточно»):
  // объявления, поданные в них раньше, переезжают в целевую категорию с той
  // сделкой, которую ярлык подразумевает. Единицу цены выправит переиндексация
  let relinked = 0;
  for (const category of catalogue.categories) {
    if (!category.shortcut) continue;
    const shortcut = category.shortcut;
    // Ярлык на весь раздел («Вязка» → все животные): объявление вида не
    // знает, поэтому уезжает в «Другие животные» — сотрудник уточнит
    const target =
      SECTION_FALLBACK[shortcut.category] !== undefined
        ? catalogue.findBySlug(SECTION_FALLBACK[shortcut.category] ?? '')
        : catalogue.findBySlug(shortcut.category);
    if (!target || !target.isLeaf) continue;

    const rows = await prisma.listing.findMany({
      where: { categoryId: category.id },
      select: { id: true, attributes: true },
    });
    for (const row of rows) {
      const attributes = {
        ...((row.attributes as Record<string, unknown> | null) ?? {}),
        ...(shortcut.attributes ?? {}),
      };
      await prisma.listing.update({
        where: { id: row.id },
        data: {
          categoryId: target.id,
          ...(shortcut.transactionType ? { transactionType: shortcut.transactionType } : {}),
          ...(shortcut.rentPeriod ? { rentPeriod: shortcut.rentPeriod } : {}),
          attributes: attributes as Prisma.InputJsonObject,
        },
      });
      relinked += 1;
    }
  }

  const ids = await prisma.listing.findMany({
    where: { deletedAt: null },
    select: { id: true, title: true },
    orderBy: { createdAt: 'asc' },
  });

  let changed = 0;
  for (const { id, title } of ids) {
    const result = await reindexListing(prisma, catalogue, id);
    if (result.changed) changed += 1;
    if (result.notes.length > 0) console.log(`  ${title}: ${result.notes.join('; ')}`);
  }

  console.log('');
  console.log(`Перенесено между категориями: ${moved}`);
  console.log(`Перенесено из ярлыков: ${relinked}`);
  console.log(`Переиндексировано объявлений: ${changed} из ${ids.length}`);
}

main()
  .catch((err: unknown) => {
    console.error('Ошибка:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
