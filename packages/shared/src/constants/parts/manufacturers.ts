import type { PartsEquipmentTypeCode } from './equipment-types.js';

/**
 * Производители деталей: тот, кто сделал запчасть (Denso, Bosch, KYB…).
 * Не путать с маркой техники (Toyota Succeed) — это разные поля, хотя
 * названия иногда совпадают: оригинальную деталь для Toyota делает Toyota.
 * «Оригинал / аналог» и состояние — отдельные поля: тип детали НЕ выводится
 * из производителя.
 *
 * Справочник один на все типы техники (`part_manufacturer`), а `equipment`
 * говорит, где производитель уместен: в форме и фильтре автозапчастей нет
 * Indesit, а у запчастей стиральных машин — KYB. Новый производитель —
 * одна строка здесь (или запись справочника из панели) без изменения схемы.
 */
export interface PartManufacturerSeed {
  value: string;
  label: string;
  aliases?: readonly string[];
  /**
   * Типы техники, к которым производитель относится. Первый — основной: по
   * нему умный поиск выбирает раздел, когда кроме производителя ничего не
   * названо («новая Denso»). Пусто — уместен везде.
   */
  equipment?: readonly PartsEquipmentTypeCode[];
  /**
   * Название — ещё и марка самой техники (Toyota, Samsung, LG). Во фразе
   * поиска такое слово читается как техника («рейка Toyota» — для Toyota),
   * а не как производитель детали: иначе «рейка тойота» искала бы только
   * детали производства Toyota. Производителя Toyota выбирают в фильтре.
   */
  machineBrand?: boolean;
}

const CAR: readonly PartsEquipmentTypeCode[] = ['passenger_car'];
const CAR_TRUCK: readonly PartsEquipmentTypeCode[] = ['passenger_car', 'truck'];
const CAR_MOTO: readonly PartsEquipmentTypeCode[] = ['passenger_car', 'moto'];
const AUTO: readonly PartsEquipmentTypeCode[] = ['passenger_car', 'truck', 'special_equipment'];
const VEHICLE: readonly PartsEquipmentTypeCode[] = [
  'passenger_car',
  'truck',
  'special_equipment',
  'moto',
  'water_transport',
];
const PC: readonly PartsEquipmentTypeCode[] = ['computer', 'laptop'];
const APPLIANCE: readonly PartsEquipmentTypeCode[] = ['home_appliance'];

