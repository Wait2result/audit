import {
  ATTRIBUTE_SYNONYMS,
  CATEGORY_SLANG,
  CATEGORY_SYNONYMS,
  FILLER_WORDS as SEARCH_FILLER_WORDS,
  LISTING_DEFAULT_RADIUS_KM,
  ListingSort,
  PARTS_EQUIPMENT,
  PART_MANUFACTURER_KIND,
  decideParts,
  isPartsCategory,
  partLabels,
  partsEquipmentByCode,
  partsEquipmentBySlug,
  goodsDirectionBySlug,
  isCatalogLeaf,
  mainTypeBySlug,
  mainTypeOf,
  type PartMatch,
  type PartsEquipmentTypeCode,
  classifyListingTitle,
  listingListQuerySchema,
  looksLike,
  type ListingAttribute,
  type ListingListQuery,
  type SmartSearchClarification,
  type SmartSearchClarificationOption,
  type SmartSearchCondition,
  type SmartSearchFilterValue,
  type SmartSearchIntentCore,
  type SmartSearchNormalizedQuery,
  type SmartSearchPreference,
} from '@dagestan/shared';

import type {
  CategoryRecord,
  DictionaryRecord,
  ListingCatalogue,
} from '../../listings/listing-categories.service.js';
import { entryEquipment } from '../../listings/listing-categories.service.js';
import {
  extractAmounts,
  formatRubles,
  isGroundedNumber,
  parseAmount,
} from '../normalize/amounts.js';
import { resolvePlace } from '../normalize/location.js';
import { norm, sameStem, words } from '../normalize/text.js';
import type { DomainRequestContext, NormalizeOutcome } from './domain-adapter.js';
import { emptyQuery } from './domain-adapter.js';

/**
 * Объявления: намерение → запрос существующей ленты `GET /listings`.
 *
 * Источник правды — каталог объявлений (`ListingCatalogue`): категории,
 * поля категорий и справочники марок и моделей из базы. Своих списков здесь
 * нет. Модель присылает «кандидатов» («саксид», «Toyota», «автомат»), а
 * нормализатор находит их в справочниках по подписи, коду и написаниям;
 * не нашлось — значение не применяется, а не угадывается.
 */

/** Поля, общие для всех категорий. Остальные — ключи характеристик из каталога. */
export const LISTING_BASE_KEYS = [
  'category',
  'brand',
  'model',
  'price',
  'transactionType',
  'rentPeriod',
  'onlyWithPhoto',
  // Запчасти: слова фразы, которые сервер превращает в тип техники, группу и деталь
  'partAlias',
  'equipmentType',
  'parts',
  'partDual',
  'partMaker',
] as const;

export interface ListingPlan {
  query: ListingListQuery;
}

/**
 * Разговорные названия значений («АКПП» — «Автомат», «4вд» — полный привод) —
 * из общего словаря поиска (packages/shared/src/search): ключ — поле,
 * затем слово → код варианта.
 */
const VALUE_SYNONYMS: Readonly<Record<string, Readonly<Record<string, string>>>> = (() => {
  const result: Record<string, Record<string, string>> = {};
  for (const entry of ATTRIBUTE_SYNONYMS) {
    if (!entry.field || entry.value !== undefined) continue;
    const field = (result[entry.field] ??= {});
    for (const alias of entry.aliases) field[norm(alias)] ??= entry.canonical;
  }
  return result;
})();

const TRANSACTION_VALUES: Readonly<Record<string, 'sale' | 'rent'>> = {
  sale: 'sale',
  buy: 'sale',
  купить: 'sale',
  продажа: 'sale',
  rent: 'rent',
  снять: 'rent',
  аренда: 'rent',
  арендовать: 'rent',
};

const RENT_PERIODS: Readonly<Record<string, 'daily' | 'monthly'>> = {
  daily: 'daily',
  посуточно: 'daily',
  monthly: 'monthly',
  помесячно: 'monthly',
  надолго: 'monthly',
};

// ─────────────────────────────────────────────────────────────────────────────
//  Каталог
// ─────────────────────────────────────────────────────────────────────────────

/** Категории, в которых ищут: включённые, не снятые и не ярлыки-переходы. */
export function searchableCategories(catalogue: ListingCatalogue): CategoryRecord[] {
  return catalogue.categories.filter(
    (category) => category.isActive && !category.shortcut && !category.deprecatedToId,
  );
}

/** Все имена фильтров, которые знает каталог: общие плюс ключи характеристик. */
export function listingFilterKeys(catalogue: ListingCatalogue): Set<string> {
  const keys = new Set<string>(LISTING_BASE_KEYS);
  for (const category of catalogue.categories) {
    for (const attribute of catalogue.attributesOf(category.id)) {
      if (attribute.filterable) keys.add(attribute.key);
    }
  }
  return keys;
}

function attributesFor(
  catalogue: ListingCatalogue,
  category: CategoryRecord,
): readonly ListingAttribute[] {
  return category.isLeaf
    ? catalogue.attributesOf(category.id)
    : catalogue.attributesForSubtree(catalogue.subtreeIds(category.id));
}

/** Категория по коду, названию или «одному предмету»: «квартиры», «Автомобиль». */
export function findCategory(
  catalogue: ListingCatalogue,
  candidate: string,
): CategoryRecord | null {
  const categories = searchableCategories(catalogue);
  const value = norm(candidate);
  if (!value) return null;
  return (
    categories.find((category) => category.slug === candidate.trim()) ??
    categories.find(
      (category) =>
        norm(category.name) === value || (category.itemLabel && norm(category.itemLabel) === value),
    ) ??
    categories.find(
      (category) =>
        (!category.name.includes(' ') && sameStem(category.name, value)) ||
        (category.itemLabel !== null &&
          !category.itemLabel.includes(' ') &&
          sameStem(category.itemLabel, value)),
    ) ??
    null
  );
}

/** Все написания записи справочника: код, подпись, написания для поиска. */
function formsOf(entry: DictionaryRecord): string[] {
  return [entry.value, entry.value.replace(/_/g, ' '), entry.label, ...entry.aliases].map(norm);
}

/** Запись справочника по слову человека: «саксид» → Succeed, «тойота» → Toyota. */
export function findEntry(
  entries: readonly DictionaryRecord[],
  candidate: string,
): DictionaryRecord | null {
  const value = norm(candidate);
  if (!value) return null;
  return entries.find((entry) => formsOf(entry).includes(value)) ?? null;
}

/**
 * Марка техники: поле «brand» у самой техники и «compatBrand» у запчастей (марка
 * того, к чему подходит деталь). Другие поля типа «brand» — категория детали
 * и производитель детали — маркой не считаются.
 */
const BRAND_KEYS: ReadonlySet<string> = new Set(['brand', 'compatBrand']);
const MODEL_KEYS: ReadonlySet<string> = new Set(['model', 'compatModel']);

function brandAttribute(attributes: readonly ListingAttribute[]): ListingAttribute | null {
  // Марка техники во фразе «зимняя резина на суксид» — это «Подходит к», а не
  // бренд самих шин: совместимость важнее, если она у подкатегории есть
  return (
    attributes.find((item) => item.key === 'compatBrand' && item.dictionary) ??
    attributes.find(
      (item) => item.type === 'brand' && item.dictionary && BRAND_KEYS.has(item.key),
    ) ??
    null
  );
}

