import { parseTaxonomy } from './taxonomy.js';

/** Запчасти для телефонов. «Телефон на запчасти» — не деталь, а состояние (см. partCondition). */
export const PHONE_PARTS = parseTaxonomy(`
# screen | Экран | дисплей; экраны
phone_display | Дисплей | дисплей; дисплеи; экран
phone_display_module | Дисплейный модуль | дисплей в сборе; модуль дисплея; дисплей с тачскрином
phone_touchscreen | Тачскрин | тач; сенсор; сенсорное стекло
phone_glass | Стекло | защитное стекло дисплея; стекло экрана
phone_backlight | Подсветка | подсветка дисплея

# power | Питание
phone_battery | Аккумулятор | батарея; акб; аккум
phone_wireless_charging | Модуль беспроводной зарядки | катушка беспроводной зарядки

# case | Корпус
phone_housing | Корпус | корпус телефона
phone_frame | Рамка | средняя рамка
phone_back_cover | Задняя крышка | крышка; задняя панель; задняя стенка
phone_fasteners | Крепёж | винты
phone_protective | Защитные элементы | защита; защитные элементы
phone_stylus | Стилусы | стилус

# camera | Камеры
phone_camera | Камера | камеры; основная камера; камера телефона
phone_front_camera | Фронтальная камера | селфи камера; передняя камера
phone_flash | Вспышка

# audio | Звук
phone_speaker | Динамик | динамики; разговорный динамик; слуховой динамик
phone_buzzer | Полифонический динамик | звонок; бузер
phone_microphone | Микрофон | микрофоны
phone_vibro | Вибромотор | вибромоторы; вибро; вибрация

# controls | Управление
phone_buttons | Кнопки | кнопка; кнопка включения; кнопка громкости
phone_joystick | Джойстики | джойстик

# connectors | Шлейфы и разъёмы | разъёмы
phone_cable | Шлейф | шлейфы; шлейф телефона
phone_connector | Разъём | разъёмы; разъем
phone_usb | USB | разъем usb
phone_usb_c | USB-C | type c; type-c; разъем type c; тайп си
phone_lightning | Lightning | лайтнинг; разъем lightning
phone_audio_jack | Аудиоразъём | разъем наушников; джек
phone_antenna | Антенны | антенна
phone_sim | SIM-модули | сим; сим лоток; sim; лоток сим
phone_nfc | NFC | нфс; нфц

# boards | Платы
phone_motherboard | Материнская плата | материнка; мать; системная плата
phone_board | Платы | плата
phone_chips | Микросхемы | микросхема; чип; контроллер питания
phone_controllers | Контроллеры | контроллер
phone_sensors | Датчики | датчик
phone_biometrics | Биометрические модули | сканер отпечатка; отпечаток
phone_face_id | Face ID | фейс айди; face id; аналог face id

# other | Прочее
phone_other | Прочее | другое
`);

/** Запчасти для ноутбуков (ремонтные). Комплектующие для ПК — отдельный тип. */
export const LAPTOP_PARTS = parseTaxonomy(`
# display | Экран | дисплей
laptop_matrix | Матрица | экран ноутбука; дисплей ноутбука
laptop_display_cable | Шлейф матрицы | шлейф экрана
laptop_hinges | Петли | петли ноутбука; петля
laptop_lid | Крышка матрицы | крышка; крышка экрана
laptop_bezel | Рамка матрицы | рамка

# case | Корпус
laptop_case | Корпус | корпус ноутбука; нижняя часть
laptop_palmrest | Топкейс | топкейс; палмрест

# input | Ввод
laptop_keyboard | Клавиатура | клавиатуры
laptop_touchpad | Тачпад | тачпады; touchpad

# power | Питание
laptop_battery | Аккумулятор | батарея; акб; батарея ноутбука
laptop_charge_port | Зарядный разъём | разъём питания; гнездо зарядки

# boards | Платы и чипы
laptop_motherboard | Материнская плата | материнка; мать; системная плата
laptop_cpu | Процессор | цпу; камень
laptop_ram | Оперативная память | оперативка; озу; планка памяти
laptop_ssd | SSD | ссд; твердотельный накопитель
laptop_hdd | HDD | хдд; жёсткий диск; жесткий диск

# cooling | Охлаждение
laptop_fan | Вентилятор | кулер; куллер
laptop_heatsink | Радиатор | радиатор охлаждения
laptop_cooling_system | Система охлаждения | сво; охлаждение

# multimedia | Мультимедиа
laptop_speakers | Динамики | колонки; динамик
laptop_camera | Камера | веб-камера; вебкамера
laptop_microphone | Микрофон
laptop_wifi | Wi-Fi модуль | вайфай модуль; wifi модуль; wifi карта
laptop_bluetooth | Bluetooth модуль | блютуз модуль

# other | Прочее
laptop_other | Прочее | другое
`);

