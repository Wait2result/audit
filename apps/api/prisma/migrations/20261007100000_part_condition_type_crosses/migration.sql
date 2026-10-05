-- Запчасти: состояние из трёх значений, «Тип детали», задел под кроссы номеров
-- (docs/ADR/0012-запчасти.md, «Производитель, тип и состояние»).
--
-- Только добавление и перевод значений: ни одна строка объявлений, номеров
-- или совместимости не удаляется.

-- ── 1. Состояние: «Новая», «Б/У», «Восстановленная» ─────────────────────────
-- «Контрактная» — это оригинальная б/у деталь: состояние «Б/У», а тип
-- «Оригинал», если продавец не указал другого. «На запчасти» и «Под
-- восстановление» — б/у (подробности продавец пишет в описании).
UPDATE "listings"
SET "attributes" =
    jsonb_set("attributes", '{partCondition}', '"used"'::jsonb)
    || CASE
         WHEN "attributes" ->> 'partCondition' = 'contract' AND NOT ("attributes" ? 'partOriginality')
           THEN '{"partOriginality": "original"}'::jsonb
         ELSE '{}'::jsonb
       END
WHERE "attributes" ->> 'partCondition' IN ('contract', 'for_parts', 'for_restoration');

-- Таблица значений для фильтра: те же переводы
INSERT INTO "listing_attribute_values" ("id", "listing_id", "key", "text_value")
SELECT gen_random_uuid(), v."listing_id", 'partOriginality', 'original'
FROM "listing_attribute_values" v
WHERE v."key" = 'partCondition'
  AND v."text_value" = 'contract'
  AND NOT EXISTS (
    SELECT 1 FROM "listing_attribute_values" o
    WHERE o."listing_id" = v."listing_id" AND o."key" = 'partOriginality'
  );

UPDATE "listing_attribute_values"
SET "text_value" = 'used'
WHERE "key" = 'partCondition'
  AND "text_value" IN ('contract', 'for_parts', 'for_restoration');

-- ── 2. Подписи полей ──────────────────────────────────────────────────────
-- Сид не перезаписывает подписи (их правят из панели), поэтому меняем здесь,
-- и только если подпись ещё прежняя
UPDATE "listing_attribute_definitions"
SET "label" = 'Тип детали', "updated_at" = NOW()
WHERE "key" = 'partOriginality' AND "label" = 'Оригинал или аналог';

-- ── 3. Кроссы номеров: подтверждённые соответствия ─────────────────────────
-- «Toyota 45510-XXXXX → KYB XXXXX». Таблица пустая: автоматически кроссы не
-- заводятся, только из подтверждённого источника (каталог производителя).
-- Производитель — код справочника part_manufacturer, номер — как в каталоге,
-- ключ — тот же, что у номеров объявлений (без регистра и знаков).
CREATE TABLE "part_number_crosses" (
    "id" UUID NOT NULL,
    "source_maker" VARCHAR(80) NOT NULL,
    "source_number" VARCHAR(60) NOT NULL,
    "source_key" VARCHAR(60) NOT NULL,
    "target_maker" VARCHAR(80) NOT NULL,
    "target_number" VARCHAR(60) NOT NULL,
    "target_key" VARCHAR(60) NOT NULL,
    "relation" VARCHAR(16) NOT NULL DEFAULT 'analog',
    "source" VARCHAR(120) NOT NULL,
    "confirmed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_number_crosses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "part_number_crosses_source_maker_source_key_target_maker_target"
    ON "part_number_crosses"("source_maker", "source_key", "target_maker", "target_key");
CREATE INDEX "part_number_crosses_source_key_idx" ON "part_number_crosses"("source_key");
CREATE INDEX "part_number_crosses_target_key_idx" ON "part_number_crosses"("target_key");
