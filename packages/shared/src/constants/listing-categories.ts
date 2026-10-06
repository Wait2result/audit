/**
 * Дерево категорий объявлений (Этап 7, версия 2).
 *
 * Дальше категории живут в базе и правятся из панели — здесь только то,
 * чем заполняется база при первом запуске. Уровней два или три: раздел →
 * подкатегория («Недвижимость → Квартиры») или раздел → основной тип →
 * направление («Транспорт → Автомобили → Автоаксессуары»). Основные типы и
 * их направления — catalog/main-types.ts; глубже дерево не идёт: «Коврики»
 * внутри автоаксессуаров — тип товара, поле объявления, а не категория.
 *
 * Размещать объявление можно только в подкатегории (`isLeaf`): иначе
 * половина машин окажется в «Транспорте» вообще и выпадет из фильтров по
 * году и пробегу.
 *
 * У каждой подкатегории описано: какие поля у неё есть (`attributes` —
 * привязки к определениям из `listing-attributes.ts`), какие сделки в ней
 * бывают (`transactions`: продажа, аренда, бесплатно) и какие единицы цены
 * допустимы. Аренда и продажа НЕ разводятся по разным категориям: это тип
 * сделки внутри одной. Иначе одна и та же квартира заводится дважды, а
 * человек, ищущий «двушку», выбирает между двумя почти одинаковыми
 * разделами.
 */
import { DictionaryKind } from './dictionaries/index.js';
import type { CategoryAttributeBinding } from './listing-attributes.js';
import { goodsDirectionBySlug, type GoodsDirection } from './catalog/goods-directions.js';
import { MAIN_TYPES, directionBindings } from './catalog/main-types.js';
import { partsBindings } from './parts/bindings.js';
import {
  PARTS_EQUIPMENT,
  partsEquipmentByCode,
  partsEquipmentBySlug,
} from './parts/equipment-types.js';
import type { ListingPriceUnit } from './listings.js';
import type { ListingRentPeriod, ListingTransactionType } from './transactions.js';

export type ListingCardLayout = 'grid' | 'list';

/** Ярлык, ведущий в другую категорию с готовым фильтром («Посуточная аренда»). */
export interface CategoryShortcut {
  category: string;
  transactionType?: ListingTransactionType;
  rentPeriod?: ListingRentPeriod;
  /** Готовые значения характеристик: «Удалённая работа» → вакансии с remote */
  attributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface SeedListingCategory {
  slug: string;
  name: string;
  /** Как назвать один объект в заголовке формы: «Квартира», «Автомобиль» */
  itemLabel?: string;
  /** Поля подкатегории: ключ определения или привязка с переопределениями */
  attributes?: readonly (string | CategoryAttributeBinding)[];
  /** Какие сделки бывают. Пусто — сделки нет (вещи, работа, услуги) */
  transactions?: readonly ListingTransactionType[];
  defaultTransaction?: ListingTransactionType;
  defaultRentPeriod?: ListingRentPeriod;
  /** Допустимые единицы цены. Пусто — только «целиком» */
  priceUnits?: readonly ListingPriceUnit[];
  defaultPriceUnit?: ListingPriceUnit;
  cardLayout?: ListingCardLayout;
  iconKey?: string;
  shortcut?: CategoryShortcut;
  /** Категория снята: объявления и переходы ведут в указанную */
  deprecatedTo?: string;
  children?: readonly SeedListingCategory[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Заготовки, общие для нескольких подкатегорий
// ─────────────────────────────────────────────────────────────────────────────

type Preset = Pick<
  SeedListingCategory,
  | 'attributes'
  | 'transactions'
  | 'defaultTransaction'
  | 'defaultRentPeriod'
  | 'priceUnits'
  | 'defaultPriceUnit'
  | 'cardLayout'
>;

const REALTY_DEAL: Preset = {
  transactions: ['sale', 'rent'],
  defaultTransaction: 'sale',
  priceUnits: ['total', 'per_month', 'per_day'],
  defaultPriceUnit: 'total',
  cardLayout: 'list',
};

/**
 * Продажа и аренда «за время»: час, сутки, неделя, месяц. Транспорт, техника,
 * инструмент, снаряжение — всё, что можно и продать, и сдать. Единицу
 * выбирает продавец; фильтр и сортировка по цене сравнивают только одну
 * единицу (price-config.ts).
 */
const RENTAL_DEAL: Preset = {
  transactions: ['sale', 'rent'],
  defaultTransaction: 'sale',
  priceUnits: ['total', 'per_hour', 'per_day', 'per_week', 'per_month'],
  defaultPriceUnit: 'total',
};

const VEHICLE_DEAL = RENTAL_DEAL;

const SALE_ONLY: Preset = {
  transactions: ['sale'],
  defaultTransaction: 'sale',
  priceUnits: ['total'],
  defaultPriceUnit: 'total',
};

const CAR_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'brand', required: true, dictionary: DictionaryKind.CAR_BRAND },
  { key: 'model', dictionary: DictionaryKind.CAR_MODEL },
  { key: 'year', required: true, label: 'Год выпуска', min: 1950 },
  { key: 'mileage', required: true },
  'engineVolume',
  'power',
  'gearbox',
  'fuel',
  'drive',
  'bodyType',
  'color',
  'steering',
  'owners',
  'customs',
  'damaged',
  'vin',
];

const MOTO_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'brand', required: true, dictionary: DictionaryKind.MOTO_BRAND },
  { key: 'model', dictionary: DictionaryKind.MOTO_MODEL },
  'motoType',
  { key: 'year', label: 'Год выпуска', min: 1950 },
  { key: 'mileage', max: 1_000_000 },
  'engineCc',
  'power',
  'color',
  'condition',
];

