import type {
  SmartSearchDomain,
  SmartSearchIntent,
  SmartSearchIntentCore,
} from '../../schemas/smart-search.schema.js';
import {
  ATTRIBUTE_SYNONYMS,
  DOMAIN_PHRASES,
  FILLER_WORDS,
  SEARCH_DICTIONARY,
} from '../dictionary/index.js';
import type { SearchDictionaryEntry } from '../types.js';
import { matchEntries, matchPhrases, type DictionaryHit, type PhraseHit } from './entities.js';
import { norm, sameStem } from './normalize.js';
import { normalizeSearchText } from './normalize.js';
import { extractNumericConditions, type NumericValue } from './numbers.js';
import { extractPartNumbers, joinBodyCodes, scanParts } from './parts-scan.js';
import { isPartsCategory } from '../../constants/parts/equipment-types.js';
import { dualCategories, partAliasStemKey } from '../parts.js';
import { consume, leftover, tokenize, type SearchToken } from './tokenize.js';

/**
 * Локальный разбор фразы: словарь + правила → то же намерение, что раньше
 * возвращала языковая модель. Дальше фраза идёт по обычному пути: сверка
 * с фразой, контекст уточнений, адаптер раздела, существующий поиск.
 *
 * Главный принцип: ложное условие хуже отсутствующего. Что не узнано
 * однозначно — не применяется, а остаётся словами для обычного поиска или
 * вопросом человеку.
 */

/** Марка, модель или категория, найденные по справочникам каталога объявлений. */
export interface SubjectHit {
  brand?: string;
  model?: string;
  category?: string;
  /** Слова фразы, которые это заняли (не попадут в текстовый поиск) */
  words: readonly string[];
}

export interface LocalParseOptions {
  /** Названия городов приложения — для location.city */
  cities?: readonly string[];
  /**
   * Предмет объявлений по справочникам каталога: марка, модель, категория.
   * Получает свободные слова фразы (без служебных и чисел).
   */
  subject?: (freeWords: readonly string[], text: string) => SubjectHit | null;
}

export interface LocalParseResult {
  intent: SmartSearchIntent;
  /** Слова, которые ничему не достались (без наполнителей) */
  leftover: string[];
  /** Что узнано: «category:transport-cars», «domain:cinema», «price» … */
  recognized: string[];
}

const EMPTY_CLARIFICATION = { needed: false, question: null, options: [] as string[] };

function emptyCore(): SmartSearchIntentCore {
  return {
    intent: 'search',
    domain: null,
    query: null,
    filters: {},
    preferences: {},
    location: null,
    time: null,
    sort: null,
    clarification: { ...EMPTY_CLARIFICATION, options: [] },
    confidence: 0,
    unresolved: [],
  };
}

const DAY_WORDS: Readonly<
  Record<string, 'today' | 'tomorrow' | 'day_after_tomorrow' | 'yesterday'>
> = {
  сегодня: 'today',
  сейчас: 'today',
  нынче: 'today',
  завтра: 'tomorrow',
  послезавтра: 'day_after_tomorrow',
  вчера: 'yesterday',
};
const PERIOD_WORDS: Readonly<Record<string, 'morning' | 'day' | 'evening' | 'night'>> = {
  утром: 'morning',
  утро: 'morning',
  утра: 'morning',
  днем: 'day',
  день: 'day',
  дневной: 'day',
  вечером: 'evening',
  вечер: 'evening',
  вечера: 'evening',
  ночью: 'night',
  ночь: 'night',
  ночной: 'night',
};
/** Слова региона: не город, а весь Дагестан. */
const REGION_WORDS = new Set([
  'дагестан',
  'дагестана',
  'дагестане',
  'республика',
  'республике',
  'рд',
]);
/** Предлог перед городом: «в Махачкале», «до Дербента», «из Каспийска». */
const CITY_PREPOSITIONS = new Set(['в', 'во', 'до', 'из', 'по', 'г', 'город', 'городе']);
/** Пожелание перед условием: «желательно автомат», «лучше в Каспийске». */
const WISH_WORDS = new Set([
  'желательно',
  'лучше',
  'предпочтительно',
  'хотелось',
  'идеале',
  'возможности',
]);
/** «Открыто сейчас» для заведений. */
const OPEN_NOW =
  /(^| )(открыт\p{L}*|работает|работают) (сейчас|сегодня)( |$)|(^| )(сейчас|которые) (открыт\p{L}*|работа\p{L}*)( |$)/u;

/** Слова времени, которые могут стоять внутри выражения: «что сегодня посмотреть». */
const TIME_WORDS: ReadonlySet<string> = new Set([
  ...Object.keys(DAY_WORDS),
  ...Object.keys(PERIOD_WORDS),
]);

