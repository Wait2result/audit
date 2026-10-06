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

/**
 * Сколько характеристик в карточке: до четырёх в плитке (она узкая) и до
 * пяти в строке. Обычно их меньше: показывается только заполненное и важное.
 */
export const CARD_FACTS_LIMIT = { grid: 4, list: 5 } as const;

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
 * читаются вместе одним словом («1 ТБ» + «SSD» → «1 ТБ SSD»).
 */
export type CardFactSpec =
  | string
  | readonly string[]
  | {
      keys: readonly string[];
      /** Не показывать, если другое поле уже сказало то же: «Удалённо» в графике и флажок «Удалённая работа» */
      unless?: Readonly<Record<string, unknown>>;
      /** Своя подпись: «Б/У оригинал», «215/65 R16», «Аккумулятор 92%», «Размер M» */
      format?: CardFactFormat;
    };

/**
 * Подписи, которых нет у самих полей. Каждая — только из заполненного
 * значения: нет значения — нет и подписи, ничего не дорисовывается.
 */
export type CardFactFormat =
  | 'partState'
  | 'tireSize'
  | 'rimWidth'
  | 'rimEt'
  | 'battery'
  | 'size'
  | 'floors'
  | 'gpu'
  | 'cellular'
  | 'dimensions'
  | 'donor'
  | 'brandModel';

const SIZE: CardFactSpec = { keys: ['size'], format: 'size' };
/**
 * Марка и модель — только словами, которых нет в заголовке: «Toyota Succeed
 * 2015» — ничего, «Тойота» — «Toyota Camry», «Succeed 2015» — «Toyota».
 */
const BRAND_MODEL: CardFactSpec = { keys: ['brand', 'model'], format: 'brandModel' };
const BRAND_MODEL_NAME: CardFactSpec = { keys: ['brand', 'modelName'], format: 'brandModel' };
const CONDITION = 'condition';
// Производитель и «Б/У аналог» — состояние и тип одной строкой; следом
// сервер ставит основной номер и коротко «Подходит: …» (слой запчасти), а
// автомобиль-донор — последним и отдельно: «Снята с» не значит «подходит к»
const PART_FACTS: readonly CardFactSpec[] = [
  'partManufacturer',
  { keys: ['partCondition', 'partOriginality'], format: 'partState' },
];
// Габариты — там, где по ним выбирают: мебель, техника для кухни и ниши
const DIMENSIONS: CardFactSpec = { keys: ['dimensions'], format: 'dimensions' };

/**
 * Что показывать в карточке, по категориям — от важного к менее важному.
 *
 * Карточка отвечает на вопрос «что это и стоит ли открывать», а не
 * пересказывает анкету: у ноутбука процессор, видеокарта, память и
 * накопитель, у дивана — что это, размер и состояние, у квартиры — площадь,
 * комнаты и этаж. Показываются только заполненные поля, пропуски не
 * заполняются второстепенным; повтор того, что уже есть в заголовке (марка,
 * модель, год), карточка отбрасывает сама. Порты, Wi-Fi, цвет, материал,
 * комплектация — на странице объявления и в фильтрах, но не здесь.
 *
 * Ключ — код подкатегории или раздела («services»). Порядок важен: при
 * узкой карточке остаётся начало списка. Поля фильтров и страницы
 * объявления этот список не меняет: фильтр ≠ карточка.
 */
