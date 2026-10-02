-- CreateEnum
CREATE TYPE "ListingTransactionType" AS ENUM ('sale', 'rent', 'free', 'mating');

-- CreateEnum
CREATE TYPE "ListingRentPeriod" AS ENUM ('daily', 'monthly');

-- CreateEnum
CREATE TYPE "ListingCardLayout" AS ENUM ('grid', 'list');

-- AlterEnum
ALTER TYPE "ListingPriceUnit" ADD VALUE 'per_unit';

-- DropIndex
DROP INDEX "listings_city_id_status_category_id_price_idx";

-- AlterTable
ALTER TABLE "listing_categories" DROP COLUMN "attribute_set",
ADD COLUMN     "allowed_price_units" TEXT[] DEFAULT ARRAY['total']::TEXT[],
ADD COLUMN     "allowed_transactions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "card_layout" "ListingCardLayout" NOT NULL DEFAULT 'grid',
ADD COLUMN     "default_rent_period" "ListingRentPeriod",
ADD COLUMN     "default_transaction" "ListingTransactionType",
ADD COLUMN     "deprecated_to_id" UUID,
ADD COLUMN     "icon_key" VARCHAR(40),
ADD COLUMN     "shortcut_filter" JSONB;

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "geom" geography(Point,4326),
ADD COLUMN     "needs_review" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "price_per_sqm" INTEGER,
ADD COLUMN     "rent_period" "ListingRentPeriod",
ADD COLUMN     "resubmitted_at" TIMESTAMP(3),
ADD COLUMN     "search_text" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "search_vector" tsvector,
ADD COLUMN     "transaction_type" "ListingTransactionType";