/** Слова, в которых опечатка не ищется: служебные, время, регион. */
const NO_FUZZY: ReadonlySet<string> = new Set([
  ...FILLER_WORDS,
  ...Object.keys(DAY_WORDS),
  ...Object.keys(PERIOD_WORDS),
  ...REGION_WORDS,
  ...CITY_PREPOSITIONS,
  ...WISH_WORDS,
]);
/** «Заказать», «привезите» без блюда и предмета — непонятно что: доставка или заведение. */
const ORDER_VERBS = new Set([
  'заказать',
  'закажи',
  'заказ',
  'закажу',
  'привезите',
  'привези',
  'привезти',
  'привезут',
  'доставьте',
]);

/**
 * Поля, которые есть только у одной категории: «автомат бензин» — легковые,
 * «6 соток» — участок. Без предмета во фразе категория берётся по ним.
 */
const FIELD_CATEGORY: Readonly<Record<string, string>> = {
  gearbox: 'transport-cars',
  fuel: 'transport-cars',
  drive: 'transport-cars',
  bodyType: 'transport-cars',
  steering: 'transport-cars',
  mileage: 'transport-cars',
  engineVolume: 'transport-cars',
  landArea: 'realty-land',
  rooms: 'realty-flats',
  floor: 'realty-flats',
  areaTotal: 'realty-flats',
};

function categoryByFields(
  hits: readonly DictionaryHit[],
  numeric: Record<string, NumericValue>,
): string | null {
  const fields = [
    ...hits
      .filter((hit) => hit.entry.type === 'attribute' && hit.entry.field)
      .map((hit) => hit.entry.field!),
    ...Object.keys(numeric),
  ];
  const categories = new Set(fields.map((field) => FIELD_CATEGORY[field]).filter(Boolean));
  return categories.size === 1 ? [...categories][0]! : null;
}

/** Жильё дороже этой суммы в месяц не снимают — это уже продажа. */
const MONTHLY_RENT_MAX_RUB = 200_000;

/** «Двушка» — не только квартиры, но и две комнаты: число комнат по слову. */
const ROOMS_BY_WORD: ReadonlyMap<string, number> = new Map(
  ATTRIBUTE_SYNONYMS.filter((entry) => entry.field === 'rooms').flatMap((entry) =>
    entry.aliases.map((alias) => [norm(alias), Number(entry.value)] as [string, number]),
  ),
);

/** Разделы, где слово «заказать» и блюдо означают доставку, а не покупку. */
const FOOD_DOMAINS: readonly SmartSearchDomain[] = ['places', 'delivery'];

/**
 * Запчасти во фразе: что названо и к какой технике подсказка. Тип техники и
 * деталь окончательно выбирает сервер по справочникам и марке (см.
 * listings.normalizer: applyPartsIntent) — здесь только то, что видно в словах.
 */
interface PartsFindings {
  /** Названия деталей и групп из фразы */
  aliases: string[];
  /** Типы техники, названные словами («айфон» → phone, «экскаватор» → special_equipment) */
  equipment: string[];
  /** Вид техники внутри типа: specialType = excavator */
  kinds: { attribute: string; option: string }[];
  /** «Запчасти на …» без названия детали */
  generic: boolean;
  numbers: string[];
  chassis: string | null;
  engine: string | null;
  /** Слово — и деталь, и обычная категория; сервер предложит оба смысла */
  dualCategories: string[];
  /** Производители деталей (коды справочника part_manufacturer) */
  makers: string[];
  /** Состояние: new | used | restored */
  condition: string | null;
  /** Тип: original | analog */
  originality: string | null;
}

interface Analysis {
  parts: PartsFindings | null;
  tokens: SearchToken[];
  phrases: PhraseHit[];
  entities: DictionaryHit[];
  numeric: Record<string, NumericValue>;
  city: { name: string; preferred: boolean } | null;
  region: boolean;
  nearMe: boolean;
  subject: SubjectHit | null;
  domain: SmartSearchDomain | null;
  ambiguous: SmartSearchDomain[];
  action: boolean;
  strong: boolean;
}

function entriesOf(
  hits: readonly DictionaryHit[],
  type: SearchDictionaryEntry['type'],
): DictionaryHit[] {
  return hits.filter((hit) => hit.entry.type === type);
}

/** Город из свободных слов: точное имя или падежная форма; предлог перед ним съедается. */
function findCity(tokens: SearchToken[], cities: readonly string[]): Analysis['city'] {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.consumed || token.text.length < 4) continue;
    // Двухсловные города («Каспийск» — одно слово, но на будущее)
    const city = cities.find((name) => sameStem(token.text, name));
    if (!city) continue;
    consume(tokens, i, i + 1, 'city');
    let preferred = false;
    let back = i - 1;
    if (back >= 0 && !tokens[back]!.consumed && CITY_PREPOSITIONS.has(tokens[back]!.text)) {
      consume(tokens, back, back + 1, 'city');
      back -= 1;
    }
    if (back >= 0 && tokens[back]!.by === 'wish') preferred = true;
    return { name: token.original, preferred };
  }
  return null;
}

