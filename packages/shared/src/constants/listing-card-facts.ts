import { describeAttribute, type ListingAttribute } from './listing-attributes.js';
import { goodsDirectionBySlug } from './catalog/goods-directions.js';
import { partStateLabel } from './parts/part-state.js';
import { TRANSACTION_CREATE_LABELS } from './transactions.js';

/**
 * Характеристики для карточки: из строки сервера — короткий список без шума.
 *
 * Сервер собирает строку по полям с showInCard, и в ней бывает то, что в
 * карточке только мешает: «Продам» (цена и так говорит, что это продажа;
 * сдача — «Сдам надолго» — остаётся) и марка с моделью, которые уже написаны
 * в заголовке («Chery Tiggo 8» и тут же «Chery · Tiggo 8»). Пользователь
 * должен получить максимум нового, не открывая объявление.
 */

/** Подписи операции, которые цена и единица уже выражают. */
const ROUTINE_OPERATIONS: ReadonlySet<string> = new Set([
  TRANSACTION_CREATE_LABELS.sale,
  TRANSACTION_CREATE_LABELS.rent,
  'Сдам',
  'Сдам посуточно',
  'Сдам надолго',
]);

/** «Ё» и регистр не должны мешать сравнению: «Тойота» = «тойота». */
function plain(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** Сколько характеристик умещается: до четырёх в обоих видах (в плитке — в две строки). */
export const CARD_FACTS_LIMIT = { grid: 4, list: 4 } as const;

export function cardFacts(summary: string, title: string, max: number): string[] {
  const inTitle = plain(title);
  const seen = new Set<string>();
  const facts: string[] = [];

  for (const raw of summary.split(' · ')) {
    const fact = raw.trim();
    const key = plain(fact);
    if (!fact || seen.has(key)) continue;
    seen.add(key);

    // Продажа и аренда — не характеристика: об операции уже говорит цена и её
    // единица («₽» или «₽/сут»). Остаются «Отдам бесплатно» и «Вязка» — у них
    // цены нет, и подпись нужна
    if (ROUTINE_OPERATIONS.has(fact)) continue;
    // Уже сказано в заголовке. Короткое («3», «4x4») в нём находится
    // случайно, поэтому сравниваем от трёх знаков
    if (key.length >= 3 && inTitle.includes(key)) continue;

    facts.push(fact);
    if (facts.length >= max) break;
  }

  return facts;
}

/**
 * Что в карточке главное. У товара и квартиры — цена, у вакансии — должность:
 * на вакансию смотрят «кто и кого ищет», а зарплата идёт следом.
 */
export type CardEmphasis = 'price' | 'title';

const TITLE_FIRST_SECTIONS = new Set(['job']);

export function cardEmphasis(categorySlug: string): CardEmphasis {
  // Код подкатегории начинается с кода раздела: «job-vacancies» → «job»
  const section = categorySlug.split('-')[0] ?? '';
  return TITLE_FIRST_SECTIONS.has(section) ? 'title' : 'price';
}

// ─────────────────────────────────────────────────────────────────────────────
//  Что показывать в карточке: приоритеты по категориям
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Одна характеристика карточки: ключ поля или несколько ключей, которые
 * читаются вместе одним словом («Chery» + «Tiggo 8» → «Chery Tiggo 8»).
 */
export type CardFactSpec =
  | string
  | readonly string[]
  | {
      keys: readonly string[];
      /** Не показывать, если другое поле уже сказало то же: «Удалённо» в графике и флажок «Удалённая работа» */
      unless?: Readonly<Record<string, unknown>>;
      /** Своя подпись для пары полей: состояние и тип детали — «Б/У оригинал» */
      format?: 'partState';
    };

const MODEL: CardFactSpec = ['brand', 'modelName'];
const BRAND_MODEL: CardFactSpec = ['brand', 'model'];
const LOOSE_MODEL: CardFactSpec = ['brandName', 'modelName'];
// Производитель и «Новый аналог» — состояние и тип одной строкой; следом
// сервер ставит номер и коротко «Подходит к». Сама деталь — в заголовке
// и на странице объявления: в карточке место нужнее номеру и совместимости
const PART_FACTS: readonly CardFactSpec[] = [
  'partManufacturer',
  { keys: ['partCondition', 'partOriginality'], format: 'partState' },
];

/**
 * Приоритетные характеристики по категориям, от важной к менее важной.
 *
 * Карточка — для быстрого сравнения, а не анкета: у квартиры площадь,
 * комнаты, этаж, а не отопление и материал стен; у автомобиля марка с
 * моделью, год, пробег, а не VIN. Список читается слева направо: первые три
 * видны на главной, четыре — в поиске; всё остальное — на странице
 * объявления. Ключ, которого у категории нет или который не заполнен,
 * пропускается. Нет записи — работает прежний набор по флагу «в карточке».
 *
 * Ключ — код подкатегории; для остальных можно задать раздел («services»).
 */
export const CARD_FACTS: Readonly<Record<string, readonly CardFactSpec[]>> = {
  // Транспорт
  'transport-cars': [BRAND_MODEL, 'year', 'mileage', 'engineVolume', 'fuel', 'drive'],
  'transport-moto': [BRAND_MODEL, 'year', 'engineCc', 'mileage'],
  'transport-trucks': [BRAND_MODEL, 'year', 'loadCapacity', 'mileage'],
  'transport-special': ['specialType', BRAND_MODEL, 'year', 'hours'],
  // Запчасти всех типов техники: деталь, производитель, состояние и тип.
  // Совместимость и номер — отдельным слоем, их добавляет сервер (см. summaryFor)
  'transport-parts': PART_FACTS,
  'transport-moto-parts': PART_FACTS,
  'transport-truck-parts': PART_FACTS,
  'transport-special-parts': PART_FACTS,
  'transport-water-parts': PART_FACTS,
  'electronics-phone-parts': PART_FACTS,
  'electronics-tablet-parts': PART_FACTS,
  'electronics-laptop-parts': PART_FACTS,
  'electronics-tv-parts': PART_FACTS,
  'home-appliance-parts': PART_FACTS,
  'home-climate-parts': PART_FACTS,
  'business-parts': PART_FACTS,
  'transport-tires': ['diameter', 'season', 'tireType', 'brand', 'condition'],
  'transport-water': ['waterType', MODEL, 'year', 'length'],
  'transport-other': [LOOSE_MODEL, 'year', 'condition'],

  // Недвижимость
  'realty-flats': ['areaTotal', 'rooms', 'floor', 'sellerType'],
  'realty-rooms': ['areaTotal', 'roomsInFlat', 'floor', 'sellerType'],
  'realty-houses': ['areaTotal', 'landArea', 'floorsTotal', 'sellerType'],
  'realty-country': ['areaTotal', 'landArea', 'floorsTotal', 'sellerType'],
  'realty-land': ['landArea', 'landPurpose', 'sellerType'],
  'realty-commercial': ['commercialType', 'areaTotal', 'floor', 'separateEntrance'],
  'realty-garages': ['garageType', 'areaTotal', 'sellerType'],

  // Электроника
  'electronics-phones': [BRAND_MODEL, 'memory', 'condition', 'battery'],
  'electronics-tablets': [BRAND_MODEL, 'screenSize', 'memory', 'condition'],
  'electronics-laptops': [BRAND_MODEL, 'screenSize', 'ram', 'storageSize', 'cpu'],
  'electronics-computers': ['brand', 'cpu', 'ram', 'storageSize'],
  'electronics-components': PART_FACTS,
  'electronics-tv': [MODEL, 'screenSize', 'resolution', 'smartTv'],
  'electronics-photo': ['photoType', BRAND_MODEL, 'condition'],
  'electronics-console': ['consoleType', 'storageSize', 'condition'],
  'electronics-audio': ['audioType', MODEL, 'condition'],
  'electronics-watches': [BRAND_MODEL, 'condition', 'color'],
  'electronics-accessories': ['accessoryType', 'brandName', 'condition'],

  // Дом
  'home-furniture': ['furnitureType', 'color', 'condition'],
  'home-appliances': ['applianceType', MODEL, 'condition'],
  'home-light': ['lightType', 'brandName', 'condition'],
  'home-materials': ['materialType', 'quantity', 'condition'],
  'home-tools': ['toolType', 'brand', 'condition'],
  'home-plumbing': ['plumbingType', 'brandName', 'condition'],
  'home-doors': ['doorsType', 'material', 'condition'],

  // Личные вещи
  'personal-clothes': ['clothesType', 'size', 'condition', 'brandName'],
  'personal-shoes': ['shoeSize', 'gender', 'condition', 'brandName'],
  'personal-accessories': ['brandName', 'gender', 'condition'],
  'personal-bags': ['brandName', 'gender', 'condition'],
  'personal-watches': ['brandName', 'gender', 'condition'],
  'personal-jewelry': ['jewelryType', 'jewelryMaterial', 'condition'],
  'personal-kids-clothes': ['clothesType', 'size', 'kidsAge', 'condition'],
  'personal-kids-goods': ['kidsGoodsType', 'kidsAge', 'condition'],
  'personal-beauty': ['brandName', 'condition'],
  'personal-sport': ['sportType', 'brandName', 'condition'],

  // Услуги: вид услуги, формат («выезд к заказчику»), опыт
  services: [
    'repairType',
    'buildingWork',
    'autoService',
    'beautyService',
    'photoService',
    'deliveryType',
    'movingType',
    'cleaningType',
    'subject',
    'itService',
    'designType',
    'legalService',
    'eventType',
    'serviceFormat',
    'experienceYears',
  ],

  // Работа: должность — в заголовке, зарплата — в цене
  'job-vacancies': [
    'employment',
    'schedule',
    'experience',
    { keys: ['remote'], unless: { schedule: 'remote' } },
  ],
  'job-resume': ['experienceYears', 'employment', 'education', 'remote'],

  // Животные
  'animals-livestock': ['livestockKind', 'breed', 'animalAge'],
  animals: ['breed', 'animalAge', 'sex'],

  // Хобби
  'hobby-sport': ['sportType', 'brandName', 'condition'],
  'hobby-games': ['gamesType', 'condition'],
  'hobby-music': ['instrumentType', 'brandName', 'condition'],
  'hobby-books': ['author', 'condition'],
  'hobby-bikes': ['bikeType', 'brand', 'wheelDiameter', 'condition'],
  hobby: ['brandName', 'condition'],

  // Бизнес
  'business-agro': ['specialType', BRAND_MODEL, 'year', 'hours'],
  'business-ready': ['businessSphere', 'monthlyRevenue', 'staffCount'],
  'business-franchise': ['businessSphere'],
  business: ['equipmentType', 'toolType', 'brand', 'brandName', 'condition'],
};

/** Приоритеты категории: сама подкатегория, затем её раздел; нет — null. */
/** Приоритеты направлений основных типов, у которых свои поля (не только «тип, бренд, состояние»). */
const DIRECTION_FACTS: Readonly<Record<string, readonly CardFactSpec[]>> = {
  'transport-moto-tires': ['diameter', 'season', 'tireType', 'brand', 'condition'],
  'transport-truck-tires': ['diameter', 'season', 'tireType', 'brand', 'condition'],
  'transport-car-seats': ['goodsType', 'seatGroup', 'isofix', 'condition'],
  'transport-batteries': ['goodsType', 'batteryCapacity', 'batteryCurrent', 'batteryPolarity'],
  'transport-car-chemicals': ['goodsType', 'volumeLiters', 'brandName'],
  'transport-trailers': ['goodsType', 'year', 'loadCapacity', 'condition'],
  'transport-water-engines': ['goodsType', 'power', 'year', 'condition'],
  'transport-water-outboards': ['goodsType', 'power', 'year', 'condition'],
  'transport-moto-gear': ['goodsType', 'size', 'brandName', 'condition'],
  'electronics-monitors': ['goodsType', 'screenSize', 'brandName', 'condition'],
  'home-climate-ac': ['goodsType', 'serviceArea', 'inverter', 'brandName'],
  'home-climate-heaters': ['goodsType', 'serviceArea', 'brandName', 'condition'],
  'home-climate-purifiers': ['goodsType', 'serviceArea', 'brandName', 'condition'],
};

export function cardFactSpecs(categorySlug: string): readonly CardFactSpec[] | null {
  const section = categorySlug.split('-')[0] ?? '';
  const own = CARD_FACTS[categorySlug] ?? DIRECTION_FACTS[categorySlug];
  if (own) return own;
  // Остальные направления: тип товара, бренд, состояние
  const direction = goodsDirectionBySlug(categorySlug);
  if (direction) {
    return [...(direction.typeKey ? [direction.typeKey] : []), 'brandName', 'condition'];
  }
  return CARD_FACTS[section] ?? null;
}

/** Все ключи приоритетов категории одним списком — для экрана фильтров. */
export function cardFactKeys(categorySlug: string): string[] {
  const specs = cardFactSpecs(categorySlug);
  if (!specs) return [];
  return specs.flatMap((spec) =>
    typeof spec === 'string'
      ? [spec]
      : Array.isArray(spec)
        ? (spec as readonly string[])
        : (spec as { keys: readonly string[] }).keys,
  );
}

/**
 * Строка характеристик для карточки: до `limit` значений в порядке
 * приоритета категории, через « · ». Возвращает null, если для категории
 * приоритеты не заданы — тогда вызывающий берёт прежний набор по флагам.
 */
export function describeCardFacts(
  categorySlug: string,
  attributes: readonly ListingAttribute[],
  values: Record<string, unknown>,
  dictionaryLabels?: Readonly<Record<string, string>>,
  limit: number = CARD_FACTS_LIMIT.list,
): string | null {
  const specs = cardFactSpecs(categorySlug);
  if (!specs) return null;

  const byKey = new Map(attributes.map((attribute) => [attribute.key, attribute]));
  const facts: string[] = [];

  for (const spec of specs) {
    const detailed =
      typeof spec === 'object' && !Array.isArray(spec)
        ? (spec as {
            keys: readonly string[];
            unless?: Readonly<Record<string, unknown>>;
            format?: 'partState';
          })
        : null;
    const keys =
      typeof spec === 'string' ? [spec] : detailed ? detailed.keys : (spec as readonly string[]);
    if (detailed?.unless) {
      const repeated = Object.entries(detailed.unless).some(
        ([key, value]) => values[key] === value,
      );
      if (repeated) continue;
    }
    if (detailed?.format === 'partState') {
      const state = partStateLabel(values.partCondition, values.partOriginality);
      if (state) facts.push(state);
      if (facts.length >= limit) break;
      continue;
    }
    const words: string[] = [];
    for (const key of keys) {
      const attribute = byKey.get(key);
      const text = attribute ? describeAttribute(attribute, values, dictionaryLabels) : null;
      if (text) words.push(text);
    }
    if (words.length === 0) continue;
    facts.push(words.join(' '));
    if (facts.length >= limit) break;
  }

  return facts.join(' · ');
}
