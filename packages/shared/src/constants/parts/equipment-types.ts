import { APPLIANCE_PARTS, CLIMATE_PARTS, OTHER_EQUIPMENT_PARTS } from './taxonomy-appliances.js';
import { CAR_PARTS } from './taxonomy-cars.js';
import { COMPUTER_PARTS, LAPTOP_PARTS, PHONE_PARTS, TV_PARTS } from './taxonomy-devices.js';
import { MOTO_PARTS, SPECIAL_PARTS, TRUCK_PARTS, WATER_PARTS } from './taxonomy-vehicles.js';
import type { PartGroupSeed } from './taxonomy.js';

/**
 * Типы техники, для которых в каталоге есть запчасти. Запчасть — не
 * самостоятельная сущность: она всегда принадлежит типу техники, а
 * совместимость с конкретной маркой и моделью хранится отдельным слоем.
 *
 * Новый тип техники добавляется записью в `PARTS_EQUIPMENT` (и списком групп
 * деталей в таксономии): подкатегория объявлений, справочники групп и
 * деталей, поля формы и фильтров, словарь поиска собираются из реестра сами.
 */
export const PartsEquipmentType = {
  PASSENGER_CAR: 'passenger_car',
  TRUCK: 'truck',
  MOTO: 'moto',
  SPECIAL_EQUIPMENT: 'special_equipment',
  WATER_TRANSPORT: 'water_transport',
  PHONE: 'phone',
  LAPTOP: 'laptop',
  COMPUTER: 'computer',
  TV: 'tv',
  HOME_APPLIANCE: 'home_appliance',
  CLIMATE_EQUIPMENT: 'climate_equipment',
  OTHER_EQUIPMENT: 'other_equipment',
} as const;

export type PartsEquipmentTypeCode = (typeof PartsEquipmentType)[keyof typeof PartsEquipmentType];

/** Вид самой техники внутри типа: «экскаватор» у спецтехники, «скутер» у мото. */
export interface EquipmentKindWords {
  /** Ключ существующего атрибута вида техники (specialType, motoType…) */
  attribute: string;
  /** Код варианта этого атрибута → как его называют люди */
  words: Readonly<Record<string, readonly string[]>>;
}

export interface PartsEquipment {
  code: PartsEquipmentTypeCode;
  /** Короткое название для вариантов выбора: «Телефон», «Телевизор» */
  label: string;
  /** Подкатегория объявлений, в которой живут эти запчасти */
  slug: string;
  /** Раздел каталога (корень дерева) */
  section: string;
  name: string;
  itemLabel: string;
  /** Короткий ключ справочников: part_group_<key>, part_item_<key> */
  key: string;
  /** Справочники марки и модели техники — те же, что у самой техники */
  brandKind?: string;
  modelKind?: string;
  /** Подпись поля «марка» в форме и фильтрах */
  brandLabel: string;
  /** Подкатегория самой техники (куда вести «машины»), если она есть */
  machineSlug?: string;
  groups: readonly PartGroupSeed[];
  kind?: EquipmentKindWords;
  /** Слова, которыми называют саму технику («на машину», «на стиралку») */
  words: readonly string[];
  /** Какие необязательные поля совместимости нужны этому типу техники */
  /**
   * Какие уточнения совместимости имеют смысл: кузов — только у легковых,
   * год и двигатель — у машин, модификация — где у моделей бывают версии
   * (комплектация авто, поколение телефона, исполнение стиральной машины)
   */
  compat: { year: boolean; chassis: boolean; engine: boolean; modification: boolean };
}