/** Компьютерные комплектующие. Совпадают с прежним списком «Тип» у комплектующих. */
export const COMPUTER_PARTS = parseTaxonomy(`
# cpu | Процессоры | процессор; цпу; проц
computer_cpu | Процессор | процессор; проц

# motherboard | Материнские платы | материнская плата; материнка
computer_motherboard | Материнская плата | материнка; мать; мамка

# gpu | Видеокарты | видеокарта; видюха
computer_gpu | Видеокарта | видяха; gpu; графическая карта

# ram | Оперативная память | оперативка; озу
computer_ram | Оперативная память | планка памяти; ddr4; ddr5; оперативка

# storage | Накопители | ssd; hdd
computer_ssd | SSD | ссд; твердотельный накопитель
computer_hdd | HDD | хдд; жёсткий диск; жесткий диск; винчестер

# psu | Блоки питания | блок питания; бп
computer_psu | Блок питания | бп; питание пк

# case | Корпуса | корпус
computer_case | Корпус | корпус пк; системный блок корпус

# cooling | Охлаждение | системы охлаждения
computer_cooler | Кулер | процессорный кулер; куллер
computer_heatsink | Радиатор | радиаторы
computer_case_fan | Вентилятор | вентиляторы; корпусной вентилятор
computer_liquid_cooling | СЖО | жидкостное охлаждение; водянка
computer_thermal_paste | Термопаста | термопрокладки

# cards | Платы расширения
computer_sound_card | Звуковая карта
computer_network_card | Сетевая карта
computer_wifi | Wi-Fi адаптер | вайфай адаптер
computer_bluetooth | Bluetooth адаптер | блютуз адаптер
computer_controller | Контроллеры | контроллер

# cables | Кабели и разъёмы
computer_cables | Кабели | кабель; шлейф
computer_connectors | Разъёмы | разъём

# other | Прочее
computer_other | Прочее | другое
`);

/** Запчасти для телевизоров. */
export const TV_PARTS = parseTaxonomy(`
# screen | Экран и подсветка | экран
tv_matrix | Матрица | экран; дисплей; панель телевизора
tv_screen | Экран в сборе | телевизионный экран
tv_backlight | LED-подсветка | подсветка; подсветка телевизора; led подсветка
tv_led_strips | LED-линейки | линейки подсветки; светодиодные линейки
tv_led_bars | LED-планки | планки подсветки

# boards | Платы
tv_mainboard | Материнская плата | main board; мейн борд; mainboard; материнка; плата телевизора
tv_tcon | T-Con | тикон; т-кон; tcon; плата tcon
tv_psu | Блок питания | бп; питание телевизора
tv_inverter | Инвертор | инверторы

# modules | Модули
tv_wifi | Wi-Fi модуль | вайфай модуль; wifi модуль
tv_bluetooth | Bluetooth модуль | блютуз модуль

# controls | Управление
tv_speakers | Динамики | колонки; динамик
tv_ir_receiver | ИК-приёмник | ик приемник; инфракрасный приемник
tv_button_panel | Кнопочные панели | кнопки; кнопочная панель

# connectors | Разъёмы и кабели
tv_connectors | Разъёмы | hdmi; разъем hdmi
tv_cables | Шлейфы | шлейф; шлейф матрицы
tv_wires | Кабели | кабель

# body | Корпус
tv_body | Корпусные детали | корпус; задняя крышка
tv_mounts | Ножки и подставки | ножки; ножки телевизора

# other | Прочее
tv_other | Прочее | другое
`);

/**
 * Детали планшета: дисплеи и тачскрины, аккумуляторы, камеры, разъёмы
 * зарядки, динамики и микрофоны, кнопки и шлейфы, платы, рамки, задние
 * крышки — устроены как у телефона, поэтому список общий, а справочники
 * групп и деталей у планшетов свои (part_group_tablet, part_item_tablet).
 */
export const TABLET_PARTS = PHONE_PARTS;