const TRUCK_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'brand', required: true, dictionary: DictionaryKind.TRUCK_BRAND },
  { key: 'model', dictionary: DictionaryKind.TRUCK_MODEL },
  { key: 'truckType', required: true },
  { key: 'year', required: true, label: 'Год выпуска', min: 1950 },
  'mileage',
  'loadCapacity',
  'fuel',
  'gearbox',
  'power',
  'owners',
  'damaged',
];

const SPECIAL_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'specialType', required: true },
  { key: 'brand', label: 'Производитель', dictionary: DictionaryKind.SPECIAL_BRAND },
  { key: 'model', dictionary: DictionaryKind.SPECIAL_MODEL },
  { key: 'year', label: 'Год выпуска', min: 1950 },
  'hours',
  'power',
  'condition',
];

const WATER_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'waterType', required: true },
  { key: 'brand', label: 'Производитель', dictionary: DictionaryKind.WATER_BRAND },
  'modelName',
  { key: 'year', label: 'Год выпуска', min: 1950 },
  'length',
  'hullMaterial',
  'power',
  'hours',
  'condition',
];

const OTHER_VEHICLE_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'brandName', label: 'Марка' },
  'modelName',
  { key: 'year', label: 'Год выпуска', min: 1950 },
  'condition',
];

/**
 * Шины и диски — у легковых, мото и грузовиков один набор: что продаётся
 * (шины, диски, колёса, колпаки), а поля шин и дисков показываются по нему.
 */
export const TIRES_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'tireType', required: true },
  'season',
  'diameter',
  'tireWidth',
  'tireProfile',
  'loadIndex',
  'speedIndex',
  'rimWidth',
  'pcd',
  'rimEt',
  'rimDia',
  'rimMaterial',
  'quantity',
  { key: 'brand', label: 'Бренд', dictionary: DictionaryKind.TIRE_BRAND },
  'condition',
];

/** «Кто разместил» — первым полем у всей недвижимости, обязательно. */
const REALTY_SELLER: CategoryAttributeBinding = { key: 'sellerType', required: true };

/** Условия аренды жилья — общий хвост у квартир, комнат и домов. */
const RENT_TERMS: readonly (string | CategoryAttributeBinding)[] = [
  'furniture',
  'utilitiesIncluded',
  'petsAllowed',
  'childrenAllowed',
];

const FLAT_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  REALTY_SELLER,
  { key: 'rooms', required: true },
  { key: 'areaTotal', required: true },
  'floor',
  'floorsTotal',
  'buildingType',
  'newBuilding',
  { key: 'year', label: 'Год постройки', min: 1900 },
  'renovation',
  'bathroom',
  'balcony',
  'lift',
  'parking',
  ...RENT_TERMS,
];

const ROOM_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  REALTY_SELLER,
  { key: 'areaTotal', required: true, label: 'Площадь комнаты' },
  { key: 'roomsInFlat', required: true },
  'floor',
  'floorsTotal',
  'renovation',
  'bathroom',
  'balcony',
  'lift',
  ...RENT_TERMS,
];

const HOUSE_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  REALTY_SELLER,
  { key: 'areaTotal', required: true, label: 'Площадь дома' },
  { key: 'landArea', required: true },
  { key: 'floorsTotal', label: 'Этажей' },
  { key: 'rooms', label: 'Комнат' },
  { key: 'year', label: 'Год постройки', min: 1800 },
  'wallMaterial',
  'renovation',
  'heating',
  'gas',
  'water',
  'sewerage',
  'electricity',
  'bathroomLocation',
  ...RENT_TERMS,
];

const LAND_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  REALTY_SELLER,
  { key: 'landArea', required: true },
  { key: 'landPurpose', required: true },
  'road',
  'communications',
  'gas',
  'water',
  'electricity',
];

const COMMERCIAL_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  REALTY_SELLER,
  { key: 'commercialType', required: true },
  { key: 'areaTotal', required: true },
  'floor',
  'floorsTotal',
  'renovation',
  'separateEntrance',
  'parking',
];

const GARAGE_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  REALTY_SELLER,
  { key: 'garageType', required: true },
  'areaTotal',
  'security',
  'electricity',
  'pit',
];

const PHONE_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'brand', required: true, dictionary: DictionaryKind.PHONE_BRAND },
  { key: 'model', dictionary: DictionaryKind.PHONE_MODEL },
  'memory',
  { key: 'condition', required: true },
  'color',
  'battery',
  'faceId',
  'warranty',
];

const TABLET_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'brand', required: true, dictionary: DictionaryKind.TABLET_BRAND },
  { key: 'model', dictionary: DictionaryKind.TABLET_MODEL },
  'screenSize',
  'memory',
  'cellular',
  { key: 'condition', required: true },
  'color',
  'warranty',
];

const LAPTOP_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'brand', required: true, dictionary: DictionaryKind.COMPUTER_BRAND },
  { key: 'model', dictionary: DictionaryKind.LAPTOP_MODEL },
  'screenSize',
  'cpu',
  'ram',
  'gpu',
  'storage',
  'storageSize',
  'os',
  { key: 'condition', required: true },
  'warranty',
];

