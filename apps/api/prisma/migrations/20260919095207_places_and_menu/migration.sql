-- CreateEnum
CREATE TYPE "PlaceType" AS ENUM ('restaurant', 'cafe', 'fast_food', 'bakery', 'shop', 'supermarket');

-- CreateEnum
CREATE TYPE "PlaceMemberRole" AS ENUM ('manager', 'staff');

-- CreateTable
CREATE TABLE "places" (
    "id" UUID NOT NULL,
    "city_id" UUID NOT NULL,
    "district_id" UUID,
    "type" "PlaceType" NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "address" VARCHAR(300) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" VARCHAR(20),
    "cuisines" TEXT[],
    "average_check" INTEGER,
    "cover_media_id" UUID,
    "orders_enabled" BOOLEAN NOT NULL DEFAULT false,
    "has_delivery" BOOLEAN NOT NULL DEFAULT false,
    "has_pickup" BOOLEAN NOT NULL DEFAULT true,
    "delivery_fee" INTEGER NOT NULL DEFAULT 0,
    "free_delivery_from" INTEGER,
    "min_order_amount" INTEGER NOT NULL DEFAULT 0,
    "delivery_minutes" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_members" (
    "id" UUID NOT NULL,
    "place_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "PlaceMemberRole" NOT NULL,
    "granted_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "place_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_schedules" (
    "id" UUID NOT NULL,
    "place_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "opens_minute" INTEGER NOT NULL DEFAULT 540,
    "closes_minute" INTEGER NOT NULL DEFAULT 1320,

    CONSTRAINT "place_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL,
    "place_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "place_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "price" INTEGER NOT NULL,
    "portion" VARCHAR(40),
    "image_media_id" UUID,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_option_groups" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "min_choices" INTEGER NOT NULL DEFAULT 0,
    "max_choices" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "menu_option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_options" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "price_delta" INTEGER NOT NULL DEFAULT 0,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "menu_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "places_city_id_type_is_active_sort_order_idx" ON "places"("city_id", "type", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "place_members_user_id_idx" ON "place_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "place_members_place_id_user_id_key" ON "place_members"("place_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "place_schedules_place_id_weekday_key" ON "place_schedules"("place_id", "weekday");

-- CreateIndex
CREATE INDEX "menu_categories_place_id_sort_order_idx" ON "menu_categories"("place_id", "sort_order");

-- CreateIndex
CREATE INDEX "menu_items_place_id_category_id_sort_order_idx" ON "menu_items"("place_id", "category_id", "sort_order");

-- CreateIndex
CREATE INDEX "menu_option_groups_item_id_sort_order_idx" ON "menu_option_groups"("item_id", "sort_order");

-- CreateIndex
CREATE INDEX "menu_options_group_id_sort_order_idx" ON "menu_options"("group_id", "sort_order");

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_members" ADD CONSTRAINT "place_members_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_members" ADD CONSTRAINT "place_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_schedules" ADD CONSTRAINT "place_schedules_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_option_groups" ADD CONSTRAINT "menu_option_groups_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_options" ADD CONSTRAINT "menu_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "menu_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
