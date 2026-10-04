-- Написания Toyota Succeed, на которых умный поиск терял модель («нужен
-- суксид на автомате»): те же, что в packages/shared (MODEL_ALIASES), чтобы
-- база совпала с кодом без повторного сида. Добавляются только недостающие.
UPDATE "listing_dictionary_entries"
SET "aliases" = ARRAY(
  SELECT DISTINCT unnest("aliases" || ARRAY['суксид', 'суксида', 'сусид']::TEXT[])
)
WHERE "kind" = 'car_model'
  AND "value" = 'succeed'
  AND NOT ("aliases" @> ARRAY['суксид', 'суксида', 'сусид']::TEXT[]);
