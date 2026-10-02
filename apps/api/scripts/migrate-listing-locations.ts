/**
 * Место у старых объявлений (ADR-0010).
 *
 *   npm run db:migrate:listing-locations --workspace @dagestan/api            — отчёт, без изменений
 *   npm run db:migrate:listing-locations --workspace @dagestan/api -- --geocode --limit 50
 *
 * Миграция `listing_location` уже перенесла всё, что известно точно: город и
 * район, выбранные человеком, — в части адреса; координаты не трогала. Этот
 * скрипт добавляет то, для чего нужен геокодер:
 *
 *   • у объявлений с точкой, но без населённого пункта — адрес по точке;
 *   • у объявлений без точки, но с адресом строкой — точку по адресу, и
 *     только если найденное место лежит рядом с городом объявления (30 км).
 *     Не нашлось или далеко — точку НЕ придумываем: объявление остаётся без
 *     неё и попадает в поиск по радиусу по центру своего города.
 *
 * Публичные геокодеры разрешают около запроса в секунду, поэтому `--limit`:
 * сотня тысяч сгенерированных объявлений так не обрабатывается, да и не
 * нужно — у них случайные точки.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { distanceKm, type GeoPlaceDto } from '@dagestan/shared';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

import { loadConfig } from '../src/config/env.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { MemoryGeoCache } from '../src/modules/geo/geocoding.engine.js';
import { NominatimProvider } from '../src/modules/geo/providers/nominatim.provider.js';
import { createGeocodingEngine } from '../src/modules/geo/geocoding.service.js';
import { locationColumns } from '../src/modules/listings/listing-location.js';

loadEnv({ path: path.resolve(import.meta.dirname, '..', '..', '..', '.env'), quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Дальше этого от своего города найденная по адресу точка не принимается. */
const MAX_DRIFT_KM = 30;

const args = process.argv.slice(2);
const geocode = args.includes('--geocode');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) || 50 : 50;

async function report(): Promise<void> {
  const rows = await prisma.$queryRaw<Record<string, number>[]>`
    SELECT
      count(*)::int AS "всего",
      count(*) FILTER (WHERE "latitude" IS NOT NULL)::int AS "с точкой",
      count(*) FILTER (WHERE "latitude" IS NOT NULL AND "city" IS NULL AND "settlement" IS NULL)::int AS "с точкой без населённого пункта",
      count(*) FILTER (WHERE "latitude" IS NULL)::int AS "без точки",
      count(*) FILTER (WHERE "latitude" IS NULL AND "address" IS NOT NULL)::int AS "без точки, но с адресом"
    FROM "listings" WHERE "deleted_at" IS NULL`;
  for (const [label, value] of Object.entries(rows[0] ?? {})) console.log(`  ${label}: ${value}`);
}

async function districtId(cityId: string, name: string | null): Promise<string | null> {
  if (!name) return null;
  const district = await prisma.district.findFirst({
    where: { cityId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  return district?.id ?? null;
}

async function main(): Promise<void> {
  console.log('Место объявлений до обработки:');
  await report();

  if (!geocode) {
    console.log('\nБез --geocode ничего не меняется. Запустите с --geocode [--limit N].');
    return;
  }

  const appConfig = loadConfig();
  const engine = createGeocodingEngine(appConfig, new MemoryGeoCache(), {
    warn: (message) => console.warn(`  ! ${message}`),
  });
  const search = new NominatimProvider(appConfig.NOMINATIM_BASE_URL, {
    userAgent: appConfig.GEOCODER_USER_AGENT,
    timeoutMs: appConfig.GEOCODER_TIMEOUT_MS,
  });

  // 1. Точка есть — адрес по точке. Старые объявления первыми: это
  // настоящие, а не сгенерированные для нагрузочной проверки
  const withPoint = await prisma.listing.findMany({
    where: {
      deletedAt: null,
      latitude: { not: null },
      cityName: null,
      settlement: null,
    },
    select: { id: true, title: true, cityId: true, latitude: true, longitude: true, address: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let enriched = 0;
  for (const row of withPoint) {
    const point = { latitude: row.latitude as number, longitude: row.longitude as number };
    const place = await engine.reverseQuietly(point);
    if (!place) {
      console.log(`  — ${row.title}: адрес по точке не найден, точка сохранена`);
      continue;
    }
    const columns = locationColumns(
      { ...point, accuracy: 'point', address: row.address, ...place.components },
      null,
    );
    await prisma.listing.update({
      where: { id: row.id },
      data: {
        ...columns,
        districtId: await districtId(row.cityId, columns.cityDistrict),
      },
    });
    enriched += 1;
    console.log(`  ✓ ${row.title}: ${place.formattedAddress}`);
  }

  // 2. Точки нет, а адрес строкой есть — ищем точку по адресу
  const withAddress = await prisma.listing.findMany({
    where: { deletedAt: null, latitude: null, address: { not: null } },
    select: {
      id: true,
      title: true,
      cityId: true,
      address: true,
      city: { select: { name: true, latitude: true, longitude: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let located = 0;
  for (const row of withAddress) {
    let found: GeoPlaceDto | undefined;
    try {
      const results = await search.suggest({
        q: `${row.city.name}, ${row.address}`,
        kind: 'any',
        limit: 3,
      });
      found = results.find((place) => distanceKm(place, row.city) <= MAX_DRIFT_KM);
    } catch (err) {
      console.warn(`  ! ${row.title}: геокодер недоступен (${String(err)})`);
      continue;
    }
    if (!found) {
      console.log(
        `  — ${row.title}: «${row.address}» не найден рядом с городом — точку не придумываем`,
      );
      continue;
    }
    const columns = locationColumns(
      {
        latitude: found.latitude,
        longitude: found.longitude,
        accuracy: found.accuracy,
        address: row.address,
        ...found.components,
      },
      null,
    );
    await prisma.listing.update({
      where: { id: row.id },
      data: { ...columns, districtId: await districtId(row.cityId, columns.cityDistrict) },
    });
    located += 1;
    console.log(`  ✓ ${row.title}: ${found.formattedAddress}`);
  }

  console.log(`\nАдрес по точке: ${enriched} из ${withPoint.length}`);
  console.log(`Точка по адресу: ${located} из ${withAddress.length}`);
  console.log('\nМесто объявлений после обработки:');
  await report();
}

main()
  .catch((err: unknown) => {
    console.error('Ошибка:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
