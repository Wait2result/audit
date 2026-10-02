import type { NewsScope } from '@dagestan/shared';

import { NEWS_LIMITS } from './news.sources.js';

/**
 * Классификация новостей по правилам, без ИИ (решение по Этапу 5).
 *
 * Все функции чистые — только текст на входе и решение на выходе, поэтому их
 * можно прогнать на живой ленте, не поднимая ни базу, ни сервер. Если правил
 * когда-нибудь не хватит, этот файл заменяется целиком (например, вызовом
 * модели), а остальной сбор новостей остаётся как есть.
 *
 * Про границы слов: в JS `\b` считает буквами только латиницу и цифры, и на
 * кириллице молча не срабатывает. Поэтому начало слова проверяется явно —
 * `(?<![а-яё])`.
 */

const W = '(?<![а-яё])';

function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е');
}

function has(pattern: RegExp, text: string): boolean {
  return pattern.test(text);
}

/**
 * Слова «Дагестан» и «республика» сами по себе масштаб не задают: их пишут и в
 * «концерт в Дербенте в День единства народов Дагестана». Если заметка при этом
 * названа городом, она остаётся городской.
 */
const REPUBLIC_WORDS = new RegExp(`${W}(дагестан|республик)`);

/** Признаки республиканского масштаба: такая новость нужна всем городам. */
const REPUBLIC_MARKERS = new RegExp(
  `${W}(выбор|парламент|госдум|народн\\S* собрани|президент|путин|правительств|министерств|голосова|проголосов|избират|явк|аэропорт|аэродром|взлетно|железнодорож|морск\\S* порт)`,
);

/** Признаки того, что новость вообще про Дагестан. */
const DAGESTAN_MARKERS = new RegExp(
  `${W}(дагестан|республик|махачкал|каспийск|дербент|избербаш|кизилюрт|буйнакск|кизляр|хасавюрт|муниципалитет|район)`,
);

/** Строгое упоминание Дагестана — для изданий обо всём Кавказе, где «район» ни о чём не говорит. */
const DAGESTAN_STRICT = new RegExp(
  `${W}(дагестан|махачкал|каспийск|дербент|избербаш|кизилюрт|буйнакск|кизляр|хасавюрт)`,
);

/** Малые города и районы, у которых нет своей вкладки: новость о них — локальная. */
const SMALL_PLACES = new RegExp(
  `${W}(избербаш|кизилюрт|буйнакск|кизляр|хасавюрт|табасаранск|лакск|левашинск|кайтагск|касумкент|курахск|тляратинск|рутульск|цунтинск|ахвахск|казбековск|новолакск|бабаюртовск|сергокалинск|гумбетовск|кулинск|кумторкалинск|дербентск\\S* район|район)`,
);

/** Общероссийское, без привязки к Дагестану. */
const NATIONAL_ONLY = new RegExp(`${W}(росси|российск|рф)`);

const SEVERITY = new RegExp(
  `${W}(погиб|пострадал|жертв|смерт|насмерть|взрыв|пожар|горит|обрушен|паводк|наводнен|землетряс|селев|оползн|сбил)`,
);

const TOP_OFFICIALS = new RegExp(
  `${W}(президент|путин|врио глав|глава дагестан|правительств\\S* (рф|росси))`,
);

const SCALE_NUMBER = /\d[\d\s,.]*\s*(тыс|млн|млрд|%|процент|км)/;

/**
 * Темы, которые касаются жизни многих людей. Нужны потому, что не все
 * источники размечают рубрики и прикладывают картинки: по одной оправе
 * значимость «Дагестанской правды» не оценить.
 */
const CIVIC_TOPICS = new RegExp(
  `${W}(выбор|голосован|избирател|аэропорт|взлетно|автодорог|дорог|мост|газификац|водопровод|водоснабж|школ|больниц|поликлиник|инвестиц|завод|строительств|ремонт|бюджет|налог|тариф|субсиди|зарплат|пенси|льгот|электроснабж|благоустройств)`,
);

/** Столица республики: её датлайн стоит на любой республиканской новости. */
const CAPITAL_STEMS = ['махачкал'];

