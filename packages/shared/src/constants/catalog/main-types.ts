import type { CategoryAttributeBinding } from '../listing-attributes.js';
import { compatBindings } from '../parts/bindings.js';
import {
  partsEquipmentByCode,
  partsEquipmentBySlug,
  type PartsEquipment,
  type PartsEquipmentTypeCode,
} from '../parts/equipment-types.js';
import {
  GOODS_DIRECTIONS,
  goodsDirectionBySlug,
  goodsTypeKind,
  type DirectionCompat,
  type GoodsDirection,
} from './goods-directions.js';

/**
 * Основные типы техники и их направления (docs/ADR/0013-основные-типы.md).
 *
 * Дерево объявлений: раздел → основной тип → направление.
 *
 *   Транспорт → Автомобили → Автомобили / Запчасти / Шины и диски / …
 *   Электроника → Телефоны → Телефоны / Запчасти / Чехлы / …
 *
 * Основной тип — узел дерева без своих объявлений, направление — лист, в
 * котором объявление живёт. Объявление принадлежит ровно одному листу: у
 * «Коврики Toyota Succeed» это «Автомобили → Автоаксессуары», тип товара
 * «Коврики», а Toyota Succeed — строка «Подходит к», а не вторая категория.
 */

export interface MainType {
  /** Код узла дерева: «cars», «phones» */
  slug: string;
  name: string;
  /** Раздел дерева, в котором стоит узел */
  section: string;
  equipment: PartsEquipmentTypeCode;
  /** Подкатегория самой техники («Автомобили» внутри «Автомобилей») */
  machine: string;
  /** Подкатегории направления по порядку показа: техника, запчасти, остальное */
  directions: readonly string[];
}

const goodsOf = (equipment: PartsEquipmentTypeCode): string[] =>
  GOODS_DIRECTIONS.filter((direction) => direction.equipment === equipment).map(
    (direction) => direction.slug,
  );

const partsOf = (equipment: PartsEquipmentTypeCode): string[] => {
  const parts = partsEquipmentByCode(equipment);
  return parts ? [parts.slug] : [];
};

export const MAIN_TYPES: readonly MainType[] = [
  {
    slug: 'cars',
    name: 'Автомобили',
    section: 'transport',
    equipment: 'passenger_car',
    machine: 'transport-cars',
    directions: ['transport-cars', ...partsOf('passenger_car'), ...goodsOf('passenger_car')],
  },
  {
    slug: 'motorcycles',
    name: 'Мотоциклы',
    section: 'transport',
    equipment: 'moto',
    machine: 'transport-moto',
    directions: ['transport-moto', ...partsOf('moto'), ...goodsOf('moto')],
  },
  {
    slug: 'trucks',
    name: 'Грузовики',
    section: 'transport',
    equipment: 'truck',
    machine: 'transport-trucks',
    directions: ['transport-trucks', ...partsOf('truck'), ...goodsOf('truck')],
  },
  {
    slug: 'special-equipment',
    name: 'Спецтехника',
    section: 'transport',
    equipment: 'special_equipment',
    machine: 'transport-special',
    directions: [
      'transport-special',
      ...partsOf('special_equipment'),
      ...goodsOf('special_equipment'),
    ],
  },
  {
    slug: 'water-transport',
    name: 'Водный транспорт',
    section: 'transport',
    equipment: 'water_transport',
    machine: 'transport-water',
    directions: ['transport-water', ...partsOf('water_transport'), ...goodsOf('water_transport')],
  },
  {
    slug: 'phones',
    name: 'Телефоны',
    section: 'electronics',
    equipment: 'phone',
    machine: 'electronics-phones',
    directions: ['electronics-phones', ...partsOf('phone'), ...goodsOf('phone')],
  },
  {
    slug: 'laptops',
    name: 'Ноутбуки',
    section: 'electronics',
    equipment: 'laptop',
    machine: 'electronics-laptops',
    directions: ['electronics-laptops', ...partsOf('laptop'), ...goodsOf('laptop')],
  },
  {
    slug: 'computers',
    name: 'Компьютеры',
    section: 'electronics',
    equipment: 'computer',
    machine: 'electronics-computers',
    directions: ['electronics-computers', ...partsOf('computer'), ...goodsOf('computer')],
  },
  {
    slug: 'tv',
    name: 'Телевизоры',
    section: 'electronics',
    equipment: 'tv',
    machine: 'electronics-tv',
    directions: ['electronics-tv', ...partsOf('tv'), ...goodsOf('tv')],
  },
  {
    slug: 'appliances',
    name: 'Бытовая техника',
    section: 'home',
    equipment: 'home_appliance',
    machine: 'home-appliances',
    directions: ['home-appliances', ...partsOf('home_appliance'), ...goodsOf('home_appliance')],
  },
  {
    // Климатическая техника: самой техники несколько видов — каждый своим направлением
    slug: 'climate',
    name: 'Климатическая техника',
    section: 'home',
    equipment: 'climate_equipment',
    machine: 'home-climate-ac',
    directions: [
      ...goodsOf('climate_equipment').filter((slug) => !/accessories|consumables|other/.test(slug)),
      ...partsOf('climate_equipment'),
      ...goodsOf('climate_equipment').filter((slug) => /accessories|consumables|other/.test(slug)),
    ],
  },
];