const COMPUTER_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'brand', dictionary: DictionaryKind.COMPUTER_BRAND },
  'cpu',
  'ram',
  'gpu',
  'storage',
  'storageSize',
  'os',
  { key: 'condition', required: true },
  'warranty',
];

const TV_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'brand', dictionary: DictionaryKind.TV_BRAND },
  'modelName',
  { key: 'screenSize', required: true },
  'resolution',
  'smartTv',
  { key: 'condition', required: true },
  'warranty',
];

const PHOTO_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'photoType', required: true },
  { key: 'brand', dictionary: DictionaryKind.PHOTO_BRAND },
  { key: 'model', dictionary: DictionaryKind.PHOTO_MODEL },
  { key: 'condition', required: true },
  'warranty',
];

const CONSOLE_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'consoleType', required: true },
  'storageSize',
  { key: 'condition', required: true },
  'warranty',
];

const AUDIO_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'audioType', required: true },
  { key: 'brand', dictionary: DictionaryKind.AUDIO_BRAND },
  'modelName',
  'wireless',
  { key: 'condition', required: true },
  'warranty',
];

const WATCH_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'brand', dictionary: DictionaryKind.WATCH_BRAND },
  { key: 'model', dictionary: DictionaryKind.WATCH_MODEL },
  'color',
  { key: 'condition', required: true },
  'warranty',
];

const ELECTRONICS_ACCESSORY_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'accessoryType', required: true },
  'brandName',
  'condition',
];

const APPLIANCE_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'applianceType', required: true },
  { key: 'brand', dictionary: DictionaryKind.APPLIANCE_BRAND },
  'modelName',
  { key: 'condition', required: true },
  'warranty',
];

/** Минимальный набор вещи без своего типа: состояние. Таких подкатегорий — единицы. */
const GOODS_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = ['condition'];

const BRANDED_GOODS_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  'condition',
  'brandName',
];

const CLOTHES_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'clothesType', required: true },
  { key: 'gender', required: true },
  'size',
  { key: 'condition', required: true },
  'brandName',
  'color',
];

const SHOES_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'gender', required: true },
  { key: 'shoeSize', required: true },
  { key: 'condition', required: true },
  'brandName',
  'color',
];

const KIDS_CLOTHES_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'kidsAge', required: true },
  'clothesType',
  'size',
  { key: 'condition', required: true },
  'brandName',
];

const KIDS_GOODS_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'kidsGoodsType', required: true },
  'kidsAge',
  { key: 'condition', required: true },
  'brandName',
];

const ACCESSORY_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  'gender',
  { key: 'condition', required: true },
  'brandName',
  'color',
];

const JEWELRY_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'jewelryType', required: true },
  { key: 'jewelryMaterial', required: true },
  'gender',
  'condition',
];

const FURNITURE_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'furnitureType', required: true },
  { key: 'condition', required: true },
  'color',
];

const LIGHT_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'lightType', required: true },
  { key: 'condition', required: true },
  'brandName',
];

const MATERIALS_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'materialType', required: true },
  'quantity',
  'condition',
];

const TOOLS_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'toolType', required: true },
  { key: 'brand', label: 'Бренд', dictionary: DictionaryKind.TOOL_BRAND },
  { key: 'condition', required: true },
  'warranty',
];

const PLUMBING_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'plumbingType', required: true },
  'brandName',
  { key: 'condition', required: true },
];

const DOORS_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'doorsType', required: true },
  'material',
  { key: 'condition', required: true },
];

const SPORT_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'sportType', required: true },
  { key: 'condition', required: true },
  'brandName',
];

const BIKE_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'bikeType', required: true },
  'wheelDiameter',
  { key: 'brand', label: 'Бренд', dictionary: DictionaryKind.BIKE_BRAND },
  { key: 'condition', required: true },
];

const MUSIC_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'instrumentType', required: true },
  'brandName',
  { key: 'condition', required: true },
];

const GAMES_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'gamesType', required: true },
  { key: 'condition', required: true },
];

const BOOKS_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  'author',
  { key: 'condition', required: true },
];

const EQUIPMENT_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'equipmentType', required: true },
  'brandName',
  { key: 'condition', required: true },
  'warranty',
];

const READY_BUSINESS_ATTRIBUTES: readonly (string | CategoryAttributeBinding)[] = [
  { key: 'businessSphere', required: true },
  'monthlyRevenue',
  'staffCount',
  'premises',
];

const VACANCY: Preset = {
  attributes: [
    { key: 'sphere', required: true },
    { key: 'employment', required: true },
    'schedule',
    'experience',
    'remote',
    'registration',
  ],
  priceUnits: ['per_month', 'per_day', 'per_hour'],
  defaultPriceUnit: 'per_month',
  cardLayout: 'list',
};

const RESUME: Preset = {
  attributes: [
    { key: 'sphere', required: true },
    { key: 'employment', required: true, label: 'Ищу работу' },
    'experienceYears',
    'education',
    'remote',
  ],
  priceUnits: ['per_month', 'per_day', 'per_hour'],
  defaultPriceUnit: 'per_month',
  cardLayout: 'list',
};

/** Ярлык бывшей подкатегории работы: вакансии с готовым фильтром. */
const JOB_SHORTCUT: Preset = {
  priceUnits: ['per_month', 'per_day', 'per_hour'],
  defaultPriceUnit: 'per_month',
  cardLayout: 'list',
};