export const PARTS_EQUIPMENT: readonly PartsEquipment[] = [
  {
    code: PartsEquipmentType.PASSENGER_CAR,
    label: 'Легковой автомобиль',
    slug: 'transport-parts',
    section: 'transport',
    name: 'Автозапчасти',
    itemLabel: 'Запчасть',
    key: 'car',
    brandKind: 'car_brand',
    modelKind: 'car_model',
    brandLabel: 'Марка авто',
    machineSlug: 'transport-cars',
    groups: CAR_PARTS,
    words: [
      'машина',
      'машину',
      'машины',
      'авто',
      'автомобиль',
      'автомобиля',
      'тачка',
      'тачку',
      'иномарка',
      'иномарку',
      'легковой',
      'легковую',
      'автозапчасти',
    ],
    compat: { year: true, chassis: true, engine: true, modification: true },
  },
  {
    code: PartsEquipmentType.TRUCK,
    label: 'Грузовик',
    slug: 'transport-truck-parts',
    section: 'transport',
    name: 'Запчасти для грузовиков',
    itemLabel: 'Запчасть',
    key: 'truck',
    brandKind: 'truck_brand',
    modelKind: 'truck_model',
    brandLabel: 'Марка грузовика',
    machineSlug: 'transport-trucks',
    groups: TRUCK_PARTS,
    kind: {
      attribute: 'truckType',
      words: {
        tractor: ['тягач', 'тягача'],
        dump: ['самосвал', 'самосвала'],
        bus: ['автобус', 'автобуса'],
        trailer: ['прицеп', 'полуприцеп', 'прицепа'],
        refrigerator: ['рефрижератор'],
      },
    },
    words: [
      'грузовик',
      'грузовика',
      'грузовой',
      'фура',
      'фуру',
      'фуры',
      'камаз',
      'камаза',
      'газель',
      'газели',
      'маз',
      'урал',
      'тягач',
      'тягача',
      'самосвал',
      'самосвала',
    ],
    compat: { year: true, chassis: false, engine: true, modification: true },
  },
  {
    code: PartsEquipmentType.MOTO,
    label: 'Мототехника',
    slug: 'transport-moto-parts',
    section: 'transport',
    name: 'Мотозапчасти',
    itemLabel: 'Запчасть',
    key: 'moto',
    brandKind: 'moto_brand',
    modelKind: 'moto_model',
    brandLabel: 'Марка мото',
    machineSlug: 'transport-moto',
    groups: MOTO_PARTS,
    kind: {
      attribute: 'motoType',
      words: {
        enduro: ['эндуро', 'кросс', 'питбайк', 'питбайка'],
        scooter: ['скутер', 'скутера', 'мопед', 'мопеда', 'скутеры'],
        atv: ['квадроцикл', 'квадроцикла', 'квадрик', 'квадрика'],
        snowmobile: ['снегоход', 'снегохода'],
        sport: ['спортбайк', 'спортбайка'],
        cruiser: ['круизер', 'чоппер'],
      },
    },
    words: [
      'мото',
      'мотоцикл',
      'мотоцикла',
      'мотик',
      'мотика',
      'байк',
      'байка',
      'мотозапчасти',
      'эндуро',
      'скутер',
      'скутера',
      'мопед',
      'мопеда',
      'квадроцикл',
      'квадроцикла',
      'квадрик',
      'снегоход',
      'снегохода',
      'питбайк',
      'питбайка',
    ],
    compat: { year: true, chassis: false, engine: true, modification: false },
  },
  {
    code: PartsEquipmentType.SPECIAL_EQUIPMENT,
    label: 'Спецтехника',
    slug: 'transport-special-parts',
    section: 'transport',
    name: 'Запчасти для спецтехники',
    itemLabel: 'Запчасть',
    key: 'special',
    brandKind: 'special_brand',
    modelKind: 'special_model',
    brandLabel: 'Производитель техники',
    machineSlug: 'transport-special',
    groups: SPECIAL_PARTS,
    kind: {
      attribute: 'specialType',
      words: {
        excavator: ['экскаватор', 'экскаватора', 'экскаваторы'],
        loader: ['погрузчик', 'погрузчика', 'погрузчики'],
        bulldozer: ['бульдозер', 'бульдозера'],
        tractor: ['трактор', 'трактора', 'тракторы'],
        crane: ['кран', 'автокран', 'автокрана', 'манипулятор', 'манипулятора'],
        grader: ['грейдер', 'грейдера'],
        roller: ['дорожный каток', 'катка'],
        agricultural: ['сельхозтехника', 'сельхозтехники', 'комбайн', 'комбайна'],
      },
    },
    words: [
      'спецтехника',
      'спецтехники',
      'спецтехнику',
      'экскаватор',
      'экскаватора',
      'погрузчик',
      'погрузчика',
      'бульдозер',
      'бульдозера',
      'трактор',
      'трактора',
      'автокран',
      'автокрана',
      'манипулятор',
      'манипулятора',
      'грейдер',
      'грейдера',
      'комбайн',
      'комбайна',
    ],
    compat: { year: true, chassis: false, engine: false, modification: true },
  },
  {
    code: PartsEquipmentType.WATER_TRANSPORT,
    label: 'Водная техника',
    slug: 'transport-water-parts',
    section: 'transport',
    name: 'Запчасти для водной техники',
    itemLabel: 'Запчасть',
    key: 'water',
    brandKind: 'water_brand',
    brandLabel: 'Производитель',
    machineSlug: 'transport-water',
    groups: WATER_PARTS,
    kind: {
      attribute: 'waterType',
      words: {
        motorboat: ['катер', 'катера', 'лодка', 'лодки', 'лодку'],
        inflatable: ['надувная лодка', 'пвх лодка', 'пвх'],
        jet_ski: ['гидроцикл', 'гидроцикла'],
      },
    },
    words: [
      'лодка',
      'лодки',
      'лодку',
      'лодочный',
      'катер',
      'катера',
      'гидроцикл',
      'гидроцикла',
      'яхта',
      'яхты',
      'яхту',
    ],
    compat: { year: true, chassis: false, engine: false, modification: false },
  },
  {
    code: PartsEquipmentType.PHONE,
    label: 'Телефон',
    slug: 'electronics-phone-parts',
    section: 'electronics',
    name: 'Запчасти для телефонов',
    itemLabel: 'Запчасть',
    key: 'phone',
    brandKind: 'phone_brand',
    modelKind: 'phone_model',
    brandLabel: 'Бренд телефона',
    machineSlug: 'electronics-phones',
    groups: PHONE_PARTS,
    words: [
      'телефон',
      'телефона',
      'телефоны',
      'смартфон',
      'смартфона',
      'мобильник',
      'мобильника',
      'мобилу',
      'мобилка',
      'айфон',
      'айфона',
      'iphone',
      'андроид',
    ],
    compat: { year: false, chassis: false, engine: false, modification: true },
  },
  {
    code: PartsEquipmentType.LAPTOP,
    label: 'Ноутбук',
    slug: 'electronics-laptop-parts',
    section: 'electronics',
    name: 'Запчасти для ноутбуков',
    itemLabel: 'Запчасть',
    key: 'laptop',
    brandKind: 'computer_brand',
    modelKind: 'laptop_model',
    brandLabel: 'Бренд ноутбука',
    machineSlug: 'electronics-laptops',
    groups: LAPTOP_PARTS,
    words: [
      'ноутбук',
      'ноутбука',
      'ноутбуки',
      'ноут',
      'ноута',
      'макбук',
      'макбука',
      'macbook',
      'ультрабук',
    ],
    compat: { year: false, chassis: false, engine: false, modification: true },
  },
  {
    code: PartsEquipmentType.COMPUTER,
    label: 'Компьютер',
    slug: 'electronics-components',
    section: 'electronics',
    name: 'Комплектующие для ПК',
    itemLabel: 'Комплектующее',
    key: 'computer',
    brandKind: 'computer_brand',
    brandLabel: 'Бренд',
    machineSlug: 'electronics-computers',
    groups: COMPUTER_PARTS,
    words: [
      'компьютер',
      'компьютера',
      'компьютеры',
      'комп',
      'компа',
      'пк',
      'системник',
      'системника',
    ],
    compat: { year: false, chassis: false, engine: false, modification: false },
  },
  {
    code: PartsEquipmentType.TV,
    label: 'Телевизор',
    slug: 'electronics-tv-parts',
    section: 'electronics',
    name: 'Запчасти для телевизоров',
    itemLabel: 'Запчасть',
    key: 'tv',
    brandKind: 'tv_brand',
    brandLabel: 'Бренд телевизора',
    machineSlug: 'electronics-tv',
    groups: TV_PARTS,
    words: [
      'телевизор',
      'телевизора',
      'телевизоры',
      'телек',
      'телека',
      'телик',
      'телика',
      'тв',
      'tv',
    ],
    compat: { year: false, chassis: false, engine: false, modification: false },
  },
  {
    code: PartsEquipmentType.HOME_APPLIANCE,
    label: 'Бытовая техника',
    slug: 'home-appliance-parts',
    section: 'home',
    name: 'Запчасти для бытовой техники',
    itemLabel: 'Запчасть',
    key: 'appliance',
    brandKind: 'appliance_brand',
    brandLabel: 'Бренд техники',
    machineSlug: 'home-appliances',
    groups: APPLIANCE_PARTS,
    words: [],
    compat: { year: false, chassis: false, engine: false, modification: true },
  },
  {
    code: PartsEquipmentType.CLIMATE_EQUIPMENT,
    label: 'Климатическая техника',
    slug: 'home-climate-parts',
    section: 'home',
    name: 'Запчасти для климатической техники',
    itemLabel: 'Запчасть',
    key: 'climate',
    brandKind: 'appliance_brand',
    brandLabel: 'Бренд техники',
    machineSlug: 'home-appliances',
    groups: CLIMATE_PARTS,
    words: [],
    compat: { year: false, chassis: false, engine: false, modification: true },
  },
  {
    code: PartsEquipmentType.OTHER_EQUIPMENT,
    label: 'Другое оборудование',
    slug: 'business-parts',
    section: 'business',
    name: 'Запчасти для оборудования',
    itemLabel: 'Запчасть',
    key: 'other',
    brandLabel: 'Производитель оборудования',
    machineSlug: 'business-equipment',
    groups: OTHER_EQUIPMENT_PARTS,
    words: [],
    compat: { year: false, chassis: false, engine: false, modification: false },
  },
];

const BY_CODE = new Map<string, PartsEquipment>(PARTS_EQUIPMENT.map((item) => [item.code, item]));
const BY_SLUG = new Map<string, PartsEquipment>(PARTS_EQUIPMENT.map((item) => [item.slug, item]));

export function partsEquipmentByCode(code: string): PartsEquipment | undefined {
  return BY_CODE.get(code);
}

/** Тип техники по подкатегории объявлений; для не-запчастей — undefined. */
export function partsEquipmentBySlug(slug: string | null | undefined): PartsEquipment | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

export function isPartsCategory(slug: string | null | undefined): boolean {
  return partsEquipmentBySlug(slug) !== undefined;
}

/** Справочник групп деталей типа техники: part_group_car. */
export const partGroupKind = (equipment: PartsEquipment): string => `part_group_${equipment.key}`;
/** Справочник деталей (родитель — группа): part_item_car. */
export const partItemKind = (equipment: PartsEquipment): string => `part_item_${equipment.key}`;

/** Справочник производителей деталей — общий для всех типов техники. */
export const PART_MANUFACTURER_KIND = 'part_manufacturer';
