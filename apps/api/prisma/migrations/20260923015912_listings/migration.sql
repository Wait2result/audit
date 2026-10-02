-- CreateEnum
CREATE TYPE "ListingPriceUnit" AS ENUM ('total', 'per_month', 'per_day', 'per_hour');

-- CreateEnum
CREATE TYPE "ListingCondition" AS ENUM ('new', 'used');

-- CreateEnum
CREATE TYPE "ListingArchiveReason" AS ENUM ('sold', 'withdrawn', 'expired');

-- CreateEnum
CREATE TYPE "ListingReportReason" AS ENUM ('fraud', 'prohibited', 'wrong_category', 'irrelevant', 'duplicate', 'offensive', 'spam', 'other');

-- CreateEnum
CREATE TYPE "ListingReportStatus" AS ENUM ('new', 'resolved', 'rejected');

-- AlterTable
ALTER TABLE "media" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "listing_categories" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "item_label" VARCHAR(60),
    "image_media_id" UUID,
    "attribute_set" VARCHAR(40),
    "default_price_unit" "ListingPriceUnit" NOT NULL DEFAULT 'total',
    "is_leaf" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "listing_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "city_id" UUID NOT NULL,
    "district_id" UUID,
    "category_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER,
    "price_max" INTEGER,
    "price_unit" "ListingPriceUnit" NOT NULL DEFAULT 'total',
    "is_negotiable" BOOLEAN NOT NULL DEFAULT false,
    "condition" "ListingCondition",
    "rooms" INTEGER,
    "area_total" INTEGER,
    "floor" INTEGER,
    "floors_total" INTEGER,
    "year" INTEGER,
    "mileage" INTEGER,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "address" VARCHAR(300),
    "contact_phone" VARCHAR(20) NOT NULL,
    "contact_name" VARCHAR(60),
    "allow_chat" BOOLEAN NOT NULL DEFAULT true,
    "allow_calls" BOOLEAN NOT NULL DEFAULT true,
    "cover_media_id" UUID,
    "status" "ModerationStatus" NOT NULL DEFAULT 'approved',
    "status_reason" VARCHAR(500),
    "status_changed_at" TIMESTAMP(3),
    "status_changed_by_id" UUID,
    "archive_reason" "ListingArchiveReason",
    "published_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "bumped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promoted_until" TIMESTAMP(3),
    "highlighted_until" TIMESTAMP(3),
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "phone_views_count" INTEGER NOT NULL DEFAULT 0,
    "reports_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_listings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_reports" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" "ListingReportReason" NOT NULL,
    "comment" VARCHAR(1000),
    "status" "ListingReportStatus" NOT NULL DEFAULT 'new',
    "resolution" VARCHAR(500),
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_categories_slug_key" ON "listing_categories"("slug");

-- CreateIndex
CREATE INDEX "listing_categories_parent_id_sort_order_idx" ON "listing_categories"("parent_id", "sort_order");

-- CreateIndex
CREATE INDEX "listing_categories_is_active_sort_order_idx" ON "listing_categories"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "listings_city_id_status_category_id_bumped_at_idx" ON "listings"("city_id", "status", "category_id", "bumped_at" DESC);

-- CreateIndex
CREATE INDEX "listings_city_id_status_bumped_at_idx" ON "listings"("city_id", "status", "bumped_at" DESC);

-- CreateIndex
CREATE INDEX "listings_city_id_status_category_id_price_idx" ON "listings"("city_id", "status", "category_id", "price");

-- CreateIndex
CREATE INDEX "listings_seller_id_status_bumped_at_idx" ON "listings"("seller_id", "status", "bumped_at" DESC);

-- CreateIndex
CREATE INDEX "listings_status_expires_at_idx" ON "listings"("status", "expires_at");

-- CreateIndex
CREATE INDEX "listings_status_reports_count_idx" ON "listings"("status", "reports_count" DESC);

-- CreateIndex
CREATE INDEX "favorite_listings_user_id_created_at_idx" ON "favorite_listings"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_listings_user_id_listing_id_key" ON "favorite_listings"("user_id", "listing_id");

-- CreateIndex
CREATE INDEX "listing_reports_status_created_at_idx" ON "listing_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "listing_reports_listing_id_idx" ON "listing_reports"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_reports_listing_id_reporter_id_key" ON "listing_reports"("listing_id", "reporter_id");

-- AddForeignKey
ALTER TABLE "listing_categories" ADD CONSTRAINT "listing_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "listing_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "listing_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_listings" ADD CONSTRAINT "favorite_listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_listings" ADD CONSTRAINT "favorite_listings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Поиск по объявлениям. Расширение pg_trgm создано первой миграцией проекта
-- и до сих пор не использовалось: без этих индексов ILIKE '%диван%' — полный
-- перебор таблицы. Морфологии они не дают («диваны» не найдут «диван») —
-- настоящий поиск через to_tsvector делается, когда объявлений станет много.
CREATE INDEX "listings_title_trgm" ON "listings" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "listings_description_trgm" ON "listings" USING GIN ("description" gin_trgm_ops);

-- Характеристики категории, которые фильтруются на равенство
-- («коробка: автомат»). Индекс пригодится, когда фильтр будет переписан на
-- оператор вложенности @> — см. docs/ADR/0008-объявления.md.
CREATE INDEX "listings_attributes_gin" ON "listings" USING GIN ("attributes" jsonb_path_ops);