export const CARD_FACTS: Readonly<Record<string, readonly CardFactSpec[]>> = {
  // Транспорт: марка и модель — в заголовке, в карточке — то, чем машины различаются
  'transport-cars': [BRAND_MODEL, 'year', 'engineVolume', 'fuel', 'gearbox', 'drive', 'mileage'],
  'transport-moto': [BRAND_MODEL, 'motoType', 'year', 'engineCc', 'mileage', CONDITION],
  'transport-trucks': [BRAND_MODEL, 'truckType', 'year', 'loadCapacity', 'mileage', 'gearbox'],
  'transport-special': ['specialType', BRAND_MODEL, 'year', 'hours', CONDITION],
  // Запчасти всех типов техники. Номер и применяемость — слоем запчасти (summaryFor)
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
  'transport-water': ['waterType', 'year', 'length', 'hours', CONDITION],
  'transport-other': ['year', CONDITION],

  // Недвижимость: комнаты и площадь, этаж «5/9 эт.», новостройка — только если да
  'realty-flats': ['rooms', 'areaTotal', 'floor', 'newBuilding'],
  'realty-rooms': ['areaTotal', 'roomsInFlat', 'floor'],
  'realty-houses': ['areaTotal', 'landArea', { keys: ['floorsTotal'], format: 'floors' }, 'rooms'],
  'realty-country': ['areaTotal', 'landArea', { keys: ['floorsTotal'], format: 'floors' }],
  'realty-land': ['landArea', 'landPurpose', 'electricity', 'gas'],
  'realty-commercial': ['commercialType', 'areaTotal', 'floor', 'separateEntrance'],
  'realty-garages': ['garageType', 'areaTotal'],

  // Электроника: модель — в заголовке
  'electronics-phones': [
    BRAND_MODEL,
    'memory',
    CONDITION,
    { keys: ['battery'], format: 'battery' },
  ],
  'electronics-tablets': [
    BRAND_MODEL,
    'memory',
    'screenSize',
    { keys: ['cellular'], format: 'cellular' },
    CONDITION,
  ],
  'electronics-laptops': [
    BRAND_MODEL,
    'cpu',
    { keys: ['gpu'], format: 'gpu' },
    'ram',
    ['storageSize', 'storage'],
    'screenSize',
    CONDITION,
  ],
  'electronics-computers': [
    'cpu',
    { keys: ['gpu'], format: 'gpu' },
    'ram',
    ['storageSize', 'storage'],
    CONDITION,
  ],
  'electronics-components': PART_FACTS,
  'electronics-tv': [BRAND_MODEL_NAME, 'screenSize', 'resolution', 'smartTv', CONDITION],
  'electronics-photo': ['photoType', BRAND_MODEL, CONDITION],
  'electronics-console': ['consoleType', 'storageSize', CONDITION],
  'electronics-audio': ['audioType', 'wireless', CONDITION],
  'electronics-watches': [BRAND_MODEL, CONDITION],
  'electronics-accessories': ['accessoryType', CONDITION],

  // Дом: что это, размер, состояние
  'home-furniture': ['furnitureType', DIMENSIONS, CONDITION],
  'home-appliances': ['applianceType', BRAND_MODEL_NAME, DIMENSIONS, CONDITION],
  'home-light': ['lightType', CONDITION],
  'home-materials': ['materialType', 'quantity', CONDITION],
  'home-tools': ['toolType', CONDITION],
  'home-plumbing': ['plumbingType', CONDITION],
  'home-doors': ['doorsType', DIMENSIONS, CONDITION],

  // Личные вещи: размер и состояние; бренд — только если его нет в заголовке
  'personal-clothes': [SIZE, CONDITION, 'brandName'],
  'personal-shoes': [{ keys: ['shoeSize'], format: 'size' }, CONDITION, 'brandName'],
  'personal-accessories': [CONDITION, 'brandName'],
  'personal-bags': [CONDITION, 'brandName'],
  'personal-watches': [CONDITION, 'brandName'],
  'personal-jewelry': ['jewelryType', 'jewelryMaterial', CONDITION],
  'personal-kids-clothes': [SIZE, 'kidsAge', CONDITION],
  'personal-kids-goods': ['kidsGoodsType', 'kidsAge', DIMENSIONS, CONDITION],
  'personal-beauty': [CONDITION, 'brandName'],
  'personal-sport': ['sportType', CONDITION],

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

  // Животные: порода, возраст, пол и один статус
  'animals-livestock': ['livestockKind', 'breed', 'animalAge', 'sex', 'quantity'],
  'animals-goods': [CONDITION],
  animals: ['breed', 'animalAge', 'sex', 'vaccinated'],

  // Хобби
  'hobby-sport': ['sportType', CONDITION],
  'hobby-games': ['gamesType', CONDITION],
  'hobby-music': ['instrumentType', CONDITION],
  'hobby-books': ['author', CONDITION],
  'hobby-bikes': ['bikeType', 'wheelDiameter', CONDITION],
  hobby: [CONDITION],

  // Бизнес
  'business-agro': ['specialType', 'year', 'hours', CONDITION],
  'business-ready': ['businessSphere', 'monthlyRevenue', 'staffCount'],
  'business-franchise': ['businessSphere'],
  business: ['equipmentType', 'toolType', CONDITION],
};

