-- Запчасти и комплектующие (docs/ADR/0012-запчасти.md).
--
-- 1. Слой запчасти объявления: совместимость (к какой технике подходит) и
--    номера (OEM, артикул). Только добавляет таблицы и индексы — существующие
--    объявления не затрагиваются: нет строк слоя — обычное объявление.
-- 2. Перенос старых запчастей в новую модель: марка и модель, которые раньше
--    лежали атрибутами, становятся строкой совместимости; «вид запчасти»,
--    «происхождение» и «тип» комплектующих — полями новой модели.
--
-- Новые определения полей, справочники и подкатегории создаёт `npm run db:seed`
-- (так заведено во всех миграциях каталога). После seed — `db:migrate:listings-v2`
-- пересобирает таблицу значений для перенесённых объявлений. Миграция
-- идемпотентна.

-- ── 1. Таблицы слоя ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "listing_compatibility" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "equipment_type" VARCHAR(30) NOT NULL,
    "brand" VARCHAR(80),
    "brand_label" VARCHAR(120),
    "model" VARCHAR(80),
    "model_label" VARCHAR(120),
    "chassis" VARCHAR(40),
    "year_from" INTEGER,
    "year_to" INTEGER,
    "engine" VARCHAR(60),
    "modification" VARCHAR(120),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "listing_compatibility_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "listing_compatibility_listing_id_fkey" FOREIGN KEY ("listing_id")
        REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "listing_compatibility_listing_id_idx" ON "listing_compatibility"("listing_id");
CREATE INDEX IF NOT EXISTS "listing_compatibility_equipment_type_brand_model_idx"
    ON "listing_compatibility"("equipment_type", "brand", "model");
CREATE INDEX IF NOT EXISTS "listing_compatibility_brand_model_idx" ON "listing_compatibility"("brand", "model");
CREATE INDEX IF NOT EXISTS "listing_compatibility_chassis_idx" ON "listing_compatibility"("chassis");
CREATE INDEX IF NOT EXISTS "listing_compatibility_engine_idx" ON "listing_compatibility"("engine");

CREATE TABLE IF NOT EXISTS "listing_part_numbers" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL DEFAULT 'oem',
    "number" VARCHAR(60) NOT NULL,
    "number_key" VARCHAR(60) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "listing_part_numbers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "listing_part_numbers_listing_id_fkey" FOREIGN KEY ("listing_id")
        REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "listing_part_numbers_listing_id_idx" ON "listing_part_numbers"("listing_id");
-- Поиск по номеру: точный и по началу ключа (LIKE 'ключ%') — оба по этому индексу
CREATE INDEX IF NOT EXISTS "listing_part_numbers_number_key_idx"
    ON "listing_part_numbers"("number_key" varchar_pattern_ops);

-- ── 2. Перенос старых запчастей (категория transport-parts) ─────────────────

-- 2a. Марка и модель → строка совместимости (только если строки ещё нет)
INSERT INTO "listing_compatibility"
    ("id", "listing_id", "equipment_type", "brand", "brand_label", "model", "model_label", "sort_order")
SELECT
    gen_random_uuid(),
    l."id",
    'passenger_car',
    NULLIF(l."attributes" ->> 'brand', ''),
    NULLIF(l."attributes" ->> 'brand', ''),
    NULLIF(l."attributes" ->> 'model', ''),
    NULLIF(l."attributes" ->> 'model', ''),
    0
FROM "listings" l
JOIN "listing_categories" c ON c."id" = l."category_id"
WHERE c."slug" = 'transport-parts'
  AND (l."attributes" ? 'brand' OR l."attributes" ? 'model')
  AND NOT EXISTS (SELECT 1 FROM "listing_compatibility" k WHERE k."listing_id" = l."id");

-- 2b. «Вид запчасти» → категория детали, «происхождение» → оригинал/аналог и
--     состояние, колонка состояния → состояние детали. Марка и модель из
--     атрибутов убираются: теперь они в слое совместимости.
UPDATE "listings" l
SET "attributes" =
    (l."attributes" - 'partType' - 'partOrigin' - 'brand' - 'model')
    || CASE WHEN l."attributes" ? 'partType' THEN jsonb_build_object('partGroup',
         CASE l."attributes" ->> 'partType'
           WHEN 'gearbox' THEN 'transmission'
           WHEN 'electric' THEN 'electrics'
           ELSE l."attributes" ->> 'partType'
         END) ELSE '{}'::jsonb END
    || CASE l."attributes" ->> 'partOrigin'
         WHEN 'original' THEN '{"partOriginality": "original"}'::jsonb
         WHEN 'aftermarket' THEN '{"partOriginality": "analog"}'::jsonb
         ELSE '{}'::jsonb END
    || CASE
         WHEN l."attributes" ->> 'partOrigin' = 'used' OR l."condition" = 'used'
           THEN '{"partCondition": "used"}'::jsonb
         WHEN l."condition" = 'new' THEN '{"partCondition": "new"}'::jsonb
         ELSE '{}'::jsonb END
FROM "listing_categories" c
WHERE c."id" = l."category_id"
  AND c."slug" = 'transport-parts'
  AND (l."attributes" ? 'partType' OR l."attributes" ? 'partOrigin' OR l."attributes" ? 'brand');

-- 2c. Комплектующие для ПК: «тип» → категория детали (коды совпадают, кроме
--     мониторов, периферии и сети — они уходят в «прочее»)
UPDATE "listings" l
SET "attributes" =
    (l."attributes" - 'componentType')
    || jsonb_build_object('partGroup',
         CASE l."attributes" ->> 'componentType'
           WHEN 'monitor' THEN 'other'
           WHEN 'peripherals' THEN 'other'
           WHEN 'network' THEN 'other'
           ELSE l."attributes" ->> 'componentType'
         END)
FROM "listing_categories" c
WHERE c."id" = l."category_id"
  AND c."slug" = 'electronics-components'
  AND l."attributes" ? 'componentType';

-- 2d. Значения для фильтра: у перенесённых объявлений старые строки таблицы
--     значений убираются, новые собирает `db:migrate:listings-v2` после seed
DELETE FROM "listing_attribute_values" v
USING "listings" l, "listing_categories" c
WHERE v."listing_id" = l."id"
  AND c."id" = l."category_id"
  AND c."slug" IN ('transport-parts', 'electronics-components')
  AND v."key" IN ('partType', 'partOrigin', 'brand', 'model', 'componentType');
