-- Русские написания марок и моделей для поиска: «тойота» → Toyota.
-- Заполняются сидом из packages/shared (BRAND_ALIASES, MODEL_ALIASES).
ALTER TABLE "listing_dictionary_entries"
  ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
