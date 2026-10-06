-- Условия аренды и санузел частного дома (аудит, п. 36–37).
--
-- 1. «Коммунальные включены», «Можно с животными», «Можно с детьми» —
--    только у объявлений «Сдам»: у продажи поля не показываются, не
--    проверяются и не сохраняются. Условие показа по сделке — ключ
--    `transactionType` в visible_when (повторный db:seed пишет то же самое).
-- 2. «Санузел» дома — несколько значений сразу: «В доме» + «На улице».
--    Тип и вид фильтра меняются здесь: повторный засев обновляет тип, но не
--    вид фильтра (его правят из панели), и фильтр остался бы одиночным.
--    Сохранённые одиночные значения становятся списком из одного значения;
--    строки таблицы значений уже хранятся по одной на значение и не меняются.
--
-- Ничего не удаляется: условия аренды у старых объявлений-продаж остаются
-- в базе как были, их просто не показывают.

UPDATE "listing_attribute_definitions"
SET "visible_when" = '{"key": "transactionType", "values": ["rent"]}'::jsonb
WHERE "key" IN ('utilitiesIncluded', 'petsAllowed', 'childrenAllowed');

UPDATE "listing_attribute_definitions"
SET "type" = 'multiEnum', "filter" = 'multiselect'
WHERE "key" = 'bathroomLocation';

UPDATE "listings"
SET "attributes" = jsonb_set("attributes", '{bathroomLocation}', jsonb_build_array("attributes" -> 'bathroomLocation'))
WHERE jsonb_typeof("attributes" -> 'bathroomLocation') = 'string';
