import { looksLikePartNumber, partNumberKey } from '../../constants/parts/part-number.js';
import {
  GENERIC_PARTS_EQUIPMENT,
  GENERIC_PARTS_WORDS,
  findEquipmentWord,
  findMakerWord,
  findPartAlias,
  findQualityWord,
  makerMaxWordCount,
  partAliasMaxWords,
  type PartQuality,
  type EquipmentWordHit,
  type PartMatch,
} from '../parts.js';
import { norm } from './normalize.js';
import { free, span, type SearchToken } from './tokenize.js';

/**
 * Разбор запчастей во фразе, до всякого выбора: что названо, где стоит.
 * Решения (что из этого — запрос о запчастях, а что обычное слово) принимает
 * вызывающий: слово «дверь» может быть деталью автомобиля, а может — дверью
 * для дома.
 */

export interface PartHit {
  start: number;
  end: number;
  text: string;
  matches: PartMatch[];
  /** Слово называет конкретную деталь, а не только группу */
  isItem: boolean;
}

export interface EquipmentHit {
  start: number;
  end: number;
  hits: EquipmentWordHit[];
}

export interface PartsScan {
  hits: PartHit[];
  generic: { start: number; end: number; equipment?: string }[];
  equipment: EquipmentHit[];
  chassis: { index: number; value: string }[];
  engine: { start: number; end: number; value: string }[];
  /** Производители деталей (не марки техники): «KYB», «денсо» */
  makers: { start: number; end: number; value: string }[];
  /** Тип и состояние: «б/у», «оригинал», «восстановленная» */
  qualities: { start: number; end: number; quality: PartQuality }[];
}

/** Самое длинное название техники или вида в словах («надувная лодка»). */
const MAX_EQUIPMENT_WORDS = 3;

/** Кузов: три–четыре буквы и цифры («NCP165», «GRX130»). Короткие («A52», «S21») — модели телефонов. */
const CHASSIS = /^[a-z]{3,4}\d{2,3}[a-z]?$/;
/** Двигатель: цифра и две–три буквы («1NZ», «2JZ»); «4wd» — привод, а не мотор. */
const ENGINE = /^\d[a-z]{2,3}$/;
const ENGINE_SUFFIX = new Set([
  'fe',
  'ge',
  'gte',
  'fse',
  'fxe',
  'ze',
  'zr',
  'gr',
  'ur',
  'ar',
  'fae',
  'gze',
]);