/** Шины, диски и колёса — разные вещи: у каждой свой набор, по полю «Что продаётся». */
const WHEELS: readonly CardFactSpec[] = [
  { keys: ['tireWidth', 'tireProfile', 'diameter'], format: 'tireSize' },
  'season',
  'quantity',
  CONDITION,
];
const RIMS: readonly CardFactSpec[] = [
  'diameter',
  'pcd',
  { keys: ['rimWidth'], format: 'rimWidth' },
  { keys: ['rimEt'], format: 'rimEt' },
  'quantity',
  CONDITION,
];
const TIRE_VARIANTS = {
  key: 'tireType',
  variants: {
    tires: WHEELS,
    rims: RIMS,
    wheels: [
      { keys: ['tireWidth', 'tireProfile', 'diameter'], format: 'tireSize' },
      'pcd',
      'season',
      'quantity',
      CONDITION,
    ],
    hubcaps: ['diameter', 'quantity', CONDITION],
    wheel_accessories: [CONDITION],
  },
  fallback: WHEELS,
} as const satisfies CardFactVariants;

interface CardFactVariants {
  /** Поле, от значения которого зависит набор */
  key: string;
  variants: Readonly<Record<string, readonly CardFactSpec[]>>;
  /** Значение не выбрано или незнакомое */
  fallback: readonly CardFactSpec[];
}

/** Подкатегории, где набор зависит от типа товара. */
const CARD_FACT_VARIANTS: Readonly<Record<string, CardFactVariants>> = {
  'transport-tires': TIRE_VARIANTS,
  'transport-moto-tires': TIRE_VARIANTS,
  'transport-truck-tires': TIRE_VARIANTS,
};

/** Приоритеты направлений основных типов, у которых свои поля (не только «тип, бренд, состояние»). */
const DIRECTION_FACTS: Readonly<Record<string, readonly CardFactSpec[]>> = {
  'transport-car-seats': ['goodsType', 'childWeight', 'isofix', CONDITION],
  'transport-batteries': ['batteryCapacity', 'batteryCurrent', 'batteryPolarity', CONDITION],
  'transport-car-chemicals': ['goodsType', 'volumeLiters'],
  'transport-trailers': ['goodsType', 'year', 'loadCapacity', CONDITION],
  'transport-water-engines': ['goodsType', 'power', 'year', CONDITION],
  'transport-water-outboards': ['goodsType', 'power', 'year', CONDITION],
  'transport-moto-gear': ['goodsType', SIZE, CONDITION],
  'electronics-monitors': ['goodsType', 'screenSize', CONDITION],
  'home-climate-ac': ['goodsType', 'serviceArea', 'inverter', CONDITION],
  'home-climate-heaters': ['goodsType', 'serviceArea', CONDITION],
  'home-climate-purifiers': ['goodsType', 'serviceArea', CONDITION],
};

/**
 * Приоритеты категории: свой набор подкатегории (с учётом типа товара),
 * направления основного типа, раздела; нет — null.
 */
