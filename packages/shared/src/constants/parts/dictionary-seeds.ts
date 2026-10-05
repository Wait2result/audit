import { PART_MANUFACTURERS } from './manufacturers.js';
import {
  PARTS_EQUIPMENT,
  PART_MANUFACTURER_KIND,
  partGroupKind,
  partItemKind,
} from './equipment-types.js';

/** Запись справочника в том же виде, что у `DictionaryEntrySeed` (без цикла импортов). */
interface PartEntrySeed {
  value: string;
  label: string;
  parent?: string;
  aliases?: readonly string[];
}

export interface PartDictionarySeed {
  kind: string;
  entries: readonly PartEntrySeed[];
}

/**
 * Справочники запчастей, собранные из таксономии и реестра типов техники:
 * группы и детали каждого типа техники, производители деталей. Своих
 * справочников марок и моделей нет — совместимость использует справочники
 * самой техники (car_brand, phone_model…).
 */
export function partDictionarySeeds(): PartDictionarySeed[] {
  const seeds: PartDictionarySeed[] = [];
  for (const equipment of PARTS_EQUIPMENT) {
    seeds.push({
      kind: partGroupKind(equipment),
      entries: equipment.groups.map((group) => ({
        value: group.code,
        label: group.label,
        aliases: group.aliases,
      })),
    });
    seeds.push({
      kind: partItemKind(equipment),
      entries: equipment.groups.flatMap((group) =>
        group.items.map((item) => ({
          value: item.code,
          label: item.label,
          parent: group.code,
          aliases: item.aliases,
        })),
      ),
    });
  }
  seeds.push({
    kind: PART_MANUFACTURER_KIND,
    entries: PART_MANUFACTURERS.map((item) => ({
      value: item.value,
      label: item.label,
      aliases: item.aliases ?? [],
    })),
  });
  return seeds;
}
