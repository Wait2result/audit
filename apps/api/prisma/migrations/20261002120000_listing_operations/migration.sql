-- ТЗ «Объявления», фаза 3: операции и цена как параметры объявления.
--
-- Что делает эта миграция и почему это безопасно:
--   1. Добавляет единицу «в неделю» (аренда техники и инструмента). Новое
--      значение enum здесь нигде не используется — только объявляется.
--   2. Включает аренду там, где её можно сдавать: мотоциклы, фото и видео,
--      инструменты, велосипеды, снаряжение, оборудование — и расширяет
--      единицы аренды у транспорта и техники до «час / сутки / неделя / месяц».
--   3. «Аренда оборудования» перестаёт быть отдельной категорией и становится
--      ярлыком в «Оборудовании» (как «Посуточная аренда» у квартир): объявления
--      переносятся, а не удаляются.
--   4. Исправляет единицу цены у аренды, у которой она осталась «целиком»:
--      срок «надолго» → «в месяц», «посуточно» → «в сутки». Цена как число
--      не меняется. Остальные объявления не трогаются.
--   5. Текстовые поля (производитель «своими словами», порода, процессор…)
--      становятся фильтруемыми «по части слова»; под это — trigram-индекс.
--
-- «Куплю» и «сниму» в базе физически не осталось: v2-миграция
-- 20260929120000_listings_v2_core убрала их из характеристик и отправила
-- такие объявления в архив. Здесь ничего с ними делать не нужно.
-- Миграция идемпотентна: повторный запуск ничего не меняет.

-- 1. Единица «в неделю»
ALTER TYPE "ListingPriceUnit" ADD VALUE IF NOT EXISTS 'per_week';

-- 2. Продажа и аренда «за время» (час, сутки, неделя, месяц)
UPDATE "listing_categories"
SET
  "allowed_transactions" = ARRAY['sale', 'rent']::text[],
  "default_transaction" = 'sale',
  "allowed_price_units" = ARRAY['total', 'per_hour', 'per_day', 'per_week', 'per_month']::text[],
  "default_price_unit" = 'total'
WHERE "slug" IN (
  'transport-cars',
  'transport-trucks',
  'transport-special',
  'transport-water',
  'transport-moto',
  'business-agro',
  'business-equipment',
  'electronics-photo',
  'home-tools',
  'hobby-bikes',
  'hobby-outdoor'
);

-- 3. «Аренда оборудования» — ярлык, а не отдельная категория
UPDATE "listings"
SET "category_id" = (SELECT "id" FROM "listing_categories" WHERE "slug" = 'business-equipment')
WHERE "category_id" = (SELECT "id" FROM "listing_categories" WHERE "slug" = 'business-rent')
  AND EXISTS (SELECT 1 FROM "listing_categories" WHERE "slug" = 'business-equipment');

UPDATE "listing_categories"
SET
  "shortcut_filter" = '{"category": "business-equipment", "transactionType": "rent"}'::jsonb,
  "allowed_transactions" = ARRAY['rent']::text[],
  "default_transaction" = 'rent',
  "allowed_price_units" = ARRAY['per_hour', 'per_day', 'per_week', 'per_month']::text[],
  "default_price_unit" = 'per_day'
WHERE "slug" = 'business-rent';

DELETE FROM "listing_category_attributes"
WHERE "category_id" = (SELECT "id" FROM "listing_categories" WHERE "slug" = 'business-rent');

-- 4. Аренда с единицей «целиком» — единица по сроку
UPDATE "listings"
SET "price_unit" = 'per_month'
WHERE "transaction_type" = 'rent' AND "price_unit" = 'total' AND "rent_period" = 'monthly';

UPDATE "listings"
SET "price_unit" = 'per_day'
WHERE "transaction_type" = 'rent' AND "price_unit" = 'total' AND "rent_period" = 'daily';

-- 5. Текстовые фильтры «по части слова»
UPDATE "listing_attribute_definitions"
SET "filter" = 'text', "filterable" = true
WHERE "type" = 'string' AND "key" <> 'vin' AND "filter" = 'none';

CREATE INDEX IF NOT EXISTS "listing_attribute_values_text_trgm_idx"
  ON "listing_attribute_values" USING gin ("text_value" gin_trgm_ops);