export interface CityRef {
  id: string;
  name: string;
}

/** «Махачкала» → «махачкал»: основа, по которой находятся все падежи. */
export function cityStem(name: string): string {
  return normalize(name).replace(/[аяуыоеь]$/, '');
}

/**
 * Место из датлайна РИА «Дагестан»: «МАХАЧКАЛА, 18 сентября» → «махачкала».
 * Датлайн печатается заглавными буквами — обычный текст с запятой не подойдёт.
 */
export function datelinePlace(description: string): string | null {
  const match = description.trim().match(/^([А-ЯЁ][А-ЯЁ\- ]{2,40}?)\s*,/);
  return match?.[1] ? normalize(match[1]) : null;
}

export interface DagestanInput {
  title: string;
  /** Начало полного текста: по нему видно, о чём речь, когда заголовок краток */
  bodyStart: string;
  category: string | null;
  description: string;
  hasImage: boolean;
  cities: CityRef[];
  /**
   * Город, к которому относится источник или страница, где издание разместило
   * заметку (местное издание, раздел «г. Дербент»). Заголовок может город не
   * называть — редакция уже сказала, о ком речь.
   */
  homeCity?: CityRef;
  /** Издание пишет обо всём Кавказе: без упоминания Дагестана заметка отсеивается */
  requireMention?: boolean;
}

export type Verdict =
  | { kind: 'kept'; scope: NewsScope; cityId: string | null; score: number; why: string }
  | { kind: 'dropped'; reason: string };

/** Название издания в подписи («РИА «Дагестан»») не должно считаться упоминанием Дагестана. */
function withoutAttribution(text: string): string {
  return text
    .replace(/риа\s*[«"]?\s*дагестан\s*[»"]?/gi, ' ')
    .replace(/дагестанск\S*\s+правд\S*/gi, ' ');
}

/** Служебная подрубрика вида «РИА/Навстречу выборам» — спецпроект, а не новость дня. */
export function specialRubric(category: string | null): string | null {
  return category && category.includes('/') ? category : null;
}

export function classifyDagestan(input: DagestanInput): Verdict {
  const title = normalize(input.title);
  const rubric = normalize(input.category ?? '');
  const context = normalize(withoutAttribution(`${input.title} ${input.bodyStart}`));

  const place = datelinePlace(input.description);
  const launched = input.cities.map((city) => ({ ...city, stem: cityStem(city.name) }));

  if (input.requireMention && !has(DAGESTAN_STRICT, context)) {
    return { kind: 'dropped', reason: 'заметка не про Дагестан' };
  }

  // Общероссийское без Дагестана: такое есть в федеральных лентах
  if (has(NATIONAL_ONLY, title) && !has(DAGESTAN_MARKERS, context)) {
    return { kind: 'dropped', reason: 'общероссийская новость без связи с Дагестаном' };
  }

  // «Дербентский район» — не город Дербент: район живёт отдельно, у него своя администрация
  const mentionedCity = launched.find((city) =>
    new RegExp(`${W}${city.stem}(?!\\S*\\s+район)`).test(title),
  );
  const datelineCity = launched.find((city) => place !== null && place.startsWith(city.stem));
  const datelineIsCapital = place !== null && CAPITAL_STEMS.some((stem) => place.startsWith(stem));

  // Датлайн столицы стоит на любой республиканской новости — по нему город
  // не определить. У остальных городов он надёжен.
  const localCity =
    mentionedCity ??
    (datelineCity && !datelineIsCapital ? datelineCity : undefined) ??
    input.homeCity;

  const republicScale =
    has(REPUBLIC_MARKERS, title) ||
    has(/выбор/, rubric) ||
    rubric === 'политика' ||
    (!localCity && has(REPUBLIC_WORDS, title));

  let score = 0;
  if (input.hasImage) score += 2;
  if (has(SEVERITY, title)) score += 2;
  if (rubric === 'политика' || rubric === 'экономика') score += 2;
  if (has(TOP_OFFICIALS, title)) score += 3;
  if (has(SCALE_NUMBER, title)) score += 1;
  if (has(CIVIC_TOPICS, title)) score += 2;
  if (specialRubric(input.category)) score -= 2;
  // Новость про наш город — по определению важна тем, кто в нём живёт
  if (localCity && !republicScale) score += 1;

  // Местное издание пишет о городе, поэтому обычные городские заметки без
  // громких слов в заголовке для его жителей значимы: иначе вкладка города
  // остаётся пустой, хотя новости в нём есть
  if (input.homeCity && !republicScale) score += 2;

  // Новость про малый город или район без своей вкладки — локальная для тех,
  // кому она не показывается: не выдаём её всей республике без веской причины
  if (!localCity && !republicScale && has(SMALL_PLACES, title)) score -= 2;

  if (score < NEWS_LIMITS.minScore) {
    return {
      kind: 'dropped',
      reason: `малозначимо (баллы ${score}, нужно ${NEWS_LIMITS.minScore})`,
    };
  }

  if (localCity && !republicScale) {
    return {
      kind: 'kept',
      scope: 'city',
      cityId: localCity.id,
      score,
      why: `город ${localCity.name}: назван в заголовке или датлайне, масштаб не республиканский`,
    };
  }

  return {
    kind: 'kept',
    scope: 'dagestan',
    cityId: null,
    score,
    why: republicScale
      ? 'республиканский масштаб — показывается во всех городах'
      : 'новость Дагестана без привязки к нашему городу',
  };
}

