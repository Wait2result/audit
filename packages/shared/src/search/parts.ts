import {
  PARTS_EQUIPMENT,
  isPartsCategory,
  partsEquipmentByCode,
  type PartsEquipment,
  type PartsEquipmentTypeCode,
} from '../constants/parts/equipment-types.js';
import { PART_MANUFACTURERS } from '../constants/parts/manufacturers.js';
import { SEARCH_DICTIONARY } from './dictionary/index.js';
import { norm } from './parser/normalize.js';

/**
 * Запчасти в поиске: синонимы деталей из таксономии (одна запись — один
 * тип техники, группа и, если названа, деталь) и правила выбора, когда слово
 * подходит нескольким типам техники.
 *
 * Принцип тот же, что у всего локального поиска: ложный выбор хуже вопроса.
 * «Рейка» — это рулевая рейка, но «насос» или «экран» без контекста могут быть
 * чем угодно, и тогда поиск спрашивает, о какой технике речь.
 */

export interface PartMatch {
  equipment: PartsEquipmentTypeCode;
  group: string;
  /** Код детали; null — слово назвало только группу («тормоза», «стиралка») */
  item: string | null;
}

interface AliasIndex {
  exact: Map<string, PartMatch[]>;
  stems: Map<string, PartMatch[]>;
  /** Самое длинное название в словах — глубже искать во фразе незачем */
  maxWords: number;
}

let cached: AliasIndex | null = null;

function add(map: Map<string, PartMatch[]>, key: string, match: PartMatch): void {
  const list = map.get(key);
  if (!list) {
    map.set(key, [match]);
    return;
  }
  const same = list.some(
    (item) =>
      item.equipment === match.equipment && item.group === match.group && item.item === match.item,
  );
  if (!same) list.push(match);
}

/** Слова короче пяти букв сравниваются только точно: «кот» не «котёл». */
const STEM_MIN = 5;

/**
 * Основа слова для сравнения: без падежного окончания («рейку» ~ «рейка»,
 * «рулевую» ~ «рулевая»). Отбрасываются последние две буквы, но остаётся не
 * меньше четырёх.
 */
const ENDING =
  /(ая|яя|ую|юю|ой|ий|ый|ое|ее|ые|ие|ами|ями|ов|ев|ей|ах|ях|ом|ем|а|я|у|ю|е|и|ы|о|ь)$/u;

function wordKey(word: string): string {
  if (word.length < STEM_MIN) return word;
  const bare = word.replace(ENDING, '');
  // Метка «~»: основа длинного слова не должна совпасть с целым коротким («мотор» ≠ «мото»)
  return `~${bare.length >= 3 ? bare : word}`;
}

function phraseKey(phrase: string): string {
  return phrase.split(' ').map(wordKey).join(' ');
}

function index(): AliasIndex {
  if (cached) return cached;
  const exact = new Map<string, PartMatch[]>();
  const stems = new Map<string, PartMatch[]>();
  let maxWords = 1;

  const register = (alias: string, match: PartMatch): void => {
    const key = norm(alias);
    if (!key) return;
    maxWords = Math.max(maxWords, key.split(' ').length);
    add(exact, key, match);
    add(stems, phraseKey(key), match);
  };

  for (const equipment of PARTS_EQUIPMENT) {
    for (const group of equipment.groups) {
      const groupMatch: PartMatch = { equipment: equipment.code, group: group.code, item: null };
      for (const alias of [group.label, ...group.aliases]) register(alias, groupMatch);
      for (const item of group.items) {
        const match: PartMatch = { equipment: equipment.code, group: group.code, item: item.code };
        for (const alias of [item.label, ...item.aliases]) register(alias, match);
      }
    }
  }
  cached = { exact, stems, maxWords };
  return cached;
}

/** Сколько слов в самом длинном названии детали. */
export function partAliasMaxWords(): number {
  return index().maxWords;
}

/** Что называет фраза (одно слово или несколько): точно, а у длинных слов — по основе. */
export function findPartAlias(phrase: string): PartMatch[] {
  const key = norm(phrase);
  if (!key) return [];
  const { exact, stems } = index();
  const found = exact.get(key);
  if (found) return found;
  return stems.get(phraseKey(key)) ?? [];
}

