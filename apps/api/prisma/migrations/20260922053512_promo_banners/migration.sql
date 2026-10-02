-- CreateEnum
CREATE TYPE "PromoPlacement" AS ENUM ('home', 'delivery');

-- CreateTable
CREATE TABLE "promo_banners" (
    "id" UUID NOT NULL,
    "placement" "PromoPlacement" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "subtitle" VARCHAR(200),
    "image_media_id" UUID,
    "target_place_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "promo_banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promo_banners_placement_is_active_sort_order_idx" ON "promo_banners"("placement", "is_active", "sort_order");

-- AddForeignKey
ALTER TABLE "promo_banners" ADD CONSTRAINT "promo_banners_target_place_id_fkey" FOREIGN KEY ("target_place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