export function cardFactSpecs(
  categorySlug: string,
  values: Readonly<Record<string, unknown>> = {},
): readonly CardFactSpec[] | null {
  const variants = CARD_FACT_VARIANTS[categorySlug];
  if (variants) {
    const value = values[variants.key];
    return (typeof value === 'string' ? variants.variants[value] : undefined) ?? variants.fallback;
  }
  const section = categorySlug.split('-')[0] ?? '';
  const own = CARD_FACTS[categorySlug] ?? DIRECTION_FACTS[categorySlug];
  if (own) return own;
  // Остальные направления: тип товара и состояние; бренд — если его нет в заголовке
  const direction = goodsDirectionBySlug(categorySlug);
  if (direction) {
    return [...(direction.typeKey ? [direction.typeKey] : []), CONDITION, 'brandName'];
  }
  return CARD_FACTS[section] ?? null;
}

/** Ключи одного правила. */
function specKeys(spec: CardFactSpec): readonly string[] {
  if (typeof spec === 'string') return [spec];
  if (Array.isArray(spec)) return spec as readonly string[];
  return (spec as { keys: readonly string[] }).keys;
}

/** Все ключи приоритетов категории одним списком — для экрана фильтров. */
export function cardFactKeys(categorySlug: string): string[] {
  const variants = CARD_FACT_VARIANTS[categorySlug];
  const lists = variants
    ? [variants.fallback, ...Object.values(variants.variants)]
    : [cardFactSpecs(categorySlug) ?? []];
  return [...new Set(lists.flatMap((list) => list.flatMap(specKeys)))];
}

