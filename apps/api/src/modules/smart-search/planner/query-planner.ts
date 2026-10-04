import type {
  SmartSearchFilterValue,
  SmartSearchIntent,
  SmartSearchIntentCore,
} from '@dagestan/shared';

import type { SearchContextRecord } from '../context/context-store.js';
import { isGroundedNumber, parseAmount } from '../normalize/amounts.js';
import { matchCity, norm, sameStem, words } from '../normalize/text.js';

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
 * Слова, без которых сделку или срок аренды модель придумала: на реальном
 * прогоне Qwen3 ставила «снять посуточно» к фразе «машину автомат бензин».
 * Значение остаётся, только если во фразе есть его признак.
 */
const DEAL_WORDS: Readonly<Record<string, RegExp>> = {
  rent: /снят|сним|аренд|посуточ|сутк|сда[мюе]|прокат|помесяч|надолго|на месяц/u,
  sale: /куп|прода|продаж/u,
};
const PERIOD_WORDS: Readonly<Record<string, RegExp>> = {
  daily: /посуточ|сутк|на день|на ночь|на выходные/u,
  monthly: /месяц|помесяч|надолго|длительн|на год|долгосроч/u,
};
const DAY_WORDS: Readonly<Record<string, RegExp>> = {
  today: /сегодня|сейчас|нынче/u,
  tomorrow: /(^|[^а-я])завтра/u,
  day_after_tomorrow: /послезавтра/u,
  yesterday: /вчера/u,
};

/**
 * Поля намерения, у которых есть своё место (location, time, sort, query):
 * Qwen3 то и дело кладёт их в filters («filters: {date: "today"}»). Это не
 * чужое поле, а не на своём месте — оно отбрасывается с пометкой, а не
 * роняет весь запрос. Неизвестные имена по-прежнему отклоняют ответ целиком.
 */
export const STRUCTURAL_KEYS = new Set([
  'date',
  'time',
  'day',
  'period',
  'city',
  'location',
  'region',
  'place_city',
  'sort',
  'query',
]);

/** Слова границ: без них «от»/«до» модель придумала («256 ГБ» → «от 256»). */
const MIN_WORDS =
  /(^| )(от|больше|более|свыше|не меньше|минимум|выше|новее|не старше|позже)( |$)|[+]/u;
const MAX_WORDS =
  /(^| )(до|меньше|менее|не больше|максимум|ниже|дешевле|не дороже|старше|раньше)( |$)/u;

/**
 * Граница, которой нет во фразе, становится точным значением: «iPhone 15 Pro
 * 256 ГБ» — ровно 256, а не «от 256». Цена не трогается: у неё одна граница
 * «до» по смыслу, а голое число цены лента и так понимает как «до».
 */
function withNamedBounds(
  key: string,
  value: SmartSearchFilterValue,
  lower: string,
): SmartSearchFilterValue {
  if (key === 'price' || typeof value !== 'object' || value === null || Array.isArray(value))
    return value;
  if (value.min !== undefined && value.max === undefined && !MIN_WORDS.test(lower))
    return value.min;
  if (value.max !== undefined && value.min === undefined && !MAX_WORDS.test(lower))
    return value.max;
  return value;
}

/** Выше — уже не месячная аренда жилья, а продажа. */
export const MONTHLY_RENT_MAX_RUB = 200_000;

/**
 * Правило сервера, а не догадка модели: жильё «до 40 тысяч» без слов
 * «купить»/«снять» — это помесячная аренда (квартиру за такие деньги не
 * продают). Работает только для недвижимости и только с названной суммой.
 */
function monthlyRentByPrice(intent: SmartSearchIntentCore, text: string): boolean {
  const category = intent.filters.category;
  const realty =
    (typeof category === 'string' && category.startsWith('realty')) || 'rooms' in intent.filters;
  const price = intent.filters.price;
  const max =
    typeof price === 'number'
      ? price
      : price && typeof price === 'object' && !Array.isArray(price)
        ? parseAmount(price.max)
        : null;
  return (
    realty &&
    max !== null &&
    max <= MONTHLY_RENT_MAX_RUB &&
    isGroundedNumber(max, text) &&
    !DEAL_WORDS.sale!.test(norm(text))
  );
}

