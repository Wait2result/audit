import type {
  SmartSearchFilterValue,
  SmartSearchIntent,
  SmartSearchIntentCore,
} from '@dagestan/shared';

import type { SearchContextRecord } from '../context/context-store.js';
import { isGroundedNumber, parseAmount } from '../normalize/amounts.js';

/**
 * Планировщик: из ответа модели — список независимых частей запроса и их
 * связь с прошлым поиском. Модель может предложить подзапросы, но решает
 * сервер: каждая часть проходит те же проверки, что и основная, и
 * исполняется только зарегистрированным адаптером раздела. Никаких
 * «инструментов», которые модель вызывала бы сама.
 */

/** Числа меньше — мелкие (комнаты, объём двигателя, минуты): их модель выводит из слов («двушка»). */
const GROUNDING_THRESHOLD = 100;

type FilterRecord = SmartSearchIntentCore['filters'];

function groundValue(
  key: string,
  value: SmartSearchFilterValue,
  text: string,
): SmartSearchFilterValue | null {
  const check = (bound: number | string): boolean => {
    const amount = typeof bound === 'number' ? bound : key === 'price' ? parseAmount(bound) : null;
    if (amount === null) return typeof bound === 'string' && key !== 'price';
    return amount < GROUNDING_THRESHOLD || isGroundedNumber(amount, text);
  };

  if (typeof value === 'number') return check(value) ? value : null;
  if (typeof value === 'string') return key === 'price' && !check(value) ? null : value;
  if (Array.isArray(value) || typeof value === 'boolean') return value;

  const min = value.min !== undefined && check(value.min) ? value.min : undefined;
  const max = value.max !== undefined && check(value.max) ? value.max : undefined;
  if (min === undefined && max === undefined) return null;
  return { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
}

/**
 * Сверка чисел с фразой: крупное число из ответа модели, которого человек не
 * писал («айфон недорого» → 30 000), убирается. Список убранных полей
 * возвращается — по нему сервер переспросит.
 */
export function groundIntent(
  intent: SmartSearchIntentCore,
  text: string,
): { intent: SmartSearchIntentCore; dropped: string[] } {
  const dropped: string[] = [];
  const clean = (record: FilterRecord): FilterRecord => {
    const result: FilterRecord = {};
    for (const [key, value] of Object.entries(record)) {
      const grounded = groundValue(key, value, text);
      if (grounded === null) dropped.push(key);
      else {
        result[key] = grounded;
        if (JSON.stringify(grounded) !== JSON.stringify(value)) dropped.push(key);
      }
    }
    return result;
  };
  return {
    intent: { ...intent, filters: clean(intent.filters), preferences: clean(intent.preferences) },
    dropped: [...new Set(dropped)],
  };
}

/** Что остаётся при смене категории: общие условия, а не характеристики прежней. */
const KEPT_ON_CATEGORY_CHANGE = new Set(['price', 'transactionType', 'onlyWithPhoto']);

/**
 * Уточнение прошлого поиска. «А автомат?» добавляет условие, «а во
 * Владивостоке?» меняет место, смена марки сбрасывает модель (как в форме),
 * смена категории — характеристики прежней категории. Другой раздел — это
 * новый поиск: кино не становится фильтром объявлений.
 */
export function mergeWithContext(
  next: SmartSearchIntentCore,
  previous: SearchContextRecord | null,
): { intent: SmartSearchIntentCore; refined: boolean } {
  if (!previous || next.intent !== 'refine') return { intent: next, refined: false };
  if (next.domain && next.domain !== previous.domain) {
    return { intent: { ...next, intent: 'search' }, refined: false };
  }

  const base = previous.intent;
  let filters: FilterRecord = { ...base.filters };
  let preferences: FilterRecord = { ...base.preferences };

  const nextCategory = next.filters.category;
  if (
    nextCategory !== undefined &&
    JSON.stringify(nextCategory) !== JSON.stringify(base.filters.category)
  ) {
    filters = Object.fromEntries(
      Object.entries(filters).filter(([key]) => KEPT_ON_CATEGORY_CHANGE.has(key)),
    );
    preferences = {};
  }
  const nextBrand = next.filters.brand;
  if (
    nextBrand !== undefined &&
    JSON.stringify(nextBrand) !== JSON.stringify(base.filters.brand) &&
    next.filters.model === undefined
  ) {
    delete filters.model;
    delete preferences.model;
  }

  for (const [key, value] of Object.entries(next.filters)) {
    filters[key] = value;
    delete preferences[key];
  }
  for (const [key, value] of Object.entries(next.preferences)) {
    preferences[key] = value;
    delete filters[key];
  }

  const time =
    next.time && base.time
      ? {
          date: next.time.date ?? base.time.date,
          from: next.time.from ?? base.time.from,
          to: next.time.to ?? base.time.to,
          period: next.time.period ?? base.time.period,
        }
      : (next.time ?? base.time);

  return {
    refined: true,
    intent: {
      ...next,
      domain: previous.domain,
      query: next.query ?? base.query,
      filters,
      preferences,
      location: next.location ?? base.location,
      time,
      sort: next.sort ?? base.sort,
    },
  };
}

/** Основная часть и подзапросы — каждый как самостоятельное намерение. */
export function splitParts(intent: SmartSearchIntent): {
  primary: SmartSearchIntentCore;
  subqueries: SmartSearchIntentCore[];
} {
  const { schemaVersion: _version, subqueries, ...primary } = intent;
  return {
    primary,
    subqueries: subqueries.map((part) => ({
      ...part,
      intent: part.intent === 'refine' ? 'search' : part.intent,
    })),
  };
}

/** Имена фильтров, которых нет в белом списке раздела. */
export function unknownFilterKeys(
  intent: SmartSearchIntentCore,
  allowed: ReadonlySet<string>,
): string[] {
  return [...Object.keys(intent.filters), ...Object.keys(intent.preferences)].filter(
    (key) => !allowed.has(key),
  );
}