/** Слова после «в», которые точно не город. */
const NOT_PLACE: ReadonlySet<string> = new Set([
  'наличии',
  'кредит',
  'рассрочку',
  'рассрочке',
  'ипотеку',
  'подарок',
  'центре',
  'районе',
  'доме',
  'квартире',
  'машине',
  'отличном',
  'хорошем',
  'идеальном',
  'сборе',
  'комплекте',
  'пленке',
  'коробке',
  'городе',
  'области',
  'республике',
  'москве',
  'россии',
  'интернете',
  'приложении',
  'кино',
  'ресторане',
  'кафе',
  'аренду',
  'аренде',
  'прокат',
  'пределах',
  'течение',
  'сутки',
  'месяц',
  'радиусе',
  'округе',
]);

/**
 * Город, которого в приложении нет («во Владивостоке»): слово после «в / во /
 * до / из», не узнанное ничем другим. Дальше раздел честно скажет, что такого
 * города нет, — лучше, чем искать по слову «владивостоке».
 */
function findForeignCity(tokens: SearchToken[]): string | null {
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const before = tokens[i - 1]!;
    if (token.consumed || before.consumed) continue;
    if (!['в', 'во', 'из', 'до'].includes(before.text)) continue;
    if (token.text.length < 5 || !/^\p{L}+$/u.test(token.text)) continue;
    if (NOT_PLACE.has(token.text) || FILLER_WORDS.has(token.text)) continue;
    if (!/(е|и|ы|а|у|ь)$/u.test(token.text)) continue;
    consume(tokens, i - 1, i + 1, 'city');
    return token.original;
  }
  return null;
}

function findRegion(tokens: SearchToken[]): boolean {
  let found = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.consumed || !REGION_WORDS.has(token.text)) continue;
    consume(tokens, i, i + 1, 'region');
    if (i > 0 && !tokens[i - 1]!.consumed && CITY_PREPOSITIONS.has(tokens[i - 1]!.text))
      consume(tokens, i - 1, i, 'region');
    found = true;
  }
  return found;
}

/** Время: день, часть дня, часы («после 19», «с 17:00», «в 7 вечера») — только для кино. */
function findTime(tokens: SearchToken[], cinema: boolean): SmartSearchIntentCore['time'] {
  let date: NonNullable<SmartSearchIntentCore['time']>['date'] = null;
  let period: NonNullable<SmartSearchIntentCore['time']>['period'] = null;
  let from: string | null = null;
  let to: string | null = null;
  if (cinema) {
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i]!;
      if (token.consumed) continue;
      const hour = /^(\d{1,2})(?:[.:](\d{2}))?$/.exec(token.text);
      if (!hour) continue;
      let hours = Number(hour[1]);
      const minutes = hour[2] ?? '00';
      if (hours > 23) continue;
      const before = i > 0 && !tokens[i - 1]!.consumed ? tokens[i - 1]!.text : '';
      const after = i + 1 < tokens.length && !tokens[i + 1]!.consumed ? tokens[i + 1]!.text : '';
      const marked = ['часов', 'часа', 'час', 'ч', 'вечера', 'утра', 'дня', 'ночи'].includes(after);
      if (!marked && !hour[2] && !['после', 'с', 'до', 'к', 'в'].includes(before)) continue;
      if ((after === 'вечера' || after === 'дня') && hours < 12) hours += 12;
      const value = `${String(hours).padStart(2, '0')}:${minutes}`;
      if (before === 'до' || before === 'к') to ??= value;
      else from ??= value;
      consume(tokens, i, i + 1, 'time');
      if (marked) consume(tokens, i + 1, i + 2, 'time');
      if (['после', 'с', 'до', 'к', 'в'].includes(before)) consume(tokens, i - 1, i, 'time');
    }
  }
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.consumed) continue;
    const day = DAY_WORDS[token.text];
    if (day) {
      // «сейчас» — сегодня только у кино и заведений; у «что сейчас в кино» слово уже в выражении
      if (token.text !== 'сейчас' || cinema) {
        date ??= day;
        consume(tokens, i, i + 1, 'time');
      }
      continue;
    }
    const part = PERIOD_WORDS[token.text];
    if (part && (cinema || token.text.endsWith('ом') || token.text === 'ночью')) {
      period ??= part;
      consume(tokens, i, i + 1, 'time');
    }
  }
  if (date === null && period === null && from === null && to === null) return null;
  return { date, from, to, period };
}

/**
 * Раздел по совпадениям. Сильные признаки — выражение или слово раздела,
 * категория объявлений, предмет из каталога. Слабые — сделка, характеристика,
 * цена, блюдо. Неоднозначное выражение решает контекст, иначе — человек.
 */
