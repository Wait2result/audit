-- Понятные названия полей запчасти (аудит, п. 17–23).
--
-- Человеку не нужно разбираться в «OEM», «каталожном номере» и «номере
-- производителя»: для него это один «Номер запчасти / артикул». Кузов и
-- двигатель в «Подходит к» — «Номер кузова» и «Номер двигателя», чтобы их не
-- путали с номером детали; «Тип детали» — «Оригинальность» (Оригинал / Аналог).
--
-- Повторный db:seed подписи не перезаписывает (их правят из панели), поэтому
-- переименование — здесь. Виды номера в базе (oem, catalog, manufacturer,
-- article) не меняются; добавляется вид «replacement» — номер замены,
-- указанный продавцом. Колонка kind — строка, схема таблицы не меняется.

UPDATE "listing_attribute_definitions" SET "label" = 'Номер запчасти / артикул' WHERE "key" = 'partNumber';
UPDATE "listing_attribute_definitions" SET "label" = 'Оригинальность' WHERE "key" = 'partOriginality';
UPDATE "listing_attribute_definitions" SET "label" = 'Номер кузова' WHERE "key" = 'compatChassis';
UPDATE "listing_attribute_definitions" SET "label" = 'Номер двигателя' WHERE "key" = 'compatEngine';
