import { BRAND_ALIASES, MODEL_ALIASES } from './aliases.js';
import { russianModelAlias } from './auto-aliases.js';
import { CAR_BRANDS } from './car-brands.js';
import {
  APPLIANCE_BRANDS,
  AUDIO_BRANDS,
  BIKE_BRANDS,
  PHOTO_BRANDS,
  SPECIAL_BRANDS,
  TABLET_BRANDS,
  TIRE_BRANDS,
  TOOL_BRANDS,
  TV_BRANDS,
  WATCH_BRANDS,
  WATER_BRANDS,
} from './category-brands.js';
import {
  COMPUTER_BRANDS,
  ELECTRONICS_BRANDS,
  PHONE_BRANDS,
  type DictionaryBrand,
} from './electronics-brands.js';
import { LAPTOP_MODELS, PHOTO_MODELS, TABLET_MODELS, WATCH_MODELS } from './electronics-models.js';
import { MOTO_BRANDS, MOTO_MODELS } from './moto-models.js';
import { partDictionarySeeds } from '../parts/dictionary-seeds.js';
import { goodsDictionarySeeds } from '../catalog/main-types.js';
import { PHONE_MODELS } from './phone-models.js';
import { SPECIAL_MODELS } from './special-models.js';
import { TRUCK_BRANDS, TRUCK_MODELS } from './truck-models.js';

export * from './aliases.js';
export * from './auto-aliases.js';
export * from './car-brands.js';
export * from './category-brands.js';
export * from './electronics-brands.js';
export * from './electronics-models.js';
export * from './moto-models.js';
export * from './names.js';
export * from './phone-models.js';
export * from './special-models.js';
export * from './truck-models.js';

/**
 * Справочники значений (Этап 7, версия 2).
 *
 * Справочник — это список «значение → подпись», иногда с родителем:
 * у модели родитель — марка. В коде справочники живут как исходник для
 * заполнения базы; сервер читает их из базы (там их правит панель), а
 * приложение получает по запросу и не хранит.
 *
 * Ключ справочника (`kind`) указывается у поля-определения; у модели
 * дополнительно указан родитель (`parentKey`), чтобы список зависел от
 * выбранной марки.
 */

export interface DictionaryEntrySeed {
  value: string;
  label: string;
  /** Значение родителя: у модели — марка */
  parent?: string;
  /** Другие написания для поиска: «тойота», «тайота» */
  aliases?: readonly string[];
  /** Дополнительные признаки записи: { faceId: true } у моделей телефонов */
  meta?: Readonly<Record<string, string | number | boolean>>;
}

export interface DictionarySeed {
  kind: string;
  entries: readonly DictionaryEntrySeed[];
}

export const DictionaryKind = {
  CAR_BRAND: 'car_brand',
  CAR_MODEL: 'car_model',
  MOTO_BRAND: 'moto_brand',
  MOTO_MODEL: 'moto_model',
  TRUCK_BRAND: 'truck_brand',
  TRUCK_MODEL: 'truck_model',
  PHONE_BRAND: 'phone_brand',
  PHONE_MODEL: 'phone_model',
  TABLET_BRAND: 'tablet_brand',
  TABLET_MODEL: 'tablet_model',
  COMPUTER_BRAND: 'computer_brand',
  LAPTOP_MODEL: 'laptop_model',
  WATCH_BRAND: 'watch_brand',
  WATCH_MODEL: 'watch_model',
  PHOTO_BRAND: 'photo_brand',
  PHOTO_MODEL: 'photo_model',
  TV_BRAND: 'tv_brand',
  AUDIO_BRAND: 'audio_brand',
  APPLIANCE_BRAND: 'appliance_brand',
  /** Прежний общий список; у категорий теперь свои, значения остаются для старых объявлений */
  ELECTRONICS_BRAND: 'electronics_brand',
  SPECIAL_BRAND: 'special_brand',
  SPECIAL_MODEL: 'special_model',
  WATER_BRAND: 'water_brand',
  TIRE_BRAND: 'tire_brand',
  TOOL_BRAND: 'tool_brand',
  BIKE_BRAND: 'bike_brand',
} as const;

export type DictionaryKind = (typeof DictionaryKind)[keyof typeof DictionaryKind];

const withBrandAliases = (brands: readonly DictionaryBrand[]): DictionaryEntrySeed[] =>
  brands.map((brand) => ({
    value: brand.value,
    label: brand.label,
    aliases: BRAND_ALIASES[brand.value] ?? [],
  }));