function decideDomain(
  tokens: readonly SearchToken[],
  phrases: readonly PhraseHit[],
  entities: readonly DictionaryHit[],
  numeric: Record<string, NumericValue>,
  city: boolean,
  region: boolean,
  subject: SubjectHit | null,
): Pick<Analysis, 'domain' | 'ambiguous' | 'action' | 'strong'> {
  const action = phrases.find((hit) => hit.phrase.action);
  if (action) {
    return { domain: action.phrase.domains[0] ?? null, ambiguous: [], action: true, strong: true };
  }
  const actionWord = entriesOf(entities, 'action')[0];

  const strong: { domain: SmartSearchDomain; at: number }[] = [];
  const ambiguousPhrases: PhraseHit[] = [];
  for (const hit of phrases) {
    if (hit.phrase.domains.length === 1)
      strong.push({ domain: hit.phrase.domains[0]!, at: hit.start });
    else ambiguousPhrases.push(hit);
  }
  for (const hit of entities) {
    if (hit.entry.type === 'domain' && hit.entry.domain)
      strong.push({ domain: hit.entry.domain, at: hit.start });
    if (hit.entry.type === 'category') strong.push({ domain: 'listings', at: hit.start });
    // Жанр — кино, «в мире» — новости: слово раздела, даже если это значение фильтра.
    // Голое слово региона («Дагестан», «Россия») раздел не выбирает: оно есть везде
    if (
      hit.entry.domain &&
      hit.entry.domain !== 'listings' &&
      hit.entry.type !== 'domain' &&
      (hit.entry.type !== 'scope' ||
        hit.alias.includes(' ') ||
        /(ые|их|ие|ских|ские)$/u.test(hit.alias))
    )
      strong.push({ domain: hit.entry.domain, at: hit.start });
  }
  if (subject)
    strong.push({ domain: 'listings', at: tokens.findIndex((token) => token.by === 'subject') });

  const dish = entriesOf(entities, 'dish').length > 0;
  const listingsWeak =
    entriesOf(entities, 'deal').length > 0 ||
    entriesOf(entities, 'period').length > 0 ||
    entriesOf(entities, 'attribute').length > 0 ||
    Object.keys(numeric).some((field) => field !== 'maxMinutes');

  const has = (domain: SmartSearchDomain) => strong.some((item) => item.domain === domain);
  const distinct = [...new Set(strong.map((item) => item.domain))];

  if (distinct.length === 0 && ambiguousPhrases.length > 0) {
    const options = ambiguousPhrases[0]!.phrase.domains;
    const timeHint = tokens.some(
      (token) => !token.consumed && (DAY_WORDS[token.text] || PERIOD_WORDS[token.text]),
    );
    if (dish && options.includes('places'))
      return { domain: 'places', ambiguous: [], action: false, strong: true };
    if ((city || region) && options.includes('attractions'))
      return { domain: 'attractions', ambiguous: [], action: false, strong: true };
    if (timeHint && options.includes('cinema'))
      return { domain: 'cinema', ambiguous: [], action: false, strong: true };
    return { domain: null, ambiguous: [...options], action: false, strong: false };
  }

  let domain: SmartSearchDomain | null = null;
  const onlyOrderVerb =
    distinct.length === 1 &&
    distinct[0] === 'delivery' &&
    !dish &&
    entities.every((hit) => hit.entry.type !== 'domain' || ORDER_VERBS.has(hit.alias)) &&
    phrases.length === 0 &&
    !tokens.some((token) => !token.consumed && !FILLER_WORDS.has(token.text));
  if (onlyOrderVerb) {
    return { domain: null, ambiguous: ['delivery', 'places'], action: false, strong: false };
  }
  if (distinct.length === 1) {
    domain = distinct[0]!;
  } else if (distinct.length > 1) {
    // «Заказать машину» — объявления, не доставка; «доставка из ресторана» — доставка
    if (has('listings') && !dish && (has('delivery') || has('places'))) domain = 'listings';
    else if (has('delivery') && has('places')) domain = 'delivery';
    else if (has('cinema') && has('attractions'))
      domain = region || city ? 'attractions' : 'cinema';
    // «Поехать в кино» — кино, а не попутчики
    else if (has('cinema') && has('rides')) domain = 'cinema';
    else domain = strong.sort((a, b) => a.at - b.at)[0]!.domain;
  } else if (dish) {
    // Одно слово-блюдо («хинкал») — где: в заведении или домой, решает человек;
    // с любым другим словом («хочу пиццу», «пицца в Каспийске») — доставка
    const bare =
      !city &&
      tokens.every((token) => token.consumed && token.by === 'entity') &&
      entities.every((hit) => hit.entry.type === 'dish');
    if (bare)
      return { domain: null, ambiguous: ['places', 'delivery'], action: false, strong: false };
    domain = 'delivery';
  } else if (listingsWeak) {
    return { domain: 'listings', ambiguous: [], action: Boolean(actionWord), strong: false };
  }

  // Сильный признак важнее размытого выражения: «что посмотреть в кино» — кино
  return { domain, ambiguous: [], action: Boolean(actionWord), strong: domain !== null };
}

/** Категория из совпадений: самое длинное слово; при равной длине — первое. */
function pickCategory(hits: readonly DictionaryHit[]): string | null {
  const categories = entriesOf(hits, 'category');
  if (categories.length === 0) return null;
  // Предмет обычно стоит первым: «участок под строительство» — участок
  const best = [...categories].sort(
    (a, b) => a.start - b.start || b.alias.length - a.alias.length,
  )[0]!;
  return best.entry.canonical;
}