function modelAttribute(attributes: readonly ListingAttribute[]): ListingAttribute | null {
  return (
    attributes.find((item) => item.key === 'compatModel' && item.dictionary && item.parentKey) ??
    attributes.find(
      (item) =>
        item.type === 'model' && item.dictionary && item.parentKey && MODEL_KEYS.has(item.key),
    ) ??
    null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Значения характеристик
// ─────────────────────────────────────────────────────────────────────────────

type Converted = { ok: true; value: unknown; display: string } | { ok: false; reason: string };

/** Длина общего начала двух слов. */
function commonPrefix(a: string, b: string): number {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index += 1;
  return index;
}

/**
 * Слово фразы — форма подписи варианта: «бензиновые» ~ «Бензин»,
 * «механическая» ~ «Механика», «полный (привод)» ~ «Полный». Общее начало —
 * не короче четырёх букв и почти вся подпись.
 */
function wordMatchesLabel(word: string, label: string): boolean {
  const target = norm(label);
  if (target.length < 3 || /[^\p{L}]/u.test(target)) return word === target;
  const common = commonPrefix(word, target);
  return word === target || (common >= 4 && common >= target.length - 2);
}

function optionFor(attribute: ListingAttribute, candidate: string | number) {
  const value = norm(String(candidate));
  const synonym = VALUE_SYNONYMS[attribute.key]?.[value];
  const exact =
    attribute.options?.find(
      (option) =>
        option.value === synonym ||
        norm(option.value) === value ||
        norm(option.label) === value ||
        (option.aliases ?? []).map(norm).includes(value) ||
        sameStem(option.label, value),
    ) ?? null;
  if (exact) return exact;
  // Несколько слов или другая форма слова: вариант — если он один такой
  const loose = (attribute.options ?? []).filter((option) =>
    value.split(' ').some((word) => wordMatchesLabel(word, option.label)),
  );
  return loose.length === 1 ? loose[0]! : null;
}

function rangeOf(value: SmartSearchFilterValue): { min?: number; max?: number } | null {
  if (typeof value === 'number') return { min: value, max: value };
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const min = value.min === undefined ? undefined : parseAmount(value.min);
    const max = value.max === undefined ? undefined : parseAmount(value.max);
    if (min === null || max === null) return null;
    return { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
  }
  if (typeof value === 'string') {
    const amount = parseAmount(value);
    return amount === null ? null : { min: amount, max: amount };
  }
  return null;
}

function rangeText(range: { min?: number; max?: number }, unit?: string): string {
  const suffix = unit ? ` ${unit}` : '';
  if (range.min !== undefined && range.max !== undefined) {
    return range.min === range.max
      ? `${range.min}${suffix}`
      : `от ${range.min} до ${range.max}${suffix}`;
  }
  return range.min !== undefined ? `от ${range.min}${suffix}` : `до ${range.max}${suffix}`;
}

/** Значение модели → значение фильтра характеристики в форме существующего API. */
export function convertAttribute(
  attribute: ListingAttribute,
  raw: SmartSearchFilterValue,
): Converted {
  if (!attribute.filterable) return { ok: false, reason: 'По этому полю не фильтруют' };

  if (attribute.type === 'boolean') {
    const truthy =
      raw === true || (typeof raw === 'string' && ['да', 'true', 'есть'].includes(norm(raw)));
    const falsy =
      raw === false || (typeof raw === 'string' && ['нет', 'false'].includes(norm(raw)));
    if (!truthy && !falsy) return { ok: false, reason: 'Ожидалось «да» или «нет»' };
    return { ok: true, value: truthy, display: truthy ? 'да' : 'нет' };
  }

  if (attribute.options && attribute.options.length > 0) {
    // Варианты-числа («256 ГБ», «4+ комнаты»): границы выбирают подходящие варианты
    const numericOptions = attribute.options.every((option) => /^\d+$/.test(option.value));
    if (numericOptions && typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      const range = rangeOf(raw);
      if (!range) return { ok: false, reason: 'Непонятные границы' };
      const picked = attribute.options.filter((option) => {
        const number = Number(option.value);
        // «4+» означает «от четырёх»: подходит любой нижней границе выше трёх
        const isOpenEnded = option.label.includes('+') || option.label.includes('больше');
        return (
          (range.min === undefined || number >= range.min || (isOpenEnded && range.min > number)) &&
          (range.max === undefined || number <= range.max)
        );
      });
      if (picked.length === 0) return { ok: false, reason: 'Нет подходящих вариантов' };
      const value =
        attribute.type === 'number'
          ? picked.map((o) => Number(o.value))
          : picked.map((o) => o.value);
      return { ok: true, value, display: picked.map((option) => option.label).join(', ') };
    }

    const items = Array.isArray(raw) ? raw : [raw];
    const picked = [];
    for (const item of items) {
      if (typeof item === 'object') return { ok: false, reason: 'Ожидался вариант из списка' };
      let option = optionFor(attribute, item as string | number);
      // «5 комнат» при варианте «4+»: число больше крайнего — это крайний «и больше»
      if (!option && numericOptions && typeof item === 'number') {
        const last = attribute.options[attribute.options.length - 1];
        if (last && item > Number(last.value) && last.label.includes('+')) option = last;
      }
      if (!option) return { ok: false, reason: `Нет варианта «${String(item)}»` };
      picked.push(option);
    }
    const unique = [...new Map(picked.map((option) => [option.value, option])).values()];
    const values = unique.map((option) =>
      attribute.type === 'number' ? Number(option.value) : option.value,
    );
    const value = attribute.filter === 'select' && values.length === 1 ? values[0] : values;
    return { ok: true, value, display: unique.map((option) => option.label).join(', ') };
  }

  if (attribute.type === 'number' || attribute.type === 'date') {
    const range = rangeOf(raw);
    if (!range) return { ok: false, reason: 'Ожидалось число' };
    return {
      ok: true,
      value: {
        ...(range.min !== undefined ? { from: range.min } : {}),
        ...(range.max !== undefined ? { to: range.max } : {}),
      },
      display: rangeText(range, attribute.unit),
    };
  }

  if (attribute.filter === 'text' && (typeof raw === 'string' || typeof raw === 'number')) {
    return { ok: true, value: String(raw), display: String(raw) };
  }
  return { ok: false, reason: 'Значение не подходит полю' };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Нормализация
// ─────────────────────────────────────────────────────────────────────────────

interface BrandModelHit {
  category: CategoryRecord;
  brand: DictionaryRecord | null;
  models: DictionaryRecord[];
}

function asText(value: SmartSearchFilterValue | undefined): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

/**
 * Модели «X или новее»: та же линейка с номером не меньше. «iPhone 15» →
 * iPhone 15, 15 Plus, 15 Pro, 16, 16e, 17 … Только из справочника марки.
 */
function modelsFrom(
  entries: readonly DictionaryRecord[],
  bound: { min?: string; max?: string },
): DictionaryRecord[] | null {
  const seriesOf = (label: string) => {
    const match = /^(.*?)(\d+)/.exec(norm(label));
    return match ? { family: (match[1] ?? '').trim(), number: Number(match[2]) } : null;
  };
  const min = bound.min ? seriesOf(findEntry(entries, bound.min)?.label ?? bound.min) : null;
  const max = bound.max ? seriesOf(findEntry(entries, bound.max)?.label ?? bound.max) : null;
  const family = min?.family ?? max?.family;
  if (family === undefined || (bound.min && !min) || (bound.max && !max)) return null;
  const picked = entries.filter((entry) => {
    const series = seriesOf(entry.label);
    return (
      series !== null &&
      series.family === family &&
      (!min || series.number >= min.number) &&
      (!max || series.number <= max.number)
    );
  });
  return picked.length > 0 ? picked : null;
}

/** Предел «линейки»: больше — это уже не модель, а вся марка. */
const MAX_FAMILY = 60;

/**
 * Линейка по началу названия: «макбук» → MacBook Air, MacBook Pro, MacBook;
 * «айфон 15» → iPhone 15, 15 Plus, 15 Pro, 15 Pro Max. Совпадение — по целым
 * словам подписи или её написаний, не по части слова.
 */
function familyOf(entries: readonly DictionaryRecord[], candidate: string): DictionaryRecord[] {
  const value = norm(candidate);
  if (value.length < 3) return [];
  const picked = entries.filter((entry) =>
    formsOf(entry).some((form) => form.startsWith(`${value} `)),
  );
  return picked.length <= MAX_FAMILY ? picked : [];
}

/**
 * Модель по концу названия: «15 Pro» → iPhone 15 Pro, «15 про» → «айфон 15
 * про». Только если такая запись одна — иначе это не модель, а догадка.
 */
function bySuffix(
  entries: readonly DictionaryRecord[],
  candidate: string,
): DictionaryRecord | null {
  const value = norm(candidate);
  if (value.length < 2) return null;
  const picked = entries.filter((entry) =>
    formsOf(entry).some((form) => form.endsWith(` ${value}`)),
  );
  return picked.length === 1 ? picked[0]! : null;
}

/** Модели по значению фильтра: одна, список или «от … и новее». */
function resolveModels(
  entries: readonly DictionaryRecord[],
  raw: SmartSearchFilterValue,
): { models: DictionaryRecord[]; missing: string[]; display?: string } {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const bound = {
      ...(raw.min !== undefined ? { min: String(raw.min) } : {}),
      ...(raw.max !== undefined ? { max: String(raw.max) } : {}),
    };
    const models = modelsFrom(entries, bound);
    const display =
      bound.min && bound.max
        ? `${bound.min} — ${bound.max}`
        : bound.min
          ? `${bound.min} и новее`
          : `${bound.max} и старше`;
    return models
      ? { models, missing: [], display }
      : { models: [], missing: [bound.min ?? bound.max ?? ''] };
  }
  const items = (Array.isArray(raw) ? raw : [raw]).map(String);
  const models: DictionaryRecord[] = [];
  const missing: string[] = [];
  let display: string | undefined;
  for (const item of items) {
    const entry = findEntry(entries, item) ?? bySuffix(entries, item);
    if (entry) {
      models.push(entry);
      continue;
    }
    const family = familyOf(entries, item);
    if (family.length > 0) {
      models.push(...family);
      display = `${item} (все модели линейки)`;
    } else {
      missing.push(item);
    }
  }
  return display ? { models, missing, display } : { models, missing };
}

/** Где марка и модель вообще встречаются: категории с таким справочником. */
function brandModelHits(
  catalogue: ListingCatalogue,
  brandCandidate: string | null,
  modelValue: SmartSearchFilterValue | undefined,
  only: CategoryRecord | null,
): BrandModelHit[] {
  const hits: BrandModelHit[] = [];
  const seenKinds = new Map<string, BrandModelHit>();
  const categories = only ? [only] : searchableCategories(catalogue).filter((c) => c.isLeaf);

  for (const category of categories) {
    const attributes = attributesFor(catalogue, category);
    const brandField = brandAttribute(attributes);
    if (!brandField?.dictionary) continue;
    const modelField = modelAttribute(attributes);
    const binding = attributes.find((item) => item.key === brandField.key);

    let brand: DictionaryRecord | null = null;
    if (brandCandidate) {
      brand = findEntry(catalogue.dictionaryEntries(brandField.dictionary), brandCandidate);
      if (!brand) continue;
    }

    let models: DictionaryRecord[] = [];
    if (modelValue !== undefined && modelField?.dictionary) {
      const pool = catalogue.dictionaryEntries(
        modelField.dictionary,
        brand ? brand.value : undefined,
      );
      models = resolveModels(pool, modelValue).models;
      if (models.length === 0 && !brand) continue;
      if (!brand && models[0]) {
        const parents = new Set(models.map((model) => model.parentValue));
        if (parents.size === 1) {
          brand = findEntry(
            catalogue.dictionaryEntries(brandField.dictionary),
            models[0].parentValue,
          );
        }
      }
    } else if (!brandCandidate) {
      continue;
    }

    // Один и тот же справочник у нескольких категорий (марка авто — у машин и
    // у запчастей): остаётся та, где марка обязательна — основная для него
    const kind = brandField.dictionary;
    const hit: BrandModelHit = { category, brand, models };
    const previous = seenKinds.get(kind);
    if (!previous) {
      seenKinds.set(kind, hit);
      hits.push(hit);
    } else if (
      binding?.required &&
      !attributesFor(catalogue, previous.category).find((a) => a.key === brandField.key)?.required
    ) {
      hits.splice(hits.indexOf(previous), 1, hit);
      seenKinds.set(kind, hit);
    }
  }
  return hits;
}

/**
 * Несколько категорий с одной маркой (Apple — телефоны, планшеты, ноутбуки,
 * часы): если слово человека — начало названий моделей только одной из них
 * («айфон» → iPhone …, «макбук» → MacBook …), это она.
 */
function hintedByWord(
  catalogue: ListingCatalogue,
  hits: readonly BrandModelHit[],
  brandCandidate: string | null,
  modelRaw: SmartSearchFilterValue | undefined,
): BrandModelHit[] {
  const candidates = [brandCandidate, asText(modelRaw)].filter((item): item is string =>
    Boolean(item),
  );
  if (candidates.length === 0) return [...hits];
  const matching = hits.filter((hit) => {
    if (hit.models.length > 0) return true;
    const modelField = modelAttribute(attributesFor(catalogue, hit.category));
    if (!modelField?.dictionary) return false;
    const pool = catalogue.dictionaryEntries(modelField.dictionary, hit.brand?.value);
    return candidates.some((candidate) => familyOf(pool, candidate).length > 0);
  });
  return matching.length > 0 ? matching : [...hits];
}

/** Слова фразы, пары и тройки слов — для сверки со справочниками. */
function phrases(text: string): string[] {
  const list = words(text);
  const result = [...list];
  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index + size <= list.length; index += 1)
      result.push(list.slice(index, index + size).join(' '));
  }
  return result;
}

