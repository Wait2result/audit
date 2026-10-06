import type { CategoryAttributeBinding } from '../listing-attributes.js';
import type { PartsEquipmentTypeCode } from '../parts/equipment-types.js';

/**
 * Направления внутри основного типа техники, кроме самой техники и запчастей:
 * «Автомобили → Автоаксессуары», «Телефоны → Чехлы», «Мотоциклы → Экипировка».
 *
 * Каждое направление — подкатегория дерева объявлений под узлом основного
 * типа (docs/ADR/0013-основные-типы.md). Внутри — «тип товара» (коврики,
 * магнитола, шлем): это поле объявления со своим справочником и синонимами,
 * а не ещё один уровень дерева — дерево не уходит вглубь до «Коврики TPE 3D».
 *
 * Типы товара записываются компактно, как таксономия запчастей:
 *
 *   код | Название | синоним; синоним
 *
 * Название — тоже синоним. Синоним уникален внутри основного типа: «чехол»
 * у телефонов и «чехлы на сиденья» у машин различаются техникой во фразе.
 */

export interface GoodsTypeSeed {
  code: string;
  label: string;
  aliases: readonly string[];
}

/** Что уточняет строка «Подходит к» у направления, кроме марки и модели. */
export interface DirectionCompat {
  year?: boolean;
  chassis?: boolean;
  engine?: boolean;
  modification?: boolean;
}

export interface GoodsDirection {
  slug: string;
  /** Короткое имя внутри основного типа: «Аксессуары», «Чехлы» */
  name: string;
  itemLabel: string;
  /** Основной тип: чьи справочники марок и моделей у «Подходит к» */
  equipment: PartsEquipmentTypeCode;
  /**
   * Поле «тип товара»: своё (`goodsType` со справочником `goods_type_<key>`)
   * или уже существующее поле подкатегории (`tireType` у шин, `accessoryType`
   * у аксессуаров телефонов). Пусто — у направления «Другое».
   */
  typeKey?: 'goodsType' | 'tireType' | 'accessoryType';
  /** Ключ справочника типов: goods_type_<key> (до 40 знаков в базе) */
  key: string;
  types: readonly GoodsTypeSeed[];
  /** «Подходит к»: у коврика есть машина, у автохимии и автокресла — нет */
  compat?: DirectionCompat;
  /** Поля после типа товара */
  attributes?: readonly (string | CategoryAttributeBinding)[];
  /** Можно ли сдавать в аренду (прицепы, навесное оборудование) */
  rental?: boolean;
  /** Слова, которыми называют само направление («автохимия», «экипировка») */
  words?: readonly string[];
}

const split = (value: string | undefined): string[] =>
  (value ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);

/** Разбор списка типов товара (формат — в шапке файла). */
export function parseGoodsTypes(text: string): GoodsTypeSeed[] {
  const result: GoodsTypeSeed[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const [code, label, aliases] = line.split('|').map((part) => part.trim());
    if (!code || !label) throw new Error(`Строка типов товара без кода или названия: «${line}»`);
    result.push({ code, label, aliases: split(aliases) });
  }
  return result;
}

const types = parseGoodsTypes;

const CAR_COMPAT: DirectionCompat = { year: true, chassis: true, modification: true };
const MOTO_COMPAT: DirectionCompat = { year: true };
const MODEL_ONLY: DirectionCompat = {};

/** Колёса: тип — существующее поле «Что продаётся» (tireType). */
const TIRE_TYPES = types(`
tires | Шины | шины; шину; резина; резину; резины; покрышки; покрышка; скаты
rims | Диски | диски; литье; литые диски; штамповка; кованые диски
wheels | Колёса в сборе | колеса; колёса; колеса в сборе; комплект колес
hubcaps | Колпаки | колпаки; колпак
wheel_accessories | Аксессуары для колёс | секретки; колесные болты; колёсные гайки; датчики давления в шинах; проставки
`);