/** Слова типа техники, которые одновременно марка или модель: их ищет справочник каталога. */
const BRAND_LIKE_WORDS: ReadonlySet<string> = new Set([
  'айфон',
  'айфона',
  'iphone',
  'айпад',
  'айпада',
  'ipad',
  'макбук',
  'макбука',
  'macbook',
  'камаз',
  'камаза',
  'газель',
  'газели',
  'маз',
  'урал',
]);

/**
 * Слова, которые называют ещё что-то кроме детали: «дверь» — и деталь, и дверь для
 * дома, «камера» — и деталь телефона, и фотокамера. Без другого признака запчастей
 * («запчасти», марка, номер, тип техники) такое слово остаётся обычным.
 */
let nonPartKeys: Map<string, Set<string>> | null = null;
function isDualPart(hit: { text: string; matches: readonly { slug: string }[] }): boolean {
  if (!nonPartKeys) {
    nonPartKeys = new Map();
    for (const entry of SEARCH_DICTIONARY) {
      // Слова самих запчастей — не «двойники». Названия направлений
      // («кондиционер», «шины») — двойники: одно такое слово — это направление
      if (entry.type === 'category' && isPartsCategory(entry.canonical)) continue;
      const owner = entry.type === 'category' ? entry.canonical : '*';
      for (const alias of entry.aliases) {
        const key = partAliasStemKey(alias);
        const owners = nonPartKeys.get(key) ?? new Set<string>();
        owners.add(owner);
        nonPartKeys.set(key, owners);
      }
    }
  }
  const owners = nonPartKeys.get(partAliasStemKey(hit.text));
  if (!owners) return false;
  // Слово называет своё же направление («лодочные моторы» — и тип товара, и
  // направление «Лодочные моторы») — это не второй смысл, а тот же
  const own = new Set(hit.matches.map((match) => match.slug));
  return [...owners].some((owner) => !own.has(owner));
}

/** Запчасти во фразе: слова съедаются только если это точно запрос о запчастях. */
function findParts(
  tokens: SearchToken[],
  numbers: readonly string[],
  options: LocalParseOptions,
): PartsFindings | null {
  const scan = scanParts(tokens);
  const itemHits = scan.hits.filter((hit) => hit.isItem);
  const dual = itemHits.filter((hit) => isDualPart(hit));
  const solid = itemHits.filter((hit) => !isDualPart(hit));
  const generic = scan.generic.length > 0;
  const codes = scan.chassis.length > 0 || scan.engine.length > 0;

  // Запрос о запчастях — когда есть название детали, слово «запчасти» или номер.
  // Одно название группы («стиралка», «тормоза») или техники («телефон») — нет
  // Производитель детали — признак запчасти рядом с названием детали, номером,
  // типом или состоянием («новая Denso»); один («дрель Bosch») — нет
  const makerEvidence =
    scan.makers.length > 0 &&
    (scan.hits.length > 0 || scan.qualities.length > 0 || numbers.length > 0);
  let evidence =
    solid.length > 0 ||
    generic ||
    numbers.length > 0 ||
    (scan.hits.length > 0 && codes) ||
    makerEvidence;
  let dualCategoriesFound: string[] = [];
  if (!evidence && dual.length > 0) {
    // Одно двусмысленное слово и больше ничего («камера», «дверь»): это вопрос «что
    // именно?» — техника на выбор плюс обычная категория, а не молчаливый выбор
    const covered = new Set<number>();
    for (const hit of scan.hits) for (let i = hit.start; i < hit.end; i += 1) covered.add(i);
    const rest = tokens.filter(
      (token, index) => !token.consumed && !covered.has(index) && !FILLER_WORDS.has(token.text),
    );
    // Считаются только детали: название группы («кондиционер» у климата и авто) не двусмысленность
    const equipments = new Set(
      dual[0]!.matches.filter((match) => match.item !== null).map((match) => match.equipment),
    );
    if (dual.length === 1 && rest.length === 0 && equipments.size >= 2) {
      evidence = true;
      dualCategoriesFound = dualCategories(dual[0]!.text);
    }
  }
  if (!evidence && dual.length > 0) {
    if (scan.equipment.length > 0) {
      evidence = true;
    } else if (options.subject) {
      // «Дверь на камри» — деталь: марка и модель говорят о технике
      const own = new Set(
        dual.flatMap((hit) => [...Array(hit.end - hit.start).keys()].map((i) => hit.start + i)),
      );
      const words = tokens
        .filter((token, index) => !token.consumed && !own.has(index))
        .map((t) => t.text);
      const hit = options.subject(words, words.join(' '));
      evidence = Boolean(hit && (hit.brand || hit.model));
    }
  }
  if (!evidence) return null;

  const take = (from: number, to: number): void => consume(tokens, from, to, 'part');
  for (const hit of scan.hits) take(hit.start, hit.end);
  for (const item of scan.generic) take(item.start, item.end);
  // «Айфон», «макбук», «камаз» — и тип техники, и марка с моделью: слово остаётся
  // во фразе, чтобы справочник нашёл iPhone 13, а не только «телефон»
  for (const item of scan.equipment) {
    if (!(item.end - item.start === 1 && BRAND_LIKE_WORDS.has(tokens[item.start]!.text)))
      take(item.start, item.end);
  }
  for (const item of scan.chassis) take(item.index, item.index + 1);
  for (const item of scan.engine) take(item.start, item.end);
  for (const item of scan.makers) take(item.start, item.end);
  for (const item of scan.qualities) take(item.start, item.end);
  let condition: string | null = null;
  let originality: string | null = null;
  for (const item of scan.qualities) {
    condition ??= item.quality.condition ?? null;
    originality ??= item.quality.originality ?? null;
  }

  const equipment = new Set<string>();
  const kinds: { attribute: string; option: string }[] = [];
  for (const item of scan.equipment) {
    for (const hit of item.hits) {
      equipment.add(hit.equipment);
      if (hit.kind && !kinds.some((k) => k.attribute === hit.kind!.attribute)) kinds.push(hit.kind);
    }
  }
  for (const item of scan.generic) if (item.equipment) equipment.add(item.equipment);
  // Код двигателя вида «1NZ-FE», «2JZ» — японский легковой мотор: подсказка к легковым
  // Кузов вида «NCP165», «GRX130» — тоже легковой
  if ((scan.engine.length > 0 || scan.chassis.length > 0) && equipment.size === 0)
    equipment.add('passenger_car');

  return {
    aliases: scan.hits.map((hit) => hit.text),
    equipment: [...equipment],
    kinds,
    generic,
    numbers: [...numbers],
    chassis: scan.chassis[0]?.value ?? null,
    engine: scan.engine[0]?.value ?? null,
    dualCategories: dualCategoriesFound,
    makers: [...new Set(scan.makers.map((item) => item.value))],
    condition,
    originality,
  };
}

