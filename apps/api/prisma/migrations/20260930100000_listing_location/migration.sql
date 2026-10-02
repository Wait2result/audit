-- Место объявления и телефон по частям (ADR-0010).
--
-- Написано вручную, а не `prisma migrate diff`: генератор не знает о
-- GIN/GIST-индексах, созданных сырым SQL в listings_v2_core, и предлагает
-- их удалить — так однажды уже потеряли поиск (см. ADR-0008).

-- ── Типы ────────────────────────────────────────────────────────────────────
CREATE TYPE "ListingLocationAccuracy" AS ENUM ('house', 'street', 'settlement', 'point');
CREATE TYPE "ListingAddressVisibility" AS ENUM ('exact', 'approximate');

-- ── Колонки ─────────────────────────────────────────────────────────────────
ALTER TABLE "listings"
  ADD COLUMN "country" VARCHAR(80),
  ADD COLUMN "region" VARCHAR(160),
  ADD COLUMN "district" VARCHAR(160),
  ADD COLUMN "city_district" VARCHAR(160),
  ADD COLUMN "city" VARCHAR(160),
  ADD COLUMN "settlement" VARCHAR(160),
  ADD COLUMN "street" VARCHAR(200),
  ADD COLUMN "house_number" VARCHAR(40),
  ADD COLUMN "formatted_address" VARCHAR(500),
  ADD COLUMN "location_accuracy" "ListingLocationAccuracy",
  ADD COLUMN "address_visibility" "ListingAddressVisibility" NOT NULL DEFAULT 'approximate',
  ADD COLUMN "contact_phone_country_code" VARCHAR(4),
  ADD COLUMN "contact_phone_national" VARCHAR(15);

-- ── Проверки точки ──────────────────────────────────────────────────────────
-- Широта и долгота — только парой и только в пределах шара. NaN в double
-- precision больше любого числа, поэтому BETWEEN его тоже не пропускает.
ALTER TABLE "listings"
  ADD CONSTRAINT "listings_point_pair_chk"
    CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  ADD CONSTRAINT "listings_latitude_range_chk"
    CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "listings_longitude_range_chk"
    CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180);

-- ── Заполнение по уже имеющимся данным ─────────────────────────────────────
-- Только то, что точно известно: ничего не выдумываем.

-- Телефон по частям: все номера уже в E.164
UPDATE "listings"
SET "contact_phone_country_code" = '7',
    "contact_phone_national" = substr("contact_phone", 3)
WHERE "contact_phone" ~ '^[+]7[0-9]{10}$';

-- Объявления без точки: человек сам выбрал город и район — это и есть их
-- адрес. Координаты не придумываем: в круг такие объявления попадают по
-- центру своего города, как и раньше
UPDATE "listings" l
SET "country" = 'Россия',
    "region" = c."region",
    "city" = c."name"
FROM "cities" c
WHERE c."id" = l."city_id" AND l."latitude" IS NULL;

UPDATE "listings" l
SET "city_district" = d."name"
FROM "districts" d
WHERE d."id" = l."district_id" AND l."latitude" IS NULL;

-- Объявления с точкой: точка ставилась руками на карте прежнего выбора
-- адреса. Город по ней не подставляем — точка могла стоять и в соседнем
-- городе, а часть адреса честно определит геокодер
-- (scripts/migrate-listing-locations.ts --geocode)
UPDATE "listings"
SET "location_accuracy" = 'point',
    "country" = 'Россия'
WHERE "latitude" IS NOT NULL;

-- ── Индексы ─────────────────────────────────────────────────────────────────
-- Объявления без точки попадают в круг по городу: узкий частичный индекс,
-- чтобы эта ветка условия не читала всю таблицу
CREATE INDEX "listings_no_geom_city_idx"
  ON "listings" ("city_id")
  WHERE "geom" IS NULL AND "deleted_at" IS NULL AND "status" = 'approved';
