import {
  LISTING_DEFAULT_RADIUS_KM,
  ListingSort,
  classifyListingTitle,
  listingListQuerySchema,
  type ListingAttribute,
  type ListingListQuery,
  type SmartSearchClarification,
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
import { formatRubles, parseAmount } from '../normalize/amounts.js';
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
] as const;

export interface ListingPlan {
  query: ListingListQuery;
}

/**
 * Разговорные названия значений, которых нет в подписях вариантов:
 * «АКПП» — это «Автомат», «б/у» — «Б/у». Ключ — поле, затем слово → код.
 */
const VALUE_SYNONYMS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  gearbox: {
    акпп: 'auto',
    автоматическая: 'auto',
    автоматическую: 'auto',
    автомате: 'auto',
    мкпп: 'manual',
    ручная: 'manual',
    механическая: 'manual',
    механике: 'manual',
    робот: 'robot',
    вариатор: 'variator',
    cvt: 'variator',
  },
  fuel: {
    бензиновый: 'petrol',
    бензиновая: 'petrol',
    дизельный: 'diesel',
    дизельная: 'diesel',
    электрический: 'electric',
    электромобиль: 'electric',
    пропан: 'gas',
    метан: 'gas',
  },
  drive: { awd: 'full', '4wd': 'full', '4x4': 'full', полноприводный: 'full' },
  condition: { новый: 'new', новая: 'new', новое: 'new', бу: 'used', подержанный: 'used' },
  steering: { правый: 'right', правым: 'right', левый: 'left', левым: 'left' },
};

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

function brandAttribute(attributes: readonly ListingAttribute[]): ListingAttribute | null {
  return attributes.find((item) => item.type === 'brand' && item.dictionary) ?? null;
}

function modelAttribute(attributes: readonly ListingAttribute[]): ListingAttribute | null {
  return (
    attributes.find((item) => item.type === 'model' && item.dictionary && item.parentKey) ?? null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Значения характеристик
// ─────────────────────────────────────────────────────────────────────────────

type Converted = { ok: true; value: unknown; display: string } | { ok: false; reason: string };

function optionFor(attribute: ListingAttribute, candidate: string | number) {
  const value = norm(String(candidate));
  const synonym = VALUE_SYNONYMS[attribute.key]?.[value];
  return (
    attribute.options?.find(
      (option) =>
        option.value === synonym ||
        norm(option.value) === value ||
        norm(option.label) === value ||
        (option.aliases ?? []).map(norm).includes(value) ||
        sameStem(option.label, value),
    ) ?? null
  );
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
    const entry = findEntry(entries, item);
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

/** Слова, уже ушедшие в фильтры, не нужны в текстовом поиске. */
function leftoverText(query: string | null, covered: readonly string[]): string | null {
  if (!query) return null;
  const coveredWords = new Set(covered.flatMap((item) => words(item)));
  const rest = words(query).filter((word) => !coveredWords.has(word));
  const text = rest.join(' ').trim();
  return text.length >= 2 ? text : null;
}

/**
 * Намерение «объявления» → запрос к существующей ленте. Возвращает готовый
 * план, уточнение (неоднозначная категория, модель чужой марки, неизвестный
 * город) или «не поддерживается».
 */
export function normalizeListings(
  intent: SmartSearchIntentCore,
  catalogue: ListingCatalogue,
  context: DomainRequestContext,
): NormalizeOutcome<ListingPlan> {
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
            options: hits.map((hit) => ({
              label: hit.category.name,
              value: hit.category.slug,
              kind: 'category',
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

  if (brandCandidate && brandField?.dictionary) {
    brandEntry = findEntry(catalogue.dictionaryEntries(brandField.dictionary), brandCandidate);
    if (!brandEntry) {
      ignored.push({
        field: 'brand',
        reason: `Марки «${brandCandidate}» нет в справочнике категории`,
      });
    }
  } else if (brandCandidate && category) {
    ignored.push({ field: 'brand', reason: 'У этой категории нет поля марки' });
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
    }
  } else if (modelRaw !== undefined && category) {
    const text = asText(modelRaw);
    if (text) query.unresolved.push(text);
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
  const dealRaw = asText(intent.filters.transactionType);
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
        display: deal === 'rent' ? 'Снять / арендовать' : 'Купить',
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
    const range = typeof source === 'number' ? { max: source } : rangeOf(source);
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
  const text = leftoverText(intent.query, covered);
  if (text) {
    raw.search = text.slice(0, 120);
    query.text = raw.search as string;
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
  return { kind: 'ready', plan: { query: parsed.data }, query };
}

/** Уточнение «до какой цены?» — когда цену назвали словом, а не числом. */
export function priceClarification(): SmartSearchClarification {
  return {
    reason: 'price_not_grounded',
    question: 'До какой цены искать? Напишите сумму, например «до 50 тысяч».',
    options: [],
  };
}
