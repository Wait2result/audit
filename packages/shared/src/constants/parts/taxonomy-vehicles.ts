import { parseTaxonomy } from './taxonomy.js';

/** Мотозапчасти: мотоциклы, скутеры, мопеды, квадроциклы, снегоходы. */
export const MOTO_PARTS = parseTaxonomy(`
# engine | Двигатель | мотор; двигатели
moto_engine | Двигатель мото | двигатель в сборе; мотор в сборе
moto_cylinder_head | ГБЦ | головка блока
moto_piston_group | Поршневая | поршень; поршневая группа; цилиндро-поршневая
moto_timing | ГРМ | цепь грм
moto_cooling | Система охлаждения | охлаждение; радиатор; помпа мото
moto_lubrication | Система смазки | смазка; масляный насос
moto_fuel | Топливная система | карбюратор; топливный насос; бензобак
moto_intake | Впуск | воздушный фильтр; впускной коллектор
moto_exhaust_system | Выпуск | выпускной коллектор
moto_ignition | Система зажигания | зажигание; катушка зажигания; свеча

# transmission | Трансмиссия
moto_clutch | Сцепление | корзина сцепления
moto_gearbox | КПП | коробка передач
moto_chain | Цепь | цепь мото; приводная цепь
moto_sprockets | Звёзды | звезда; звезды; звёздочка; звездочка
moto_drive | Привод | кардан; ремень привода

# chassis | Ходовая
moto_chassis | Ходовая | рама; подвеска
moto_shocks | Амортизаторы | амортизатор
moto_fork | Вилка | передняя вилка
moto_steering_column | Рулевая колонка
moto_handlebar | Руль | рули

# brakes | Тормоза
moto_brakes | Тормоза | колодки; тормозной диск; суппорт
moto_abs | ABS | абс

# electrics | Электрика
moto_electrics | Электрика | проводка; реле; регулятор напряжения
moto_generator | Генератор | статор
moto_starter | Стартер
moto_dashboard | Приборная панель | приборка; спидометр
moto_controls | Органы управления | ручка газа; рычаг; манетка

# body | Кузовные детали
moto_body | Кузовные детали | кузов
moto_plastic | Пластик | пластик на мото; обвес
moto_fairings | Обтекатели | обтекатель
moto_glass | Стёкла | ветровое стекло; визор
moto_optics | Оптика | фара; фонарь; поворотник
moto_seats | Сиденья | сиденье; седло
moto_fuel_tanks | Топливные баки | топливный бак; бак
moto_exhaust | Выхлоп | выхлоп; глушитель

# tracked | Гусеницы и лыжи (снегоходы)
moto_tracks | Гусеницы | гусеница
moto_skis | Лыжи | лыжа
moto_runners | Склизы | сколз; склиз

# other | Прочее
moto_consumables | Расходники | фильтры; свечи
moto_protection | Защита | дуги; слайдеры; защита
moto_fasteners | Крепёж
moto_other | Прочее | другое
`);