function analyze(
  text: string,
  options: LocalParseOptions,
  partNumbers: readonly string[] = [],
): Analysis {
  const tokens = tokenize(normalizeSearchText(text));
  // «Желательно», «лучше» — пожелание к следующему условию; слово само ничего не ищет
  for (let i = 0; i < tokens.length; i += 1) {
    if (WISH_WORDS.has(tokens[i]!.text)) consume(tokens, i, i + 1, 'wish');
  }
  const phrases = matchPhrases(tokens, DOMAIN_PHRASES, TIME_WORDS);
  // Числа с единицами («3 комнаты», «100 тыс км») — раньше словаря: «комнаты» здесь единица
  const realty = /(однушк|двушк|трешк|четырешк|студи|квартир|комнат|жиль)/u.test(
    tokens.map((token) => token.text).join(' '),
  );
  const numeric = extractNumericConditions(tokens, { realty });
  // Запчасти — раньше словаря: «рейка», «граната», «матрица» не должны уйти в категории
  const parts = findParts(tokens, partNumbers, options);
  const entities = matchEntries(tokens, SEARCH_DICTIONARY, { noFuzzy: NO_FUZZY });
  // «В Дагестане» — лента новостей по республике и признак региона для остальных разделов
  const region =
    findRegion(tokens) ||
    entities.some((hit) => hit.entry.type === 'scope' && hit.entry.canonical === 'dagestan');
  const known = options.cities ? findCity(tokens, options.cities) : null;
  // Город не из приложения — всё равно место, а не слово для поиска
  const foreign = known ? null : findForeignCity(tokens);
  const city = known ?? (foreign ? { name: foreign, preferred: false } : null);
  const nearMe = entriesOf(entities, 'near').length > 0;

  let subject: SubjectHit | null = null;
  if (options.subject) {
    const freeWords = tokens.filter((token) => !token.consumed);
    const hit = options.subject(
      freeWords.map((token) => token.text),
      tokens.map((token) => token.text).join(' '),
    );
    if (hit && (hit.brand || hit.model || hit.category)) {
      subject = hit;
      for (const word of hit.words) {
        const index = tokens.findIndex((token) => !token.consumed && token.text === norm(word));
        if (index >= 0) consume(tokens, index, index + 1, 'subject');
      }
    }
  }

  const decision = decideDomain(
    tokens,
    phrases,
    entities,
    numeric,
    known !== null,
    region,
    subject,
  );
  // Запчасти — всегда объявления: тип техники и деталь потом уточнит сервер
  const forced: Partial<Analysis> = parts
    ? { domain: 'listings', ambiguous: [], action: false, strong: true }
    : {};
  return {
    parts,
    tokens,
    phrases,
    entities,
    numeric,
    city,
    region,
    nearMe,
    subject,
    ...decision,
    ...forced,
  };
}

/** Признаки, по которым фразу делят на независимые части: «кино завтра и новости». */
const PART_SPLIT = /\s(?:и|а также|плюс)\s|,/u;

