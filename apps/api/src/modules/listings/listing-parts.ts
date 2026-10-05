import {
  ErrorCode,
  PART_NUMBER_KIND_LABELS,
  modelValue,
  norm,
  partNumberKey,
  catalogLayer,
  type ListingCompatibilityDto,
  type ListingPartDto,
  type ListingPartInput,
  type ListingPartNumberDto,
  type PartNumberKind,
  type PartsEquipment,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import type { DictionaryRecord, ListingCatalogue } from './listing-categories.service.js';

/**
 * Слой запчасти объявления: проверка и подготовка строк совместимости и
 * номеров. Не знает про базу — только про справочники каталога и правила.
 *
 * Марка и модель берутся из справочников самой техники (car_model,
 * phone_model…), как у самой техники; своих копий нет. Где справочника нет
 * (модель телевизора, бренд бытовой техники), значение — текст человека.
 */

/**
 * Что нужно карточке от слоя запчасти: первые строки совместимости и первый
 * номер. У объявлений, которые не запчасти, связей нет — выборка пустая и
 * ничего не стоит.
 */
export const PART_LAYER_SELECT = {
  compatibility: {
    select: {
      brand: true,
      brandLabel: true,
      model: true,
      modelLabel: true,
      chassis: true,
      yearFrom: true,
      yearTo: true,
      engine: true,
      modification: true,
    },
    orderBy: { sortOrder: 'asc' },
    take: 3,
  },
  partNumbers: {
    select: { kind: true, number: true },
    orderBy: { sortOrder: 'asc' },
    take: 1,
  },
} as const;

export interface CompatibilityRow {
  equipmentType: string;
  brand: string | null;
  brandLabel: string | null;
  model: string | null;
  modelLabel: string | null;
  chassis: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  engine: string | null;
  modification: string | null;
  sortOrder: number;
}

export interface PartNumberRow {
  kind: PartNumberKind;
  number: string;
  numberKey: string;
  sortOrder: number;
}

export interface PreparedPart {
  equipmentType: string;
  compatibility: CompatibilityRow[];
  numbers: PartNumberRow[];
}

const fail = (message: string): never => {
  throw AppException.badRequest(message, ErrorCode.VALIDATION_FAILED);
};

/** Запись справочника по значению, подписи или написанию. */
function findRecord(
  entries: readonly DictionaryRecord[],
  candidate: string,
): DictionaryRecord | undefined {
  const wanted = norm(candidate);
  if (!wanted) return undefined;
  return entries.find((entry) =>
    [entry.value, entry.value.replace(/_/g, ' '), entry.label, ...entry.aliases]
      .map((form) => norm(form))
      .includes(wanted),
  );
}

/** Код и подпись для текста человека там, где справочника нет. */
function freeText(text: string): { value: string; label: string } {
  const label = text.trim().slice(0, 120);
  return { value: modelValue(label).slice(0, 80) || label.slice(0, 80), label };
}

function brandAndModel(
  catalogue: ListingCatalogue,
  equipment: PartsEquipment,
  brand: string | undefined,
  model: string | undefined,
): Pick<CompatibilityRow, 'brand' | 'brandLabel' | 'model' | 'modelLabel'> {
  let brandValue: string | null = null;
  let brandLabel: string | null = null;
  let modelValueText: string | null = null;
  let modelLabel: string | null = null;

  if (brand) {
    if (equipment.brandKind) {
      // Марка строго по справочнику техники: «Тойота» → toyota. Нет такой —
      // отказ, а не выдумка: по неверной марке деталь не найдут
      const record = findRecord(catalogue.dictionaryEntries(equipment.brandKind, ''), brand);
      if (!record) return fail(`Марки «${brand}» нет в справочнике`);
      brandValue = record.value;
      brandLabel = record.label;
    } else {
      const text = freeText(brand);
      brandValue = text.value;
      brandLabel = text.label;
    }
  }

  if (model) {
    if (equipment.modelKind && brandValue) {
      const own = catalogue.dictionaryEntries(equipment.modelKind, brandValue);
      const record = findRecord(own, model);
      if (record) {
        modelValueText = record.value;
        modelLabel = record.label;
      } else {
        // Модели нет в справочнике — как и у самой техники, это не ошибка:
        // справочник не знает всех модификаций. Остаётся текстом
        const text = freeText(model);
        modelValueText = text.value;
        modelLabel = text.label;
      }
    } else {
      const text = freeText(model);
      modelValueText = text.value;
      modelLabel = text.label;
    }
  }

  return { brand: brandValue, brandLabel, model: modelValueText, modelLabel };
}

/**
 * Слой запчасти из запроса. Для подкатегории без запчастей слой не
 * допускается: пустой — это просто «нет слоя», непустой — ошибка человека
 * (форма такого не отправит, но сервер проверяет сам).
 */
export function preparePart(
  catalogue: ListingCatalogue,
  categorySlug: string,
  input: ListingPartInput | undefined,
): PreparedPart | null {
  // Слой есть у запчастей (номера и «Подходит к») и у направлений с совместимостью
  // (коврики, магнитолы, чехлы — только «Подходит к»)
  const layer = catalogLayer(categorySlug);
  if (!layer) {
    if (input && (input.numbers.length > 0 || input.compatibility.length > 0)) {
      return fail('Номера и «Подходит к» в этой подкатегории не указываются');
    }
    return null;
  }
  if (!layer.numbers && input && input.numbers.length > 0) {
    return fail('Номера детали указываются только у запчастей');
  }
  const equipment = layer.equipment;
  if (!input) return { equipmentType: equipment.code, compatibility: [], numbers: [] };

  const compatibility: CompatibilityRow[] = input.compatibility.map((row, index) => ({
    equipmentType: equipment.code,
    ...brandAndModel(catalogue, equipment, row.brand, row.model),
    chassis: row.chassis ? row.chassis.toUpperCase() : null,
    yearFrom: row.yearFrom ?? null,
    yearTo: row.yearTo ?? null,
    engine: row.engine ? row.engine.toUpperCase() : null,
    modification: row.modification ?? null,
    sortOrder: index,
  }));

  // Один и тот же номер дважды — один раз; ключ нужен и для этого
  const seen = new Set<string>();
  const numbers: PartNumberRow[] = [];
  for (const item of input.numbers) {
    const numberKey = partNumberKey(item.value);
    if (!numberKey || seen.has(numberKey)) continue;
    seen.add(numberKey);
    numbers.push({
      kind: item.kind,
      number: item.value.slice(0, 60),
      numberKey: numberKey.slice(0, 60),
      sortOrder: numbers.length,
    });
  }

  return { equipmentType: equipment.code, compatibility, numbers };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Чтение
// ─────────────────────────────────────────────────────────────────────────────

export interface StoredCompatibility {
  brand: string | null;
  brandLabel: string | null;
  model: string | null;
  modelLabel: string | null;
  chassis: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  engine: string | null;
  modification: string | null;
}

export interface StoredPartNumber {
  kind: string;
  number: string;
}

export function compatibilityDto(row: StoredCompatibility): ListingCompatibilityDto {
  return {
    brand: row.brand,
    brandLabel: row.brandLabel,
    model: row.model,
    modelLabel: row.modelLabel,
    chassis: row.chassis,
    yearFrom: row.yearFrom,
    yearTo: row.yearTo,
    engine: row.engine,
    modification: row.modification,
  };
}

export function partDto(
  categorySlug: string,
  compatibility: readonly StoredCompatibility[],
  numbers: readonly StoredPartNumber[],
): ListingPartDto | null {
  const layer = catalogLayer(categorySlug);
  if (!layer) return null;
  return {
    equipmentType: layer.equipment.code,
    compatibility: compatibility.map(compatibilityDto),
    numbers: numbers.map((item): ListingPartNumberDto => ({
      kind: (item.kind in PART_NUMBER_KIND_LABELS ? item.kind : 'oem') as PartNumberKind,
      value: item.number,
    })),
  };
}

/** «Toyota Succeed NCP165 2015–2018» — одна строка совместимости для карточки. */
export function compatibilityText(row: StoredCompatibility): string {
  const years =
    row.yearFrom && row.yearTo && row.yearFrom !== row.yearTo
      ? `${row.yearFrom}–${row.yearTo}`
      : (row.yearFrom ?? row.yearTo)
        ? String(row.yearFrom ?? row.yearTo)
        : null;
  return [row.brandLabel, row.modelLabel, row.chassis, years].filter(Boolean).join(' ');
}

/**
 * Часть строки под заголовком карточки запчасти: совместимость («Toyota
 * Succeed NCP165», с «+2», если подходит и другим) и первый номер. Подробности
 * — на странице объявления, карточка не анкета.
 */
export function partCardFacts(
  compatibility: readonly StoredCompatibility[],
  numbers: readonly StoredPartNumber[],
): { compatibility: string | null; number: string | null } {
  const first = compatibility[0];
  const rest = compatibility.length > 1 ? ` +${compatibility.length - 1}` : '';
  const text = first ? compatibilityText(first) : '';
  const number = numbers[0];
  return {
    compatibility: text ? `Подходит: ${text}${rest}` : null,
    number: number
      ? `${PART_NUMBER_KIND_LABELS[(number.kind as PartNumberKind) in PART_NUMBER_KIND_LABELS ? (number.kind as PartNumberKind) : 'oem']} ${number.number}`
      : null,
  };
}
