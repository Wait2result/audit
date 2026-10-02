import { BRAND_ALIASES, MODEL_ALIASES } from './aliases.js';
import { CAR_BRANDS } from './car-brands.js';
import {
  COMPUTER_BRANDS,
  ELECTRONICS_BRANDS,
  PHONE_BRANDS,
  type DictionaryBrand,
} from './electronics-brands.js';

import { PHONE_MODELS } from './phone-models.js';
import { MOTO_BRANDS, TRUCK_BRANDS } from './vehicle-brands.js';

export * from './aliases.js';
export * from './car-brands.js';
export * from './electronics-brands.js';
export * from './phone-models.js';
export * from './vehicle-brands.js';

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
  TRUCK_BRAND: 'truck_brand',
  PHONE_BRAND: 'phone_brand',
  PHONE_MODEL: 'phone_model',
  COMPUTER_BRAND: 'computer_brand',
  ELECTRONICS_BRAND: 'electronics_brand',
} as const;

export type DictionaryKind = (typeof DictionaryKind)[keyof typeof DictionaryKind];

const withBrandAliases = (brands: readonly DictionaryBrand[]): DictionaryEntrySeed[] =>
  brands.map((brand) => ({
    value: brand.value,
    label: brand.label,
    aliases: BRAND_ALIASES[brand.value] ?? [],
  }));

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
  { kind: DictionaryKind.TRUCK_BRAND, entries: withBrandAliases(TRUCK_BRANDS) },
  { kind: DictionaryKind.PHONE_BRAND, entries: withBrandAliases(PHONE_BRANDS) },
  {
    kind: DictionaryKind.PHONE_MODEL,
    entries: PHONE_MODELS.map((model) => ({
      value: modelValue(model.label),
      label: model.label,
      parent: model.brand,
      aliases: MODEL_ALIASES[modelValue(model.label)] ?? [],
      ...(model.faceId !== undefined ? { meta: { faceId: model.faceId } } : {}),
    })),
  },
  { kind: DictionaryKind.COMPUTER_BRAND, entries: withBrandAliases(COMPUTER_BRANDS) },
  { kind: DictionaryKind.ELECTRONICS_BRAND, entries: withBrandAliases(ELECTRONICS_BRANDS) },
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
