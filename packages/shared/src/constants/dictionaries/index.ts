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
        aliases: withAutoAlias(label, MODEL_ALIASES[value]),
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
      aliases: withAutoAlias(model.label, MODEL_ALIASES[modelValue(model.label)]),
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