export const GOODS_DIRECTIONS: readonly GoodsDirection[] = [
  // ══ Автомобили ══════════════════════════════════════════════════════════
  {
    slug: 'transport-tires',
    name: 'Шины и диски',
    itemLabel: 'Шины',
    equipment: 'passenger_car',
    typeKey: 'tireType',
    key: 'car_tires',
    types: TIRE_TYPES,
    compat: { year: true },
    words: ['шины и диски', 'резина и диски'],
  },
  {
    slug: 'transport-accessories',
    name: 'Автоаксессуары',
    itemLabel: 'Аксессуар',
    equipment: 'passenger_car',
    typeKey: 'goodsType',
    key: 'car_accessories',
    compat: CAR_COMPAT,
    words: ['автоаксессуары', 'аксессуары для авто', 'аксессуары для машины'],
    attributes: ['brandName', 'condition'],
    types: types(`
interior | Аксессуары для салона | аксессуары в салон; аксессуары для салона
exterior | Внешние аксессуары | дефлекторы; ветровики; брызговики; молдинги; накладки на кузов
floor_mats | Коврики | коврики; коврик; автоковрики; ковры в машину; коврики в салон; коврики в багажник
seat_covers | Чехлы и накидки | чехлы на сиденья; авточехлы; накидки на сиденья; чехлы в машину
steering_covers | Оплётки руля | оплетка; оплётка; оплетка на руль; оплётка руля
organizers | Органайзеры | органайзер; органайзер в багажник; сумка в багажник
phone_chargers | Зарядки для телефона | автомобильная зарядка; зарядка в прикуриватель; зарядка в машину
phone_holders | Держатели телефонов | держатель телефона; держатель для телефона; автодержатель
jump_cables | Провода прикуривания | провода для прикуривания; провода прикуривания; крокодилы
emergency | Знаки и аварийные принадлежности | знак аварийной остановки; аварийный знак; огнетушитель; аптечка; жилет светоотражающий
motorist_kits | Наборы автомобилиста | набор автомобилиста; набор автолюбителя
cargo | Багажные аксессуары | сетка в багажник; стяжки; ремни для груза
fresheners | Ароматизаторы | ароматизатор; вонючка; освежитель в машину
sunshades | Шторки и солнцезащита | шторки на окна; солнцезащитные шторки; экран на лобовое
`),
  },
  {
    slug: 'transport-car-seats',
    name: 'Детские автокресла',
    itemLabel: 'Автокресло',
    equipment: 'passenger_car',
    typeKey: 'goodsType',
    key: 'car_seats',
    words: ['детские автокресла', 'автокресла'],
    types: types(`
car_seat | Автокресло | автокресло; автокресла; детское автокресло; детское кресло; детское кресло в машину; кресло для ребенка; кресло для ребёнка в машину
booster | Бустер | бустер; бустеры; бустер в машину
carrier | Люлька | автолюлька; люлька в машину; люлька-переноска; переноска для новорожденных
seat_base | База для автокресла | база isofix; база изофикс; база для автокресла
seat_accessories | Аксессуары для автокресел | чехол на автокресло; вкладыш для автокресла; зеркало для наблюдения за ребенком
restraint | Дополнительные удерживающие устройства | фэст; фест; адаптер ремня; треугольник для ремня
`),
    attributes: [
      'childAge',
      'childWeight',
      'seatGroup',
      'childHeight',
      'isofix',
      'seatInstallation',
      'brandName',
      'condition',
    ],
  },
  {
    slug: 'transport-car-electronics',
    name: 'Автоэлектроника и мультимедиа',
    itemLabel: 'Автоэлектроника',
    equipment: 'passenger_car',
    typeKey: 'goodsType',
    key: 'car_electronics',
    compat: { year: true, modification: true },
    words: ['автоэлектроника', 'автомультимедиа'],
    types: types(`
head_unit | Магнитолы | магнитола; магнитолу; магнитолы; автомагнитола; андроид магнитола; головное устройство; штатная магнитола
multimedia | Мультимедиа | мультимедийная система; мультимедиа; карплей; carplay; android auto
rear_camera | Камеры заднего вида | камера заднего вида; камера заднего хода; парковочная камера
dashcam | Видеорегистраторы | видеорегистратор; регистратор; видеорегистраторы
navigator | GPS-навигация | навигатор; gps навигатор; автонавигатор
parking_sensors | Парктроники | парктроник; парктроники; датчики парковки
monitor | Мониторы | автомонитор; монитор в машину; монитор на подголовник
speakers | Динамики | динамики; колонки в машину; автоакустика; автоколонки
amplifier | Усилители | усилитель; автоусилитель; усилок
subwoofer | Сабвуферы | сабвуфер; саб; сабик; короб с сабвуфером
alarm | Автосигнализации | сигнализация; автосигнализация; старлайн; starline; пандора; pandora
immobilizer | Иммобилайзеры | иммобилайзер; обходчик иммобилайзера
central_lock | Центральные замки | центральный замок; центральный замок на авто
radar | Радар-детекторы | антирадар; радар детектор; радар-детектор
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-car-chemicals',
    name: 'Автохимия и уход',
    itemLabel: 'Автохимия',
    equipment: 'passenger_car',
    typeKey: 'goodsType',
    key: 'car_chemicals',
    words: ['автохимия', 'автокосметика'],
    types: types(`
oils | Масла | масло; масла; моторное масло; трансмиссионное масло; масло в двигатель; масло в коробку
antifreeze | Антифриз | антифриз; тосол; охлаждающая жидкость
brake_fluid | Тормозные жидкости | тормозная жидкость; тормозуха
cleaners | Очистители | очиститель; очиститель двигателя; очиститель дросселя; очиститель тормозов
shampoo | Автошампуни | автошампунь; шампунь для авто; шампунь для машины
polish | Полироли | полироль; полировка; полировальная паста
wax | Воски | воск; жидкий воск; твердый воск
sealants | Герметики | герметик; герметик прокладок; фиксатор резьбы
additives | Присадки | присадка; присадки; присадка в масло; присадка в топливо
interior_cleaners | Очистители салона | химчистка салона; очиститель салона; очиститель кожи; полироль пластика
glass_cleaners | Очистители стёкол | омывайка; омыватель; незамерзайка; антидождь; очиститель стекол
`),
    attributes: ['volumeLiters', 'brandName', 'condition'],
  },
  {
    slug: 'transport-batteries',
    name: 'Аккумуляторы',
    itemLabel: 'Аккумулятор',
    equipment: 'passenger_car',
    typeKey: 'goodsType',
    key: 'batteries',
    words: ['аккумуляторы', 'акб'],
    types: types(`
car | Автомобильные | аккумулятор; аккумуляторы; акб; аккум; автомобильный аккумулятор; аккумулятор на машину; аккумулятор для авто
moto | Мотоциклетные | мотоаккумулятор; аккумулятор на мотоцикл; аккумулятор для мото; аккумулятор на скутер
truck | Грузовые | грузовой аккумулятор; аккумулятор на грузовик; аккумулятор 190; аккумулятор на камаз
special | Для спецтехники | аккумулятор на трактор; аккумулятор на спецтехнику
other | Другие | тяговый аккумулятор; аккумулятор для лодки
`),
    attributes: [
      'batteryVoltage',
      'batteryCapacity',
      'batteryCurrent',
      'batteryPolarity',
      'batteryChemistry',
      'batterySize',
      'brandName',
      'condition',
    ],
  },
  {
    slug: 'transport-racks',
    name: 'Багажники, фаркопы и крепления',
    itemLabel: 'Багажник',
    equipment: 'passenger_car',
    typeKey: 'goodsType',
    key: 'car_racks',
    compat: CAR_COMPAT,
    words: ['багажники и фаркопы'],
    types: types(`
roof_rack | Багажники на крышу | багажник на крышу; багажник; поперечины; рейлинги
roof_box | Боксы | автобокс; бокс на крышу; бокс багажник
towbar | Фаркопы | фаркоп; фаркопы; тсу; тягово-сцепное устройство
bike_mount | Крепления для велосипедов | крепление для велосипеда; велобагажник
ski_mount | Крепления для лыж | крепление для лыж
snowboard_mount | Крепления для сноубордов | крепление для сноуборда
hitch | Прицепные устройства | прицепное устройство; шар фаркопа; электрика фаркопа; розетка фаркопа
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-car-tools',
    name: 'Инструменты и оборудование',
    itemLabel: 'Инструмент',
    equipment: 'passenger_car',
    typeKey: 'goodsType',
    key: 'car_tools',
    words: ['автоинструмент', 'гаражное оборудование'],
    types: types(`
jack | Домкраты | домкрат; домкраты; подкатной домкрат; бутылочный домкрат
compressor | Компрессоры | автокомпрессор; компрессор для шин; насос для шин; компрессор для колес
jump_starter | Пусковые устройства | пусковое устройство; бустер для запуска; пускач; джамп стартер
battery_charger | Зарядные устройства для АКБ | зарядка для аккумулятора; зарядное устройство для акб; зарядка акб
diagnostics | Диагностическое оборудование | диагностический сканер; elm327; елм327; автосканер; сканер ошибок
tool_kit | Наборы инструментов | набор инструментов; набор головок; набор ключей
garage | Гаражное оборудование | подъемник; подъёмник; шиномонтажный станок; балансировочный станок; гаражное оборудование
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-tuning',
    name: 'Тюнинг и дополнительное оборудование',
    itemLabel: 'Тюнинг',
    equipment: 'passenger_car',
    typeKey: 'goodsType',
    key: 'car_tuning',
    compat: CAR_COMPAT,
    words: ['тюнинг', 'автотюнинг'],
    types: types(`
body_kit | Обвесы | обвес; обвесы; аэродинамический обвес
spoiler | Спойлеры | спойлер; спойлеры; антикрыло
side_skirts | Пороги | тюнинг пороги; пороги-подножки; подножки; силовые пороги
tuning_bumpers | Бамперы | силовой бампер; тюнинг бампер; кенгурятник
grilles | Решётки | тюнинг решетка; решетка радиатора тюнинг; защитная сетка радиатора
extra_lights | Дополнительный свет | доп свет; дополнительные фары; люстра на крышу; led балка; светодиодная балка
tuning_exhaust | Выхлоп | прямоток; спортивный выхлоп; тюнинг выхлоп; насадка на глушитель
tuning_suspension | Подвеска | койловеры; койловер; проставки для лифта; лифт комплект; занижение
brake_kits | Тормозные комплекты | тормозной тюнинг; тюнинг тормоза; спортивные тормоза
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-car-other',
    name: 'Другое',
    itemLabel: 'Товар для авто',
    equipment: 'passenger_car',
    key: 'car_other',
    types: [],
    compat: CAR_COMPAT,
    attributes: ['brandName', 'condition'],
  },

  // ══ Мотоциклы ═══════════════════════════════════════════════════════════
  {
    slug: 'transport-moto-tires',
    name: 'Шины и диски',
    itemLabel: 'Шины',
    equipment: 'moto',
    typeKey: 'tireType',
    key: 'moto_tires',
    types: types(`
tires | Шины | мотошины; мотошина; мотопокрышки; резина на мотоцикл
rims | Диски | мотодиски; диски на мотоцикл
wheels | Колёса в сборе | мотоколеса; колесо на мотоцикл
`),
    compat: MOTO_COMPAT,
  },
  {
    slug: 'transport-moto-accessories',
    name: 'Аксессуары',
    itemLabel: 'Аксессуар',
    equipment: 'moto',
    typeKey: 'goodsType',
    key: 'moto_accessories',
    compat: MOTO_COMPAT,
    words: ['мотоаксессуары'],
    types: types(`
cases | Кофры и сумки | кофр; кофры; мотокофр; мотосумка; бардачная сумка
moto_covers | Чехлы для мотоцикла | мотобрезент; чехол для мотоцикла; тент для мотоцикла
locks | Замки и противоугонные | мотозамок; замок на диск; противоугонный трос
moto_holders | Держатели телефона | держатель телефона на руль; мотодержатель
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-moto-gear',
    name: 'Экипировка',
    itemLabel: 'Экипировка',
    equipment: 'moto',
    typeKey: 'goodsType',
    key: 'moto_gear',
    words: ['мотоэкипировка', 'экипировка', 'экипировку'],
    types: types(`
helmet | Шлемы | шлем; шлемы; мотошлем; мотошлемы; шлем для мотоцикла; интеграл
jacket | Куртки | мотокуртка; мотокуртки; куртка для мотоцикла
pants | Штаны | мотоштаны; мотобрюки
gloves | Перчатки | мотоперчатки
boots | Ботинки | мотоботы; мотоботинки
protection | Защита | черепаха; мотозащита; наколенники для мотоцикла; моточерепаха
rainwear | Дождевики | мотодождевик; дождевик для мотоцикла
`),
    attributes: ['size', 'brandName', 'condition'],
  },
  {
    slug: 'transport-moto-electronics',
    name: 'Электроника',
    itemLabel: 'Мотоэлектроника',
    equipment: 'moto',
    typeKey: 'goodsType',
    key: 'moto_electronics',
    words: ['мотоэлектроника'],
    types: types(`
intercom | Мотогарнитуры | мотогарнитура; интерком; гарнитура для шлема
moto_navigator | Навигаторы | навигатор для мотоцикла; мотонавигатор
moto_alarm | Мотосигнализации | мотосигнализация; сигнализация на мотоцикл
moto_charger | Зарядки и USB | usb на мотоцикл; зарядка на мотоцикл
moto_cameras | Экшн-камеры и регистраторы | мотовидеорегистратор; экшн камера на шлем
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-moto-tuning',
    name: 'Тюнинг',
    itemLabel: 'Тюнинг',
    equipment: 'moto',
    typeKey: 'goodsType',
    key: 'moto_tuning',
    compat: MOTO_COMPAT,
    words: ['мототюнинг'],
    types: types(`
moto_exhaust | Выхлоп | прямоток на мотоцикл; спортивный глушитель на мотоцикл; акрапович; akrapovic
moto_lights | Свет | доп фары на мотоцикл; led на мотоцикл
moto_body_kit | Пластик и обвес | тюнинг пластик; обтекатель тюнинг
moto_controls | Управление | тюнинг рычаги; подножки тюнинг
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-moto-other',
    name: 'Другое',
    itemLabel: 'Товар для мото',
    equipment: 'moto',
    key: 'moto_other',
    types: [],
    compat: MOTO_COMPAT,
    attributes: ['brandName', 'condition'],
  },

  // ══ Грузовики ═══════════════════════════════════════════════════════════
  {
    slug: 'transport-truck-tires',
    name: 'Шины и диски',
    itemLabel: 'Шины',
    equipment: 'truck',
    typeKey: 'tireType',
    key: 'truck_tires',
    types: types(`
tires | Шины | грузовые шины; грузовая резина; шины на грузовик; шины на камаз
rims | Диски | грузовые диски; диски на грузовик
wheels | Колёса в сборе | колесо на грузовик; грузовое колесо
`),
    compat: { year: true },
  },
  {
    slug: 'transport-truck-accessories',
    name: 'Аксессуары',
    itemLabel: 'Аксессуар',
    equipment: 'truck',
    typeKey: 'goodsType',
    key: 'truck_accessories',
    compat: { year: true },
    types: types(`
truck_interior | Для кабины | коврики в кабину; шторки в кабину; чехлы на сиденья грузовика
truck_exterior | Внешние аксессуары | брызговики на грузовик; дефлектор кабины; козырек на кабину
truck_lights | Свет и сигналы | люстра на кабину; маячок; проблесковый маячок
truck_cargo | Для груза | стяжные ремни; ремни крепления груза; тент на кузов
truck_electronics | Электроника | тахограф; навигатор для грузовика; рация
truck_tools | Инструменты | домкрат для грузовика; набор инструментов для грузовика
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-truck-attachments',
    name: 'Навесное оборудование',
    itemLabel: 'Оборудование',
    equipment: 'truck',
    typeKey: 'goodsType',
    key: 'truck_attachments',
    compat: { year: true },
    rental: true,
    words: ['навесное на грузовик'],
    types: types(`
crane | Крано-манипуляторные установки | кму; манипулятор; кран манипулятор; кран-манипулятор
tail_lift | Гидроборты | гидроборт; гидроборта
snow_plow | Снегоотвалы | снегоотвал; отвал на грузовик
tipper_body | Кузова и самосвальные установки | самосвальный кузов; кузов самосвала; самосвальная установка
hydraulic_kit | Гидрофикация | гидрофикация; коробка отбора мощности; ком
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-trailers',
    name: 'Прицепы и полуприцепы',
    itemLabel: 'Прицеп',
    equipment: 'truck',
    typeKey: 'goodsType',
    key: 'trailers',
    rental: true,
    words: ['прицепы', 'полуприцепы'],
    types: types(`
car_trailer | Легковой прицеп | прицеп; прицеп для легковой; легковой прицеп; прицеп к машине
semi | Полуприцеп | полуприцеп; полуприцепы; полуприцеп шторный; тентованный полуприцеп
tipper | Самосвальный | самосвальный полуприцеп; полуприцеп самосвал
platform | Платформа и трал | трал; тралл; низкорамник
tanker | Цистерна | цистерна; полуприцеп цистерна
reefer | Рефрижератор | рефрижератор; реф
special_trailer | Специальный | прицеп для лодки; прицеп для техники; автодом прицеп
`),
    attributes: ['year', 'loadCapacity', 'axles', 'brandName', 'condition'],
  },
  {
    slug: 'transport-truck-other',
    name: 'Другое',
    itemLabel: 'Товар для грузовика',
    equipment: 'truck',
    key: 'truck_other',
    types: [],
    compat: { year: true },
    attributes: ['brandName', 'condition'],
  },

  // ══ Спецтехника ═════════════════════════════════════════════════════════
  {
    slug: 'transport-special-attachments',
    name: 'Навесное оборудование',
    itemLabel: 'Оборудование',
    equipment: 'special_equipment',
    typeKey: 'goodsType',
    key: 'special_attachments',
    compat: MODEL_ONLY,
    rental: true,
    words: ['навесное оборудование', 'навесное'],
    types: types(`
bucket | Ковши | ковш; ковши; ковш на экскаватор; планировочный ковш; скальный ковш
hammer | Гидромолоты | гидромолот; гидромолоты; гидробур
forks | Вилы | вилы на погрузчик; вилочный захват
blade | Отвалы | отвал; отвал на трактор; бульдозерный отвал
grapple | Грейферы и захваты | грейфер; захват; ножницы гидравлические
auger | Буры | бур; ямобур; гидробур на экскаватор
ripper | Рыхлители | рыхлитель; рыхлители
quick_coupler | Быстросъёмы | квик каплер; быстросъем; быстросъём
brush | Щётки и косилки | щетка на трактор; коммунальная щетка; косилка навесная
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-special-work',
    name: 'Рабочее оборудование',
    itemLabel: 'Оборудование',
    equipment: 'special_equipment',
    typeKey: 'goodsType',
    key: 'special_work',
    compat: MODEL_ONLY,
    rental: true,
    words: ['рабочее оборудование'],
    types: types(`
boom | Стрелы | стрела экскаватора; стрела крана
arm | Рукояти | рукоять экскаватора
counterweight | Противовесы | противовес
cab_assembly | Кабины в сборе | кабина экскаватора; кабина трактора
winch | Лебёдки | лебедка; лебёдка; лебедка на спецтехнику
power_unit | Энергоустановки | генератор на спецтехнику; компрессорная станция; сварочный агрегат
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-special-tracks',
    name: 'Шины и гусеницы',
    itemLabel: 'Гусеницы',
    equipment: 'special_equipment',
    typeKey: 'goodsType',
    key: 'special_tracks',
    compat: MODEL_ONLY,
    words: ['шины и гусеницы'],
    types: types(`
rubber_tracks | Резиновые гусеницы | резиновая гусеница; резиновые гусеницы; гусеница резиновая
steel_tracks | Металлические гусеницы | гусеница; гусеницы; гусеничная лента
special_tires | Шины для спецтехники | шины на трактор; шины на погрузчик; шины на экскаватор; тракторные шины
special_rims | Диски для спецтехники | диски на трактор; диски на погрузчик
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-special-accessories',
    name: 'Аксессуары',
    itemLabel: 'Аксессуар',
    equipment: 'special_equipment',
    typeKey: 'goodsType',
    key: 'special_accessories',
    compat: MODEL_ONLY,
    types: types(`
cab_accessories | Для кабины | коврики в кабину трактора; чехлы на сиденье трактора
beacons | Маячки и свет | маячок на трактор; рабочие фары; фара рабочего света
cameras | Камеры и мониторы | камера на спецтехнику; монитор на экскаватор
safety | Безопасность | огнетушитель на спецтехнику; знаки на спецтехнику
lubrication | Смазка и обслуживание | шприц для солидола; солидолонагнетатель; централизованная смазка
special_electronics | Электрооборудование | gps трекер на технику; датчик уровня топлива
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-special-other',
    name: 'Другое',
    itemLabel: 'Товар для спецтехники',
    equipment: 'special_equipment',
    key: 'special_other',
    types: [],
    compat: MODEL_ONLY,
    attributes: ['brandName', 'condition'],
  },

  // ══ Водный транспорт ════════════════════════════════════════════════════
  {
    slug: 'transport-water-engines',
    name: 'Двигатели',
    itemLabel: 'Двигатель',
    equipment: 'water_transport',
    typeKey: 'goodsType',
    key: 'water_engines',
    words: ['лодочные двигатели', 'стационарные двигатели'],
    types: types(`
inboard | Стационарный двигатель | стационарный двигатель; стационар; стационарный мотор
sterndrive | Поворотно-откидная колонка | поворотно-откидная колонка; колонка вольво пента; sterndrive
jet | Водомётный двигатель | водомет; водомёт; водометная установка
`),
    attributes: ['power', 'year', 'brandName', 'condition'],
  },
  {
    slug: 'transport-water-outboards',
    name: 'Лодочные моторы',
    itemLabel: 'Лодочный мотор',
    equipment: 'water_transport',
    typeKey: 'goodsType',
    key: 'water_outboards',
    words: ['лодочные моторы'],
    types: types(`
outboard | Подвесной мотор | лодочный мотор; лодочные моторы; подвесной мотор; подвесной лодочный мотор; лодочник
electric_outboard | Электромотор | лодочный электромотор; электромотор для лодки; троллинговый мотор
jet_outboard | Водомётный мотор | водометный мотор; мотор с водометом
`),
    attributes: ['power', 'year', 'brandName', 'condition'],
  },
  {
    slug: 'transport-water-propellers',
    name: 'Винты',
    itemLabel: 'Винт',
    equipment: 'water_transport',
    typeKey: 'goodsType',
    key: 'water_propellers',
    compat: MODEL_ONLY,
    words: ['гребные винты'],
    types: types(`
propeller | Гребные винты | гребной винт; винт на лодочный мотор; винт для мотора; винт на мотор
impeller | Импеллеры водомёта | импеллер водомета
propeller_parts | Детали винтов | шлицевая втулка; гайка винта; шплинт винта
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-water-electronics',
    name: 'Электроника',
    itemLabel: 'Электроника',
    equipment: 'water_transport',
    typeKey: 'goodsType',
    key: 'water_electronics',
    words: ['электроника для лодки'],
    types: types(`
echo_sounder | Эхолоты | эхолот; эхолоты; картплоттер
marine_navigator | Навигация | навигатор для лодки; морской навигатор; компас для лодки
marine_radio | Рации | морская рация; рация для лодки
marine_lights | Свет | ходовые огни; огни для лодки
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-water-accessories',
    name: 'Аксессуары и экипировка',
    itemLabel: 'Аксессуар',
    equipment: 'water_transport',
    typeKey: 'goodsType',
    key: 'water_accessories',
    words: ['аксессуары для лодки'],
    types: types(`
life_jacket | Спасательные жилеты | спасательный жилет; спасжилет
wetsuit | Гидрокостюмы | гидрокостюм; гидрокостюмы
anchor | Якоря и швартовка | якорь; якоря; кранцы; швартовы
oars | Вёсла | весла; вёсла; весло
boat_covers | Тенты и чехлы | тент на лодку; чехол на лодку; транцевая доска
boat_trolley | Тележки и транспортировка | тележка для лодки; транцевые колеса
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'transport-water-other',
    name: 'Другое',
    itemLabel: 'Товар для лодки',
    equipment: 'water_transport',
    key: 'water_other',
    types: [],
    attributes: ['brandName', 'condition'],
  },

  // ══ Телефоны ════════════════════════════════════════════════════════════
  {
    slug: 'electronics-accessories',
    name: 'Аксессуары',
    itemLabel: 'Аксессуар',
    equipment: 'phone',
    typeKey: 'accessoryType',
    key: 'phone_accessories',
    compat: MODEL_ONLY,
    types: types(`
holder | Держатели и подставки | подставка для телефона; держатель; попсокет
memory_card | Карты памяти | карта памяти; флешка; microsd
other | Другое | селфи палка; кольцо для телефона
`),
  },
  {
    slug: 'electronics-phone-cases',
    name: 'Чехлы',
    itemLabel: 'Чехол',
    equipment: 'phone',
    typeKey: 'goodsType',
    key: 'phone_cases',
    compat: MODEL_ONLY,
    words: ['чехлы для телефона'],
    types: types(`
back_case | Чехол-накладка | чехол; чехлы; чехол на телефон; чехол на айфон; чехол-накладка; бампер на телефон
book_case | Чехол-книжка | чехол книжка; книжка на телефон
silicone_case | Силиконовый чехол | силиконовый чехол
leather_case | Кожаный чехол | кожаный чехол
armored_case | Противоударный чехол | противоударный чехол
magsafe_case | Чехол с MagSafe | чехол magsafe; магсейф чехол
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'electronics-phone-glass',
    name: 'Защитные стёкла',
    itemLabel: 'Защитное стекло',
    equipment: 'phone',
    typeKey: 'goodsType',
    key: 'phone_glass',
    compat: MODEL_ONLY,
    words: ['защитные стекла'],
    types: types(`
tempered_glass | Защитное стекло | защитное стекло; стекло на телефон; стекло на айфон; закаленное стекло
full_glass | Стекло на весь экран | полноэкранное стекло; стекло 9d; стекло 5d
privacy_glass | Стекло-антишпион | антишпион; стекло антишпион
film | Защитная плёнка | защитная пленка; гидрогелевая пленка; пленка на экран
camera_glass | Стекло на камеру | стекло на камеру; защита камеры
`),
    attributes: ['condition'],
  },
  {
    slug: 'electronics-phone-chargers',
    name: 'Зарядные устройства',
    itemLabel: 'Зарядка',
    equipment: 'phone',
    typeKey: 'goodsType',
    key: 'phone_chargers',
    compat: MODEL_ONLY,
    words: ['зарядки для телефона'],
    types: types(`
charger | Сетевые зарядки | зарядка; зарядное; зарядное устройство; блок зарядки; адаптер питания для телефона
cable | Кабели | кабель; провод для зарядки; кабель type c; кабель lightning
powerbank | Пауэрбанки | пауэрбанк; повербанк; внешний аккумулятор; powerbank
wireless | Беспроводные зарядки | беспроводная зарядка; magsafe зарядка
car_charger | Автомобильные зарядки | зарядка в прикуриватель для телефона
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'electronics-phone-other',
    name: 'Другое',
    itemLabel: 'Товар для телефона',
    equipment: 'phone',
    key: 'phone_other',
    types: [],
    compat: MODEL_ONLY,
    attributes: ['brandName', 'condition'],
  },

  // ══ Планшеты ════════════════════════════════════════════════════════════
  {
    slug: 'electronics-tablet-accessories',
    name: 'Аксессуары',
    itemLabel: 'Аксессуар',
    equipment: 'tablet',
    typeKey: 'goodsType',
    key: 'tablet_accessories',
    compat: MODEL_ONLY,
    words: ['аксессуары для планшета'],
    types: types(`
stand | Подставки и держатели | подставка для планшета; держатель для планшета
memory_card | Карты памяти | карта памяти для планшета
other | Другое | сумка для планшета; рюкзак для планшета
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'electronics-tablet-cases',
    name: 'Чехлы',
    itemLabel: 'Чехол',
    equipment: 'tablet',
    typeKey: 'goodsType',
    key: 'tablet_cases',
    compat: MODEL_ONLY,
    words: ['чехлы для планшета', 'чехол на планшет', 'чехол на айпад'],
    types: types(`
book_case | Чехол-книжка | чехол книжка на планшет; обложка для планшета; smart cover
back_case | Чехол-накладка | чехол; чехлы; накладка на планшет; бампер на планшет
keyboard_case | Чехол с клавиатурой | чехол с клавиатурой
kids_case | Детский чехол | детский чехол на планшет; противоударный чехол на планшет
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'electronics-tablet-glass',
    name: 'Защитные стёкла',
    itemLabel: 'Защитное стекло',
    equipment: 'tablet',
    typeKey: 'goodsType',
    key: 'tablet_glass',
    compat: MODEL_ONLY,
    words: ['стекло на планшет', 'стекло на айпад'],
    types: types(`
tempered_glass | Защитное стекло | защитное стекло на планшет
film | Защитная плёнка | пленка на планшет; paperlike; пленка для рисования
privacy_glass | Стекло-антишпион | антишпион на планшет; стекло антишпион для планшета
`),
    attributes: ['condition'],
  },
  {
    slug: 'electronics-tablet-chargers',
    name: 'Зарядки',
    itemLabel: 'Зарядка',
    equipment: 'tablet',
    typeKey: 'goodsType',
    key: 'tablet_chargers',
    compat: MODEL_ONLY,
    words: ['зарядка для планшета', 'зарядка для айпада'],
    types: types(`
charger | Сетевые зарядки | блок питания для планшета; зарядное для планшета
powerbank | Пауэрбанки | пауэрбанк для планшета
wireless | Беспроводные зарядки | беспроводная зарядка для планшета
dock | Док-станции | док станция для планшета; подставка с зарядкой для планшета
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'electronics-tablet-cables',
    name: 'Кабели',
    itemLabel: 'Кабель',
    equipment: 'tablet',
    typeKey: 'goodsType',
    key: 'tablet_cables',
    compat: MODEL_ONLY,
    words: ['кабель для планшета'],
    types: types(`
usb_c | Кабели USB-C | кабель usb c для планшета
lightning | Кабели Lightning | кабель lightning для айпада
adapter | Переходники | переходник для планшета; хаб для планшета; usb хаб для айпада
`),
    attributes: ['condition'],
  },
  {
    slug: 'electronics-tablet-input',
    name: 'Клавиатуры и стилусы',
    itemLabel: 'Клавиатура или стилус',
    equipment: 'tablet',
    typeKey: 'goodsType',
    key: 'tablet_input',
    compat: MODEL_ONLY,
    // «стилус» само по себе — и деталь телефона (S Pen): слово направления — с уточнением
    words: ['стилусы для планшета', 'клавиатура для планшета', 'клавиатуры и стилусы'],
    types: types(`
stylus | Стилусы | стилус для планшета; apple pencil; эпл пенсил; перо для планшета
keyboard | Клавиатуры | клавиатура для планшета; magic keyboard; клавиатура для айпада
mouse | Мыши и тачпады | мышь для планшета; мышка для айпада; тачпад для планшета
tips | Наконечники для стилуса | наконечник для стилуса; наконечники apple pencil
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'electronics-tablet-other',
    name: 'Другое',
    itemLabel: 'Товар для планшета',
    equipment: 'tablet',
    key: 'tablet_other',
    types: [],
    compat: MODEL_ONLY,
    attributes: ['brandName', 'condition'],
  },

  // ══ Ноутбуки ════════════════════════════════════════════════════════════
  {
    slug: 'electronics-laptop-accessories',
    name: 'Аксессуары',
    itemLabel: 'Аксессуар',
    equipment: 'laptop',
    typeKey: 'goodsType',
    key: 'laptop_accessories',
    compat: MODEL_ONLY,
    types: types(`
laptop_bag | Сумки и рюкзаки | сумка для ноутбука; рюкзак для ноутбука
laptop_sleeve | Чехлы | чехол для ноутбука; чехол для макбука; кейс для ноутбука
laptop_stand | Подставки | подставка для ноутбука; охлаждающая подставка
docking | Док-станции и хабы | док станция; док-станция; usb хаб; type c хаб; переходник для макбука
laptop_lock | Защита | замок кенсингтона; пленка на клавиатуру; накладка на клавиатуру
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'electronics-laptop-chargers',
    name: 'Зарядные устройства',
    itemLabel: 'Зарядка',
    equipment: 'laptop',
    typeKey: 'goodsType',
    key: 'laptop_chargers',
    compat: MODEL_ONLY,
    words: ['зарядки для ноутбука'],
    types: types(`
laptop_charger | Блоки питания | зарядка для ноутбука; зарядка ноутбука; блок питания для ноутбука; блок питания ноутбука; зарядник для ноутбука
usb_c_charger | Зарядки USB-C | зарядка type c для ноутбука; зарядка для макбука; usb c зарядка 65w
laptop_power_cable | Кабели питания | кабель питания для ноутбука; шнур для зарядки ноутбука
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'electronics-laptop-other',
    name: 'Другое',
    itemLabel: 'Товар для ноутбука',
    equipment: 'laptop',
    key: 'laptop_other',
    types: [],
    compat: MODEL_ONLY,
    attributes: ['brandName', 'condition'],
  },

  // ══ Компьютеры ══════════════════════════════════════════════════════════
  {
    slug: 'electronics-peripherals',
    name: 'Периферия',
    itemLabel: 'Периферия',
    equipment: 'computer',
    typeKey: 'goodsType',
    key: 'peripherals',
    words: ['периферия', 'оргтехника'],
    types: types(`
keyboard | Клавиатуры | клавиатура; клава; механическая клавиатура
mouse | Мыши | мышь; мышка; игровая мышь
printer | Принтеры и МФУ | принтер; мфу; лазерный принтер; струйный принтер
scanner | Сканеры | сканер документов
webcam | Веб-камеры | веб камера; вебкамера; веб-камера
pc_speakers | Колонки для компьютера | компьютерные колонки; колонки для компьютера
network | Сетевое оборудование | роутер; маршрутизатор; wi-fi роутер; свитч; коммутатор
ups | ИБП | ибп; бесперебойник; источник бесперебойного питания
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'electronics-monitors',
    name: 'Мониторы',
    itemLabel: 'Монитор',
    equipment: 'computer',
    typeKey: 'goodsType',
    key: 'monitors',
    words: ['мониторы'],
    types: types(`
office_monitor | Офисный монитор | монитор; мониторы; монитор для компьютера
gaming_monitor | Игровой монитор | игровой монитор; монитор 144 гц; монитор 165 гц
curved_monitor | Изогнутый монитор | изогнутый монитор
pro_monitor | Монитор для работы с графикой | монитор для дизайна; профессиональный монитор
`),
    attributes: ['screenSize', 'brandName', 'condition'],
  },
  {
    slug: 'electronics-computer-accessories',
    name: 'Аксессуары',
    itemLabel: 'Аксессуар',
    equipment: 'computer',
    typeKey: 'goodsType',
    key: 'pc_accessories',
    types: types(`
mouse_pad | Коврики для мыши | коврик для мыши; игровой коврик
pc_cables | Кабели и переходники | кабель hdmi; кабель displayport; переходник hdmi; удлинитель usb
headset | Гарнитуры | игровая гарнитура; наушники с микрофоном для компьютера
monitor_arm | Кронштейны для мониторов | кронштейн для монитора; держатель монитора
gaming_chair | Игровые кресла | игровое кресло; компьютерное кресло
flash_drive | Флешки и внешние диски | флешка usb; внешний жесткий диск; внешний ssd
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'electronics-computer-other',
    name: 'Другое',
    itemLabel: 'Товар для компьютера',
    equipment: 'computer',
    key: 'pc_other',
    types: [],
    attributes: ['brandName', 'condition'],
  },

  // ══ Телевизоры ══════════════════════════════════════════════════════════
  {
    slug: 'electronics-tv-remotes',
    name: 'Пульты',
    itemLabel: 'Пульт',
    equipment: 'tv',
    typeKey: 'goodsType',
    key: 'tv_remotes',
    compat: MODEL_ONLY,
    words: ['пульты'],
    types: types(`
original_remote | Оригинальный пульт | пульт; пульты; пульт от телевизора; пульт для телевизора; пульт ду; пульт от тв
universal_remote | Универсальный пульт | универсальный пульт
smart_remote | Пульт с голосовым управлением | голосовой пульт; пульт с микрофоном; аэромышь
`),
    attributes: ['condition'],
  },
  {
    slug: 'electronics-tv-mounts',
    name: 'Крепления',
    itemLabel: 'Кронштейн',
    equipment: 'tv',
    typeKey: 'goodsType',
    key: 'tv_mounts',
    words: ['крепления для телевизора'],
    types: types(`
wall_mount | Настенные кронштейны | кронштейн; кронштейн для телевизора; крепление для телевизора; настенное крепление
tilt_mount | Наклонные кронштейны | наклонный кронштейн
swivel_mount | Поворотные кронштейны | поворотный кронштейн
ceiling_mount | Потолочные кронштейны | потолочный кронштейн
tv_stand | Стойки | стойка для телевизора; напольная стойка для телевизора
`),
    attributes: ['condition'],
  },
  {
    slug: 'electronics-tv-accessories',
    name: 'Аксессуары',
    itemLabel: 'Аксессуар',
    equipment: 'tv',
    typeKey: 'goodsType',
    key: 'tv_accessories',
    types: types(`
tv_cables | Кабели | hdmi кабель; кабель для телевизора; оптический кабель
media_player | Медиаплееры и приставки | смарт приставка; тв приставка; андроид приставка; медиаплеер; mi box
antenna | Антенны и ресиверы | антенна; тв антенна; ресивер; приставка dvb-t2; цифровая приставка
tv_cam | Камеры для ТВ | камера для телевизора
glasses_3d | 3D-очки | 3d очки
tv_protection | Защитные экраны | защитный экран для телевизора
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'electronics-tv-other',
    name: 'Другое',
    itemLabel: 'Товар для телевизора',
    equipment: 'tv',
    key: 'tv_other',
    types: [],
    attributes: ['brandName', 'condition'],
  },

  // ══ Бытовая техника ═════════════════════════════════════════════════════
  {
    slug: 'home-appliance-accessories',
    name: 'Аксессуары',
    itemLabel: 'Аксессуар',
    equipment: 'home_appliance',
    typeKey: 'goodsType',
    key: 'appliance_accessories',
    compat: MODEL_ONLY,
    types: types(`
stands | Подставки и подиумы | подставка под стиральную машину; подиум для стиралки
hoses_ext | Шланги и удлинители | заливной шланг удлинитель; сливной шланг удлинитель
anti_vibration | Антивибрационные подставки | антивибрационные подставки; виброопоры
racks | Решётки и противни | противень; решетка для духовки; решетка для микроволновки
appliance_covers | Чехлы и накидки | чехол на стиральную машину; накидка на холодильник
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'home-appliance-consumables',
    name: 'Расходники',
    itemLabel: 'Расходник',
    equipment: 'home_appliance',
    typeKey: 'goodsType',
    key: 'appliance_consumables',
    compat: MODEL_ONLY,
    words: ['расходники для техники'],
    types: types(`
vacuum_bags | Мешки для пылесоса | мешки для пылесоса; мешок для пылесоса
vacuum_filters | Фильтры для пылесоса | фильтр для пылесоса; hepa фильтр
water_filters | Фильтры для воды | фильтр для холодильника; фильтр для кофемашины; картридж для воды
descaler | Средства от накипи | средство от накипи; антинакипин; декальцинатор
detergents | Средства для посудомоек | таблетки для посудомойки; соль для посудомойки; ополаскиватель
coffee_supplies | Расходники для кофемашин | капсулы; кофейные капсулы; чистящие таблетки для кофемашины
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'home-appliance-other',
    name: 'Другое',
    itemLabel: 'Товар для техники',
    equipment: 'home_appliance',
    key: 'appliance_other',
    types: [],
    compat: MODEL_ONLY,
    attributes: ['brandName', 'condition'],
  },

  // ══ Климатическая техника ═══════════════════════════════════════════════
  {
    slug: 'home-climate-ac',
    name: 'Кондиционеры',
    itemLabel: 'Кондиционер',
    equipment: 'climate_equipment',
    typeKey: 'goodsType',
    key: 'climate_ac',
    words: ['кондиционеры', 'кондиционер', 'сплит система', 'сплит-система', 'сплит', 'кондер'],
    types: types(`
split | Сплит-система | сплит система; сплит-система; настенный кондиционер
mobile_ac | Мобильный кондиционер | мобильный кондиционер; напольный кондиционер
window_ac | Оконный кондиционер | оконный кондиционер
multi_split | Мульти-сплит | мульти сплит; мультисплит
cassette | Кассетный и канальный | кассетный кондиционер; канальный кондиционер
`),
    attributes: ['serviceArea', 'inverter', 'brandName', 'condition'],
  },
  {
    slug: 'home-climate-heaters',
    name: 'Обогреватели',
    itemLabel: 'Обогреватель',
    equipment: 'climate_equipment',
    typeKey: 'goodsType',
    key: 'climate_heaters',
    words: ['обогреватели', 'обогреватель'],
    types: types(`
oil_heater | Масляный радиатор | масляный радиатор; масляный обогреватель
convector | Конвектор | конвектор; конвекторы; электроконвектор
heat_fan | Тепловентилятор | тепловентилятор; дуйка; тепловая пушка
infrared | Инфракрасный | инфракрасный обогреватель; ик обогреватель
gas_heater | Газовый обогреватель | газовый обогреватель; газовая печка
`),
    attributes: ['serviceArea', 'brandName', 'condition'],
  },
  {
    slug: 'home-climate-fans',
    name: 'Вентиляторы',
    itemLabel: 'Вентилятор',
    equipment: 'climate_equipment',
    typeKey: 'goodsType',
    key: 'climate_fans',
    words: ['вентиляторы'],
    types: types(`
floor_fan | Напольный вентилятор | вентилятор; напольный вентилятор
table_fan | Настольный вентилятор | настольный вентилятор
tower_fan | Колонный вентилятор | колонный вентилятор
ceiling_fan | Потолочный вентилятор | потолочный вентилятор
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'home-climate-humidifiers',
    name: 'Увлажнители',
    itemLabel: 'Увлажнитель',
    equipment: 'climate_equipment',
    typeKey: 'goodsType',
    key: 'climate_humidifiers',
    words: ['увлажнители'],
    types: types(`
ultrasonic | Ультразвуковой | увлажнитель; увлажнитель воздуха; ультразвуковой увлажнитель
steam | Паровой | паровой увлажнитель
evaporative | Мойка воздуха | мойка воздуха
dehumidifier | Осушитель | осушитель воздуха
`),
    attributes: ['brandName', 'condition'],
  },
  {
    slug: 'home-climate-purifiers',
    name: 'Очистители воздуха',
    itemLabel: 'Очиститель',
    equipment: 'climate_equipment',
    typeKey: 'goodsType',
    key: 'climate_purifiers',
    words: ['очистители воздуха'],
    types: types(`
hepa_purifier | С HEPA-фильтром | очиститель воздуха; воздухоочиститель
ionizer | Ионизатор | ионизатор воздуха
recuperator | Бризер | бризер; приточная вентиляция; рекуператор
`),
    attributes: ['serviceArea', 'brandName', 'condition'],
  },
  {
    slug: 'home-climate-accessories',
    name: 'Аксессуары',
    itemLabel: 'Аксессуар',
    equipment: 'climate_equipment',
    typeKey: 'goodsType',
    key: 'climate_accessories',
    compat: MODEL_ONLY,
    types: types(`
ac_remote | Пульты для кондиционеров | пульт кондиционера; пульт от кондиционера; пульт для сплит системы
ac_brackets | Кронштейны для кондиционеров | кронштейн для кондиционера; кронштейн наружного блока
ac_drain | Дренажные помпы и трубки | дренажная помпа; дренажный шланг кондиционера
ac_lines | Медные трассы | медная труба для кондиционера; трасса для кондиционера
ac_visor | Защитные козырьки | козырек на кондиционер; корзина для кондиционера
`),
    attributes: ['condition'],
  },
  {
    slug: 'home-climate-consumables',
    name: 'Расходники',
    itemLabel: 'Расходник',
    equipment: 'climate_equipment',
    typeKey: 'goodsType',
    key: 'climate_consumables',
    compat: MODEL_ONLY,
    types: types(`
climate_filters | Фильтры | фильтр для кондиционера; фильтр для очистителя; фильтр для увлажнителя
freon | Фреон | фреон; хладагент; r410; r32
cleaning | Средства для чистки | очиститель кондиционера; антибактериальная пена для кондиционера
cartridges | Картриджи | картридж для увлажнителя; деминерализующий картридж
`),
    attributes: ['condition'],
  },
  {
    slug: 'home-climate-other',
    name: 'Другое',
    itemLabel: 'Климатическая техника',
    equipment: 'climate_equipment',
    key: 'climate_other',
    types: [],
    attributes: ['brandName', 'condition'],
  },
];

const BY_SLUG = new Map(GOODS_DIRECTIONS.map((direction) => [direction.slug, direction]));

export function goodsDirectionBySlug(slug: string | null | undefined): GoodsDirection | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

/** Справочник типов товара направления: goods_type_<key>. */
export function goodsTypeKind(direction: Pick<GoodsDirection, 'key'>): string {
  return `goods_type_${direction.key}`;
}