/**
 * Модели «марка → модель» как записи справочника. Повтор названия внутри
 * марки (с точностью до регистра, пробелов и дефисов) отбрасывается: в базе
 * пара «марка + значение» уникальна, а составитель мог повторить имя.
 */
/** Вручную заданные написания плюс написание, собранное по словам названия. */
function withAutoAlias(label: string, manual: readonly string[] = []): string[] {
  const auto = russianModelAlias(label);
  return auto && !manual.includes(auto) ? [...manual, auto] : [...manual];
}

/**
 * Как модель называют в жизни — короче, чем в каталоге (аудит, п. 32):
 *   • без названия серии: «Galaxy Z Fold 8» — «Z Fold 8», «зет фолд 8»;
 *   • с маркой, если модель записана без неё: «Honor 400» — «хонор 400».
 * Только сочетания с цифрой: «Galaxy» или «Pro» сами по себе моделью не становятся.
 */
const SERIES_PREFIXES = ['Galaxy '];

/**
 * Синонимы марки, которые на деле — названия продуктов («айфон» у Apple,
 * «галакси» у Samsung): написанием марки в начале модели они не служат —
 * иначе «Apple Watch» получил бы написание «айфон watch».
 */
const PRODUCT_WORDS: ReadonlySet<string> = new Set([
  'айфон',
  'iphone',
  'макбук',
  'macbook',
  'айпад',
  'ipad',
  'галакси',
  'galaxy',
  'пиксель',
  'pixel',
  'плейстейшен',
  'playstation',
]);

/** Латинская буква серии и её кириллический двойник на клавиатуре. */
const CYRILLIC_TWIN: Readonly<Record<string, string>> = { s: 'с', a: 'а', m: 'м' };

function spokenAliases(brand: string, label: string): string[] {
  const result: string[] = [];
  for (const prefix of SERIES_PREFIXES) {
    if (!label.startsWith(prefix)) continue;
    const short = label.slice(prefix.length);
    if (!/\d/.test(short) || short.split(' ').length < 2) continue;
    result.push(short.toLowerCase());
    const russian = russianModelAlias(short);
    if (russian) result.push(russian);
  }
  if (/^\d/.test(label)) {
    result.push(`${brand} ${label}`.toLowerCase());
    const brandRu = BRAND_ALIASES[brand]?.[0];
    if (brandRu) result.push(`${brandRu} ${label}`.toLowerCase());
  }
  // Марка в начале названия — всеми её написаниями: «Xiaomi 15» — «ксиоми 15», «шаоми 15»
  const [head, ...tail] = label.split(' ');
  if (head && tail.length > 0 && head.toLowerCase() === brand) {
    const rest = tail.join(' ');
    const restForms = [rest.toLowerCase(), russianModelAlias(rest)].filter((form): form is string =>
      Boolean(form),
    );
    for (const alias of BRAND_ALIASES[brand] ?? []) {
      if (alias.length < 4 || alias.includes(' ') || PRODUCT_WORDS.has(alias)) continue;
      for (const form of restForms) result.push(`${alias} ${form}`);
    }
  }
  // «Note» говорят и «нот», и «ноут»: «редми ноут 15 про»
  const russianFull = russianModelAlias(label);
  for (const form of [...result, ...(russianFull ? [russianFull] : [])]) {
    if (/(^| )нот( |$)/.test(form)) result.push(form.replace(/(^| )нот( |$)/, '$1ноут$2'));
  }
  // Буква серии кириллицей — так часто и набирают: «с26 ультра», «а55»
  for (const form of [...result]) {
    const cyrillic = form.replace(/^([sam])(?=\d)/, (letter) => CYRILLIC_TWIN[letter] ?? letter);
    if (cyrillic !== form) result.push(cyrillic);
  }
  return result;
}

function modelEntries(models: Readonly<Record<string, readonly string[]>>): DictionaryEntrySeed[] {
  const entries: DictionaryEntrySeed[] = [];
  for (const [brand, labels] of Object.entries(models)) {
    const seen = new Set<string>();
    for (const label of labels) {
      const value = modelValue(label);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      entries.push({
        value,
        label,
        parent: brand,
        aliases: [
          ...new Set([
            ...withAutoAlias(label, MODEL_ALIASES[value]),
            ...spokenAliases(brand, label),
          ]),
        ],
      });
    }
  }
  return entries;
}