function buildCore(analysis: Analysis, text: string): SmartSearchIntentCore {
  const { tokens, entities, numeric, domain } = analysis;
  const core = emptyCore();
  core.domain = domain;
  core.intent = analysis.action ? 'action' : domain ? 'search' : 'unknown';

  const filters: SmartSearchIntentCore['filters'] = {};
  const preferences: SmartSearchIntentCore['preferences'] = {};
  const wished = (hit: DictionaryHit) => hit.start > 0 && tokens[hit.start - 1]!.by === 'wish';
  const put = (hit: DictionaryHit | null, field: string, value: string | number | boolean) => {
    const target = hit && wished(hit) ? preferences : filters;
    if (target[field] === undefined) target[field] = value;
  };

  const parts = analysis.parts;
  if (domain === 'listings') {
    // Словарь важнее классификатора: «участок под строительство» — участок, не стройка.
    // У запчастей категорию выбирает сервер: «рейка на суксид» — автозапчасти, а не «Автомобили»
    const category = parts
      ? null
      : (pickCategory(entities) ??
        analysis.subject?.category ??
        categoryByFields(entities, numeric));
    if (category) filters.category = category;
    if (parts) {
      if (parts.aliases.length > 0) filters.partAlias = parts.aliases.slice(0, 6);
      if (parts.equipment.length > 0) filters.equipmentType = parts.equipment.slice(0, 6);
      if (parts.generic) filters.parts = true;
      if (parts.dualCategories.length > 0) filters.partDual = parts.dualCategories.slice(0, 3);
      if (parts.numbers.length > 0)
        filters.partNumber =
          parts.numbers.length === 1 ? parts.numbers[0]! : parts.numbers.slice(0, 4);
      if (parts.chassis) filters.compatChassis = parts.chassis;
      if (parts.engine) filters.compatEngine = parts.engine;
      for (const kind of parts.kinds) filters[kind.attribute] = kind.option;
      // Производитель — кодом справочника, тип и состояние — значениями полей детали
      if (parts.makers.length > 0) filters.partMaker = parts.makers[0]!;
      if (parts.condition) filters.partCondition = parts.condition;
      if (parts.originality) filters.partOriginality = parts.originality;
    }
    for (const hit of entriesOf(entities, 'category')) {
      const rooms = ROOMS_BY_WORD.get(hit.alias);
      if (rooms !== undefined && filters.rooms === undefined) filters.rooms = rooms;
    }
    if (analysis.subject?.brand) filters.brand = analysis.subject.brand;
    if (analysis.subject?.model) filters.model = analysis.subject.model;
    for (const hit of entriesOf(entities, 'attribute')) {
      put(hit, hit.entry.field!, hit.entry.value ?? hit.entry.canonical);
    }
    for (const hit of entriesOf(entities, 'deal')) put(hit, 'transactionType', hit.entry.canonical);
    for (const hit of entriesOf(entities, 'period')) put(hit, 'rentPeriod', hit.entry.canonical);
    if (filters.rentPeriod !== undefined && filters.transactionType === undefined)
      filters.transactionType = 'rent';
    for (const [rawField, value] of Object.entries(numeric)) {
      if (rawField === 'maxMinutes') continue;
      // У запчасти год — год техники, к которой она подходит
      const field = parts && rawField === 'year' ? 'compatYear' : rawField;
      if (filters[field] === undefined) filters[field] = value;
    }
    // Правило сервера: жильё «до 40 тысяч» без слов «купить»/«снять» — помесячная
    // аренда (квартиру за такие деньги не продают)
    const realtySubject =
      (typeof filters.category === 'string' && filters.category.startsWith('realty')) ||
      filters.rooms !== undefined;
    const budget =
      typeof filters.price === 'number'
        ? filters.price
        : filters.price && typeof filters.price === 'object' && !Array.isArray(filters.price)
          ? Number(filters.price.max)
          : NaN;
    if (realtySubject && filters.transactionType === undefined && budget <= MONTHLY_RENT_MAX_RUB) {
      filters.transactionType = 'rent';
      filters.rentPeriod ??= 'monthly';
    }
  } else if (domain ? FOOD_DOMAINS.includes(domain) : entriesOf(entities, 'dish').length > 0) {
    // Раздел не выбран, но блюдо названо («хинкал» после «где поесть?»): блюдо — в условия,
    // раздел подскажет контекст или выбор человека
    const dish = entriesOf(entities, 'dish')[0];
    if (dish) filters.dish = dish.entry.canonical;
    if (typeof numeric.maxMinutes === 'number') filters.maxMinutes = numeric.maxMinutes;
    else if (numeric.maxMinutes && typeof numeric.maxMinutes === 'object' && numeric.maxMinutes.max)
      filters.maxMinutes = numeric.maxMinutes.max;
    if (OPEN_NOW.test(norm(text))) filters.openNow = true;
  } else if (domain === 'cinema') {
    for (const hit of entriesOf(entities, 'attribute')) {
      if (hit.entry.domain === 'cinema' && hit.entry.field)
        put(hit, hit.entry.field, hit.entry.value ?? hit.entry.canonical);
    }
  } else if (domain === 'news') {
    const scope = entriesOf(entities, 'scope')[0];
    if (scope) filters.scope = scope.entry.canonical;
    else if (analysis.region) filters.scope = 'dagestan';
  }

  for (const hit of entriesOf(entities, 'sort'))
    core.sort ??= hit.entry.canonical as SmartSearchIntentCore['sort'];

  core.filters = filters;
  core.preferences = preferences;
  core.time = findTime(tokens, domain === 'cinema');
  if (analysis.city || analysis.nearMe) {
    core.location = {
      city: analysis.city?.name ?? null,
      nearMe: analysis.nearMe,
      preferred: analysis.city?.preferred ?? false,
    };
  }

  // Одиночное число — обычно часть уже разобранного условия; но число сразу после
  // марки («iPhone 18», «Honor 400») — модель, которой нет в справочнике: оно
  // остаётся словом поиска, иначе выдача стала бы «все Apple»
  const rest = tokens
    .filter(
      (token, index) =>
        !token.consumed && (!/^\d+$/.test(token.text) || tokens[index - 1]?.by === 'subject'),
    )
    .map((token) => token.text)
    .filter((word) => !FILLER_WORDS.has(word));
  const query = rest.join(' ').trim();
  core.query = query ? query.slice(0, 120) : null;
  core.unresolved =
    domain === null || domain === 'listings'
      ? rest.filter((word) => word.length <= 60).slice(0, 10)
      : [];

  core.clarification =
    domain === null
      ? { needed: true, question: null, options: analysis.ambiguous.slice(0, 6) }
      : { needed: false, question: null, options: [] };
  core.confidence = domain === null ? 0.3 : analysis.strong ? 0.9 : 0.6;
  return core;
}