/** Число из значения поля; не число — null. */
function numberOf(value: unknown): number | null {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

/** «2 этажа», «1 этаж», «5 этажей». */
function floorsLabel(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  const word =
    tens >= 11 && tens <= 14
      ? 'этажей'
      : ones === 1
        ? 'этаж'
        : ones >= 2 && ones <= 4
          ? 'этажа'
          : 'этажей';
  return `${count} ${word}`;
}

/** Встроенная графика — не повод занимать место в карточке. */
const INTEGRATED_GPU = /встро|интегр|integrated|onboard|uhd|iris|radeon graphics|vega \d|^нет$/i;

/** Подпись по своему формату; null — показывать нечего. */
function formatFact(
  format: CardFactFormat,
  values: Readonly<Record<string, unknown>>,
  byKey: ReadonlyMap<string, ListingAttribute>,
  dictionaryLabels?: Readonly<Record<string, string>>,
  keys: readonly string[] = [],
  title = '',
): string | null {
  // Число поля в единицах ввода: хранится с масштабом (ширина диска 7J — как 70)
  const real = (key: string): number | null => {
    const number = numberOf(values[key]);
    const scale = byKey.get(key)?.scale ?? 1;
    return number === null ? null : number / scale;
  };
  switch (format) {
    case 'partState':
      return partStateLabel(values.partCondition, values.partOriginality);
    case 'tireSize': {
      // 215/65 R16 — как пишут на боковине; без ширины или профиля — только диаметр
      const width = real('tireWidth');
      const profile = real('tireProfile');
      const diameter = real('diameter');
      if (width !== null && profile !== null && diameter !== null)
        return `${width}/${profile} R${diameter}`;
      return diameter !== null ? `R${diameter}` : null;
    }
    case 'rimWidth': {
      const width = real('rimWidth');
      return width !== null ? `${width}J` : null;
    }
    case 'rimEt': {
      const et = real('rimEt');
      return et !== null ? `ET${et}` : null;
    }
    case 'battery': {
      // Только то, что продавец указал сам: «100%» по умолчанию не бывает
      const percent = real('battery');
      return percent !== null && percent > 0 && percent <= 100 ? `Аккумулятор ${percent}%` : null;
    }
    case 'size': {
      const key = values.size !== undefined ? 'size' : 'shoeSize';
      const attribute = byKey.get(key);
      const text = attribute ? describeAttribute(attribute, values, dictionaryLabels) : null;
      return text ? `Размер ${text}` : null;
    }
    case 'floors': {
      const count = real('floorsTotal');
      return count !== null && count > 0 ? floorsLabel(count) : null;
    }
    case 'gpu': {
      const gpu = typeof values.gpu === 'string' ? values.gpu.trim() : '';
      return gpu && !INTEGRATED_GPU.test(gpu) ? gpu : null;
    }
    case 'cellular':
      // Модификация с SIM — важное отличие планшета; без неё Wi-Fi и так есть у всех
      return values.cellular === true ? 'С SIM (LTE)' : null;
    case 'dimensions': {
      const text = typeof values.dimensions === 'string' ? values.dimensions.trim() : '';
      if (!text) return null;
      const pretty = text.replace(/\s*[xх×*]\s*/giu, ' × ');
      return /см|мм|м\b/u.test(pretty) ? pretty : `${pretty} см`;
    }
    case 'brandModel': {
      // Слова марки и модели, которых в заголовке нет; всё уже сказано — ничего
      const inTitle = new Set(
        plain(title)
          .split(/[\s,.\-/()]+/)
          .filter(Boolean),
      );
      const words: string[] = [];
      // Модель целиком в заголовке — она и называет вещь, марка лишняя
      // («iPhone 16 Pro» без «Apple», «Succeed 2015» без «Toyota»)
      const modelKey = keys[keys.length - 1];
      const model =
        modelKey && byKey.get(modelKey)
          ? describeAttribute(byKey.get(modelKey)!, values, dictionaryLabels)
          : null;
      if (model && model.split(/\s+/).every((word) => inTitle.has(plain(word)))) return null;
      for (const key of keys) {
        const attribute = byKey.get(key);
        const text = attribute ? describeAttribute(attribute, values, dictionaryLabels) : null;
        if (!text) continue;
        const fresh = text
          .split(/\s+/)
          .filter((word) => !inTitle.has(plain(word)))
          .join(' ');
        if (fresh) words.push(fresh);
      }
      return words.length > 0 ? words.join(' ') : null;
    }
    case 'donor': {
      const text = typeof values.donorVehicle === 'string' ? values.donorVehicle.trim() : '';
      return text ? `Снята с: ${text}` : null;
    }
  }
}

/**
 * Строка характеристик для карточки: до `limit` значений в порядке
 * приоритета категории, через « · ». Только заполненное — пустые и
 * незнакомые значения пропускаются, второстепенное на их место не встаёт.
 * Возвращает null, если для категории приоритеты не заданы — тогда
 * вызывающий берёт прежний набор по флагам.
 */
export function describeCardFacts(
  categorySlug: string,
  attributes: readonly ListingAttribute[],
  values: Record<string, unknown>,
  dictionaryLabels?: Readonly<Record<string, string>>,
  // С запасом: приложение ещё уберёт то, что уже есть в заголовке («Toyota
  // Succeed 2015» — год), и обрежет до CARD_FACTS_LIMIT
  limit: number = CARD_FACTS_LIMIT.list + 2,
  /** Заголовок объявления: марка и модель из него не повторяются */
  title = '',
): string | null {
  const specs = cardFactSpecs(categorySlug, values);
  if (!specs) return null;

  const byKey = new Map(attributes.map((attribute) => [attribute.key, attribute]));
  const facts: string[] = [];

  for (const spec of specs) {
    const detailed =
      typeof spec === 'object' && !Array.isArray(spec)
        ? (spec as {
            keys: readonly string[];
            unless?: Readonly<Record<string, unknown>>;
            format?: CardFactFormat;
          })
        : null;
    // Поля нет у категории — правило не про неё
    const keys = specKeys(spec);
    if (!keys.some((key) => byKey.has(key))) continue;
    if (detailed?.unless) {
      const repeated = Object.entries(detailed.unless).some(
        ([key, value]) => values[key] === value,
      );
      if (repeated) continue;
    }
    if (detailed?.format) {
      const text = formatFact(detailed.format, values, byKey, dictionaryLabels, keys, title);
      if (text) facts.push(text);
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

/** Автомобиль-донор б/у детали — для строки карточки после применяемости. */
export function donorFact(values: Readonly<Record<string, unknown>>): string | null {
  return formatFact('donor', values, new Map());
}
