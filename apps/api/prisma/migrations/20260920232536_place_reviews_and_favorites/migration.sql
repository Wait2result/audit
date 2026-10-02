-- AlterTable
ALTER TABLE "places" ADD COLUMN     "rating_average" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "rating_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "place_reviews" (
    "id" UUID NOT NULL,
    "place_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" VARCHAR(1000),
    "reply" VARCHAR(1000),
    "replied_at" TIMESTAMP(3),
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "place_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_places" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "place_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "place_reviews_place_id_is_hidden_created_at_idx" ON "place_reviews"("place_id", "is_hidden", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "place_reviews_place_id_user_id_key" ON "place_reviews"("place_id", "user_id");

-- CreateIndex
CREATE INDEX "favorite_places_user_id_created_at_idx" ON "favorite_places"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_places_user_id_place_id_key" ON "favorite_places"("user_id", "place_id");

-- AddForeignKey
ALTER TABLE "place_reviews" ADD CONSTRAINT "place_reviews_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_reviews" ADD CONSTRAINT "place_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_places" ADD CONSTRAINT "favorite_places_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_places" ADD CONSTRAINT "favorite_places_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;
