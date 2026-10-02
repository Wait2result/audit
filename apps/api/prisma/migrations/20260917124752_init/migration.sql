-- CreateTable
CREATE TABLE "cinemas" (
    "id" UUID NOT NULL,
    "city_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "phone" VARCHAR(20),
    "website_url" VARCHAR(300) NOT NULL,
    "kinoplan_token" VARCHAR(120) NOT NULL,
    "kinoplan_cinema_id" INTEGER NOT NULL,
    "kinoplan_city_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cinemas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cinemas_kinoplan_token_key" ON "cinemas"("kinoplan_token");

-- CreateIndex
CREATE INDEX "cinemas_city_id_is_active_sort_order_idx" ON "cinemas"("city_id", "is_active", "sort_order");

-- AddForeignKey
ALTER TABLE "cinemas" ADD CONSTRAINT "cinemas_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