const SERVICE_BASE: readonly (string | CategoryAttributeBinding)[] = [
  'serviceFormat',
  'performer',
  'experienceYears',
  'urgent',
];

const SERVICE: Preset = {
  attributes: SERVICE_BASE,
  priceUnits: ['total', 'per_hour', 'per_unit'],
  defaultPriceUnit: 'total',
  cardLayout: 'list',
};

/** Услуга со своим списком работ первым обязательным полем. */
const service = (key: string): Preset => ({
  ...SERVICE,
  attributes: [{ key, required: true }, ...SERVICE_BASE],
});

const PET: Preset = {
  attributes: ['breed', 'animalAge', 'sex', 'vaccinated', 'sterilized', 'documents'],
  transactions: ['sale', 'free', 'mating'],
  defaultTransaction: 'sale',
  priceUnits: ['total'],
  defaultPriceUnit: 'total',
};

const GOODS: Preset = {
  attributes: GOODS_ATTRIBUTES,
  priceUnits: ['total'],
  defaultPriceUnit: 'total',
};

/**
 * Подкатегория запчастей типа техники. Цена — за штуку или целиком
 * (комплект, пара, «в сборе» — отдельное поле partSaleUnit), только продажа.
 * Тип техники — запись реестра PARTS_EQUIPMENT; вся подкатегория собирается из неё.
 */
/**
 * Направление основного типа из реестра (catalog/goods-directions.ts): тип
 * товара, свои поля и «Подходит к». Сделка — продажа, у прицепов и навесного
 * оборудования ещё и аренда.
 */
function goodsLeaf(direction: GoodsDirection): SeedListingCategory {
  const extra =
    direction.typeKey === 'tireType'
      ? TIRES_ATTRIBUTES
      : direction.typeKey === 'accessoryType'
        ? ELECTRONICS_ACCESSORY_ATTRIBUTES
        : [];
  return {
    slug: direction.slug,
    name: direction.name,
    itemLabel: direction.itemLabel,
    attributes: directionBindings(direction, extra),
    ...(direction.rental ? RENTAL_DEAL : SALE_ONLY),
  };
}

/** Имя подкатегории запчастей внутри основного типа: «Запчасти», у ПК — «Комплектующие». */
const PARTS_NAME_IN_TYPE: Readonly<Record<string, string>> = {
  computer: 'Комплектующие',
};

/**
 * Раздел с основными типами: подкатегории, относящиеся к типу техники,
 * собираются в узел этого типа на месте первой из них (в порядке, заданном
 * реестром), недостающие направления строятся из реестра. Остальные
 * подкатегории раздела («Планшеты», «Прочий транспорт») остаются прямо в нём.
 */
function withMainTypes(root: SeedListingCategory): SeedListingCategory {
  const types = MAIN_TYPES.filter((type) => type.section === root.slug);
  if (types.length === 0) return root;
  const own = new Map((root.children ?? []).map((child) => [child.slug, child]));
  const leafOf = (slug: string): SeedListingCategory => {
    const direction = goodsDirectionBySlug(slug);
    if (direction) return goodsLeaf(direction);
    const parts = partsEquipmentBySlug(slug);
    const existing = own.get(slug);
    if (!existing)
      throw new Error(`Подкатегории ${slug} нет ни в дереве, ни в реестре направлений`);
    return parts ? { ...existing, name: PARTS_NAME_IN_TYPE[parts.code] ?? 'Запчасти' } : existing;
  };
  const used = new Set<string>();
  const children: SeedListingCategory[] = [];
  const pushType = (type: (typeof types)[number]) => {
    used.add(type.slug);
    children.push({ slug: type.slug, name: type.name, children: type.directions.map(leafOf) });
  };
  for (const child of root.children ?? []) {
    const type = types.find((item) => item.directions.includes(child.slug));
    if (!type) {
      children.push(child);
      continue;
    }
    if (!used.has(type.slug)) pushType(type);
  }
  for (const type of types) if (!used.has(type.slug)) pushType(type);
  return { ...root, children };
}