export function scanParts(tokens: readonly SearchToken[]): PartsScan {
  const scan: PartsScan = {
    hits: [],
    generic: [],
    equipment: [],
    chassis: [],
    engine: [],
    makers: [],
    qualities: [],
  };
  const taken = new Array<boolean>(tokens.length).fill(false);
  const isFree = (from: number, to: number): boolean =>
    free(tokens, from, to) && taken.slice(from, to).every((item) => !item);
  const take = (from: number, to: number): void => {
    for (let i = from; i < to; i += 1) taken[i] = true;
  };

  // Названия деталей: сначала самые длинные («насос стиралки» раньше «насос»)
  const maxWords = Math.min(partAliasMaxWords(), 5);
  for (let length = maxWords; length >= 1; length -= 1) {
    for (let start = 0; start + length <= tokens.length; start += 1) {
      const end = start + length;
      if (!isFree(start, end)) continue;
      const text = span(tokens, start, end);
      const matches = findPartAlias(text);
      if (matches.length === 0) continue;
      scan.hits.push({ start, end, text, matches, isItem: matches.some((m) => m.item !== null) });
      take(start, end);
    }
  }

  // Общие слова «запчасти», «комплектующие»
  for (let i = 0; i < tokens.length; i += 1) {
    const word = tokens[i]!.text;
    if (!isFree(i, i + 1) || !GENERIC_PARTS_WORDS.has(word)) continue;
    const equipment = GENERIC_PARTS_EQUIPMENT[word];
    scan.generic.push({ start: i, end: i + 1, ...(equipment ? { equipment } : {}) });
    take(i, i + 1);
  }

  // Названия техники и её вида: «на айфон», «на экскаватор», «для скутера»
  for (let length = MAX_EQUIPMENT_WORDS; length >= 1; length -= 1) {
    for (let start = 0; start + length <= tokens.length; start += 1) {
      const end = start + length;
      if (!isFree(start, end)) continue;
      const hits = findEquipmentWord(span(tokens, start, end));
      if (hits.length === 0) continue;
      scan.equipment.push({ start, end, hits });
      take(start, end);
    }
  }

  // Кузов и двигатель: «NCP165», «1NZ-FE» — только как подсказка к детали
  for (let i = 0; i < tokens.length; i += 1) {
    if (!isFree(i, i + 1)) continue;
    const word = tokens[i]!.text;
    if (CHASSIS.test(word)) {
      scan.chassis.push({ index: i, value: word.toUpperCase() });
      take(i, i + 1);
    } else if (ENGINE.test(word) && !/^\dwd$/.test(word)) {
      const next = tokens[i + 1];
      const suffix =
        next && isFree(i + 1, i + 2) && ENGINE_SUFFIX.has(next.text) ? next.text : null;
      scan.engine.push({
        start: i,
        end: i + (suffix ? 2 : 1),
        value: (suffix ? `${word}-${suffix}` : word).toUpperCase(),
      });
      take(i, i + (suffix ? 2 : 1));
    }
  }

  // Производитель детали: «рейка KYB», «фильтр Denso». Марки техники (Toyota,
  // Samsung) остаются словами фразы — их читает справочник техники
  for (let length = makerMaxWordCount(); length >= 1; length -= 1) {
    for (let start = 0; start + length <= tokens.length; start += 1) {
      const end = start + length;
      if (!isFree(start, end)) continue;
      const hit = findMakerWord(span(tokens, start, end));
      if (!hit || hit.machineBrand) continue;
      scan.makers.push({ start, end, value: hit.value });
      take(start, end);
    }
  }

  // Тип и состояние: «б/у оригинал», «не оригинал», «после переборки»
  for (let length = 2; length >= 1; length -= 1) {
    for (let start = 0; start + length <= tokens.length; start += 1) {
      const end = start + length;
      if (!isFree(start, end)) continue;
      const quality = findQualityWord(span(tokens, start, end));
      if (!quality) continue;
      scan.qualities.push({ start, end, quality });
      take(start, end);
    }
  }

  scan.hits.sort((a, b) => a.start - b.start);
  scan.makers.sort((a, b) => a.start - b.start);
  return scan;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Номера деталей: до нормализации, пока дефисы на месте
// ─────────────────────────────────────────────────────────────────────────────

/** Слово-признак перед номером: «OEM 12345», «артикул XXXXX», «номер детали 5555». */
const NUMBER_MARKER =
  /(?:^|[\s,;])(?:oem|оем|артикул|арт\.?|part\s*number|partnumber|p\/n|pn|каталожный\s+номер|кат\.?\s*номер|номер\s+детали|номер)\s*[:№#]?\s*([A-Za-zА-Яа-я0-9][A-Za-zА-Яа-я0-9\-–./]{2,})/giu;

export interface ExtractedCodes {
  numbers: string[];
  /** Фраза без номеров — её дальше разбирает обычный разбор */
  text: string;
}

/**
 * Номера деталей во фразе (приоритет первый: по номеру ищут раньше, чем по
 * названию). Две формы: после слова-признака («OEM 12345», «артикул ABC1»)
 * и сам по себе, если похож на номер («90915-YZZD1»).
 */
export function extractPartNumbers(text: string): ExtractedCodes {
  const numbers: string[] = [];
  const remember = (value: string): void => {
    const clean = value.replace(/[.,;:]+$/g, '');
    if (clean && !numbers.some((item) => norm(item) === norm(clean))) numbers.push(clean);
  };

  let rest = text.replace(NUMBER_MARKER, (match: string, value: string) => {
    // «номер телефона» — не номер детали: нужна цифра или код латиницей («артикул ABCD»)
    if (!/\d/.test(value) && !/^[A-Za-z][A-Za-z\-–./]{3,}$/.test(value)) return match;
    remember(value);
    return ' ';
  });

  rest = rest
    .split(/\s+/)
    .map((token) => {
      const clean = token.replace(/^[(«"']+|[)»"'.,;:!?]+$/g, '');
      if (clean && looksLikePartNumber(clean)) {
        remember(clean);
        return ' ';
      }
      return token;
    })
    .join(' ');

  // Номер сразу после производителя: «Denso 123456», «KYB 333388». У марки
  // техники («Toyota 2015», «тойота 500000») число — год или цена, поэтому
  // после неё номером считается только код с буквой или дефисом
  const words = rest.split(/\s+/);
  for (let i = 1; i < words.length; i += 1) {
    const maker = findMakerWord(words[i - 1]!);
    const value = words[i]!.replace(/^[(«"']+|[)»"'.,;:!?]+$/g, '');
    if (!maker || !/^[A-Za-z0-9][A-Za-z0-9\-–./]{3,}$/.test(value) || !/\d/.test(value)) continue;
    const digitsOnly = /^\d+$/.test(value);
    if (digitsOnly && (value.length < 5 || maker.machineBrand)) continue;
    // Код без знаков («NCP165», «1NZ») — кузов или мотор, а не номер; номер с буквами — с дефисом,
    // или длинный код у производителя деталей («KYB 3340a12»)
    const separated = /[-–./]/.test(value);
    const code = /^[A-Za-z]{2,4}\d{2,3}[A-Za-z]?$|^\d[A-Za-z]{2,3}$/.test(value);
    if (
      !digitsOnly &&
      (partNumberKey(value).length < 4 ||
        code ||
        (!separated && (maker.machineBrand || value.length < 6)))
    )
      continue;
    remember(value);
    words[i] = ' ';
  }
  rest = words.join(' ');

  return { numbers, text: numbers.length > 0 ? rest.replace(/\s+/g, ' ').trim() : text };
}