export const DICTIONARY_SEEDS: readonly DictionarySeed[] = [
  { kind: DictionaryKind.CAR_BRAND, entries: withBrandAliases(CAR_BRANDS) },
  {
    kind: DictionaryKind.CAR_MODEL,
    entries: CAR_BRANDS.flatMap((brand) =>
      brand.models.map((model) => ({
        value: modelValue(model),
        label: model,
        parent: brand.value,
        aliases: MODEL_ALIASES[modelValue(model)] ?? [],
      })),
    ),
  },
  { kind: DictionaryKind.MOTO_BRAND, entries: withBrandAliases(MOTO_BRANDS) },
  { kind: DictionaryKind.MOTO_MODEL, entries: modelEntries(MOTO_MODELS) },
  { kind: DictionaryKind.TRUCK_BRAND, entries: withBrandAliases(TRUCK_BRANDS) },
  { kind: DictionaryKind.TRUCK_MODEL, entries: modelEntries(TRUCK_MODELS) },
  { kind: DictionaryKind.PHONE_BRAND, entries: withBrandAliases(PHONE_BRANDS) },
  {
    kind: DictionaryKind.PHONE_MODEL,
    entries: PHONE_MODELS.map((model) => ({
      value: modelValue(model.label),
      label: model.label,
      parent: model.brand,
      aliases: [
        ...new Set([
          ...withAutoAlias(model.label, MODEL_ALIASES[modelValue(model.label)]),
          ...spokenAliases(model.brand, model.label),
        ]),
      ],
      ...(model.faceId !== undefined ? { meta: { faceId: model.faceId } } : {}),
    })),
  },
  { kind: DictionaryKind.TABLET_BRAND, entries: withBrandAliases(TABLET_BRANDS) },
  { kind: DictionaryKind.TABLET_MODEL, entries: modelEntries(TABLET_MODELS) },
  { kind: DictionaryKind.COMPUTER_BRAND, entries: withBrandAliases(COMPUTER_BRANDS) },
  { kind: DictionaryKind.LAPTOP_MODEL, entries: modelEntries(LAPTOP_MODELS) },
  { kind: DictionaryKind.WATCH_BRAND, entries: withBrandAliases(WATCH_BRANDS) },
  { kind: DictionaryKind.WATCH_MODEL, entries: modelEntries(WATCH_MODELS) },
  { kind: DictionaryKind.PHOTO_BRAND, entries: withBrandAliases(PHOTO_BRANDS) },
  { kind: DictionaryKind.PHOTO_MODEL, entries: modelEntries(PHOTO_MODELS) },
  { kind: DictionaryKind.TV_BRAND, entries: withBrandAliases(TV_BRANDS) },
  { kind: DictionaryKind.AUDIO_BRAND, entries: withBrandAliases(AUDIO_BRANDS) },
  { kind: DictionaryKind.APPLIANCE_BRAND, entries: withBrandAliases(APPLIANCE_BRANDS) },
  { kind: DictionaryKind.ELECTRONICS_BRAND, entries: withBrandAliases(ELECTRONICS_BRANDS) },
  { kind: DictionaryKind.SPECIAL_BRAND, entries: withBrandAliases(SPECIAL_BRANDS) },
  { kind: DictionaryKind.SPECIAL_MODEL, entries: modelEntries(SPECIAL_MODELS) },
  { kind: DictionaryKind.WATER_BRAND, entries: withBrandAliases(WATER_BRANDS) },
  { kind: DictionaryKind.TIRE_BRAND, entries: withBrandAliases(TIRE_BRANDS) },
  { kind: DictionaryKind.TOOL_BRAND, entries: withBrandAliases(TOOL_BRANDS) },
  { kind: DictionaryKind.BIKE_BRAND, entries: withBrandAliases(BIKE_BRANDS) },
  // Группы и детали запчастей, производители деталей (docs/ADR/0012-запчасти.md)
  ...partDictionarySeeds(),
  // Типы товара направлений основных типов: «Коврики», «Магнитолы», «Шлемы»
  ...goodsDictionarySeeds(),
];

/**
 * Значение модели из подписи: «Land Cruiser 200» → «land_cruiser_200».
 * Подпись остаётся для показа, значение — для хранения и фильтра.
 */
export function modelValue(label: string): string {
  return label
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '');
}