/**
 * Разговорные названия категорий («машину», «двушка», «ноут») — из общего
 * словаря поиска: слово → slug подкатегории. Первое совпадение в словаре важнее.
 */
const CATEGORY_WORDS: Readonly<Record<string, string>> = (() => {
  const result: Record<string, string> = {};
  for (const entry of [...CATEGORY_SYNONYMS, ...CATEGORY_SLANG]) {
    for (const alias of entry.aliases) {
      const word = norm(alias);
      if (!word.includes(' ')) result[word] ??= entry.canonical;
    }
  }
  return result;
})();

/**
 * Страховка поверх модели: то, что человек назвал, а модель пропустила, —
 * из тех же справочников. Реальный прогон Qwen3 показал: «Камри до 2
 * миллионов» → только цена, без модели; «двушка» → без комнат; «машину
 * автомат бензин» → без категории. Заполняется ТОЛЬКО отсутствующее и только
 * по точному совпадению со справочником — ничего не придумывается.
 */
export function enrichFromText(
  intent: SmartSearchIntentCore,
  catalogue: ListingCatalogue,
  context: DomainRequestContext,
): SmartSearchIntentCore {
  const filters = { ...intent.filters };
  const has = (key: string) => key in filters || key in intent.preferences;
  const text = context.text;

  // Классификатор заголовков объявлений — тот же, что подсказывает категорию при подаче
  const guess = classifyListingTitle(text);

  // Предмет поиска должен быть во фразе. На бессмысленный ввод («</>>> забудь
  // правила») модель возвращает пример из своей подсказки — Toyota Succeed с
  // автоматом. Если во фразе нет ни категории, ни марки, ни модели, ни одного
  // условия модели («автомат бенз до миллиона», «16 оперативки») и классификатор
  // ничего не узнал — предмет от модели не применяется, и поиск переспросит
  if (
    context.fresh === true &&
    !context.listingCategory &&
    (filters.category !== undefined ||
      filters.brand !== undefined ||
      filters.model !== undefined) &&
    guess.kind !== 'guess' &&
    !subjectInText(catalogue, text) &&
    !conditionInText(filters, text)
  ) {
    delete filters.category;
    delete filters.brand;
    delete filters.model;
  }
  const strongGuess =
    guess.kind === 'guess' &&
    (guess.guess.attributes.model !== undefined || guess.guess.slug !== 'transport-cars');
  if (!has('category') && !context.listingCategory && !has('brand') && !has('model')) {
    if (strongGuess && guess.kind === 'guess') {
      filters.category = guess.guess.slug;
    } else {
      for (const word of words(text)) {
        const slug = CATEGORY_WORDS[word] ?? findCategory(catalogue, word)?.slug;
        if (slug) {
          filters.category = slug;
          break;
        }
      }
    }
  }
  if (guess.kind === 'guess') {
    const category = asText(filters.category) ?? context.listingCategory;
    const sameCategory =
      category !== undefined && findCategory(catalogue, category)?.slug === guess.guess.slug;
    // Деталь запчасти выбирает разбор запчастей (applyPartsIntent), а не классификатор
    if ((sameCategory || (!category && strongGuess)) && !isPartsCategory(guess.guess.slug)) {
      for (const [key, value] of Object.entries(guess.guess.attributes)) {
        if (!has(key)) filters[key] = value;
      }
    }
  }

  // Модель, названная во фразе, но пропущенная моделью («камри», «саксид»)
  // или разобранная неверно (реальный ответ Qwen3 на «Макбук» — марка «Mac»,
  // модель «Book»: ни того, ни другого в справочниках нет)
  const brandRaw = asText(filters.brand ?? intent.preferences.brand);
  const modelRawValue = filters.model ?? intent.preferences.model;
  const unknownPair =
    (has('brand') || has('model')) &&
    brandModelHits(catalogue, brandRaw, modelRawValue, null).length === 0 &&
    (brandRaw === null || !brandKnown(catalogue, brandRaw));
  if ((!has('brand') && !has('model')) || unknownPair) {
    const found = modelInText(catalogue, text);
    if (found) {
      filters.model = found.label;
      if (found.brand) filters.brand = found.brand;
      else delete filters.brand;
      // Модель назвала чужую категорию («ищу суксида» → «Собаки»): у неё нет такой
      // марки — категорию выберет справочник марок, а не догадка модели
      const current = asText(filters.category);
      const record = current ? findCategory(catalogue, current) : null;
      const field = record ? brandAttribute(attributesFor(catalogue, record)) : null;
      if (
        current &&
        found.brand &&
        (!field?.dictionary ||
          !findEntry(catalogue.dictionaryEntries(field.dictionary), found.brand))
      ) {
        delete filters.category;
      }
    }
  }

  // «16 ГБ оперативки» модель кладёт в память накопителя — это ОЗУ
  if (RAM_WORDS.test(norm(text)) && filters.memory !== undefined && !has('ram')) {
    filters.ram = filters.memory;
    delete filters.memory;
  }

  // Цена словами, которую модель не вернула или вернула не туда («до 2 ляма» → 2 литра)
  if (!has('price')) {
    const price = priceFromText(text);
    if (price) filters.price = price;
  }

  return { ...intent, filters };
}

const RAM_WORDS = /(^| )(оператив\p{L}*|озу|ram)( |$)/u;

/**
 * «до 1.2 млн», «до двух миллионов», «не дороже 500 тысяч», «от 300 тыс» —
 * граница цены по словам фразы. Только суммы от 10 000: «до 2015 года» и
 * «до 30 минут» ценой не становятся.
 */
function priceFromText(text: string): { min?: number; max?: number } | null {
  const lower = text.toLowerCase().replace(/ё/g, 'е');
  const range: { min?: number; max?: number } = {};
  for (const match of lower.matchAll(
    /(?:^|[^\p{L}])(до|не дороже|не больше|дешевле|от)\s+((?:[\p{L}\d.,]+\s*){1,3})/gu,
  )) {
    const amount = extractAmounts(match[2] ?? '')[0];
    if (amount === undefined || amount < 10_000) continue;
    if (match[1] === 'от') range.min ??= amount;
    else range.max ??= amount;
  }
  return range.min !== undefined || range.max !== undefined ? range : null;
}

/**
 * Назван ли во фразе предмет объявлений: слово категории («машину»,
 * «квартиры»), марка («тойота»), модель («камри», «саксид») или их часть.
 */
function subjectInText(catalogue: ListingCatalogue, text: string): boolean {
  const list = words(text);
  if (list.some((word) => CATEGORY_WORDS[word] !== undefined)) return true;
  if (list.some((word) => word.length >= 4 && findCategory(catalogue, word) !== null)) return true;
  if (phrases(text).some((phrase) => phrase.length >= 2 && brandKnown(catalogue, phrase)))
    return true;
  return modelInText(catalogue, text) !== null;
}

/**
 * Есть ли во фразе хоть одно условие модели, кроме предмета: число («16
 * оперативки», «до миллиона») или слово значения («автомат», «бенз» ~ «бензин»).
 */
function conditionInText(filters: SmartSearchIntentCore['filters'], text: string): boolean {
  const list = words(text);
  const grounded = (value: unknown): boolean => {
    if (typeof value === 'number') return isGroundedNumber(value, text);
    if (typeof value === 'string')
      return words(value).some((part) => list.some((word) => sameStem(word, part)));
    if (Array.isArray(value)) return value.some(grounded);
    if (value && typeof value === 'object') return Object.values(value).some(grounded);
    return false;
  };
  return Object.entries(filters).some(
    ([key, value]) => key !== 'category' && key !== 'brand' && key !== 'model' && grounded(value),
  );
}

