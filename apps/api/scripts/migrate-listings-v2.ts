/**
 * Перенос объявлений на модель версии 2 и переиндексация (сделка, единица
 * цены, таблица значений, поисковый текст).
 *
 *   npm run db:migrate:listings-v2 --workspace @dagestan/api -- --dry-run
 *   npm run db:migrate:listings-v2 --workspace @dagestan/api
 *   npm run db:migrate:listings-v2 --workspace @dagestan/api -- --drop-invalid --yes
 *
 * Сначала ВСЕГДА считается план и печатается статистика: сколько объявлений
 * изменится, сколько значений будет удалено, преобразовано, сохранено как
 * есть и не тронуто. `--dry-run` на этом останавливается и печатает каждое
 * изменение: объявление, категория, поле, было, станет, причина.
 *
 * Значения, которые нынешняя проверка не узнала, по умолчанию СОХРАНЯЮТСЯ
 * (см. listing-reindex.ts). Удалить их можно только явно: `--drop-invalid`
 * и подтверждение `--yes`; без подтверждения запуск останавливается.
 *
 * Объявления, чья деталь или товар получили своё направление, переезжают по
 * правилам CATEGORY_RELOCATIONS (shared) — тоже только после показа плана.
 *
 * На боевом сервере (NODE_ENV=production) скрипт не запускается.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

import { relocationFor } from '@dagestan/shared';

import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import {
  loadCatalogue,
  type CategoryRecord,
  type ListingCatalogue,
} from '../src/modules/listings/listing-categories.service.js';
import {
  planReindex,
  type ReindexPlan,
  type ReindexSource,
} from '../src/modules/listings/listing-reindex.js';

loadEnv({ path: path.resolve(import.meta.dirname, '..', '..', '..', '.env'), quiet: true });

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const DROP_INVALID = args.has('--drop-invalid');
const CONFIRMED = args.has('--yes');

if (process.env.NODE_ENV === 'production') {
  console.error('Миграция объявлений на боевом сервере не запускается.');
  process.exit(1);
}

/** Куда везти объявления из ярлыка на целый раздел, если вид неизвестен. */
const SECTION_FALLBACK: Readonly<Record<string, string>> = {
  animals: 'animals-other',
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PAGE = 1000;

const SOURCE_SELECT = {
  id: true,
  title: true,
  categoryId: true,
  attributes: true,
  transactionType: true,
  rentPeriod: true,
  priceUnit: true,
  price: true,
  rooms: true,
  areaTotal: true,
  floor: true,
  floorsTotal: true,
  year: true,
  mileage: true,
  condition: true,
  city: { select: { name: true } },
  district: { select: { name: true } },
} as const;

/** Переезд объявления из снятой категории или ярлыка: куда и с чем. */
interface Move {
  target: CategoryRecord;
  attributes?: Record<string, unknown>;
  transactionType?: ReindexSource['transactionType'];
  rentPeriod?: ReindexSource['rentPeriod'];
  reason: string;
}

function moveOf(
  catalogue: ListingCatalogue,
  categoryId: string,
  attributes: Readonly<Record<string, unknown>>,
): Move | null {
  const category = catalogue.findById(categoryId);
  if (!category) return null;
  // Деталь или товар, у которых появилось своё направление (CATEGORY_RELOCATIONS)
  const rule = relocationFor(category.slug, attributes);
  if (rule) {
    const target = catalogue.findBySlug(rule.to);
    if (target?.isLeaf) {
      return { target, ...(rule.set ? { attributes: { ...rule.set } } : {}), reason: rule.reason };
    }
  }
  if (category.deprecatedToId) {
    const target = catalogue.findById(category.deprecatedToId);
    return target ? { target, reason: `категория ${category.slug} снята` } : null;
  }
  if (category.shortcut) {
    const shortcut = category.shortcut;
    // Ярлык на весь раздел («Вязка» → все животные): вид неизвестен — «Другие животные»
    const target = catalogue.findBySlug(SECTION_FALLBACK[shortcut.category] ?? shortcut.category);
    if (!target || !target.isLeaf) return null;
    return {
      target,
      ...(shortcut.attributes ? { attributes: { ...shortcut.attributes } } : {}),
      ...(shortcut.transactionType ? { transactionType: shortcut.transactionType } : {}),
      ...(shortcut.rentPeriod ? { rentPeriod: shortcut.rentPeriod } : {}),
      reason: `ярлык ${category.slug}`,
    };
  }
  return null;
}

interface Stats {
  listings: number;
  changedListings: number;
  moved: number;
  removed: number;
  converted: number;
  kept: number;
  unchanged: number;
  fieldChanges: number;
}

type Row = ReindexSource & { title: string };

/** План по одному объявлению с учётом переезда в другую категорию. */
function planFor(
  catalogue: ListingCatalogue,
  row: Row,
): { plan: ReindexPlan; move: Move | null } | null {
  const move = moveOf(
    catalogue,
    row.categoryId,
    (row.attributes as Record<string, unknown> | null) ?? {},
  );
  const source: ReindexSource = move
    ? {
        ...row,
        categoryId: move.target.id,
        // Ярлык добавляет свои значения, но не затирает те, что у объявления уже есть
        attributes: { ...(move.attributes ?? {}), ...(row.attributes ?? {}) },
        transactionType: move.transactionType ?? row.transactionType,
        rentPeriod: move.rentPeriod ?? row.rentPeriod,
      }
    : row;
  const category = catalogue.findById(source.categoryId);
  if (!category) return null;
  return { plan: planReindex(source, category, catalogue, { dropInvalid: DROP_INVALID }), move };
}

const show = (value: unknown): string => (value === undefined ? '—' : JSON.stringify(value));

async function forEachListing(visit: (row: Row) => Promise<void> | void): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.listing.findMany({
      where: { deletedAt: null },
      select: SOURCE_SELECT,
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) return;
    for (const row of rows) await visit(row);
    cursor = rows[rows.length - 1]!.id;
  }
}