/** Ключ для поиска «двойников»: слово, которое называет ещё что-то кроме детали. */
export function partAliasStemKey(word: string): string {
  return phraseKey(norm(word));
}

/**
 * Обычные категории, которые называет то же слово («камера» — ещё и
 * «Фотоаппараты», «дверь» — ещё и «Двери и окна»). Нужны, чтобы вопрос
 * «что именно?» предложил и их, а не только типы техники.
 */
export function dualCategories(phrase: string): string[] {
  const key = partAliasStemKey(phrase);
  const slugs = new Set<string>();
  for (const entry of SEARCH_DICTIONARY) {
    if (entry.type !== 'category' || isPartsCategory(entry.canonical)) continue;
    if (entry.aliases.some((alias) => partAliasStemKey(alias) === key)) slugs.add(entry.canonical);
  }
  return [...slugs];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Слова, называющие технику и её вид
// ─────────────────────────────────────────────────────────────────────────────

export interface EquipmentWordHit {
  equipment: PartsEquipmentTypeCode;
  /** Вид техники внутри типа: поле и вариант («specialType» = «excavator») */
  kind?: { attribute: string; option: string };
}

let wordIndex: Map<string, EquipmentWordHit[]> | null = null;

function equipmentWords(): Map<string, EquipmentWordHit[]> {
  if (wordIndex) return wordIndex;
  const map = new Map<string, EquipmentWordHit[]>();
  const put = (word: string, hit: EquipmentWordHit): void => {
    const key = norm(word);
    if (!key) return;
    const list = map.get(key) ?? [];
    if (
      !list.some(
        (item) => item.equipment === hit.equipment && item.kind?.option === hit.kind?.option,
      )
    )
      list.push(hit);
    map.set(key, list);
  };
  for (const equipment of PARTS_EQUIPMENT) {
    for (const word of equipment.words) put(word, { equipment: equipment.code });
    if (equipment.kind) {
      for (const [option, words] of Object.entries(equipment.kind.words)) {
        for (const word of words) {
          put(word, {
            equipment: equipment.code,
            kind: { attribute: equipment.kind.attribute, option },
          });
        }
      }
    }
  }
  wordIndex = map;
  return map;
}

/** Слово — название техники или её вида («телефон», «экскаватор», «скутер»). */
export function findEquipmentWord(phrase: string): EquipmentWordHit[] {
  return equipmentWords().get(norm(phrase)) ?? [];
}

/** Слова, которые сами по себе говорят «речь о запчастях». */
export const GENERIC_PARTS_WORDS: ReadonlySet<string> = new Set([
  'запчасть',
  'запчасти',
  'запчастей',
  'запчастям',
  'запчастями',
  'комплектующие',
  'комплектующих',
  'комплектующим',
  'автозапчасти',
  'автозапчасть',
  'мотозапчасти',
  'мотозапчасть',
]);

/** Общее слово с подсказкой типа техники: «автозапчасти» — легковые. */
export const GENERIC_PARTS_EQUIPMENT: Readonly<Record<string, PartsEquipmentTypeCode>> = {
  автозапчасти: 'passenger_car',
  автозапчасть: 'passenger_car',
  мотозапчасти: 'moto',
  мотозапчасть: 'moto',
};

// ─────────────────────────────────────────────────────────────────────────────
//  Производитель, тип и состояние детали
// ─────────────────────────────────────────────────────────────────────────────

export interface MakerWordHit {
  /** Код производителя в справочнике part_manufacturer */
  value: string;
  /** Название — ещё и марка техники (Toyota, Samsung): во фразе это техника */
  machineBrand: boolean;
}

let makerIndex: Map<string, MakerWordHit> | null = null;
let makerMaxWords = 1;

function makerWords(): Map<string, MakerWordHit> {
  if (makerIndex) return makerIndex;
  const map = new Map<string, MakerWordHit>();
  for (const item of PART_MANUFACTURERS) {
    // «Другой производитель» — вариант формы, а не слово поиска
    if (item.value === 'other') continue;
    const hit = { value: item.value, machineBrand: item.machineBrand === true };
    for (const name of [item.label, item.value.replace(/_/g, ' '), ...(item.aliases ?? [])]) {
      const key = norm(name);
      // «Denso», «DENSO» и «денсо» — один производитель: первый записанный побеждает
      if (!key || map.has(key)) continue;
      map.set(key, hit);
      makerMaxWords = Math.max(makerMaxWords, key.split(' ').length);
    }
  }
  makerIndex = map;
  return map;
}

/** Слово или фраза — производитель детали из справочника («kyb», «денсо»). */
export function findMakerWord(phrase: string): MakerWordHit | undefined {
  return makerWords().get(norm(phrase));
}

export function makerMaxWordCount(): number {
  makerWords();
  return makerMaxWords;
}

/** Тип детали и состояние словами: «б/у оригинал», «восстановленная», «аналог». */
export interface PartQuality {
  condition?: 'new' | 'used' | 'restored';
  originality?: 'original' | 'analog';
}

const QUALITY_WORDS: ReadonlyArray<readonly [readonly string[], PartQuality]> = [
  [['новая', 'новый', 'новое', 'новые', 'новую', 'новой', 'нового'], { condition: 'new' }],
  [
    ['б у', 'бу', 'бэу', 'бушная', 'бушный', 'бушную', 'бушные', 'подержанная', 'подержанный'],
    { condition: 'used' },
  ],
  // «Контрактная» — это «Оригинал» + «Б/У», отдельного значения нет
  [
    ['контрактная', 'контрактный', 'контрактную', 'контрактные', 'контрактное', 'контракт'],
    { condition: 'used', originality: 'original' },
  ],
  [
    [
      'восстановленная',
      'восстановленный',
      'восстановленную',
      'восстановленные',
      'восстановленное',
      'восстановленной',
      'перебранная',
      'перебранный',
      'перебранную',
      'после переборки',
      'после восстановления',
    ],
    { condition: 'restored' },
  ],
  [
    [
      'оригинал',
      'оригинала',
      'оригинальная',
      'оригинальный',
      'оригинальную',
      'оригинальные',
      'оригинальное',
      'оригинальной',
      'ориг',
      'родная',
      'родной',
      'родную',
    ],
    { originality: 'original' },
  ],
  [
    [
      'аналог',
      'аналога',
      'аналоги',
      'аналогов',
      'неоригинал',
      'неоригинальная',
      'неоригинальный',
      'неоригинальную',
      'неоригинальные',
      'не оригинал',
      'не оригинальная',
      'не оригинальный',
    ],
    { originality: 'analog' },
  ],
];

const QUALITY_INDEX = new Map<string, PartQuality>(
  QUALITY_WORDS.flatMap(([words, quality]) => words.map((word) => [word, quality] as const)),
);

/** Тип или состояние детали по слову или паре слов. */
export function findQualityWord(phrase: string): PartQuality | undefined {
  return QUALITY_INDEX.get(norm(phrase));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Разрешение
// ─────────────────────────────────────────────────────────────────────────────

export interface PartResolution {
  equipment: PartsEquipmentTypeCode;
  group: string | null;
  item: string | null;
}

export type PartsDecision =
  | { status: 'resolved'; resolution: PartResolution }
  /** Подходит нескольким типам техники — спросить, каким */
  | { status: 'equipment'; equipments: PartsEquipmentTypeCode[]; matches: PartMatch[] }
  /** Тип техники один, но деталь есть у нескольких групп («насос» у стиралки и посудомойки) */
  | { status: 'group'; equipment: PartsEquipmentTypeCode; groups: string[]; matches: PartMatch[] }
  | { status: 'none' };

export interface PartsEvidence {
  /** Названия деталей и групп из фразы (нормализованные) */
  aliases: readonly string[];
  /** Типы техники, названные словами фразы или определённые по марке и модели */
  equipment: readonly PartsEquipmentTypeCode[];
  /** Группа и деталь, уже выбранные человеком (нажатый вариант) */
  group?: string | null;
  item?: string | null;
}

/**
 * Что имел в виду человек: какой тип техники, какая группа и деталь.
 * Название детали даёт кандидатов (тип техники, группа, деталь); названный тип
 * техники и выбранная группа их сужают; единственный оставшийся — ответ,
 * несколько типов техники — вопрос «какой?», несколько групп одного типа —
 * вопрос «какой именно?».
 */
export function decideParts(evidence: PartsEvidence): PartsDecision {
  let candidates: PartMatch[] = [];
  const namedGroups = new Set<string>();
  for (const alias of evidence.aliases) {
    const found = findPartAlias(alias);
    candidates.push(...found);
    // Слово назвало только группы («стиралка», «посудомойка»): они сужают детали
    if (found.length > 0 && found.every((match) => match.item === null)) {
      for (const match of found) namedGroups.add(`${match.equipment}/${match.group}`);
    }
  }

  if (candidates.length === 0) {
    // Названа только техника («запчасти на экскаватор»): деталь не придумывается
    const equipments = [...new Set(evidence.equipment)];
    if (equipments.length === 1 && partsEquipmentByCode(equipments[0]!)) {
      return {
        status: 'resolved',
        resolution: {
          equipment: equipments[0]!,
          group: evidence.group ?? null,
          item: evidence.item ?? null,
        },
      };
    }
    return equipments.length > 1
      ? { status: 'equipment', equipments, matches: [] }
      : { status: 'none' };
  }

  // 1. Тип техники из слов, марки или открытой категории: «насос на стиралку Samsung»
  if (evidence.equipment.length > 0) {
    const wanted = new Set(evidence.equipment);
    const narrowed = candidates.filter((match) => wanted.has(match.equipment));
    if (narrowed.length > 0) candidates = narrowed;
  }

  // 2. Названная группа сужает детали: «насос» + «стиралка» — насос стиральной машины
  if (namedGroups.size > 0) {
    const inGroups = candidates.filter(
      (match) => match.item !== null && namedGroups.has(`${match.equipment}/${match.group}`),
    );
    if (inGroups.length > 0) candidates = inGroups;
  }

  // 3. Выбор человека (нажатый вариант)
  if (evidence.group) {
    const narrowed = candidates.filter((match) => match.group === evidence.group);
    if (narrowed.length > 0) candidates = narrowed;
  }
  if (evidence.item) {
    const narrowed = candidates.filter((match) => match.item === evidence.item);
    if (narrowed.length > 0) candidates = narrowed;
  }

  // 4. Внутри одного типа техники конкретная деталь важнее слова-группы
  const withItem = new Set(candidates.filter((m) => m.item !== null).map((m) => m.equipment));
  candidates = candidates.filter((match) => match.item !== null || !withItem.has(match.equipment));

  const equipments = [...new Set(candidates.map((match) => match.equipment))];
  if (equipments.length > 1) return { status: 'equipment', equipments, matches: candidates };

  const groups = [...new Set(candidates.map((match) => match.group))];
  if (groups.length > 1) {
    return { status: 'group', equipment: equipments[0]!, groups, matches: candidates };
  }

  // Одна группа: деталь — если названа одна; несколько деталей группы — только группа
  const items = [...new Set(candidates.map((match) => match.item).filter((item) => item !== null))];
  return {
    status: 'resolved',
    resolution: {
      equipment: equipments[0]!,
      group: groups[0] ?? null,
      item: items.length === 1 ? items[0]! : null,
    },
  };
}

/** Подписи группы и детали из таксономии — для условий и вопросов. */
export function partLabels(
  equipment: PartsEquipment | PartsEquipmentTypeCode,
  group: string | null,
  item: string | null,
): { group: string | null; item: string | null } {
  const record = typeof equipment === 'string' ? partsEquipmentByCode(equipment) : equipment;
  const groupRecord = record?.groups.find((entry) => entry.code === group);
  return {
    group: groupRecord?.label ?? null,
    item: groupRecord?.items.find((entry) => entry.code === item)?.label ?? null,
  };
}

/** Короткое название типа техники для вариантов выбора («Телефон»). */
export function equipmentLabel(code: PartsEquipmentTypeCode): string {
  return partsEquipmentByCode(code)?.label ?? code;
}