/**
 * Марка, названная во фразе (одним или двумя словами) — по справочникам
 * марок всех категорий; с опечаткой — только если похожа ровно на одну
 * марку («тойта» → Toyota, а «толя» — нет).
 */
export function brandInText(
  catalogue: ListingCatalogue,
  freeWords: readonly string[],
): { label: string; words: string[] } | null {
  const entries: DictionaryRecord[] = [];
  const seen = new Set<string>();
  for (const category of searchableCategories(catalogue)) {
    const field = brandAttribute(attributesFor(catalogue, category));
    if (!field?.dictionary || seen.has(field.dictionary)) continue;
    seen.add(field.dictionary);
    entries.push(
      ...catalogue.dictionaryEntries(field.dictionary).filter((e) => e.value !== 'other'),
    );
  }
  const candidates: string[][] = [];
  for (let i = 0; i < freeWords.length; i += 1) {
    if (i + 1 < freeWords.length) candidates.push([freeWords[i]!, freeWords[i + 1]!]);
    candidates.push([freeWords[i]!]);
  }
  for (const words of candidates) {
    const found = findEntry(entries, words.join(' '));
    if (found) return { label: found.label, words };
  }
  for (const word of freeWords) {
    if (word.length < 5 || /\d/.test(word) || FILLER_WORDS.has(word)) continue;
    const similar = new Set<string>();
    for (const entry of entries) {
      if (formsOf(entry).some((form) => !form.includes(' ') && looksLike(word, form)))
        similar.add(entry.label);
    }
    if (similar.size === 1) return { label: [...similar][0]!, words: [word] };
  }
  return null;
}

/**
 * Модель с опечаткой («суксд» → Succeed): единственная модель, на написание
 * которой похоже слово. Две разные модели — ничего.
 */
export function modelLikeInText(
  catalogue: ListingCatalogue,
  freeWords: readonly string[],
): { label: string; brand: string | null; word: string } | null {
  const kinds = new Set<string>();
  for (const category of searchableCategories(catalogue)) {
    const field = modelAttribute(attributesFor(catalogue, category));
    if (field?.dictionary) kinds.add(field.dictionary);
  }
  for (const word of freeWords) {
    if (word.length < 5 || /\d/.test(word) || FILLER_WORDS.has(word)) continue;
    const hits = new Map<string, DictionaryRecord>();
    for (const kind of kinds) {
      for (const entry of catalogue.dictionaryEntries(kind)) {
        if (formsOf(entry).some((form) => !form.includes(' ') && looksLike(word, form)))
          hits.set(norm(entry.label), entry);
      }
    }
    if (hits.size !== 1) continue;
    const entry = [...hits.values()][0]!;
    return { label: entry.label, brand: entry.parentValue || null, word };
  }
  return null;
}

/** Есть ли такая марка хоть в одном справочнике марок каталога. */
function brandKnown(catalogue: ListingCatalogue, candidate: string): boolean {
  for (const category of searchableCategories(catalogue)) {
    const field = brandAttribute(attributesFor(catalogue, category));
    if (field?.dictionary && findEntry(catalogue.dictionaryEntries(field.dictionary), candidate))
      return true;
  }
  return false;
}

/** Модель справочника, названная во фразе одним, двумя или тремя словами. */
export function modelInText(
  catalogue: ListingCatalogue,
  text: string,
): { label: string; brand: string | null } | null {
  const wanted = new Set(
    phrases(text).filter((phrase) => phrase.length >= 4 && !/^[\d ]+$/.test(phrase)),
  );
  if (wanted.size === 0) return null;
  const kinds = new Set<string>();
  for (const category of searchableCategories(catalogue)) {
    const field = modelAttribute(attributesFor(catalogue, category));
    if (field?.dictionary) kinds.add(field.dictionary);
  }
  const hits = new Map<string, DictionaryRecord>();
  for (const kind of kinds) {
    for (const entry of catalogue.dictionaryEntries(kind)) {
      if (formsOf(entry).some((form) => wanted.has(form)))
        hits.set(`${entry.parentValue}/${entry.value}`, entry);
    }
  }
  const labels = new Set([...hits.values()].map((entry) => norm(entry.label)));
  if (labels.size !== 1) return null;
  const parents = new Set([...hits.values()].map((entry) => entry.parentValue));
  const first = [...hits.values()][0]!;
  return { label: first.label, brand: parents.size === 1 ? first.parentValue : null };
}

/**
 * Значения характеристик, которые человек назвал словом, а модель не
 * разложила («автомат» → коробка «Автомат», «ИЖС» → назначение земли).
 * Только поля категории с вариантами, только если подходит ровно одно поле
 * и один вариант.
 */
function optionsInText(
  attributes: readonly ListingAttribute[],
  text: string,
  skip: ReadonlySet<string>,
  coveredWords: ReadonlySet<string>,
): Map<
  string,
  { attribute: ListingAttribute; option: NonNullable<ListingAttribute['options']>[number] }
> {
  const found = new Map<
    string,
    { attribute: ListingAttribute; option: NonNullable<ListingAttribute['options']>[number] }
  >();
  const candidates = phrases(text).filter(
    (phrase) => !phrase.split(' ').every((word) => coveredWords.has(word)),
  );
  for (const phrase of candidates) {
    const matches: {
      attribute: ListingAttribute;
      option: NonNullable<ListingAttribute['options']>[number];
    }[] = [];
    for (const attribute of attributes) {
      if (
        skip.has(attribute.key) ||
        !attribute.options ||
        attribute.type === 'brand' ||
        attribute.type === 'model'
      )
        continue;
      if (attribute.filter !== 'select' && attribute.filter !== 'multiselect') continue;
      for (const option of attribute.options) {
        const label = norm(option.label);
        if (label.length < 3 || option.value === 'other') continue;
        const single = !phrase.includes(' ') && !label.includes(' ');
        if (label === phrase || (single && wordMatchesLabel(phrase, option.label)))
          matches.push({ attribute, option });
      }
    }
    if (matches.length === 1) {
      const [match] = matches;
      if (!found.has(match!.attribute.key)) found.set(match!.attribute.key, match!);
    }
  }
  return found;
}

/** Слова запроса, которые сами по себе ничего не ищут, — из общего словаря поиска. */
const FILLER_WORDS = SEARCH_FILLER_WORDS;