function partsLeaf(code: string): SeedListingCategory {
  const equipment = partsEquipmentByCode(code);
  if (!equipment) throw new Error(`Нет типа техники для запчастей: ${code}`);
  return {
    slug: equipment.slug,
    name: equipment.name,
    itemLabel: equipment.itemLabel,
    attributes: partsBindings(equipment),
    transactions: ['sale'],
    defaultTransaction: 'sale',
    priceUnits: ['total', 'per_unit'],
    defaultPriceUnit: 'total',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Дерево
// ─────────────────────────────────────────────────────────────────────────────

const FLAT_TREE: readonly SeedListingCategory[] = [
  {
    slug: 'transport',
    name: 'Транспорт',
    children: [
      {
        slug: 'transport-cars',
        name: 'Автомобили',
        itemLabel: 'Автомобиль',
        attributes: CAR_ATTRIBUTES,
        ...VEHICLE_DEAL,
      },
      {
        slug: 'transport-moto',
        name: 'Мотоциклы',
        itemLabel: 'Мотоцикл',
        attributes: MOTO_ATTRIBUTES,
        ...RENTAL_DEAL,
      },
      {
        slug: 'transport-trucks',
        name: 'Грузовики',
        itemLabel: 'Грузовик',
        attributes: TRUCK_ATTRIBUTES,
        ...VEHICLE_DEAL,
      },
      {
        slug: 'transport-special',
        name: 'Спецтехника',
        itemLabel: 'Техника',
        attributes: SPECIAL_ATTRIBUTES,
        ...VEHICLE_DEAL,
      },
      partsLeaf('passenger_car'),
      partsLeaf('moto'),
      partsLeaf('truck'),
      partsLeaf('special_equipment'),
      partsLeaf('water_transport'),
      {
        slug: 'transport-tires',
        name: 'Шины и диски',
        itemLabel: 'Шины',
        attributes: TIRES_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'transport-accessories',
        name: 'Автоаксессуары',
        itemLabel: 'Аксессуар',
        ...GOODS,
        ...SALE_ONLY,
      },
      {
        slug: 'transport-water',
        name: 'Водный транспорт',
        itemLabel: 'Транспорт',
        attributes: WATER_ATTRIBUTES,
        ...VEHICLE_DEAL,
      },
      {
        slug: 'transport-other',
        name: 'Прочий транспорт',
        itemLabel: 'Транспорт',
        attributes: OTHER_VEHICLE_ATTRIBUTES,
        ...SALE_ONLY,
      },
    ],
  },
  {
    slug: 'realty',
    name: 'Недвижимость',
    children: [
      {
        slug: 'realty-flats',
        name: 'Квартиры',
        itemLabel: 'Квартира',
        attributes: FLAT_ATTRIBUTES,
        ...REALTY_DEAL,
      },
      {
        slug: 'realty-houses',
        name: 'Дома',
        itemLabel: 'Дом',
        attributes: HOUSE_ATTRIBUTES,
        ...REALTY_DEAL,
      },
      {
        slug: 'realty-rooms',
        name: 'Комнаты',
        itemLabel: 'Комната',
        attributes: ROOM_ATTRIBUTES,
        ...REALTY_DEAL,
      },
      {
        slug: 'realty-land',
        name: 'Земельные участки',
        itemLabel: 'Участок',
        attributes: LAND_ATTRIBUTES,
        ...REALTY_DEAL,
      },
      {
        slug: 'realty-commercial',
        name: 'Коммерческая недвижимость',
        itemLabel: 'Помещение',
        attributes: COMMERCIAL_ATTRIBUTES,
        ...REALTY_DEAL,
      },
      {
        slug: 'realty-garages',
        name: 'Гаражи и машиноместа',
        itemLabel: 'Гараж',
        attributes: GARAGE_ATTRIBUTES,
        ...REALTY_DEAL,
      },
      {
        slug: 'realty-country',
        name: 'Дачи',
        itemLabel: 'Дача',
        attributes: HOUSE_ATTRIBUTES,
        ...REALTY_DEAL,
      },
      // «Посуточно» и «Надолго» — не отдельные категории, а ярлыки в
      // «Квартиры» с готовым фильтром по сделке. Иначе одна и та же квартира
      // заводится дважды, а поиск «двушку снять» разбегается по трём разделам.
      // Объявления, поданные сюда раньше, переносит scripts/migrate-listings-v2
      {
        slug: 'realty-daily',
        name: 'Посуточная аренда',
        itemLabel: 'Жильё',
        shortcut: { category: 'realty-flats', transactionType: 'rent', rentPeriod: 'daily' },
        transactions: ['rent'],
        defaultTransaction: 'rent',
        defaultRentPeriod: 'daily',
        priceUnits: ['per_day'],
        defaultPriceUnit: 'per_day',
        cardLayout: 'list',
      },
      {
        slug: 'realty-long',
        name: 'Долгосрочная аренда',
        itemLabel: 'Жильё',
        shortcut: { category: 'realty-flats', transactionType: 'rent', rentPeriod: 'monthly' },
        transactions: ['rent'],
        defaultTransaction: 'rent',
        defaultRentPeriod: 'monthly',
        priceUnits: ['per_month'],
        defaultPriceUnit: 'per_month',
        cardLayout: 'list',
      },
    ],
  },
  {
    slug: 'electronics',
    name: 'Электроника',
    children: [
      {
        slug: 'electronics-phones',
        name: 'Телефоны',
        itemLabel: 'Телефон',
        attributes: PHONE_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'electronics-tablets',
        name: 'Планшеты',
        itemLabel: 'Планшет',
        attributes: TABLET_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'electronics-laptops',
        name: 'Ноутбуки',
        itemLabel: 'Ноутбук',
        attributes: LAPTOP_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'electronics-computers',
        name: 'Компьютеры',
        itemLabel: 'Компьютер',
        attributes: COMPUTER_ATTRIBUTES,
        ...SALE_ONLY,
      },
      partsLeaf('computer'),
      partsLeaf('phone'),
      partsLeaf('tablet'),
      partsLeaf('laptop'),
      partsLeaf('tv'),
      {
        slug: 'electronics-tv',
        name: 'Телевизоры',
        itemLabel: 'Телевизор',
        attributes: TV_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'electronics-photo',
        name: 'Фото и видео',
        itemLabel: 'Техника',
        attributes: PHOTO_ATTRIBUTES,
        ...RENTAL_DEAL,
      },
      {
        slug: 'electronics-console',
        name: 'Игровые приставки',
        itemLabel: 'Приставка',
        attributes: CONSOLE_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'electronics-audio',
        name: 'Аудиотехника',
        itemLabel: 'Техника',
        attributes: AUDIO_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'electronics-watches',
        name: 'Смарт-часы',
        itemLabel: 'Часы',
        attributes: WATCH_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'electronics-accessories',
        name: 'Аксессуары',
        itemLabel: 'Аксессуар',
        attributes: ELECTRONICS_ACCESSORY_ATTRIBUTES,
        ...SALE_ONLY,
      },
    ],
  },
  {
    slug: 'home',
    name: 'Дом и ремонт',
    children: [
      {
        slug: 'home-furniture',
        name: 'Мебель',
        itemLabel: 'Мебель',
        attributes: FURNITURE_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'home-appliances',
        name: 'Бытовая техника',
        itemLabel: 'Техника',
        attributes: APPLIANCE_ATTRIBUTES,
        ...SALE_ONLY,
      },
      partsLeaf('home_appliance'),
      partsLeaf('climate_equipment'),
      { slug: 'home-dishes', name: 'Посуда', itemLabel: 'Посуда', ...GOODS, ...SALE_ONLY },
      {
        slug: 'home-light',
        name: 'Освещение',
        itemLabel: 'Светильник',
        attributes: LIGHT_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'home-materials',
        name: 'Стройматериалы',
        itemLabel: 'Материал',
        attributes: MATERIALS_ATTRIBUTES,
        ...SALE_ONLY,
        // Кирпич и доски продают поштучно — единица «за штуку»
        priceUnits: ['total', 'per_unit'],
      },
      {
        slug: 'home-tools',
        name: 'Инструменты',
        itemLabel: 'Инструмент',
        attributes: TOOLS_ATTRIBUTES,
        ...RENTAL_DEAL,
      },
      {
        slug: 'home-plumbing',
        name: 'Сантехника',
        itemLabel: 'Сантехника',
        attributes: PLUMBING_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'home-doors',
        name: 'Двери и окна',
        itemLabel: 'Двери',
        attributes: DOORS_ATTRIBUTES,
        ...SALE_ONLY,
      },
      { slug: 'home-decor', name: 'Декор', itemLabel: 'Декор', ...GOODS, ...SALE_ONLY },
      { slug: 'home-plants', name: 'Растения', itemLabel: 'Растение', ...GOODS, ...SALE_ONLY },
      { slug: 'home-other', name: 'Всё для дома', itemLabel: 'Товар', ...GOODS, ...SALE_ONLY },
    ],
  },
  {
    slug: 'personal',
    name: 'Личные вещи',
    children: [
      {
        slug: 'personal-clothes',
        name: 'Одежда',
        itemLabel: 'Одежда',
        attributes: CLOTHES_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'personal-shoes',
        name: 'Обувь',
        itemLabel: 'Обувь',
        attributes: SHOES_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'personal-accessories',
        name: 'Аксессуары',
        itemLabel: 'Аксессуар',
        attributes: ACCESSORY_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'personal-bags',
        name: 'Сумки',
        itemLabel: 'Сумка',
        attributes: ACCESSORY_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'personal-watches',
        name: 'Часы',
        itemLabel: 'Часы',
        attributes: ACCESSORY_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'personal-jewelry',
        name: 'Украшения',
        itemLabel: 'Украшение',
        attributes: JEWELRY_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'personal-kids-clothes',
        name: 'Детские вещи',
        itemLabel: 'Вещь',
        attributes: KIDS_CLOTHES_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'personal-kids-goods',
        name: 'Товары для детей',
        itemLabel: 'Товар',
        attributes: KIDS_GOODS_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'personal-beauty',
        name: 'Косметика',
        itemLabel: 'Товар',
        attributes: BRANDED_GOODS_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'personal-sport',
        name: 'Спорттовары',
        itemLabel: 'Товар',
        attributes: SPORT_ATTRIBUTES,
        ...SALE_ONLY,
      },
    ],
  },
  {
    slug: 'services',
    name: 'Услуги',
    children: [
      { slug: 'services-repair', name: 'Ремонт', itemLabel: 'Услуга', ...service('repairType') },
      {
        slug: 'services-building',
        name: 'Строительство',
        itemLabel: 'Услуга',
        ...service('buildingWork'),
      },
      { slug: 'services-auto', name: 'Автоуслуги', itemLabel: 'Услуга', ...service('autoService') },
      {
        slug: 'services-beauty',
        name: 'Красота',
        itemLabel: 'Услуга',
        ...service('beautyService'),
      },
      {
        slug: 'services-photo',
        name: 'Фото и видео',
        itemLabel: 'Услуга',
        ...service('photoService'),
      },
      {
        slug: 'services-delivery',
        name: 'Доставка',
        itemLabel: 'Услуга',
        ...service('deliveryType'),
      },
      { slug: 'services-moving', name: 'Перевозки', itemLabel: 'Услуга', ...service('movingType') },
      {
        slug: 'services-cleaning',
        name: 'Уборка',
        itemLabel: 'Услуга',
        ...service('cleaningType'),
      },
      {
        slug: 'services-tutors',
        name: 'Репетиторы',
        itemLabel: 'Услуга',
        ...SERVICE,
        attributes: [{ key: 'subject', required: true }, 'grade', ...SERVICE_BASE],
        defaultPriceUnit: 'per_hour',
      },
      { slug: 'services-it', name: 'IT', itemLabel: 'Услуга', ...service('itService') },
      { slug: 'services-design', name: 'Дизайн', itemLabel: 'Услуга', ...service('designType') },
      {
        slug: 'services-legal',
        name: 'Юридические услуги',
        itemLabel: 'Услуга',
        ...service('legalService'),
      },
      {
        slug: 'services-events',
        name: 'Организация мероприятий',
        itemLabel: 'Услуга',
        ...service('eventType'),
      },
      { slug: 'services-other', name: 'Другое', itemLabel: 'Услуга', ...SERVICE },
    ],
  },
  {
    slug: 'job',
    name: 'Работа',
    children: [
      { slug: 'job-vacancies', name: 'Вакансии', itemLabel: 'Вакансия', ...VACANCY },
      { slug: 'job-resume', name: 'Ищу работу', itemLabel: 'Резюме', ...RESUME },
      // Подработка, «без опыта», удалёнка и стажировки — не отдельные доски, а
      // вакансии с готовым фильтром: иначе одна и та же вакансия подаётся в
      // три места, а соискатель не знает, куда смотреть. Поданные туда раньше
      // объявления переносит scripts/migrate-listings-v2 с нужным признаком
      {
        slug: 'job-parttime',
        name: 'Подработка',
        itemLabel: 'Подработка',
        shortcut: { category: 'job-vacancies', attributes: { employment: 'temporary' } },
        ...JOB_SHORTCUT,
      },
      {
        slug: 'job-no-experience',
        name: 'Работа без опыта',
        itemLabel: 'Вакансия',
        shortcut: { category: 'job-vacancies', attributes: { experience: 'none' } },
        ...JOB_SHORTCUT,
      },
      {
        slug: 'job-remote',
        name: 'Удалённая работа',
        itemLabel: 'Вакансия',
        shortcut: { category: 'job-vacancies', attributes: { remote: true } },
        ...JOB_SHORTCUT,
      },
      {
        slug: 'job-internship',
        name: 'Стажировки',
        itemLabel: 'Стажировка',
        shortcut: { category: 'job-vacancies', attributes: { employment: 'internship' } },
        ...JOB_SHORTCUT,
      },
    ],
  },
  {
    slug: 'animals',
    name: 'Животные',
    children: [
      { slug: 'animals-dogs', name: 'Собаки', itemLabel: 'Собака', ...PET },
      { slug: 'animals-cats', name: 'Кошки', itemLabel: 'Кошка', ...PET },
      { slug: 'animals-birds', name: 'Птицы', itemLabel: 'Птица', ...PET },
      { slug: 'animals-fish', name: 'Рыбки', itemLabel: 'Рыбки', ...PET },
      {
        slug: 'animals-livestock',
        name: 'Сельхозживотные',
        itemLabel: 'Животное',
        ...PET,
        attributes: [
          { key: 'livestockKind', required: true },
          'breed',
          'animalAge',
          'sex',
          'quantity',
          'vaccinated',
          'documents',
        ],
        priceUnits: ['total', 'per_unit'],
      },
      { slug: 'animals-other', name: 'Другие животные', itemLabel: 'Животное', ...PET },
      {
        slug: 'animals-goods',
        name: 'Товары для животных',
        itemLabel: 'Товар',
        ...GOODS,
        ...SALE_ONLY,
      },
      // «Вязка» и «Отдам» — сделка, а не вид животного: ярлыки на весь раздел
      // с готовым фильтром. Само животное подаётся в свой вид со сделкой
      {
        slug: 'animals-mating',
        name: 'Вязка',
        itemLabel: 'Объявление',
        ...PET,
        attributes: [],
        shortcut: { category: 'animals', transactionType: 'mating' },
        transactions: ['mating'],
        defaultTransaction: 'mating',
      },
      {
        slug: 'animals-free',
        name: 'Отдам',
        itemLabel: 'Животное',
        ...PET,
        attributes: [],
        shortcut: { category: 'animals', transactionType: 'free' },
        transactions: ['free'],
        defaultTransaction: 'free',
      },
    ],
  },
  {
    slug: 'hobby',
    name: 'Хобби и отдых',
    children: [
      {
        slug: 'hobby-sport',
        name: 'Спорт',
        itemLabel: 'Товар',
        attributes: SPORT_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'hobby-tourism',
        name: 'Туризм',
        itemLabel: 'Товар',
        attributes: BRANDED_GOODS_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'hobby-fishing',
        name: 'Рыбалка',
        itemLabel: 'Товар',
        attributes: BRANDED_GOODS_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'hobby-hunting',
        name: 'Охота',
        itemLabel: 'Товар',
        attributes: BRANDED_GOODS_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'hobby-games',
        name: 'Игры',
        itemLabel: 'Игра',
        attributes: GAMES_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'hobby-music',
        name: 'Музыкальные инструменты',
        itemLabel: 'Инструмент',
        attributes: MUSIC_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'hobby-collections',
        name: 'Коллекционирование',
        itemLabel: 'Предмет',
        ...GOODS,
        ...SALE_ONLY,
      },
      {
        slug: 'hobby-books',
        name: 'Книги',
        itemLabel: 'Книга',
        attributes: BOOKS_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'hobby-bikes',
        name: 'Велосипеды и самокаты',
        itemLabel: 'Велосипед',
        attributes: BIKE_ATTRIBUTES,
        ...RENTAL_DEAL,
      },
      {
        slug: 'hobby-outdoor',
        name: 'Туристическое снаряжение',
        itemLabel: 'Снаряжение',
        attributes: BRANDED_GOODS_ATTRIBUTES,
        ...RENTAL_DEAL,
      },
    ],
  },
  {
    slug: 'business',
    name: 'Бизнес и оборудование',
    children: [
      {
        slug: 'business-equipment',
        name: 'Оборудование',
        itemLabel: 'Оборудование',
        attributes: EQUIPMENT_ATTRIBUTES,
        ...RENTAL_DEAL,
      },
      partsLeaf('other_equipment'),
      {
        slug: 'business-retail',
        name: 'Торговое оборудование',
        itemLabel: 'Оборудование',
        attributes: EQUIPMENT_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'business-production',
        name: 'Производство',
        itemLabel: 'Оборудование',
        attributes: EQUIPMENT_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'business-agro',
        name: 'Сельхозтехника',
        itemLabel: 'Техника',
        attributes: SPECIAL_ATTRIBUTES,
        ...VEHICLE_DEAL,
      },
      {
        slug: 'business-tools',
        name: 'Инструмент',
        itemLabel: 'Инструмент',
        attributes: TOOLS_ATTRIBUTES,
        ...SALE_ONLY,
      },
      {
        slug: 'business-ready',
        name: 'Готовый бизнес',
        itemLabel: 'Бизнес',
        attributes: READY_BUSINESS_ATTRIBUTES,
        priceUnits: ['total'],
        ...SALE_ONLY,
        cardLayout: 'list',
      },
      {
        slug: 'business-franchise',
        name: 'Франшизы',
        itemLabel: 'Франшиза',
        attributes: [{ key: 'businessSphere', required: true }],
        priceUnits: ['total'],
        ...SALE_ONLY,
        cardLayout: 'list',
      },
      {
        slug: 'business-goods',
        name: 'Товары для бизнеса',
        itemLabel: 'Товар',
        ...GOODS,
        ...SALE_ONLY,
      },
      {
        slug: 'business-rent',
        name: 'Аренда оборудования',
        itemLabel: 'Оборудование',
        // Не отдельная категория, а ярлык в «Оборудовании» с готовой сделкой:
        // иначе один и тот же станок заводится дважды, а поиск разбегается.
        // Объявления, поданные сюда раньше, переносит миграция
        // 20261002120000_listing_operations
        shortcut: { category: 'business-equipment', transactionType: 'rent' },
        transactions: ['rent'],
        defaultTransaction: 'rent',
        priceUnits: ['per_hour', 'per_day', 'per_week', 'per_month'],
        defaultPriceUnit: 'per_day',
      },
    ],
  },
];

export const SEED_LISTING_CATEGORIES: readonly SeedListingCategory[] = FLAT_TREE.map(withMainTypes);

/**
 * Подкатегории вещей — там, где у покупателя есть вопрос «как забрать».
 * У недвижимости, работы, услуг, живых животных и готового бизнеса его нет.
 */
const GOODS_PREFIXES = ['electronics-', 'home-', 'personal-', 'hobby-'] as const;
const GOODS_SLUGS: readonly string[] = [
  // Подкатегории запчастей всех типов техники (реестр PARTS_EQUIPMENT)
  ...PARTS_EQUIPMENT.map((equipment) => equipment.slug),
  // Направления основных типов (аксессуары, шины, экипировка…) — тоже вещи
  ...GOODS_DIRECTION_SLUGS(),
  'transport-parts',
  'animals-goods',
  'business-equipment',
  'business-retail',
  'business-production',
  'business-agro',
  'business-tools',
  'business-goods',
];

function GOODS_DIRECTION_SLUGS(): string[] {
  return MAIN_TYPES.flatMap((type) => type.directions).filter((slug) =>
    Boolean(goodsDirectionBySlug(slug)),
  );
}

export function isGoodsCategory(slug: string): boolean {
  return GOODS_SLUGS.includes(slug) || GOODS_PREFIXES.some((prefix) => slug.startsWith(prefix));
}

/**
 * Привязки категории в едином виде: строка → { key }. У вещей в конец
 * добавляется «Получение» (самовывоз, доставка) — одним правилом, а не
 * строкой в каждом из шестидесяти наборов.
 */
export function bindingsOf(category: SeedListingCategory): CategoryAttributeBinding[] {
  const bindings = (category.attributes ?? []).map((item) =>
    typeof item === 'string' ? { key: item } : item,
  );
  const ownSet = bindings.length > 0 && !category.shortcut && !category.deprecatedTo;
  if (ownSet && isGoodsCategory(category.slug) && !bindings.some((b) => b.key === 'delivery')) {
    bindings.push({ key: 'delivery' });
  }
  return bindings;
}

/** Все категории плоским списком с родителем — для заполнения базы и тестов. */
export function flattenSeedCategories(): {
  category: SeedListingCategory;
  parentSlug: string | null;
}[] {
  const result: { category: SeedListingCategory; parentSlug: string | null }[] = [];
  const visit = (category: SeedListingCategory, parentSlug: string | null): void => {
    result.push({ category, parentSlug });
    for (const child of category.children ?? []) visit(child, category.slug);
  };
  for (const root of SEED_LISTING_CATEGORIES) visit(root, null);
  return result;
}

/** Категория из исходника по коду — для тестов и скриптов. */
export function findSeedCategory(slug: string): SeedListingCategory | null {
  return flattenSeedCategories().find((item) => item.category.slug === slug)?.category ?? null;
}
