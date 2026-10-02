-- DropIndex
DROP INDEX "listings_attributes_gin";

-- DropIndex
DROP INDEX "listings_description_trgm";

-- DropIndex
DROP INDEX "listings_title_trgm";

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "promoted_at" TIMESTAMP(3);