-- CreateTable
CREATE TABLE "listing_attribute_definitions" (
    "key" VARCHAR(60) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "short_label" VARCHAR(40),
    "unit" VARCHAR(20),
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "scale" INTEGER,
    "options" JSONB,
    "dictionary_kind" VARCHAR(40),
    "parent_key" VARCHAR(60),
    "column" VARCHAR(20),
    "filter" VARCHAR(20) NOT NULL,
    "searchable" BOOLEAN NOT NULL DEFAULT true,
    "filterable" BOOLEAN NOT NULL DEFAULT true,
    "sortable" BOOLEAN NOT NULL DEFAULT false,
    "show_in_card" BOOLEAN NOT NULL DEFAULT false,
    "show_in_details" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_attribute_definitions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "listing_category_attributes" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "attribute_key" VARCHAR(60) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "label" VARCHAR(80),
    "dictionary_kind" VARCHAR(40),
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "listing_category_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_dictionary_entries" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "value" VARCHAR(80) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "parent_value" VARCHAR(80) NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "meta" JSONB,

    CONSTRAINT "listing_dictionary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_attribute_values" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "num_value" DECIMAL(18,4),
    "text_value" VARCHAR(200),

    CONSTRAINT "listing_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_category_attributes_attribute_key_idx" ON "listing_category_attributes"("attribute_key");

-- CreateIndex
CREATE UNIQUE INDEX "listing_category_attributes_category_id_attribute_key_key" ON "listing_category_attributes"("category_id", "attribute_key");

-- CreateIndex
CREATE INDEX "listing_dictionary_entries_kind_parent_value_sort_order_idx" ON "listing_dictionary_entries"("kind", "parent_value", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "listing_dictionary_entries_kind_parent_value_value_key" ON "listing_dictionary_entries"("kind", "parent_value", "value");

-- CreateIndex
CREATE INDEX "listing_attribute_values_listing_id_key_idx" ON "listing_attribute_values"("listing_id", "key");

-- CreateIndex
CREATE INDEX "listing_attribute_values_key_num_value_idx" ON "listing_attribute_values"("key", "num_value");

-- CreateIndex
CREATE INDEX "listing_attribute_values_key_text_value_idx" ON "listing_attribute_values"("key", "text_value");

-- CreateIndex
CREATE INDEX "listings_city_id_status_category_id_price_unit_price_idx" ON "listings"("city_id", "status", "category_id", "price_unit", "price");

-- CreateIndex
CREATE INDEX "listings_city_id_status_transaction_type_rent_period_idx" ON "listings"("city_id", "status", "transaction_type", "rent_period");

-- CreateIndex
CREATE INDEX "listings_city_id_status_category_id_year_idx" ON "listings"("city_id", "status", "category_id", "year");

-- CreateIndex
CREATE INDEX "listings_city_id_status_category_id_mileage_idx" ON "listings"("city_id", "status", "category_id", "mileage");

-- CreateIndex
CREATE INDEX "listings_city_id_status_category_id_rooms_idx" ON "listings"("city_id", "status", "category_id", "rooms");

-- CreateIndex
CREATE INDEX "listings_city_id_status_category_id_area_total_idx" ON "listings"("city_id", "status", "category_id", "area_total");

-- CreateIndex
CREATE INDEX "listings_city_id_status_district_id_idx" ON "listings"("city_id", "status", "district_id");

-- CreateIndex
CREATE INDEX "listings_status_published_at_idx" ON "listings"("status", "published_at");

-- CreateIndex
CREATE INDEX "listings_needs_review_updated_at_idx" ON "listings"("needs_review", "updated_at");

-- AddForeignKey
ALTER TABLE "listing_categories" ADD CONSTRAINT "listing_categories_deprecated_to_id_fkey" FOREIGN KEY ("deprecated_to_id") REFERENCES "listing_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_category_attributes" ADD CONSTRAINT "listing_category_attributes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "listing_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_category_attributes" ADD CONSTRAINT "listing_category_attributes_attribute_key_fkey" FOREIGN KEY ("attribute_key") REFERENCES "listing_attribute_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_attribute_values" ADD CONSTRAINT "listing_attribute_values_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
--  Ниже — то, чего Prisma не выражает: перенос данных, триггеры, GIN/GIST.
-- ═══════════════════════════════════════════════════════════════════════════

-- Тип сделки переезжает из характеристики dealType в свою колонку.
-- «Куплю» и «Сниму» типами объявления больше не являются — такие объявления
-- уходят в архив с пояснением автору.
UPDATE "listings" SET
  "transaction_type" = CASE "attributes"->>'dealType'
    WHEN 'sale' THEN 'sale'::"ListingTransactionType"
    WHEN 'rent' THEN 'rent'::"ListingTransactionType"
    WHEN 'rent_long' THEN 'rent'::"ListingTransactionType"
    WHEN 'rent_daily' THEN 'rent'::"ListingTransactionType"
    ELSE NULL END,
  "rent_period" = CASE "attributes"->>'dealType'
    WHEN 'rent_long' THEN 'monthly'::"ListingRentPeriod"
    WHEN 'rent_daily' THEN 'daily'::"ListingRentPeriod"
    ELSE NULL END
WHERE "attributes" ? 'dealType';

UPDATE "listings" SET
  "status" = 'archived',
  "archive_reason" = 'withdrawn',
  "status_reason" = 'Объявления «Куплю» и «Сниму» больше не размещаются: ищите готовые объявления через фильтр «Купить» или «Снять»',
  "status_changed_at" = now()
WHERE "attributes"->>'dealType' IN ('buy', 'rent_wanted') AND "status" <> 'archived';

UPDATE "listings" SET "attributes" = "attributes" - 'dealType' WHERE "attributes" ? 'dealType';

-- Единица цены определяется сделкой: аренда надолго — в месяц, посуточно — в сутки
UPDATE "listings" SET "price_unit" = 'per_month'
WHERE "transaction_type" = 'rent' AND "rent_period" = 'monthly' AND "price_unit" = 'total';
UPDATE "listings" SET "price_unit" = 'per_day'
WHERE "transaction_type" = 'rent' AND "rent_period" = 'daily' AND "price_unit" = 'total';

-- Марка — значение справочника в нижнем регистре: «Apple» → «apple»
UPDATE "listings" SET "attributes" = jsonb_set("attributes", '{brand}', to_jsonb(lower("attributes"->>'brand')))
WHERE "attributes" ? 'brand' AND jsonb_typeof("attributes"->'brand') = 'string';

-- Цена за м² у продажи с площадью (площадь хранится в десятых)
UPDATE "listings" SET "price_per_sqm" = round("price"::numeric / ("area_total"::numeric / 10))
WHERE "price" IS NOT NULL AND "area_total" IS NOT NULL AND "area_total" > 0
  AND "price_unit" = 'total' AND "transaction_type" = 'sale';

-- Поисковый вектор и точка на карте считаются триггером: приложение и
-- панель пишут обычные колонки, а база сама держит производные в порядке.
CREATE OR REPLACE FUNCTION "listings_derived_update"() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('russian', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(NEW."search_text", '')), 'B') ||
    setweight(to_tsvector('russian', coalesce(NEW."description", '')), 'C');
  NEW."geom" := CASE
    WHEN NEW."latitude" IS NOT NULL AND NEW."longitude" IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography
    ELSE NULL END;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "listings_derived_trg"
BEFORE INSERT OR UPDATE OF "title", "description", "search_text", "latitude", "longitude"
ON "listings" FOR EACH ROW EXECUTE FUNCTION "listings_derived_update"();

-- Пересчёт производных у уже существующих строк
UPDATE "listings" SET "title" = "title";

-- Поиск: полнотекстовый вектор, триграммы для опечаток и частичных
-- совпадений, JSON характеристик, точка на карте. Расширения pg_trgm и
-- postgis созданы первой миграцией проекта.
CREATE INDEX "listings_search_vector_idx" ON "listings" USING GIN ("search_vector");
CREATE INDEX "listings_title_trgm_idx" ON "listings" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "listings_search_text_trgm_idx" ON "listings" USING GIN ("search_text" gin_trgm_ops);
CREATE INDEX "listings_attributes_gin_idx" ON "listings" USING GIN ("attributes" jsonb_path_ops);
CREATE INDEX "listings_geom_idx" ON "listings" USING GIST ("geom");