// ── Федеральные ленты ────────────────────────────────────────────────────────

export interface NationalInput {
  category: string | null;
}

/** Рубрики мировой ленты: у Интерфакса «В мире», у Ленты.ру «Мир» и «Бывший СССР». */
const WORLD_CATEGORY = /^(в мире|мир|международS*|зарубежS*|бывший ссср)$/;

/**
 * Рубрики российской ленты. Список закрытый намеренно: у федеральных изданий
 * есть развлекательные и «жизненные» рубрики («Из жизни», «Забота о себе»,
 * «Ценности», «Путешествия», «Авто», спорт), которые не «самое интересное»,
 * а поток. Новая рубрика, не названная здесь, не попадёт в ленту сама.
 */
const RUSSIA_CATEGORY =
  /^(в россии|россия|политика|общество|экономика|бизнес|происшествия|топ главной|силовые структуры|наука и техника|выборы .*)$/;

export function classifyNational(input: NationalInput): Verdict {
  const category = normalize(input.category ?? '').trim();

  const scope: NewsScope | null = WORLD_CATEGORY.test(category)
    ? 'world'
    : RUSSIA_CATEGORY.test(category)
      ? 'russia'
      : null;

  if (!scope)
    return { kind: 'dropped', reason: `рубрика «${input.category ?? '—'}» не входит в ленты` };
  return { kind: 'kept', scope, cityId: null, score: 0, why: `рубрика «${input.category ?? '—'}»` };
}

// ── Подтверждение несколькими агентствами ────────────────────────────────────

const STOP_WORDS = new Set([
  'после',
  'этого',
  'также',
  'более',
  'если',
  'чтобы',
  'когда',
  'который',
  'которые',
  'заявил',
  'сообщил',
  'сообщила',
  'сообщили',
  'заявила',
  'рассказал',
  'отметил',
  'будет',
  'может',
  'своих',
]);

/**
 * Набор «основ» слов текста: первые пять букв слов от четырёх букв.
 * Русские падежи и окончания у разных агентств разные («дронов», «дроны»),
 * по первым пяти буквам такие слова совпадают.
 */
export function stems(text: string): Set<string> {
  const result = new Set<string>();
  for (const word of normalize(text).split(/[^а-яa-z0-9]+/)) {
    if (word.length < 4 || STOP_WORDS.has(word)) continue;
    result.add(word.slice(0, 5));
  }
  return result;
}

/** Похожи ли два текста настолько, что речь об одном событии. */
export function sameStory(left: Set<string>, right: Set<string>): boolean {
  if (left.size === 0 || right.size === 0) return false;

  let shared = 0;
  for (const stem of left) if (right.has(stem)) shared += 1;

  return shared >= 3 && shared / Math.min(left.size, right.size) >= 0.4;
}
