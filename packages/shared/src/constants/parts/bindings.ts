import type { CategoryAttributeBinding } from '../listing-attributes.js';
import {
  PART_MANUFACTURER_KIND,
  partGroupKind,
  partItemKind,
  type PartsEquipment,
} from './equipment-types.js';

/**
 * Поля подкатегории запчастей одного типа техники. Состав один для всех, а
 * справочники и подписи берутся из реестра: у телефона марка — из
 * справочника телефонов, у грузовика — из справочника грузовиков, у
 * стиральной машины моделей нет вовсе, и модель — свободный текст.
 *
 * Обязательна только категория детали: остальное зависит от того, что знает
 * продавец (номер, совместимость, производитель).
 */
/** Что уточняет строка «Подходит к», кроме марки и модели. */
export interface CompatFieldFlags {
  year?: boolean;
  chassis?: boolean;
  engine?: boolean;
  modification?: boolean;
}

/**
 * Поля фильтра «Подходит к»: марка и модель — из справочников самой техники
 * (у телефона — справочник телефонов, у стиральной машины моделей нет, и
 * модель — текстом), остальное — по флагам. Общие для запчастей и для
 * направлений с совместимостью (коврики, магнитолы, чехлы).
 */
export function compatBindings(
  equipment: PartsEquipment,
  flags: CompatFieldFlags,
): CategoryAttributeBinding[] {
  const bindings: CategoryAttributeBinding[] = [];
  if (equipment.brandKind) {
    bindings.push({
      key: 'compatBrand',
      label: equipment.brandLabel,
      dictionary: equipment.brandKind,
    });
  } else {
    bindings.push({ key: 'compatBrandText', label: equipment.brandLabel });
  }
  if (equipment.modelKind) {
    bindings.push({ key: 'compatModel', label: 'Модель', dictionary: equipment.modelKind });
  } else {
    bindings.push({ key: 'compatModelText', label: 'Модель' });
  }
  if (flags.year) bindings.push({ key: 'compatYear' });
  if (flags.chassis) bindings.push({ key: 'compatChassis' });
  if (flags.engine) bindings.push({ key: 'compatEngine' });
  if (flags.modification) bindings.push({ key: 'compatModification' });
  return bindings;
}

export function partsBindings(equipment: PartsEquipment): CategoryAttributeBinding[] {
  const bindings: CategoryAttributeBinding[] = [
    { key: 'partGroup', required: true, dictionary: partGroupKind(equipment) },
    { key: 'partItem', dictionary: partItemKind(equipment) },
  ];
  // Вид самой техники (экскаватор, скутер, тягач) — существующее поле каталога
  if (equipment.kind) bindings.push({ key: equipment.kind.attribute });

  bindings.push(...compatBindings(equipment, equipment.compat));

  bindings.push(
    { key: 'partManufacturer', dictionary: PART_MANUFACTURER_KIND },
    { key: 'partOriginality' },
    { key: 'partCondition' },
    // Снята с автомобиля — только у транспорта: у телефона и стиралки донора не пишут
    ...(equipment.section === 'transport' ? [{ key: 'donorVehicle' }] : []),
    { key: 'partSaleUnit' },
    { key: 'partAvailability' },
    { key: 'quantity' },
    { key: 'warranty' },
    { key: 'partNumber' },
  );
  return bindings;
}
