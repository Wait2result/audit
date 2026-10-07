-- Фильтры по альтернативным значениям — множественный выбор (аудит фильтров).
--
-- Кузов «Седан или Хэтчбек», топливо «Бензин или Газ», сезон «Зимние или
-- Всесезонные», тип техники, ремонт, график работы и т. п.: внутри одного поля
-- выбранные значения объединяются через ИЛИ, между разными полями — И. Сервер
-- уже понимает список значений (IN), а экран фильтров давал выбрать одно.
--
-- Вид фильтра правится из панели, и повторный db:seed его не перезаписывает —
-- поэтому меняем здесь, и только там, где он всё ещё исходный «select»:
-- поле, которое владелец уже настроил иначе, остаётся как есть.
-- Одиночными остаются марка, тип шины/диска (от него зависят поля), руль,
-- оригинал/аналог, наличие, «Новое/Б/у», продавец, пол животного, порог опыта
-- и образования, индекс скорости. Сохранённые значения объявлений не меняются:
-- одиночное значение в фильтре сервер понимает как список из одного.

UPDATE "listing_attribute_definitions"
SET "filter" = 'multiselect'
WHERE "filter" = 'select'
  AND "key" IN (
  'gearbox', 'fuel', 'drive', 'bodyType', 'owners', 'partCondition',
  'partSaleUnit', 'season', 'rimMaterial', 'motoType', 'truckType', 'specialType',
  'waterType', 'hullMaterial', 'buildingType', 'renovation', 'bathroom', 'wallMaterial',
  'heating', 'roomsInFlat', 'landPurpose', 'road', 'commercialType', 'garageType',
  'accessoryType', 'storage', 'os', 'resolution', 'photoType', 'consoleType',
  'audioType', 'furnitureType', 'applianceType', 'lightType', 'materialType', 'toolType',
  'plumbingType', 'doorsType', 'material', 'clothesType', 'gender', 'jewelryType',
  'jewelryMaterial', 'kidsGoodsType', 'sportType', 'serviceFormat', 'performer', 'sphere',
  'employment', 'schedule', 'registration', 'livestockKind', 'gamesType', 'instrumentType',
  'bikeType', 'equipmentType', 'businessSphere', 'premises', 'childAge', 'childWeight',
  'seatInstallation', 'batteryVoltage', 'batteryChemistry'
  );
