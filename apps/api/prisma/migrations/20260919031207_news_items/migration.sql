-- CreateEnum
CREATE TYPE "NewsScope" AS ENUM ('city', 'dagestan', 'russia', 'world');

-- CreateTable
CREATE TABLE "news_items" (
    "id" UUID NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "external_id" VARCHAR(600) NOT NULL,
    "url" VARCHAR(1000) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "lead" TEXT,
    "body" TEXT,
    "image_url" VARCHAR(1000),
    "scope" "NewsScope",
    "city_id" UUID,
    "source_category" VARCHAR(120),
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "corroboration" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMP(3) NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_items_scope_city_id_published_at_idx" ON "news_items"("scope", "city_id", "published_at");

-- CreateIndex
CREATE INDEX "news_items_published_at_idx" ON "news_items"("published_at");

-- CreateIndex
CREATE UNIQUE INDEX "news_items_source_external_id_key" ON "news_items"("source", "external_id");

-- AddForeignKey
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
