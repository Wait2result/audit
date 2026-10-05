-- Короткие и уменьшительные написания Toyota Succeed из реальных запросов
-- («сукс», «суксидик»): те же, что в packages/shared (MODEL_ALIASES), чтобы
-- база совпала с кодом без повторного сида. Добавляются только недостающие.
UPDATE "listing_dictionary_entries"
SET "aliases" = ARRAY(
  SELECT DISTINCT unnest("aliases" || ARRAY['сукс', 'сукса', 'суксидик', 'суксидика']::TEXT[])
)
WHERE "kind" = 'car_model'
  AND "value" = 'succeed'
  AND NOT ("aliases" @> ARRAY['сукс', 'сукса', 'суксидик', 'суксидика']::TEXT[]);