function recognizedOf(analysis: Analysis): string[] {
  const items: string[] = [];
  if (analysis.parts) {
    for (const alias of analysis.parts.aliases) items.push(`part:${alias}`);
    for (const equipment of analysis.parts.equipment) items.push(`equipment:${equipment}`);
    for (const number of analysis.parts.numbers) items.push(`part_number:${number}`);
    if (analysis.parts.generic) items.push('parts:generic');
  }
  if (analysis.domain) items.push(`domain:${analysis.domain}`);
  for (const hit of analysis.entities) items.push(`${hit.entry.type}:${hit.entry.canonical}`);
  for (const hit of analysis.phrases) items.push(`phrase:${hit.phrase.phrase}`);
  for (const field of Object.keys(analysis.numeric)) items.push(`number:${field}`);
  if (analysis.city) items.push('city');
  if (analysis.subject) {
    for (const key of ['brand', 'model', 'category'] as const)
      if (analysis.subject[key]) items.push(`${key}:${analysis.subject[key]}`);
  }
  return items;
}

/** Одна фраза (без деления на части) → намерение. */
function parseWhole(
  text: string,
  options: LocalParseOptions,
  partNumbers: readonly string[] = [],
): { core: SmartSearchIntentCore; analysis: Analysis } {
  const analysis = analyze(text, options, partNumbers);
  return { core: buildCore(analysis, text), analysis };
}

/**
 * Фраза человека → намерение по словарю и правилам. Составная фраза
 * («кино завтра и новости») делится на части, если у частей разные разделы.
 */
export function parseSearchIntent(
  source: string,
  options: LocalParseOptions = {},
): LocalParseResult {
  // Номера деталей — раньше всего: пока дефисы на месте, «90915-YZZD1» — один номер.
  // Код кузова с пробелом («NCP 165») — одно слово, иначе «165» потерялось бы
  const extracted = extractPartNumbers(joinBodyCodes(source));
  const text = extracted.text;
  const normalized = normalizeSearchText(text);
  const pieces =
    extracted.numbers.length > 0
      ? []
      : text
          .split(PART_SPLIT)
          .map((piece) => piece.trim())
          .filter((piece) => piece.length > 0);

  let primary: { core: SmartSearchIntentCore; analysis: Analysis };
  let subqueries: SmartSearchIntentCore[] = [];
  const parts =
    pieces.length > 1 && pieces.length <= 4
      ? pieces.map((piece) => parseWhole(piece, options))
      : [];
  const withDomain = parts.filter((part) => part.core.domain !== null && part.analysis.strong);
  const domains = new Set(withDomain.map((part) => part.core.domain));
  if (parts.length > 1 && withDomain.length === parts.length && domains.size > 1) {
    primary = withDomain[0]!;
    subqueries = withDomain.slice(1, 4).map((part) => ({ ...part.core, intent: 'search' }));
  } else {
    primary = parseWhole(normalized, options, extracted.numbers);
  }

  const intent: SmartSearchIntent = { schemaVersion: '1', ...primary.core, subqueries };
  return {
    intent,
    leftover: leftover(primary.analysis.tokens).filter((word) => !FILLER_WORDS.has(word)),
    recognized: recognizedOf(primary.analysis),
  };
}