async function main(): Promise<void> {
  const catalogue = await loadCatalogue(prisma);
  const stats: Stats = {
    listings: 0,
    changedListings: 0,
    moved: 0,
    removed: 0,
    converted: 0,
    kept: 0,
    unchanged: 0,
    fieldChanges: 0,
  };

  // ── 1. План: ничего не пишет ──────────────────────────────────────────────
  console.log(DRY_RUN ? 'Пробный прогон: в базу ничего не пишется.\n' : 'Считаю план…\n');
  await forEachListing((row) => {
    const result = planFor(catalogue, row);
    if (!result) return;
    const { plan, move } = result;
    stats.listings += 1;
    stats.unchanged += plan.unchanged;
    stats.fieldChanges += plan.fieldChanges.length;
    if (move) stats.moved += 1;
    for (const change of plan.changes) stats[change.kind] += 1;
    if (plan.changed || move) stats.changedListings += 1;

    const visible = plan.changes.length > 0 || plan.fieldChanges.length > 0 || move;
    if (!DRY_RUN || !visible) return;
    console.log(`${plan.listingId}  ${plan.category}  «${row.title}»`);
    if (move) console.log(`    категория → ${move.target.slug} (${move.reason})`);
    for (const change of plan.fieldChanges) {
      console.log(
        `    ${change.field}: ${show(change.before)} → ${show(change.after)} (${change.reason})`,
      );
    }
    for (const change of plan.changes) {
      const label =
        change.kind === 'removed'
          ? 'УДАЛЕНИЕ'
          : change.kind === 'kept'
            ? 'сохраняется'
            : 'преобразование';
      console.log(
        `    ${change.key}: ${show(change.before)} → ${show(change.after)} [${label}: ${change.reason}]`,
      );
    }
  });

  console.log('');
  console.log(`Объявлений всего:                       ${stats.listings}`);
  console.log(`Объявлений изменится:                   ${stats.changedListings}`);
  console.log(`  из них переедет в другую категорию:   ${stats.moved}`);
  console.log(`Значений будет удалено:                 ${stats.removed}`);
  console.log(`Значений будет преобразовано:           ${stats.converted}`);
  console.log(`Значений сохранится как есть (не прошли проверку): ${stats.kept}`);
  console.log(`Значений без изменений:                 ${stats.unchanged}`);
  console.log(`Изменений сделки и единицы цены:        ${stats.fieldChanges}`);

  if (DRY_RUN) return;

  if (stats.removed > 0 && !(DROP_INVALID && CONFIRMED)) {
    console.error(
      `\nОстановлено: будет удалено значений — ${stats.removed}. ` +
        'Проверьте список (--dry-run) и запустите с --drop-invalid --yes, если удаление нужно.',
    );
    process.exit(2);
  }

  // ── 2. Запись ─────────────────────────────────────────────────────────────
  let written = 0;
  await forEachListing(async (row) => {
    const result = planFor(catalogue, row);
    if (!result) return;
    const { plan, move } = result;
    const data: Prisma.ListingUpdateInput = move
      ? { ...plan.data, category: { connect: { id: move.target.id } } }
      : plan.data;
    await prisma.listing.update({ where: { id: row.id }, data });
    written += 1;
  });
  console.log(`\nПереиндексировано объявлений: ${written}`);
}

main()
  .catch((err: unknown) => {
    console.error('Ошибка:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
