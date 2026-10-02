-- Подписи вариантов для карточки объявления (ТЗ «Объявления», визуальная
-- итерация): в строке карточки «Не требуется» и «Полная» без названия поля
-- ничего не говорят, а «Без опыта» и «Полная занятость» — говорят.
--
-- Варианты полей живут в базе, и повторный seed их не перезаписывает, поэтому
-- подписи добавляются отдельной миграцией. Идемпотентна: ставит одни и те же
-- значения поверх прежних, остальные свойства вариантов не трогает.
UPDATE "listing_attribute_definitions" AS d
SET "options" = (
  SELECT jsonb_agg(
    CASE o ->> 'value'
      WHEN 'none' THEN o || '{"cardLabel": "Без опыта"}'::jsonb
      WHEN 'year' THEN o || '{"cardLabel": "Опыт от года"}'::jsonb
      WHEN 'three' THEN o || '{"cardLabel": "Опыт от 3 лет"}'::jsonb
      ELSE o
    END
  )
  FROM jsonb_array_elements(d."options") AS o
)
WHERE d."key" = 'experience' AND d."options" IS NOT NULL;

UPDATE "listing_attribute_definitions" AS d
SET "options" = (
  SELECT jsonb_agg(
    CASE o ->> 'value'
      WHEN 'full' THEN o || '{"cardLabel": "Полная занятость"}'::jsonb
      WHEN 'part' THEN o || '{"cardLabel": "Частичная занятость"}'::jsonb
      WHEN 'free' THEN o || '{"cardLabel": "Свободный график"}'::jsonb
      ELSE o
    END
  )
  FROM jsonb_array_elements(d."options") AS o
)
WHERE d."key" IN ('employment', 'schedule') AND d."options" IS NOT NULL;