export const PART_MANUFACTURERS: readonly PartManufacturerSeed[] = [
  // Производители техники, делающие оригинальные детали
  {
    value: 'toyota',
    label: 'Toyota',
    aliases: ['тойота', 'toyota genuine'],
    equipment: CAR_TRUCK,
    machineBrand: true,
  },
  { value: 'lexus', label: 'Lexus', aliases: ['лексус'], equipment: CAR, machineBrand: true },
  {
    value: 'nissan',
    label: 'Nissan',
    aliases: ['ниссан'],
    equipment: CAR_TRUCK,
    machineBrand: true,
  },
  { value: 'honda', label: 'Honda', aliases: ['хонда'], equipment: CAR_MOTO, machineBrand: true },
  { value: 'mazda', label: 'Mazda', aliases: ['мазда'], equipment: CAR, machineBrand: true },
  {
    value: 'mitsubishi',
    label: 'Mitsubishi',
    aliases: ['мицубиси', 'митсубиси'],
    equipment: CAR_TRUCK,
    machineBrand: true,
  },
  { value: 'subaru', label: 'Subaru', aliases: ['субару'], equipment: CAR, machineBrand: true },
  {
    value: 'suzuki',
    label: 'Suzuki',
    aliases: ['сузуки'],
    equipment: CAR_MOTO,
    machineBrand: true,
  },
  {
    value: 'hyundai_mobis',
    label: 'Hyundai Mobis',
    aliases: ['мобис', 'mobis'],
    equipment: CAR_TRUCK,
    machineBrand: true,
  },
  { value: 'bmw', label: 'BMW', aliases: ['бмв'], equipment: CAR_MOTO, machineBrand: true },
  {
    value: 'mercedes',
    label: 'Mercedes-Benz',
    aliases: ['мерседес', 'mercedes'],
    equipment: CAR_TRUCK,
    machineBrand: true,
  },
  { value: 'vag', label: 'VAG', aliases: ['ваг', 'vw group'], equipment: CAR, machineBrand: true },
  { value: 'ford', label: 'Ford', aliases: ['форд'], equipment: CAR_TRUCK, machineBrand: true },
  {
    value: 'gm',
    label: 'GM',
    aliases: ['дженерал моторс', 'general motors'],
    equipment: CAR,
    machineBrand: true,
  },
  {
    value: 'lada',
    label: 'LADA / АвтоВАЗ',
    aliases: ['лада', 'ваз', 'автоваз'],
    equipment: CAR,
    machineBrand: true,
  },
  { value: 'gaz', label: 'ГАЗ', aliases: ['газ'], equipment: CAR_TRUCK, machineBrand: true },
  { value: 'kamaz', label: 'КАМАЗ', aliases: ['камаз'], equipment: ['truck'], machineBrand: true },
  // Поставщики автокомплектующих
  { value: 'denso', label: 'Denso', aliases: ['денсо'], equipment: VEHICLE },
  { value: 'aisin', label: 'AISIN', aliases: ['айсин'], equipment: CAR_TRUCK },
  { value: 'advics', label: 'Advics', aliases: ['адвикс'], equipment: CAR },
  { value: 'bosch', label: 'Bosch', aliases: ['бош'], equipment: VEHICLE },
  { value: 'trw', label: 'TRW', aliases: ['трв'], equipment: CAR_TRUCK },
  { value: 'zf', label: 'ZF', equipment: AUTO },
  {
    value: 'kyb',
    label: 'KYB',
    aliases: ['кяб', 'каяба', 'кайаба'],
    equipment: ['passenger_car', 'truck', 'moto'],
  },
  { value: 'ctr', label: 'CTR', aliases: ['цтр'], equipment: CAR },
  { value: 'masuma', label: 'Masuma', aliases: ['масума'], equipment: CAR },
  {
    value: 'sachs',
    label: 'Sachs',
    aliases: ['закс', 'сакс'],
    equipment: ['passenger_car', 'truck', 'moto'],
  },
  { value: 'monroe', label: 'Monroe', aliases: ['монро'], equipment: CAR },
  { value: 'bilstein', label: 'Bilstein', aliases: ['бильштайн', 'билштейн'], equipment: CAR },
  { value: 'tokico', label: 'Tokico', aliases: ['токико'], equipment: CAR },
  {
    value: 'lemforder',
    label: 'Lemförder',
    aliases: ['лемфердер', 'лемфордер', 'lemfoerder'],
    equipment: CAR_TRUCK,
  },
  { value: 'febi', label: 'Febi', aliases: ['феби', 'febi bilstein'], equipment: CAR_TRUCK },
  { value: 'moog', label: 'Moog', aliases: ['муг'], equipment: CAR },
  { value: 'febest', label: 'Febest', aliases: ['фебест'], equipment: CAR },
  { value: 'mando', label: 'Mando', aliases: ['мандо'], equipment: CAR },
  { value: 'gmb', label: 'GMB', aliases: ['гмб'], equipment: CAR_TRUCK },
  { value: 'exedy', label: 'Exedy', aliases: ['экседи'], equipment: CAR_TRUCK },
  { value: 'valeo', label: 'Valeo', aliases: ['валео'], equipment: CAR_TRUCK },
  { value: 'hella', label: 'Hella', aliases: ['хелла'], equipment: VEHICLE },
  { value: 'osram', label: 'Osram', aliases: ['осрам'], equipment: VEHICLE },
  {
    value: 'philips',
    label: 'Philips',
    aliases: ['филипс'],
    equipment: [...VEHICLE, 'tv', 'home_appliance'],
    machineBrand: true,
  },
  { value: 'ngk', label: 'NGK', aliases: ['нгк'], equipment: VEHICLE },
  { value: 'gates', label: 'Gates', aliases: ['гейтс'], equipment: VEHICLE },
  { value: 'dayco', label: 'Dayco', aliases: ['дайко'], equipment: CAR_TRUCK },
  { value: 'skf', label: 'SKF', equipment: VEHICLE },
  { value: 'nsk', label: 'NSK', equipment: VEHICLE },
  { value: 'ntn', label: 'NTN', equipment: VEHICLE },
  { value: 'koyo', label: 'Koyo', aliases: ['койо'], equipment: VEHICLE },
  { value: 'ina', label: 'INA', aliases: ['ина'], equipment: CAR_TRUCK },
  { value: 'mahle', label: 'Mahle', aliases: ['мале', 'махле'], equipment: VEHICLE },
  { value: 'mann', label: 'Mann-Filter', aliases: ['манн', 'mann'], equipment: AUTO },
  { value: 'brembo', label: 'Brembo', aliases: ['брембо'], equipment: CAR_MOTO },
  { value: 'ate', label: 'ATE', aliases: ['ате'], equipment: CAR },
  { value: 'ferodo', label: 'Ferodo', aliases: ['феродо'], equipment: CAR_MOTO },
  { value: 'textar', label: 'Textar', aliases: ['текстар'], equipment: CAR_TRUCK },
  { value: 'delphi', label: 'Delphi', aliases: ['делфи'], equipment: CAR_TRUCK },
  { value: 'continental', label: 'Continental', aliases: ['континенталь'], equipment: CAR_TRUCK },
  {
    value: 'magneti_marelli',
    label: 'Magneti Marelli',
    aliases: ['маренелли', 'марелли'],
    equipment: CAR_MOTO,
  },
  { value: 'sakura', label: 'Sakura', aliases: ['сакура'], equipment: CAR_TRUCK },
  { value: 'jet', label: 'Jet', equipment: CAR },
  // Электроника и компьютеры
  {
    value: 'apple',
    label: 'Apple',
    aliases: ['эпл', 'эппл'],
    equipment: ['phone', 'tablet', 'laptop', 'computer'],
    machineBrand: true,
  },
  {
    value: 'samsung',
    label: 'Samsung',
    aliases: ['самсунг'],
    equipment: [
      'phone',
      'tablet',
      'tv',
      'laptop',
      'computer',
      'home_appliance',
      'climate_equipment',
    ],
    machineBrand: true,
  },
  {
    value: 'xiaomi',
    label: 'Xiaomi',
    aliases: ['сяоми', 'ксиаоми'],
    equipment: ['phone', 'tablet', 'laptop', 'tv', 'home_appliance'],
    machineBrand: true,
  },
  {
    value: 'huawei',
    label: 'Huawei',
    aliases: ['хуавей'],
    equipment: ['phone', 'tablet', 'laptop'],
    machineBrand: true,
  },
  {
    value: 'lg',
    label: 'LG',
    aliases: ['лж', 'элджи'],
    equipment: ['tv', 'phone', 'tablet', 'home_appliance', 'climate_equipment', 'computer'],
    machineBrand: true,
  },
  {
    value: 'sony',
    label: 'Sony',
    aliases: ['сони'],
    equipment: ['tv', 'phone', 'tablet', 'laptop'],
    machineBrand: true,
  },
  {
    value: 'lenovo',
    label: 'Lenovo',
    aliases: ['леново'],
    equipment: ['laptop', 'computer', 'phone', 'tablet'],
    machineBrand: true,
  },
  {
    value: 'asus',
    label: 'ASUS',
    aliases: ['асус'],
    equipment: [...PC, 'phone', 'tablet'],
    machineBrand: true,
  },
  { value: 'hp', label: 'HP', equipment: PC, machineBrand: true },
  { value: 'dell', label: 'Dell', aliases: ['делл'], equipment: PC, machineBrand: true },
  { value: 'acer', label: 'Acer', aliases: ['асер'], equipment: PC, machineBrand: true },
  { value: 'intel', label: 'Intel', aliases: ['интел'], equipment: PC },
  { value: 'amd', label: 'AMD', aliases: ['амд'], equipment: PC },
  { value: 'nvidia', label: 'NVIDIA', aliases: ['нвидиа', 'нвидия'], equipment: PC },
  { value: 'msi', label: 'MSI', equipment: PC, machineBrand: true },
  { value: 'gigabyte', label: 'Gigabyte', aliases: ['гигабайт'], equipment: PC },
  { value: 'kingston', label: 'Kingston', aliases: ['кингстон'], equipment: PC },
  { value: 'seagate', label: 'Seagate', aliases: ['сигейт'], equipment: PC },
  {
    value: 'western_digital',
    label: 'Western Digital',
    aliases: ['wd', 'вестерн диджитал'],
    equipment: PC,
  },
  // Бытовая и климатическая техника
  {
    value: 'bosch_home',
    label: 'Bosch (быт. техника)',
    aliases: ['bosch home'],
    equipment: APPLIANCE,
    machineBrand: true,
  },
  {
    value: 'indesit',
    label: 'Indesit',
    aliases: ['индезит'],
    equipment: APPLIANCE,
    machineBrand: true,
  },
  {
    value: 'electrolux',
    label: 'Electrolux',
    aliases: ['электролюкс'],
    equipment: APPLIANCE,
    machineBrand: true,
  },
  {
    value: 'whirlpool',
    label: 'Whirlpool',
    aliases: ['вирпул'],
    equipment: APPLIANCE,
    machineBrand: true,
  },
  { value: 'candy', label: 'Candy', aliases: ['канди'], equipment: APPLIANCE, machineBrand: true },
  {
    value: 'atlant',
    label: 'Атлант',
    aliases: ['atlant'],
    equipment: APPLIANCE,
    machineBrand: true,
  },
  {
    value: 'daikin',
    label: 'Daikin',
    aliases: ['дайкин'],
    equipment: ['climate_equipment'],
    machineBrand: true,
  },
  // Спецтехника, мото и водная техника
  {
    value: 'caterpillar',
    label: 'Caterpillar',
    aliases: ['катерпиллер', 'cat'],
    equipment: ['special_equipment', 'truck'],
    machineBrand: true,
  },
  {
    value: 'komatsu',
    label: 'Komatsu',
    aliases: ['комацу'],
    equipment: ['special_equipment'],
    machineBrand: true,
  },
  { value: 'jcb', label: 'JCB', equipment: ['special_equipment'], machineBrand: true },
  {
    value: 'hitachi',
    label: 'Hitachi',
    aliases: ['хитачи'],
    equipment: ['special_equipment', 'passenger_car'],
    machineBrand: true,
  },
  {
    value: 'kayaba',
    label: 'Kayaba',
    aliases: ['каяба гидравлика'],
    equipment: ['special_equipment', 'moto'],
  },
  {
    value: 'yamaha',
    label: 'Yamaha',
    aliases: ['ямаха'],
    equipment: ['moto', 'water_transport'],
    machineBrand: true,
  },
  {
    value: 'mercury',
    label: 'Mercury',
    aliases: ['меркури'],
    equipment: ['water_transport'],
    machineBrand: true,
  },
  {
    value: 'tohatsu',
    label: 'Tohatsu',
    aliases: ['тохатсу'],
    equipment: ['water_transport'],
    machineBrand: true,
  },
  // Без списка техники — уместен везде
  { value: 'other', label: 'Другой производитель', aliases: ['другой', 'неизвестный'] },
];

/** Производитель по коду. */
export function partManufacturerByValue(value: string): PartManufacturerSeed | undefined {
  return PART_MANUFACTURERS.find((item) => item.value === value);
}

/** Уместен ли производитель для этого типа техники: без списка — везде. */
export function manufacturerFitsEquipment(
  equipment: readonly string[] | undefined,
  code: string,
): boolean {
  return !equipment || equipment.length === 0 || equipment.includes(code);
}

/**
 * Подходит ли производитель к оригинальности детали. Оригинал — деталь
 * производителя самой техники (Toyota, Samsung…): список — марки техники.
 * Аналог — деталь стороннего производителя (KYB, Denso, Bosch…): список —
 * производители запчастей. Оригинальность не выбрана — подходят все.
 * Производитель, которого нет в реестре кода (добавлен из панели), не
 * скрывается: о нём ничего не известно.
 */
export function manufacturerFitsOriginality(value: string, originality: unknown): boolean {
  if (originality !== 'original' && originality !== 'analog') return true;
  const maker = partManufacturerByValue(value);
  if (!maker) return true;
  return originality === 'original' ? maker.machineBrand === true : maker.machineBrand !== true;
}