/** Час «ЧЧ:ММ» есть во фразе: «после 19», «19:00», «в 7 вечера». */
function hourInText(time: string, text: string): boolean {
  const hour = Number(time.slice(0, 2));
  const numbers = (text.match(/\d{1,2}(?=\D|$)/g) ?? []).map(Number);
  return numbers.some((value) => value === hour || (hour > 12 && value === hour - 12));
}

/** Город модели назван во фразе (с точностью до падежа). */
function cityInText(city: string, text: string): boolean {
  const target = norm(city);
  if (!target) return false;
  if (norm(text).includes(target)) return true;
  return words(city).every((part) => words(text).some((word) => sameStem(word, part)));
}

/**
 * Сверка с фразой: крупное число, сделка, срок аренды, день, час и город,
 * которых человек не называл, убираются («айфон недорого» → 30 000; «машину
 * автомат» → «снять посуточно»). Список убранных полей возвращается — по нему
 * сервер переспросит или пометит условие как не применённое.
 */
export function groundIntent(
  intent: SmartSearchIntentCore,
  text: string,
): { intent: SmartSearchIntentCore; dropped: string[] } {
  const dropped: string[] = [];
  const lower = norm(text);
  const clean = (record: FilterRecord): FilterRecord => {
    const result: FilterRecord = {};
    for (const [key, rawValue] of Object.entries(record)) {
      const value = withNamedBounds(key, rawValue, lower);
      if (STRUCTURAL_KEYS.has(key)) {
        dropped.push(`structural:${key}`);
        continue;
      }
      const rule =
        key === 'transactionType' ? DEAL_WORDS : key === 'rentPeriod' ? PERIOD_WORDS : null;
      if (rule && typeof value === 'string') {
        const code = value === 'buy' ? 'sale' : value;
        const pattern = rule[code];
        const byPrice = (code === 'rent' || code === 'monthly') && monthlyRentByPrice(intent, text);
        if (pattern && !pattern.test(lower) && !byPrice) {
          dropped.push(key);
          continue;
        }
      }
      const grounded = groundValue(key, value, text);
      if (grounded === null) dropped.push(key);
      else {
        result[key] = grounded;
        if (JSON.stringify(grounded) !== JSON.stringify(value)) dropped.push(key);
      }
    }
    return result;
  };
  let time = intent.time;
  if (time) {
    const day = time.date;
    const dayGrounded =
      day === null || (day in DAY_WORDS ? DAY_WORDS[day]!.test(lower) : /\d/.test(lower));
    const from = time.from && hourInText(time.from, text) ? time.from : null;
    const to = time.to && (time.to === '23:59' || hourInText(time.to, text)) ? time.to : null;
    if (!dayGrounded) dropped.push('time.date');
    if (time.from && !from) dropped.push('time.from');
    if (time.to && !to) dropped.push('time.to');
    time = { ...time, date: dayGrounded ? day : null, from, to };
    if (!time.date && !time.from && !time.to && !time.period) time = null;
  }

  let location = intent.location;
  if (location?.city && !cityInText(location.city, text)) {
    dropped.push('location.city');
    location = location.nearMe ? { ...location, city: null } : null;
  }

  return {
    intent: {
      ...intent,
      filters: clean(intent.filters),
      preferences: clean(intent.preferences),
      time,
      location,
    },
    dropped: [...new Set(dropped)],
  };
}

/** Город, названный во фразе, если модель его не вернула: «Новости Дербента». */
export function cityFromText(text: string, cities: Parameters<typeof matchCity>[1]) {
  for (const word of words(text)) {
    const match = matchCity(word, cities);
    if (match.kind !== 'unknown') return match;
  }
  return null;
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