/** Запчасти для грузовиков. */
export const TRUCK_PARTS = parseTaxonomy(`
# engine | Двигатель | двигатели
truck_engine | Двигатель в сборе | двигатель; двс
truck_turbine | Турбина | турбокомпрессор
truck_injectors | Форсунки | форсунка
truck_high_pressure_pump | ТНВД
truck_engine_parts | Детали двигателя | гбц; поршни; вкладыши
truck_cooling | Охлаждение двигателя | радиатор; помпа; вентилятор

# gearbox | КПП | коробка передач
truck_gearbox | КПП в сборе | коробка; коробка передач
truck_gearbox_parts | Детали КПП | синхронизаторы; шестерни

# clutch | Сцепление
truck_clutch | Сцепление в сборе | комплект сцепления; корзина; диск сцепления
truck_clutch_actuator | Пневмоусилитель сцепления | пгу

# axles | Мосты
truck_axle | Мост | задний мост; передний мост; мосты
truck_axle_parts | Детали моста | полуось; сателлиты
truck_hubs | Ступицы | ступица

# reducers | Редукторы
truck_final_drive | Редуктор моста | редуктор
truck_interaxle | Межосевой дифференциал | межосевой

# driveshaft | Кардан
truck_cardan | Карданный вал | кардан
truck_cardan_cross | Крестовина | крестовина кардана

# steering | Рулевое управление | рулевое
truck_steering | Рулевая рейка | рейка; рулевой механизм; рулевой редуктор

# suspension | Подвеска
truck_suspension | Подвеска | амортизатор; стабилизатор; сайлентблок
truck_air_suspension | Пневмоподушка | пневморессора; пневмобаллон
# springs | Рессоры
truck_leaf_spring | Рессора | рессоры

# cab | Кабина
truck_cab | Кабина в сборе | кабина
truck_cab_parts | Детали кабины | капот; крыло; дверь; бампер
truck_cab_mounts | Крепление кабины | подушки кабины

# body | Кузов
truck_body | Кузов | борт; кузова; платформа
truck_dump_parts | Детали самосвала | подъёмник; гидроцилиндр кузова

# brakes | Тормоза
truck_brakes | Тормоза | колодки; барабан; тормозной диск; суппорт
truck_brake_chamber | Энергоаккумулятор | тормозная камера

# pneumatics | Пневмосистема
truck_air_system | Пневмосистема | пневматика; ресивер; кран; клапан
truck_air_dryer | Осушитель воздуха | осушитель

# compressors | Компрессоры
truck_compressor | Компрессор | компрессор воздушный

# fuel | Топливная система
truck_fuel_tank | Топливный бак | бак
truck_fuel_system | Топливная система | топливный насос; фильтр; трубки

# electrics | Электрика
truck_alternator | Генератор
truck_starter | Стартер
truck_electrics | Электрика | реле; датчики; проводка; блок управления

# optics | Оптика
truck_headlight | Фара | фары; оптика
truck_taillight | Фонарь | фонари; задний фонарь

# hydraulics | Гидравлика
truck_hydraulics | Гидравлика | гидронасос; гидроцилиндр; гидрораспределитель

# trailer | Прицепное оборудование
truck_trailer_parts | Прицепное оборудование | дышло; тормоза прицепа; опора
# saddle | Седельное оборудование
truck_fifth_wheel | Седельное устройство | седло; седельный механизм

# body_parts | Кузовные детали
truck_body_parts | Кузовные детали | подножка
# glass | Стёкла
truck_glass | Стёкла | лобовое; боковое стекло
# interior | Салон
truck_interior | Салон | сиденье; обшивка; панель
# consumables | Расходники
truck_consumables | Расходники | фильтры; ремни
# fasteners | Крепёж
truck_fasteners | Крепёж
# other | Прочее
truck_other | Прочее | другое
`);

