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
/** Сколько строк «Подходит к» читает карточка: остальное — числом «+N». */
const CARD_COMPAT_ROWS = 8;

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
    // Карточке хватает первых строк — их собирают по моделям («Succeed
    // NCP160/NCP165, Probox»); сколько их всего — счётчик _count.compatibility
    // (его добавляет каждая выборка сама: у неё бывают и свои счётчики)
    take: CARD_COMPAT_ROWS,
  },
  partNumbers: {
    // В карточке — основной номер, а не номер замены
    where: { kind: { not: 'replacement' } },
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

/** Предел длины применяемости в карточке: дальше — на странице объявления. */
const CARD_COMPAT_MAX = 36;

/** «2015–2020», «2015» или ничего. */
function yearsOf(row: StoredCompatibility): string | null {
  if (row.yearFrom && row.yearTo && row.yearFrom !== row.yearTo)
    return `${row.yearFrom}–${row.yearTo}`;
  const year = row.yearFrom ?? row.yearTo;
  return year ? String(year) : null;
}

/** Одна строка «Подходит к» коротко: «Succeed NCP165 2015–2020». Марка — только без модели. */
export function compactCompatibility(row: StoredCompatibility): string {
  const text = [row.modelLabel ?? row.brandLabel, row.chassis, yearsOf(row)]
    .filter(Boolean)
    .join(' ');
  return text.length > CARD_COMPAT_MAX ? `${text.slice(0, CARD_COMPAT_MAX - 1).trimEnd()}…` : text;
}

/**
 * Применяемость для карточки — коротко и без выдумки: строки одной модели
 * собираются вместе («Succeed NCP160/NCP165»), показываются одна-две модели,
 * остальное — реальным числом скрытых строк («+3»). Одна строка — с годами.
 * Строк нет — пусто: применяемость не угадывается ни по заголовку, ни по
 * автомобилю-донору.
 */
export function compactApplicability(
  rows: readonly StoredCompatibility[],
  total: number = rows.length,
): string | null {
  if (rows.length === 0) return null;
  if (rows.length === 1 && total <= 1) return compactCompatibility(rows[0]!);

  const groups: { name: string; chassis: string[]; rows: number }[] = [];
  for (const row of rows) {
    const name = row.modelLabel ?? row.brandLabel ?? row.chassis ?? '';
    if (!name) continue;
    let group = groups.find((item) => item.name === name);
    if (!group) {
      group = { name, chassis: [], rows: 0 };
      groups.push(group);
    }
    group.rows += 1;
    if (row.chassis && row.chassis !== name && !group.chassis.includes(row.chassis))
      group.chassis.push(row.chassis);
  }
  if (groups.length === 0) return null;

  const label = (group: (typeof groups)[number]) =>
    group.chassis.length > 0 ? `${group.name} ${group.chassis.join('/')}` : group.name;
  // Первая модель — с кузовами, вторая — одним названием («Probox»): карточка
  // узкая, подробности — на странице объявления
  const first = label(groups[0]!);
  const second = groups[1];
  const withSecond = second ? `${first}, ${second.name}` : first;
  const shown =
    second && withSecond.length <= CARD_COMPAT_MAX ? [groups[0]!, second] : [groups[0]!];
  const covered = shown.reduce((sum, group) => sum + group.rows, 0);
  const hidden = Math.max(0, total - covered);
  const text = shown.length > 1 ? withSecond : first;
  const short =
    text.length > CARD_COMPAT_MAX ? `${text.slice(0, CARD_COMPAT_MAX - 1).trimEnd()}…` : text;
  return hidden > 0 ? `${short} +${hidden}` : short;
}

/**
 * Часть строки под заголовком карточки запчасти: основной номер («45510-52230»,
 * без «OEM» — номер узнают и так) и применяемость («Succeed NCP160/NCP165,
 * Probox +3»). Производитель, оригинальность и состояние идут
 * перед ними из характеристик, автомобиль-донор — после и отдельно.
 */
export function partCardFacts(
  compatibility: readonly StoredCompatibility[],
  numbers: readonly StoredPartNumber[],
  /** Сколько всего строк совместимости: в выборке карточки — только первые */
  compatibilityTotal: number = compatibility.length,
): { compatibility: string | null; number: string | null } {
  const applicability = compactApplicability(compatibility, compatibilityTotal);
  const number = numbers.find((item) => item.kind !== 'replacement') ?? null;
  return {
    compatibility: applicability,
    number: number ? number.number : null,
  };
}