function leftoverText(
  query: string | null,
  covered: readonly string[],
  categorySlug?: string,
): string | null {
  if (!query) return null;
  const coveredWords = new Set(covered.flatMap((item) => words(item)));
  const rest = words(query).filter((word) => {
    if (coveredWords.has(word) || FILLER_WORDS.has(word)) return false;
    // «машины» в категории «Автомобили» — не слово для поиска, а сама категория
    if (categorySlug && CATEGORY_WORDS[word] === categorySlug) return false;
    const guess = categorySlug ? classifyListingTitle(word) : null;
    return !(guess?.kind === 'guess' && guess.guess.slug === categorySlug);
  });
  const text = rest.join(' ').trim();
  return text.length >= 2 ? text : null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Запчасти
// ─────────────────────────────────────────────────────────────────────────────

/** Значения фильтра как список строк (одно значение или массив). */
function strings(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Что решено про запчасть: тип техники, группа, деталь и производитель. */
interface ResolvedPart {
  equipment: PartsEquipmentTypeCode;
  group: string | null;
  item: string | null;
  /** Подкатегория: запчасти типа техники или направление («Автоаксессуары») */
  slug: string;
  kind: 'parts' | 'goods';
  /** Производитель детали из справочника — только если он уместен этой технике */
  maker: DictionaryRecord | null;
}

type PartsOutcome =
  | {
      kind: 'ok';
      intent: SmartSearchIntentCore;
      part: ResolvedPart | null;
      numberSearch: string | null;
    }
  | { kind: 'clarify'; clarification: SmartSearchClarification };

/** Типы техники, у которых есть такая марка (и, если названа, такая модель) в справочниках. */
function equipmentByBrand(
  catalogue: ListingCatalogue,
  brand: string | null,
  model: string | null,
): PartsEquipmentTypeCode[] {
  if (!brand) return [];
  const byBrand: { code: PartsEquipmentTypeCode; brandValue: string; modelKind?: string }[] = [];
  for (const equipment of PARTS_EQUIPMENT) {
    if (!equipment.brandKind) continue;
    const record = findEntry(catalogue.dictionaryEntries(equipment.brandKind, ''), brand);
    if (record) {
      byBrand.push({
        code: equipment.code,
        brandValue: record.value,
        ...(equipment.modelKind ? { modelKind: equipment.modelKind } : {}),
      });
    }
  }
  if (model) {
    const byModel = byBrand.filter(
      (item) =>
        item.modelKind &&
        findEntry(catalogue.dictionaryEntries(item.modelKind, item.brandValue), model) !== null,
    );
    if (byModel.length > 0) return byModel.map((item) => item.code);
  }
  return byBrand.map((item) => item.code);
}

/** Варианты выбора типа техники; обычные категории («камера» — «Фотоаппараты») — следом. */
function equipmentOptions(
  catalogue: ListingCatalogue,
  codes: readonly PartsEquipmentTypeCode[],
  dualSlugs: readonly string[],
  matches: readonly PartMatch[] = [],
): SmartSearchClarificationOption[] {
  const options: SmartSearchClarificationOption[] = [];
  for (const code of codes.slice(0, 6)) {
    const equipment = partsEquipmentByCode(code);
    if (!equipment) continue;
    // Вариант ведёт туда, где такое объявление живёт: «аккумулятор» для машины —
    // в «Аккумуляторы», а не в запчасти; несколько мест — в запчасти типа техники
    const slugs = [...new Set(matches.filter((m) => m.equipment === code).map((m) => m.slug))];
    const slug = slugs.length === 1 ? slugs[0]! : equipment.slug;
    const leaf = findCategory(catalogue, slug);
    if (options.some((option) => option.value === slug)) continue;
    options.push({
      // Направление называет себя («Аккумуляторы»), запчасти — техникой («Телефон»)
      label: goodsDirectionBySlug(slug)?.name ?? equipment.label,
      value: slug,
      kind: 'category',
      hint: leaf ? catalogue.displayName(leaf) : equipment.name,
      choice: { kind: 'filter', field: 'category', value: slug },
    });
  }
  for (const slug of dualSlugs) {
    const category = findCategory(catalogue, slug);
    if (!category || options.some((option) => option.value === category.slug)) continue;
    options.push({
      label: category.name,
      value: category.slug,
      kind: 'category',
      hint: 'Обычные объявления',
      choice: { kind: 'filter', field: 'category', value: category.slug },
    });
  }
  return options;
}

/** Самые частые типы техники — когда сказано только «запчасти» и больше ничего. */
const COMMON_EQUIPMENT: readonly PartsEquipmentTypeCode[] = [
  'passenger_car',
  'phone',
  'laptop',
  'tv',
  'home_appliance',
  'moto',
];

const WITHOUT_PARTS_KEYS = [
  'partAlias',
  'equipmentType',
  'parts',
  'partDual',
  'partMaker',
] as const;

/**
 * Запчасти: слова фразы → тип техники, группа и деталь по справочникам.
 *
 * Название детали даёт кандидатов («насос» — у стиралки, посудомойки,
 * спецтехники…), а выбор сужают тип техники из слов («на айфон»), марка и
 * модель по справочникам («самсунг» есть у телефонов и телевизоров, «суксид»
 * — только у легковых), открытая категория. Один кандидат — ответ; несколько —
 * вопрос «для какой техники?». Деталь не придумывается: «запчасти на
 * экскаватор» открывает раздел запчастей спецтехники без детали.
 *
 * Номер без названия детали и техники — не повод выбирать категорию:
 * «90915-YZZD1» ищется по номерам во всей доске.
 */
function applyPartsIntent(
  intent: SmartSearchIntentCore,
  catalogue: ListingCatalogue,
  context: DomainRequestContext,
): PartsOutcome {
  const filters = intent.filters;
  const aliases = strings(filters.partAlias);
  const hints = strings(filters.equipmentType) as PartsEquipmentTypeCode[];
  const generic = filters.parts === true;
  const dual = strings(filters.partDual);
  const group = asText(filters.partGroup);
  const item = asText(filters.partItem);
  const number = strings(filters.partNumber)[0] ?? null;
  // Производитель детали — только из справочника: незнакомое слово им не становится
  const makerValue = asText(filters.partMaker);
  const maker = makerValue
    ? (catalogue
        .dictionaryEntries(PART_MANUFACTURER_KIND, '')
        .find((entry) => entry.value === makerValue) ?? null)
    : null;
  const makerEquipment = maker ? (entryEquipment(maker) as PartsEquipmentTypeCode[]) : [];

  const explicitSlug = asText(filters.category) ?? context.listingCategory ?? null;
  const explicit = explicitSlug ? findCategory(catalogue, explicitSlug) : null;
  // Открытая или выбранная категория: запчасти, направление («Автоаксессуары») или
  // основной тип («Автомобили») — всё это говорит, о какой технике речь
  const explicitCode = explicit
    ? (partsEquipmentBySlug(explicit.slug)?.code ??
      goodsDirectionBySlug(explicit.slug)?.equipment ??
      mainTypeBySlug(explicit.slug)?.equipment ??
      mainTypeOf(explicit.slug)?.equipment)
    : undefined;
  const explicitEquipment = explicitCode ? partsEquipmentByCode(explicitCode) : undefined;
  const explicitLeaf = explicit && isCatalogLeaf(explicit.slug) ? explicit.slug : null;

  const withoutKeys = (extra: readonly string[] = []): SmartSearchIntentCore => {
    const next = { ...filters };
    for (const key of [...WITHOUT_PARTS_KEYS, ...extra]) delete next[key];
    return { ...intent, filters: next };
  };

  const involved =
    aliases.length > 0 || generic || hints.length > 0 || group || item || maker !== null;
  if (!involved) {
    // Один номер: ищется по номерам, а не по названию; в запчастях — как поле
    if (number && !explicitEquipment) {
      return { kind: 'ok', intent: withoutKeys(['partNumber']), part: null, numberSearch: number };
    }
    return { kind: 'ok', intent, part: null, numberSearch: null };
  }

  /**
   * Запчасть здесь не ищется — слова остаются поиском по словам. Категория
   * открыта на экране, а не выбрана к этой фразе: «рейка» в «Доме и ремонте» —
   * не деталь машины, но и не пустое место, иначе выдача стала бы всем разделом.
   */
  const asWords = (): PartsOutcome => {
    const next = withoutKeys(['partNumber']);
    if (asText(filters.category) === null) {
      const words = [intent.query, ...aliases, ...(number ? [number] : [])].filter(Boolean);
      next.query = words.join(' ').slice(0, 120) || null;
    }
    return { kind: 'ok', intent: next, part: null, numberSearch: null };
  };

  // Раздел или основной тип, внутри которого есть запчасти («Транспорт», «Дом и
  // ремонт»): тип техники решают слова фразы, но только среди запчастей раздела
  const scopeEquipment: PartsEquipmentTypeCode[] | null =
    explicit && !explicitEquipment
      ? PARTS_EQUIPMENT.filter((equipment) => {
          const leaf = catalogue.findBySlug(equipment.slug);
          return leaf !== null && withinScope(catalogue, leaf, explicit);
        }).map((equipment) => equipment.code)
      : null;

  // Человек выбрал обычную категорию («Фотоаппараты» вместо «камера» — деталь телефона)
  if (scopeEquipment !== null && scopeEquipment.length === 0) return asWords();

  const brand = asText(filters.brand ?? intent.preferences.brand);
  const model = asText(filters.model ?? intent.preferences.model);
  const byBrand = equipmentByBrand(catalogue, brand, model);

  // Названо словами и подтверждено маркой — важнее одного из двух; противоречие — слова
  let evidence: PartsEquipmentTypeCode[];
  if (explicitEquipment) evidence = [explicitEquipment.code];
  else if (hints.length > 0 && byBrand.length > 0) {
    const both = hints.filter((code) => byBrand.includes(code));
    evidence = both.length > 0 ? both : hints;
  } else if (hints.length > 0) evidence = hints;
  else if (byBrand.length > 1 && byBrand.includes('passenger_car')) {
    // Марка есть и у легковых, и у грузовых/спецтехники (Toyota, Hyundai): без других слов
    // «на тойоту» — это легковая; если у неё такой детали нет, decideParts вернёт выбор
    evidence = ['passenger_car'];
  } else evidence = byBrand;
  // Ничего о технике, кроме производителя детали («новая Denso», «Denso 123456»):
  // его основной тип техники. Слабее слов и марки — только когда их нет
  if (evidence.length === 0 && makerEquipment.length > 0) evidence = [makerEquipment[0]!];

  let decision = decideParts({ aliases, equipment: evidence, group, item, slug: explicitLeaf });

  // Открыт раздел, а не запчасти: техника — только та, чьи запчасти лежат в нём.
  // «рейка» в «Доме и ремонте» — не вопрос «для легковой или грузовика?»
  if (scopeEquipment !== null) {
    const outside = (code: PartsEquipmentTypeCode) => !scopeEquipment.includes(code);
    if (decision.status === 'resolved' && outside(decision.resolution.equipment)) return asWords();
    if (decision.status === 'group' && outside(decision.equipment)) return asWords();
    if (decision.status === 'equipment') {
      const inside = decision.equipments.filter((code) => !outside(code));
      if (inside.length === 0) return asWords();
      if (inside.length === 1) {
        evidence = inside;
        decision = decideParts({ aliases, equipment: inside, group, item, slug: explicitLeaf });
      }
    }
    if (decision.status === 'none') {
      const inside = (evidence.length > 0 ? evidence : COMMON_EQUIPMENT).filter(
        (code) => !outside(code),
      );
      if (inside.length === 0) return asWords();
      evidence = inside;
    }
  }

  /**
   * Производитель для выбранной техники. Уместен — фильтр «Производитель
   * детали»; неуместен, но это марка самой техники («насос bosch» у стиралки)
   * — это марка техники; иначе не применяется (а не подменяется).
   */
  const placeMaker = (
    equipment: PartsEquipmentTypeCode,
    next: SmartSearchIntentCore,
  ): DictionaryRecord | null => {
    if (!maker) return null;
    if (makerEquipment.length === 0 || makerEquipment.includes(equipment)) return maker;
    const machine = partsEquipmentByCode(equipment);
    if (machine?.brandKind && next.filters.brand === undefined) {
      const asBrand = findEntry(catalogue.dictionaryEntries(machine.brandKind, ''), maker.label);
      if (asBrand) next.filters.brand = asBrand.label;
    }
    return null;
  };

  /**
   * «Восстановленная» без «оригинал» или «аналог»: тип детали не угадывается,
   * а спрашивается (ТЗ запчастей, п. 16). Ответ — поле «Тип детали».
   */
  const typeQuestion = (): PartsOutcome | null => {
    if (asText(filters.partCondition) !== 'restored' || filters.partOriginality !== undefined)
      return null;
    return {
      kind: 'clarify',
      clarification: {
        reason: 'ambiguous_part_type',
        question: 'Уточните тип детали',
        options: [
          {
            label: 'Оригинал',
            value: 'original',
            kind: 'other',
            choice: { kind: 'filter', field: 'partOriginality', value: 'original' },
          },
          {
            label: 'Аналог',
            value: 'analog',
            kind: 'other',
            choice: { kind: 'filter', field: 'partOriginality', value: 'analog' },
          },
        ],
      },
    };
  };

  if (decision.status === 'resolved') {
    const question = typeQuestion();
    if (question) return question;
    const equipment = partsEquipmentByCode(decision.resolution.equipment)!;
    const next = withoutKeys(['partGroup', 'partItem']);
    next.filters.category = decision.resolution.slug;
    return {
      kind: 'ok',
      intent: next,
      part: {
        equipment: equipment.code,
        group: decision.resolution.group,
        item: decision.resolution.item,
        slug: decision.resolution.slug,
        kind: decision.resolution.kind,
        maker: decision.resolution.kind === 'parts' ? placeMaker(equipment.code, next) : null,
      },
      numberSearch: null,
    };
  }

  if (decision.status === 'group') {
    const equipment = partsEquipmentByCode(decision.equipment)!;
    const options = decision.groups.slice(0, 6).map((code) => ({
      label: partLabels(equipment, code, null).group ?? code,
      value: code,
      kind: 'other' as const,
      choice: { kind: 'filter' as const, field: 'partGroup', value: code },
    }));
    return {
      kind: 'clarify',
      clarification: {
        reason: 'ambiguous_part_group',
        question: 'Для какой техники нужна эта деталь?',
        options,
      },
    };
  }

  // Несколько типов техники — или «запчасти» без единой подсказки
  const candidates = (
    decision.status === 'equipment'
      ? decision.equipments
      : evidence.length > 1
        ? evidence
        : COMMON_EQUIPMENT
  ).filter((code) => scopeEquipment === null || scopeEquipment.includes(code));
  if (decision.status === 'none' && evidence.length === 1) {
    const question = typeQuestion();
    if (question) return question;
    const equipment = partsEquipmentByCode(evidence[0]!)!;
    const next = withoutKeys(['partGroup', 'partItem']);
    const slug = explicitLeaf ?? equipment.slug;
    next.filters.category = slug;
    return {
      kind: 'ok',
      intent: next,
      part: {
        equipment: equipment.code,
        group: null,
        item: null,
        slug,
        kind: goodsDirectionBySlug(slug) ? 'goods' : 'parts',
        maker: placeMaker(equipment.code, next),
      },
      numberSearch: null,
    };
  }
  const label = aliases.length === 1 ? `«${aliases[0]}»` : null;
  return {
    kind: 'clarify',
    clarification: {
      reason: 'ambiguous_equipment',
      question: label ? `${label} — для какой техники?` : 'Запчасти для какой техники?',
      options: equipmentOptions(
        catalogue,
        candidates,
        dual,
        decision.status === 'equipment' ? decision.matches : [],
      ),
    },
  };
}

/**
 * Код кузова во фразе: «NCP165» («NCP 165» разбор уже склеил). Слова техники
 * с числом («gtx970», «ram16») кодом кузова не считаются.
 */
function hasCarCode(query: string | null): boolean {
  return (query ?? '').split(/\s+/).some((word) => {
    const match = /^([a-z]{3})\d{2,3}[a-z]?$/i.exec(word);
    return match !== null && !NOT_CAR_CODE.has(match[1]!.toLowerCase());
  });
}

const NOT_CAR_CODE = new Set(['gtx', 'rtx', 'ram', 'ssd', 'hdd', 'usb', 'cpu', 'gpu', 'mac']);

const CAR_PARTS_SLUG = 'transport-parts';

/** Открытая категория, из которой поиск не уходит; null — поиск по всем категориям. */
function scopeOf(
  catalogue: ListingCatalogue,
  context: DomainRequestContext,
): CategoryRecord | null {
  if (!context.scopeLocked || !context.listingCategory) return null;
  return catalogue.findBySlug(context.listingCategory);
}

/** Категория — сама граница или лежит внутри неё (направление основного типа и т. п.). */
function withinScope(
  catalogue: ListingCatalogue,
  category: CategoryRecord,
  scope: CategoryRecord,
): boolean {
  return catalogue.pathOf(category).some((item) => item.id === scope.id);
}

/**
 * Категория — сама техника запчастей, открытых на экране: «Toyota Succeed» в
 * «Запчастях» автомобилей — не другая категория, а «Подходит к».
 */
function machineOfScope(category: CategoryRecord, scope: CategoryRecord): boolean {
  return partsEquipmentBySlug(scope.slug)?.machineSlug === category.slug;
}

/**
 * Намерение «объявления» → запрос к существующей ленте. Возвращает готовый
 * план, уточнение (неоднозначная категория, модель чужой марки, неизвестный
 * город) или «не поддерживается».
 */
export function normalizeListings(
  incoming: SmartSearchIntentCore,
  catalogue: ListingCatalogue,
  context: DomainRequestContext,
): NormalizeOutcome<ListingPlan> {
  // Запчасти: тип техники, группа и деталь — до остального разбора
  const partsOutcome = applyPartsIntent(incoming, catalogue, context);
  if (partsOutcome.kind === 'clarify') {
    return {
      kind: 'clarify',
      query: emptyQuery('listings', incoming),
      clarification: partsOutcome.clarification,
    };
  }
  const rawIntent = partsOutcome.intent;
  const intent = enrichFromText(rawIntent, catalogue, context);
  const query: SmartSearchNormalizedQuery = emptyQuery('listings', intent);
  const conditions: SmartSearchCondition[] = query.conditions;
  const preferences: SmartSearchPreference[] = query.preferences;
  const ignored = query.ignored;
  const covered: string[] = [];
  const attributeFilter: Record<string, unknown> = {};
  const raw: Record<string, unknown> = {};

  const brandRaw = intent.filters.brand ?? intent.preferences.brand;
  const modelRaw = intent.filters.model ?? intent.preferences.model;
  const brandCandidate = asText(brandRaw);

  // ── Категория ─────────────────────────────────────────────────────────────
  let category: CategoryRecord | null = null;
  const categoryCandidate = asText(intent.filters.category) ?? asText(intent.preferences.category);
  if (categoryCandidate) {
    category = findCategory(catalogue, categoryCandidate);
    if (!category)
      ignored.push({ field: 'category', reason: `Категории «${categoryCandidate}» нет` });
  }
  if (!category && context.listingCategory) {
    category = findCategory(catalogue, context.listingCategory);
  }

  if (!category && (brandCandidate || modelRaw !== undefined)) {
    const hits = brandModelHits(catalogue, brandCandidate, modelRaw, null);
    // Поля из фразы тоже подсказывают категорию: «правый руль» есть у легковых, а не у грузовиков
    const fieldKeys = [...Object.keys(intent.filters), ...Object.keys(intent.preferences)].filter(
      (key) => !(LISTING_BASE_KEYS as readonly string[]).includes(key),
    );
    const byFields =
      hits.length > 1 && fieldKeys.length > 0
        ? hits.filter((hit) => {
            const keys = new Set(attributesFor(catalogue, hit.category).map((item) => item.key));
            return fieldKeys.every((key) => keys.has(key));
          })
        : [];
    const hinted =
      byFields.length === 1
        ? byFields
        : hits.length > 1
          ? hintedByWord(catalogue, byFields.length > 1 ? byFields : hits, brandCandidate, modelRaw)
          : hits;
    if (hinted.length === 1) {
      category = hinted[0]!.category;
    } else if (hits.length > 1) {
      // Классификатор заголовков объявлений — тот же, что подсказывает категорию
      // при подаче. Ему доверяем, только если он узнал модель или увидел
      // слово-признак («мотоцикл»), а не просто марку
      const guess = classifyListingTitle(context.text);
      const guessed =
        guess.kind === 'guess' &&
        (guess.guess.attributes.model !== undefined || guess.guess.slug !== 'transport-cars')
          ? hits.find((hit) => hit.category.slug === guess.guess.slug)
          : undefined;
      if (guessed) {
        category = guessed.category;
      } else {
        return {
          kind: 'clarify',
          query,
          clarification: {
            reason: 'ambiguous_category',
            question: `${brandCandidate ?? 'Это'} — в какой категории искать?`,
            // Нажатие — выбор кодом: тот же поиск в выбранной категории, без модели
            options: hits.map((hit) => ({
              label: hit.category.name,
              value: hit.category.slug,
              kind: 'category' as const,
              choice: { kind: 'filter' as const, field: 'category', value: hit.category.slug },
            })),
          },
        };
      }
    }
  }
  if (!category) {
    const guess = classifyListingTitle(context.text);
    if (guess.kind === 'guess') category = findCategory(catalogue, guess.guess.slug);
  }

  // ── Граница поиска: открытая категория ────────────────────────────────────
  // Поиск, запущенный внутри категории, из неё не уходит: «Конь» в «Запчастях»
  // ищется в запчастях словами, а «Сельхозживотные» — только подсказка рядом.
  // Марка и модель автомобиля в запчастях автомобилей — это «Подходит к»
  const scope = scopeOf(catalogue, context);
  let elsewhere: CategoryRecord | null = null;
  if (scope && (!category || !withinScope(catalogue, category, scope))) {
    if (category && !machineOfScope(category, scope)) elsewhere = category;
    category = scope;
  }
  // Код кузова или двигателя («NCP165», «1NZ») вне запчастей — похоже на автозапчасть
  if (scope && !elsewhere && !partsEquipmentBySlug(scope.slug) && hasCarCode(intent.query)) {
    const parts = catalogue.findBySlug(CAR_PARTS_SLUG);
    if (parts && !withinScope(catalogue, parts, scope)) elsewhere = parts;
  }

  const attributes = category ? attributesFor(catalogue, category) : [];
  if (category) {
    raw.category = category.slug;
    covered.push(category.name, category.itemLabel ?? '');
    conditions.push({
      field: 'category',
      label: 'Категория',
      value: category.slug,
      display: category.name,
    });
  }

  // ── Марка и модель ────────────────────────────────────────────────────────
  const brandField = brandAttribute(attributes);
  const modelField = modelAttribute(attributes);
  let brandEntry: DictionaryRecord | null = null;

  // Названное, но в этой категории не применимое (марка телефона в запчастях
  // машин, модели нет в справочнике) не пропадает, а ищется словами: иначе
  // «Honor 400» в «Запчастях» стал бы поиском по одному числу
  const lostWords: string[] = [];
  if (brandCandidate && brandField?.dictionary) {
    brandEntry = findEntry(catalogue.dictionaryEntries(brandField.dictionary), brandCandidate);
    if (!brandEntry) {
      ignored.push({
        field: 'brand',
        reason: `Марки «${brandCandidate}» нет в справочнике категории`,
      });
      lostWords.push(brandCandidate);
    }
  } else if (brandCandidate && category) {
    ignored.push({ field: 'brand', reason: 'У этой категории нет поля марки' });
    lostWords.push(brandCandidate);
  }

  if (modelRaw !== undefined && modelField?.dictionary) {
    const pool = catalogue.dictionaryEntries(modelField.dictionary, brandEntry?.value);
    const resolved = resolveModels(pool, modelRaw);

    if (resolved.models.length === 0 && brandEntry) {
      // Модель есть, но у другой марки: «Honda Corolla Fielder» — спросить, а не подменять
      const elsewhere = resolveModels(catalogue.dictionaryEntries(modelField.dictionary), modelRaw);
      const owners = [...new Set(elsewhere.models.map((model) => model.parentValue))];
      if (owners.length > 0) {
        const brands = catalogue.dictionaryEntries(brandField?.dictionary ?? '');
        return {
          kind: 'clarify',
          query,
          clarification: {
            reason: 'model_brand_mismatch',
            question: `Модели «${String(asText(modelRaw) ?? '')}» у марки ${brandEntry.label} нет. Искать у другой марки?`,
            options: owners.slice(0, 6).map((owner) => ({
              label: brands.find((brand) => brand.value === owner)?.label ?? owner,
              value: owner,
              kind: 'brand',
            })),
          },
        };
      }
    }

    if (!brandEntry && resolved.models.length > 0 && brandField?.dictionary) {
      const owners = [...new Set(resolved.models.map((model) => model.parentValue))];
      if (owners.length === 1) {
        brandEntry = findEntry(catalogue.dictionaryEntries(brandField.dictionary), owners[0]!);
      } else {
        const brands = catalogue.dictionaryEntries(brandField.dictionary);
        return {
          kind: 'clarify',
          query,
          clarification: {
            reason: 'ambiguous_brand',
            question: 'Такая модель есть у нескольких марок. Какая нужна?',
            options: owners.slice(0, 6).map((owner) => ({
              label: brands.find((brand) => brand.value === owner)?.label ?? owner,
              value: owner,
              kind: 'brand',
            })),
          },
        };
      }
    }

    if (resolved.models.length > 0 && brandEntry) {
      const own = resolved.models.filter((model) => model.parentValue === brandEntry!.value);
      const values = own.map((model) => model.value);
      attributeFilter[modelField.key] = values.length === 1 ? values[0] : values;
      covered.push(...own.flatMap((model) => [model.label, ...model.aliases]));
      conditions.push({
        field: 'model',
        label: modelField.label,
        value: attributeFilter[modelField.key],
        display: resolved.display ?? own.map((model) => model.label).join(', '),
      });
    }
    for (const missing of resolved.missing) {
      ignored.push({ field: 'model', reason: `Модели «${missing}» нет в справочнике` });
      query.unresolved.push(missing);
      lostWords.push(missing);
    }
  } else if (modelRaw !== undefined && category) {
    const text = asText(modelRaw);
    if (text) {
      query.unresolved.push(text);
      lostWords.push(text);
    }
  }

  if (brandEntry && brandField) {
    attributeFilter[brandField.key] = brandEntry.value;
    covered.push(brandEntry.label, ...brandEntry.aliases);
    conditions.unshift(
      ...[
        {
          field: 'brand',
          label: brandField.label,
          value: brandEntry.value,
          display: brandEntry.label,
        },
      ],
    );
  }

  // ── Сделка ────────────────────────────────────────────────────────────────
  // «А посуточно?» — срок аренды без слова «снять»: это аренда
  const dealRaw =
    asText(intent.filters.transactionType) ?? (asText(intent.filters.rentPeriod) ? 'rent' : null);
  if (dealRaw) {
    const deal = TRANSACTION_VALUES[norm(dealRaw)];
    if (!deal) {
      ignored.push({ field: 'transactionType', reason: `Непонятная сделка «${dealRaw}»` });
    } else if (category && !category.allowedTransactions.includes(deal)) {
      ignored.push({ field: 'transactionType', reason: 'В этой категории такой сделки нет' });
    } else {
      raw.transactionType = deal;
      conditions.push({
        field: 'transactionType',
        label: 'Сделка',
        value: deal,
        display: deal === 'rent' ? 'Аренда' : 'Продажа',
      });
      const periodRaw = asText(intent.filters.rentPeriod);
      const period = periodRaw ? RENT_PERIODS[norm(periodRaw)] : undefined;
      if (deal === 'rent' && period) {
        raw.rentPeriod = period;
        conditions.push({
          field: 'rentPeriod',
          label: 'Срок',
          value: period,
          display: period === 'daily' ? 'посуточно' : 'на длительный срок',
        });
      }
    }
  }

  // ── Цена (в рублях от модели, в копейках — для API) ───────────────────────
  for (const [source, target] of [
    [intent.filters.price, 'exact'],
    [intent.preferences.price, 'preferred'],
  ] as const) {
    if (source === undefined) continue;
    const parsedRange = typeof source === 'number' ? { max: source } : rangeOf(source);
    // «От 0 ₽» — не условие: модель ставит ноль вместо пустой границы
    const range =
      parsedRange && parsedRange.min === 0
        ? { ...(parsedRange.max !== undefined ? { max: parsedRange.max } : {}) }
        : parsedRange;
    if (!range || (range.min === undefined && range.max === undefined)) {
      ignored.push({ field: 'price', reason: 'Непонятная цена' });
      continue;
    }
    const display = [
      range.min !== undefined && range.min !== range.max ? `от ${formatRubles(range.min)}` : null,
      range.max !== undefined ? `до ${formatRubles(range.max)}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    if (target === 'exact') {
      if (range.min !== undefined && range.min !== range.max)
        raw.priceFrom = Math.round(range.min * 100);
      if (range.max !== undefined) raw.priceTo = Math.round(range.max * 100);
      conditions.push({ field: 'price', label: 'Цена', value: range, display });
    } else {
      preferences.push({
        field: 'price',
        label: 'Цена',
        value: range,
        display,
        applied: false,
        note: 'Пожелание: в ленте нет мягкого учёта цены, выдача не сужена',
      });
    }
  }

  if (intent.filters.onlyWithPhoto === true) {
    raw.onlyWithPhoto = 'true';
    conditions.push({
      field: 'onlyWithPhoto',
      label: 'Фото',
      value: true,
      display: 'только с фото',
    });
  }

  // ── Характеристики категории ──────────────────────────────────────────────
  const base = new Set<string>(LISTING_BASE_KEYS);
  for (const [bucket, preferred] of [
    [intent.filters, false],
    [intent.preferences, true],
  ] as const) {
    for (const [key, value] of Object.entries(bucket)) {
      if (base.has(key)) continue;
      const attribute = attributes.find((item) => item.key === key);
      if (!attribute) {
        ignored.push({
          field: key,
          reason: category
            ? `У категории «${category.name}» нет такого поля`
            : 'Без категории поле не применить',
        });
        continue;
      }
      const converted = convertAttribute(attribute, value);
      if (!converted.ok) {
        ignored.push({ field: key, reason: converted.reason });
        continue;
      }
      if (preferred) {
        preferences.push({
          field: key,
          label: attribute.label,
          value: converted.value,
          display: converted.display,
          applied: false,
          note: 'Пожелание: показано отдельно, выдача по нему не сужена',
        });
      } else {
        attributeFilter[key] = converted.value;
        conditions.push({
          field: key,
          label: attribute.label,
          value: converted.value,
          display: converted.display,
        });
      }
    }
  }

  // Запчасть: категория детали и деталь из справочников таксономии, а не слова человека
  // Товар направления: тип товара — поле направления («Коврики», «Шины»)
  const goodsDirection = partsOutcome.part
    ? goodsDirectionBySlug(partsOutcome.part.slug)
    : undefined;
  if (partsOutcome.part && category && goodsDirection && category.slug === goodsDirection.slug) {
    const typeKey = goodsDirection.typeKey;
    const type = goodsDirection.types.find((entry) => entry.code === partsOutcome.part!.item);
    if (typeKey && type) {
      attributeFilter[typeKey] = type.code;
      covered.push(type.label, ...type.aliases);
      // Поле могли уже разложить слова фразы («диски» — значение «Что продаётся»)
      const sameField = conditions.findIndex((item) => item.field === typeKey);
      if (sameField >= 0) conditions.splice(sameField, 1);
      conditions.push({
        field: typeKey,
        label: typeKey === 'goodsType' ? 'Тип товара' : 'Что продаётся',
        value: type.code,
        display: type.label,
      });
    }
  }
  if (partsOutcome.part && category && partsEquipmentBySlug(category.slug)) {
    const labels = partLabels(
      partsOutcome.part.equipment,
      partsOutcome.part.group,
      partsOutcome.part.item,
    );
    if (partsOutcome.part.group) {
      attributeFilter.partGroup = partsOutcome.part.group;
      conditions.push({
        field: 'partGroup',
        label: 'Категория детали',
        value: partsOutcome.part.group,
        display: labels.group ?? partsOutcome.part.group,
      });
    }
    if (partsOutcome.part.maker) {
      attributeFilter.partManufacturer = partsOutcome.part.maker.value;
      covered.push(partsOutcome.part.maker.label, ...partsOutcome.part.maker.aliases);
      conditions.push({
        field: 'partManufacturer',
        label: 'Производитель детали',
        value: partsOutcome.part.maker.value,
        display: partsOutcome.part.maker.label,
      });
    }
    if (partsOutcome.part.item) {
      attributeFilter.partItem = partsOutcome.part.item;
      conditions.push({
        field: 'partItem',
        label: 'Деталь',
        value: partsOutcome.part.item,
        display: labels.item ?? partsOutcome.part.item,
      });
    }
  }

  // Слова, которые модель не разложила, но они — вариант поля категории
  const coveredWords = new Set(covered.flatMap((item) => words(item)));
  const alreadySet = new Set([...Object.keys(attributeFilter), ...Object.keys(intent.preferences)]);
  for (const [key, { attribute, option }] of optionsInText(
    attributes,
    context.text,
    alreadySet,
    coveredWords,
  )) {
    const value =
      attribute.type === 'number'
        ? [Number(option.value)]
        : attribute.filter === 'multiselect'
          ? [option.value]
          : option.value;
    attributeFilter[key] = value;
    conditions.push({ field: key, label: attribute.label, value, display: option.label });
    query.unresolved = query.unresolved.filter(
      (word) => !wordMatchesLabel(norm(word), option.label) && norm(word) !== norm(option.label),
    );
  }

  // ── Место ─────────────────────────────────────────────────────────────────
  const place = resolvePlace(intent, context, { allowRegion: true });
  if (place.kind === 'clarify')
    return { kind: 'clarify', query, clarification: place.clarification };
  let sort: string | undefined;
  if (place.kind === 'city') {
    raw.latitude = place.city.latitude;
    raw.longitude = place.city.longitude;
    query.location = { cityId: place.city.id, cityName: place.city.name, mode: place.mode };
    if (place.mode === 'preferred') {
      raw.regionWide = 'true';
      sort = ListingSort.DISTANCE;
      preferences.push({
        field: 'location',
        label: 'Место',
        value: place.city.name,
        display: place.city.name,
        applied: true,
        note: `Поиск по всему Дагестану, сначала ближе к ${place.city.name}`,
      });
    } else {
      raw.radiusKm = LISTING_DEFAULT_RADIUS_KM;
      if (place.mode !== 'context') {
        conditions.push({
          field: 'location',
          label: 'Место',
          value: place.city.id,
          display: `${place.city.name} · ${LISTING_DEFAULT_RADIUS_KM} км`,
        });
      }
    }
  } else {
    raw.regionWide = 'true';
    if (place.kind === 'region') {
      query.location = {
        cityId: null,
        cityName: 'Весь Дагестан',
        mode: place.mode === 'preferred' ? 'preferred' : 'exact',
      };
    }
  }
  if (
    intent.location?.preferred &&
    intent.location.city &&
    (place.kind === 'none' || (place.kind === 'city' && place.mode === 'context'))
  ) {
    preferences.push({
      field: 'location',
      label: 'Место',
      value: intent.location.city,
      display: intent.location.city,
      applied: false,
      note: 'Такого города нет в приложении — пожелание не учтено',
    });
  }

  // ── Порядок ───────────────────────────────────────────────────────────────
  const sortMap: Partial<Record<NonNullable<SmartSearchIntentCore['sort']>, string>> = {
    relevance: ListingSort.RECOMMENDED,
    newest: ListingSort.DATE,
    price_asc: ListingSort.PRICE_ASC,
    price_desc: ListingSort.PRICE_DESC,
    nearest: ListingSort.DISTANCE,
  };
  if (intent.sort) {
    const mapped = sortMap[intent.sort];
    if (mapped && (mapped !== ListingSort.DISTANCE || raw.latitude !== undefined)) sort = mapped;
    else ignored.push({ field: 'sort', reason: 'Такого порядка у объявлений нет' });
  }
  if (sort) raw.sort = sort;

  // ── Текст ─────────────────────────────────────────────────────────────────
  // Слова, узнанные как предмет другой категории, в этой категории ничего не
  // фильтруют — они остаются словами поиска, а не пропадают
  const source = elsewhere
    ? context.text
    : [...lostWords, intent.query].filter(Boolean).join(' ') || null;
  const text = leftoverText(source, covered, category?.slug);
  if (text) {
    raw.search = text.slice(0, 120);
    query.text = raw.search as string;
  }
  // Только номер детали: ищется по номерам запчастей во всей доске, с дефисом как есть
  if (partsOutcome.numberSearch) {
    raw.search = partsOutcome.numberSearch.slice(0, 120);
    query.text = raw.search as string;
    conditions.push({
      field: 'partNumber',
      label: 'Номер запчасти / артикул',
      value: partsOutcome.numberSearch,
      display: partsOutcome.numberSearch,
    });
  }

  // Ни категории, ни условий, ни слов («дёшево», «рядом») — выдавать всю доску бессмысленно
  if (
    !category &&
    Object.keys(attributeFilter).length === 0 &&
    raw.priceTo === undefined &&
    raw.priceFrom === undefined &&
    raw.transactionType === undefined &&
    raw.search === undefined
  ) {
    return {
      kind: 'clarify',
      query,
      clarification: {
        reason: 'empty_query',
        question: 'Что ищете? Например: «Toyota Succeed до 1 млн» или «двушка в Каспийске».',
        options: [],
      },
    };
  }

  if (Object.keys(attributeFilter).length > 0) raw.attributes = JSON.stringify(attributeFilter);
  raw.limit = context.limit;

  // Последний рубеж — тот же валидатор, что у обычного запроса ленты
  const parsed = listingListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Собранный запрос объявлений не прошёл проверку: ${parsed.error.issues[0]?.message}`,
    );
  }

  query.params = raw;
  query.sort = intent.sort;
  if (elsewhere) query.elsewhere = { slug: elsewhere.slug, name: elsewhere.name };
  // Быстрые значения: «хочу машину» — марки, «хочу квартиру» — купить или снять.
  // Не вопрос, а подсказка рядом с кнопкой «Открыть»: в раздел можно перейти и так (D15)
  const suggestions = category
    ? quickSuggestions(category, attributesFor(catalogue, category), catalogue, {
        brandSet: attributeFilter.brand !== undefined,
        dealSet: raw.transactionType !== undefined || raw.rentPeriod !== undefined,
      })
    : [];
  return {
    kind: 'ready',
    plan: { query: parsed.data },
    query,
    ...(suggestions.length > 0 ? { suggestions } : {}),
  };
}

/**
 * Быстрые значения раздела: до четырёх готовых условий, которые человек
 * добавляет одним нажатием (без модели). Только реальные значения из
 * справочников и операций категории, а не названия полей.
 */
const QUICK_BRANDS: Readonly<Record<string, readonly string[]>> = {
  'transport-cars': ['toyota', 'lada', 'kia', 'hyundai', 'mercedes', 'mercedes-benz', 'bmw'],
};

const QUICK_DEALS: Readonly<
  Record<string, readonly { label: string; field: string; value: string }[]>
> = {
  'realty-flats': [
    { label: 'Продажа', field: 'transactionType', value: 'sale' },
    { label: 'Аренда надолго', field: 'rentPeriod', value: 'monthly' },
    { label: 'Посуточно', field: 'rentPeriod', value: 'daily' },
  ],
};

function quickSuggestions(
  category: CategoryRecord,
  attributes: readonly ListingAttribute[],
  catalogue: ListingCatalogue,
  state: { brandSet: boolean; dealSet: boolean },
): SmartSearchClarificationOption[] {
  const options: SmartSearchClarificationOption[] = [];
  const brands = QUICK_BRANDS[category.slug];
  const brandField = brandAttribute(attributes);
  if (brands && !state.brandSet && brandField?.dictionary) {
    const entries = catalogue.dictionaryEntries(brandField.dictionary);
    for (const code of brands) {
      const entry = entries.find((item) => item.value === code);
      if (!entry || options.length >= 4) continue;
      // «LADA (ВАЗ)» → «LADA»
      const label = entry.label.replace(/\s*\([^)]*\)$/u, '');
      options.push({
        label,
        value: label,
        kind: 'brand',
        choice: { kind: 'filter', field: 'brand', value: entry.value },
      });
    }
  }
  const deals = QUICK_DEALS[category.slug];
  if (deals && !state.dealSet) {
    for (const deal of deals) {
      options.push({
        label: deal.label,
        value: deal.label,
        kind: 'other',
        choice: { kind: 'filter', field: deal.field, value: deal.value },
      });
    }
  }
  return options.slice(0, 4);
}

/** Уточнение «до какой цены?» — когда цену назвали словом, а не числом. */
export function priceClarification(): SmartSearchClarification {
  return {
    reason: 'price_not_grounded',
    question: 'До какой цены искать? Напишите сумму, например «до 50 тысяч».',
    options: [],
  };
}
