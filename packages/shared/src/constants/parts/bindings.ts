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
export function partsBindings(equipment: PartsEquipment): CategoryAttributeBinding[] {
  const bindings: CategoryAttributeBinding[] = [
    { key: 'partGroup', required: true, dictionary: partGroupKind(equipment) },
    { key: 'partItem', dictionary: partItemKind(equipment) },
  ];
  // Вид самой техники (экскаватор, скутер, тягач) — существующее поле каталога
  if (equipment.kind) bindings.push({ key: equipment.kind.attribute });

  // Совместимость в фильтре: справочники — те же, что у самой техники
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
  if (equipment.compat.year) bindings.push({ key: 'compatYear' });
  if (equipment.compat.chassis) bindings.push({ key: 'compatChassis' });
  if (equipment.compat.engine) bindings.push({ key: 'compatEngine' });

  bindings.push(
    { key: 'partManufacturer', dictionary: PART_MANUFACTURER_KIND },
    { key: 'partOriginality' },
    { key: 'partCondition' },
    { key: 'partSaleUnit' },
    { key: 'partAvailability' },
    { key: 'quantity' },
    { key: 'warranty' },
    { key: 'partNumber' },
  );
  return bindings;
}