const BY_SLUG = new Map(MAIN_TYPES.map((type) => [type.slug, type]));
const BY_DIRECTION = new Map(
  MAIN_TYPES.flatMap((type) => type.directions.map((slug) => [slug, type] as const)),
);

export function mainTypeBySlug(slug: string | null | undefined): MainType | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

/** Основной тип, к которому относится подкатегория. */
export function mainTypeOf(leafSlug: string | null | undefined): MainType | undefined {
  return leafSlug ? BY_DIRECTION.get(leafSlug) : undefined;
}

/** Подкатегория — запчасти или направление основного типа (не сама техника). */
export function isCatalogLeaf(slug: string | null | undefined): boolean {
  return Boolean(partsEquipmentBySlug(slug) ?? goodsDirectionBySlug(slug));
}

// ─────────────────────────────────────────────────────────────────────────────
//  «Подходит к»: слой совместимости
// ─────────────────────────────────────────────────────────────────────────────

/** Слой «номера + подходит к» подкатегории: у запчастей оба, у коврика — только совместимость. */
export interface CatalogLayer {
  /** Чьи справочники марок и моделей: техника направления */
  equipment: PartsEquipment;
  compat: Required<DirectionCompat>;
  /** Номера детали (OEM, артикул) — только у запчастей */
  numbers: boolean;
}

/** Слой подкатегории или null, если «Подходит к» у неё нет (автохимия, автокресла). */
export function catalogLayer(slug: string | null | undefined): CatalogLayer | null {
  const parts = partsEquipmentBySlug(slug);
  if (parts) {
    return {
      equipment: parts,
      compat: { ...parts.compat },
      numbers: true,
    };
  }
  const direction = goodsDirectionBySlug(slug);
  if (!direction?.compat) return null;
  const equipment = partsEquipmentByCode(direction.equipment);
  if (!equipment) return null;
  return {
    equipment,
    compat: {
      year: direction.compat.year === true,
      chassis: direction.compat.chassis === true,
      engine: direction.compat.engine === true,
      modification: direction.compat.modification === true,
    },
    numbers: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Подкатегории направлений
// ─────────────────────────────────────────────────────────────────────────────

/** Поля направления: тип товара, свои поля, «Подходит к» для фильтра. */
export function directionBindings(
  direction: GoodsDirection,
  extra: readonly (string | CategoryAttributeBinding)[] = [],
): CategoryAttributeBinding[] {
  const bindings: CategoryAttributeBinding[] = [];
  if (direction.typeKey === 'goodsType') {
    bindings.push({ key: 'goodsType', required: true, dictionary: goodsTypeKind(direction) });
  }
  for (const item of [...extra, ...(direction.attributes ?? [])]) {
    bindings.push(typeof item === 'string' ? { key: item } : item);
  }
  const layer = catalogLayer(direction.slug);
  if (layer) bindings.push(...compatBindings(layer.equipment, layer.compat));
  return bindings;
}

/** Справочники типов товара всех направлений: goods_type_<ключ>. */
export function goodsDictionarySeeds(): {
  kind: string;
  entries: { value: string; label: string; aliases: readonly string[] }[];
}[] {
  return GOODS_DIRECTIONS.filter((direction) => direction.typeKey === 'goodsType').map(
    (direction) => ({
      kind: goodsTypeKind(direction),
      entries: direction.types.map((type) => ({
        value: type.code,
        label: type.label,
        aliases: type.aliases,
      })),
    }),
  );
}