/** Запчасти для спецтехники: экскаваторы, погрузчики, бульдозеры, тракторы, краны. */
export const SPECIAL_PARTS = parseTaxonomy(`
# engine | Двигатель / ДВС | двигатель; двс
special_engine | Двигатель в сборе | двигатель; двс; мотор
special_cylinder_head | ГБЦ | головка блока
special_piston_group | Поршневая | поршни; гильзы; кольца
special_turbine | Турбина | турбокомпрессор
special_high_pressure_pump | ТНВД
special_injectors | Форсунки | форсунка
special_starter | Стартер
special_alternator | Генератор

# fuel | Топливная система | топливо
special_fuel_system | Топливная система | топливный насос; топливные трубки; бак

# cooling | Охлаждение
special_cooling | Система охлаждения | радиатор; помпа; вентилятор

# filters | Фильтры
special_filters | Фильтры | фильтр масляный; фильтр воздушный; фильтр топливный

# belts | Ремни и ролики
special_belts | Ремни и ролики | ремень; ролик

# steering | Рулевое управление | рулевое
special_steering | Рулевая рейка | рейка; рулевой механизм; рулевой цилиндр

# transmission | Трансмиссия
special_gearbox | КПП | коробка передач
special_torque_converter | Гидротрансформатор | гидротрансформаторы
special_reducer | Редуктор | редукторы
special_travel_reducer | Редуктор хода | бортовой редуктор
special_swing_reducer | Редуктор поворота | редуктор поворота платформы
special_axle | Мост | мосты; ось
special_differential | Дифференциал | дифференциалы

# hydraulics | Гидравлика | гидросистема
hydraulic_pump | Гидронасос | гидравлический насос; насос гидравлический
hydraulic_motor | Гидромотор | гидравлический мотор
hydraulic_cylinder | Гидроцилиндр | гидравлический цилиндр
hydraulic_distributor | Гидрораспределитель | распределитель; гидрораспределители
hydraulic_valves | Гидроклапаны | гидроклапан
hydraulic_hoses | Гидрошланги | рукав высокого давления; рвд; шланг гидравлический
hydraulic_pipes | Гидротрубки
hydraulic_accumulator | Гидроаккумуляторы | гидроаккумулятор
hydraulic_repair_kit | Ремкомплект гидравлики | ремкомплект гидроцилиндра; ремкомплект гидронасоса

# undercarriage | Ходовая
special_track_shoes | Башмаки | башмак
track_roller | Каток | катки; опорный каток; поддерживающий каток
special_sprocket | Звёздочка | звёздочки; ведущая звёздочка; ленивец
special_track_tensioner | Натяжитель | натяжитель гусеницы; натяжители
special_chains | Цепи | цепь; цепь гусеницы
special_wheels | Колёса | колесо
special_bushings | Втулки | втулка
special_pins | Пальцы | палец

# work_equipment | Износные детали рабочего оборудования
bucket_teeth | Зубья ковша | зубья; зуб ковша; коронки ковша; коронки ковшей; коронка
bucket_adapters | Адаптеры | адаптер
blades | Ножи | нож; режущая кромка

# electrics | Электрика
special_electrics | Электрика | проводка; реле; предохранители
# sensors | Датчики
special_sensors | Датчики | датчик
# ecu | Блоки управления
special_ecu | Блоки управления | блок управления; контроллер

# cab | Кабина
special_cab | Кабина | кабина в сборе; дверь кабины
# glass | Стёкла
special_glass | Стёкла | стекло
# seats | Сиденья
special_seats | Сиденья | сиденье; кресло оператора
# ac | Кондиционер
special_ac | Кондиционер | компрессор кондиционера
# heating | Отопление
special_heating | Отопление | печка; радиатор печки

# fasteners | Крепёж
special_fasteners | Крепёж
# seals | Уплотнения
special_seals | Уплотнения | сальники; манжеты; уплотнительные кольца
# repair_kits | Ремкомплекты
special_repair_kits | Ремкомплекты | ремкомплект
# other | Прочее
special_other | Прочее | другое
`);

/** Запчасти для водной техники: лодки, лодочные моторы, катера, гидроциклы, яхты. */
export const WATER_PARTS = parseTaxonomy(`
# engines | Детали двигателя | детали мотора; запчасти мотора
water_engine_parts | Детали двигателя | поршни; цилиндры; ремкомплект
# gearboxes | Редукторы
water_gearbox | Редуктор | нога; лодочный редуктор
# fuel | Топливная система
water_fuel_system | Топливная система | топливный насос; бак; шланг
# cooling | Охлаждение
water_cooling | Охлаждение | помпа; импеллер
# starter | Стартер
water_starter | Стартер
# generator | Генератор
water_generator | Генератор
# electrics | Электрика
water_electrics | Электрика | проводка; реле; катушка
# steering | Рулевое управление
water_steering | Рулевое управление | штурвал; тросы; румпель
# transmission | Трансмиссия
water_transmission | Трансмиссия | трансмиссия
# pumps | Насосы
water_pumps | Насосы | трюмный насос
# hull | Корпусные детали
water_hull | Корпусные детали | транец; киль; палуба
# fasteners | Крепёж
water_fasteners | Крепёж
# other | Прочее
water_other | Прочее | другое
`);
