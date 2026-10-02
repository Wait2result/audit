-- Населённый пункт и районы — в поисковый вектор (ADR-0010).
--
-- Раньше город и район приписывались к search_text при сохранении
-- характеристик. Теперь место — отдельные колонки, их определяет геокодер,
-- и в поиск они попадают тем же триггером, что держит вектор и точку:
-- «Манаскент» находит объявления из Манаскента, даже если в заголовке его нет.

CREATE OR REPLACE FUNCTION "listings_derived_update"() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('russian', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('russian',
      coalesce(NEW."search_text", '') || ' ' ||
      coalesce(NEW."city", '') || ' ' ||
      coalesce(NEW."settlement", '') || ' ' ||
      coalesce(NEW."city_district", '') || ' ' ||
      coalesce(NEW."district", '')), 'B') ||
    setweight(to_tsvector('russian', coalesce(NEW."description", '')), 'C');
  NEW."geom" := CASE
    WHEN NEW."latitude" IS NOT NULL AND NEW."longitude" IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography
    ELSE NULL END;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "listings_derived_trg" ON "listings";
CREATE TRIGGER "listings_derived_trg"
BEFORE INSERT OR UPDATE OF "title", "description", "search_text", "latitude", "longitude",
  "city", "settlement", "city_district", "district"
ON "listings" FOR EACH ROW EXECUTE FUNCTION "listings_derived_update"();

-- Пересчёт вектора у объявлений, которым прошлая миграция записала город
UPDATE "listings" SET "title" = "title" WHERE "city" IS NOT NULL OR "settlement" IS NOT NULL;
