-- Условие показа поля: «Face ID работает» — только у Apple.
-- { "key": "brand", "values": ["apple"] }; заполняется сидом из packages/shared.
ALTER TABLE "listing_attribute_definitions" ADD COLUMN "visible_when" JSONB;
