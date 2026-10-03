import { BRAND_ALIASES, MODEL_ALIASES } from './dictionaries/aliases.js';
import { CAR_BRANDS, OTHER_BRAND } from './dictionaries/car-brands.js';
import { modelValue } from './dictionaries/index.js';
import { PHONE_MODELS } from './dictionaries/phone-models.js';
import type { ListingRentPeriod, ListingTransactionType } from './transactions.js';

/**
 * Категория по заголовку (ТЗ «Объявления», п. 9).
 *
 * Человек пишет «iPhone 15 Pro Max 256GB» или «2-комнатная квартира в
 * Махачкале» — и форма сразу предлагает категорию и заполняет то, что уже
 * сказано в заголовке: марку, модель, год, число комнат, сделку.
 *
 * Сейчас это правила: справочники марок и моделей плюс словарь признаков
 * подкатегорий. Детерминированно, без сети и без ошибок «на всякий случай».
 * Интерфейс — функция «заголовок → догадка», поэтому подключить позже
 * классификатор на модели можно, не трогая форму: он вернёт ту же догадку.
 *
 * Догадка — подсказка, а не решение: форма всегда даёт подтвердить,
 * выбрать другую категорию или пропустить. Публикацию она не блокирует.
 */

export interface ListingTitleGuess {
  /** Код подкатегории: `transport-cars`, `electronics-phones` */
  slug: string;
  /** Что заполнить в форме сразу: марка, модель, год, комнаты */
  attributes: Record<string, string | number>;
  /** Подписи для строки «Похоже, это: …»: марка и модель как их пишут люди */
  details: string[];
  /** Сделка, если заголовок её называет: «сдам», «посуточно» */
  transactionType?: ListingTransactionType;
  rentPeriod?: ListingRentPeriod;
}

export type ListingTitleVerdict =
  | { kind: 'guess'; guess: ListingTitleGuess }
  /** «Куплю», «сниму», «ищу квартиру» — объявления-запросы не публикуются */
  | { kind: 'request'; message: string }
  | { kind: 'none' };

export const REQUEST_LISTING_MESSAGE =
  'Объявления «куплю» и «сниму» не публикуются. Найдите нужное через поиск: «Купить» и «Снять» — в фильтрах.';

/** Не меньше стольких букв — иначе догадываться не о чем. */
const MIN_TITLE_LENGTH = 3;

export function classifyListingTitle(title: string): ListingTitleVerdict {
  const text = normalize(title);
  if (text.replace(/\s/g, '').length < MIN_TITLE_LENGTH) return { kind: 'none' };
  const words = text.split(' ');

  const job = jobGuess(words);
  if (job) return { kind: 'guess', guess: job };

  if (isRequest(words)) return { kind: 'request', message: REQUEST_LISTING_MESSAGE };

  // Услуги раньше недвижимости и вещей: «ремонт квартир» — услуга, а не
  // квартира, «ремонт холодильников» — не холодильник
  const guess =
    phoneGuess(text) ??
    vehicleGuess(text, words) ??
    serviceGuess(words) ??
    realtyGuess(text, words) ??
    keywordGuess(words, GOODS_KEYWORDS);
  return guess ? { kind: 'guess', guess } : { kind: 'none' };
}

// ─────────────────────────────────────────────────────────────────────────────

function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9+]+/gi, ' ')
    .trim();
}

/**
 * Есть ли слово с такой основой. Короткие основы («дом», «кот», «тв»)
 * сравниваются целым словом: иначе «домашняя выпечка» стала бы домом, а
 * «котёл» — котом.
 */
function hasStem(words: readonly string[], stems: readonly string[]): boolean {
  return words.some((word) =>
    stems.some((stem) => (stem.length <= 3 ? word === stem : word.startsWith(stem))),
  );
}

/** «Ищу сотрудника», «требуется повар» — вакансия, это можно. «Ищу работу» — резюме. */
function jobGuess(words: readonly string[]): ListingTitleGuess | null {
  // \b в регулярных выражениях JS не видит кириллицу — поэтому по словам
  const seeksWork = words.some(
    (word, index) =>
      ['ищу', 'нужна', 'нужен', 'ищем'].includes(word) &&
      (words[index + 1] ?? '').startsWith('работ'),
  );
  if (seeksWork || words[0] === 'резюме') {
    return { slug: 'job-resume', attributes: {}, details: [] };
  }
  const hiring =
    hasStem(words, ['требует', 'вакансия', 'вакансии']) ||
    (hasStem(words, ['ищу', 'ищем', 'нужен', 'нужна', 'нужны']) && hasStem(words, JOB_PROFESSIONS));
  return hiring ? { slug: 'job-vacancies', attributes: {}, details: [] } : null;
}

const JOB_PROFESSIONS = [
  'сотрудник',
  'работник',
  'продав',
  'кассир',
  'водител',
  'повар',
  'официант',
  'парикмахер',
  'мастер',
  'менеджер',
  'бухгалтер',
  'администратор',
  'охранник',
  'грузчик',
  'разнорабоч',
  'сварщик',
  'строител',
  'уборщиц',
  'курьер',
  'няня',
  'сиделк',
  'бармен',
  'механик',
  'электрик',
  'сантехник',
  'учител',
  'помощник',
] as const;

function isRequest(words: readonly string[]): boolean {
  return ['куплю', 'сниму', 'ищу', 'возьму', 'приму'].includes(words[0] ?? '');
}

/** Телефон по модели из справочника: самая длинная совпавшая подпись. */
function phoneGuess(text: string): ListingTitleGuess | null {
  const padded = ` ${text} `;
  let best: (typeof PHONE_MODELS)[number] | null = null;
  for (const model of PHONE_MODELS) {
    const label = normalize(model.label);
    const aliases = MODEL_ALIASES[modelValue(model.label)] ?? [];
    const hit = [label, ...aliases.map(normalize)].some((form) => padded.includes(` ${form} `));
    if (hit && (!best || model.label.length > best.label.length)) best = model;
  }
  if (!best) return null;

  const attributes: Record<string, string | number> = {
    brand: best.brand,
    model: modelValue(best.label),
  };
  const memory = /\b(64|128|256|512)\s?(gb|гб)?\b|\b1\s?(tb|тб)\b/.exec(text);
  if (memory) attributes.memory = memory[1] ?? '1024';
  return { slug: 'electronics-phones', attributes, details: [best.label] };
}

/**
 * Модель названа в тексте. Короткое название («3», «2», «Z») — слишком
 * частое слово: «Mazda 3» — модель, а «Mazda 2.0 бензин» — нет. Поэтому
 * короткое название засчитывается только сразу после марки и не перед
 * дробной частью числа.
 */
function matchesModel(padded: string, label: string, brandForms: readonly string[]): boolean {
  if (!label || !padded.includes(` ${label} `)) return false;
  if (label.length >= 3) return true;
  return brandForms.some((form) => {
    const marker = ` ${form} ${label} `;
    const at = padded.indexOf(marker);
    return at >= 0 && !/^\d( |$)/.test(padded.slice(at + marker.length));
  });
}

/** Автомобиль по марке, модели и году; мотоцикл, шины и запчасти — по словам. */
function vehicleGuess(text: string, words: readonly string[]): ListingTitleGuess | null {
  const brand = CAR_BRANDS.find(
    (item) =>
      item.value !== OTHER_BRAND &&
      [item.value, normalize(item.label), ...(BRAND_ALIASES[item.value] ?? [])].some((form) =>
        words.includes(form),
      ),
  );
  if (!brand) return null;

  // Та же марка у мотоцикла (Honda) и у шин для неё: решают слова
  if (hasStem(words, ['шины', 'шину', 'резин', 'диск', 'колес'])) return plain('transport-tires');
  if (
    hasStem(words, ['запчаст', 'бампер', 'фара', 'фары', 'двигател', 'коробк', 'капот', 'крыл'])
  ) {
    return plain('transport-parts');
  }
  if (hasStem(words, ['мотоцикл', 'мопед', 'скутер', 'квадроцикл'])) {
    return plain('transport-moto');
  }

  const attributes: Record<string, string | number> = { brand: brand.value };
  const details = [brand.label];
  const padded = ` ${text} `;
  const brandForms = [brand.value, normalize(brand.label), ...(BRAND_ALIASES[brand.value] ?? [])];
  const model = [...brand.models]
    .sort((a, b) => b.length - a.length)
    .find((label) => matchesModel(padded, normalize(label), brandForms));
  if (model) {
    attributes.model = modelValue(model);
    details.push(model);
  }
  const year = /\b(19[5-9]\d|20[0-4]\d)\b/.exec(text);
  if (year?.[1]) attributes.year = Number(year[1]);

  return { slug: 'transport-cars', attributes, details };
}

/** Недвижимость: тип объекта, комнаты, сделка. */
function realtyGuess(text: string, words: readonly string[]): ListingTitleGuess | null {
  const deal = realtyDeal(words);
  const rooms = /\b([1-9])\s?(к|х|комн|комнатн)/.exec(text);
  const studio = hasStem(words, ['студи']);

  let slug: string | null = null;
  if (rooms || studio || hasStem(words, ['квартир', 'однушк', 'двушк', 'трешк'])) {
    slug = 'realty-flats';
  } else if (hasStem(words, ['комнат'])) slug = 'realty-rooms';
  else if (hasStem(words, ['дом', 'домик', 'коттедж', 'таунхаус', 'дача', 'дачу', 'дачи'])) {
    slug = 'realty-houses';
  } else if (hasStem(words, ['участ', 'сотк', 'соток', 'земл'])) slug = 'realty-land';
  else if (hasStem(words, ['гараж', 'машиномест'])) slug = 'realty-garages';
  else if (hasStem(words, ['офис', 'помещени', 'склад', 'магазин'])) slug = 'realty-commercial';
  if (!slug) return null;

  const attributes: Record<string, string | number> = {};
  if (slug === 'realty-flats') {
    const count = rooms ? Number(rooms[1]) : studio ? 0 : wordRooms(words);
    if (count !== null) attributes.rooms = count;
  }
  return { slug, attributes, details: [], ...deal };
}

function wordRooms(words: readonly string[]): number | null {
  if (hasStem(words, ['однушк', 'однокомнат'])) return 1;
  if (hasStem(words, ['двушк', 'двухкомнат'])) return 2;
  if (hasStem(words, ['трешк', 'трехкомнат'])) return 3;
  return null;
}

function realtyDeal(
  words: readonly string[],
): Pick<ListingTitleGuess, 'transactionType' | 'rentPeriod'> {
  if (hasStem(words, ['посуточн', 'сутк'])) return { transactionType: 'rent', rentPeriod: 'daily' };
  if (hasStem(words, ['сдам', 'сдаю', 'сдается', 'аренд'])) {
    return { transactionType: 'rent', rentPeriod: 'monthly' };
  }
  if (hasStem(words, ['продам', 'продаю', 'продается', 'продажа'])) {
    return { transactionType: 'sale' };
  }
  return {};
}

function plain(slug: string): ListingTitleGuess {
  return { slug, attributes: {}, details: [] };
}

/**
 * Словари признаков подкатегорий: начало слова → категория. Порядок внутри
 * важен — частное раньше общего («ремонт квартиры» — отделка, а не ремонт
 * техники).
 */
type KeywordTable = readonly (readonly [string, readonly string[]])[];

const SERVICE_KEYWORDS: KeywordTable = [
  ['services-building', ['отделк', 'строительств', 'кладк', 'штукатур', 'укладк', 'электромонтаж']],
  ['services-auto', ['автосервис', 'шиномонтаж', 'развал', 'автоэлектрик', 'автомойк']],
  ['services-repair', ['ремонт', 'починк', 'прошивк']],
  ['services-beauty', ['маникюр', 'педикюр', 'стрижк', 'наращиван', 'бров', 'ресниц']],
  ['services-tutors', ['репетитор', 'уроки', 'занятия', 'подготовк']],
  ['services-moving', ['грузоперевоз', 'переезд', 'грузчик']],
  ['services-cleaning', ['уборк', 'клининг', 'химчистк']],
  ['services-photo', ['фотограф', 'видеосъемк', 'фотосесси', 'видеограф']],
  ['services-events', ['тамад', 'ведущ', 'банкет', 'аниматор']],
  ['services-legal', ['юрист', 'адвокат', 'бухгалтерск', 'нотари']],
  ['services-it', ['сайт', 'программист', 'разработк']],
];

const GOODS_KEYWORDS: KeywordTable = [
  ['transport-moto', ['мотоцикл', 'мопед', 'скутер', 'квадроцикл', 'питбайк']],
  ['transport-trucks', ['грузовик', 'камаз', 'самосвал', 'фура', 'тягач']],
  ['transport-special', ['трактор', 'экскаватор', 'погрузчик', 'бульдозер', 'автокран']],
  ['transport-water', ['лодк', 'катер', 'гидроцикл', 'яхт']],
  ['transport-tires', ['шины', 'шину', 'резин', 'диски', 'колес']],
  ['transport-parts', ['запчаст', 'бампер', 'фара', 'фары', 'стартер', 'генератор']],
  ['electronics-laptops', ['ноутбук', 'macbook', 'макбук']],
  ['electronics-tablets', ['планшет', 'ipad', 'айпад']],
  ['electronics-tv', ['телевизор', 'тв']],
  ['electronics-console', ['playstation', 'ps4', 'ps5', 'xbox', 'nintendo', 'приставк']],
  ['electronics-audio', ['наушник', 'airpods', 'колонк', 'саундбар', 'усилител']],
  ['electronics-watches', ['смарт', 'watch', 'фитнес', 'браслет']],
  ['electronics-photo', ['фотоаппарат', 'объектив', 'камер', 'canon', 'nikon']],
  ['electronics-components', ['видеокарт', 'процессор', 'оперативн', 'материнск', 'ssd']],
  ['electronics-computers', ['компьютер', 'системн', 'моноблок', 'монитор', 'пк']],
  ['electronics-phones', ['телефон', 'смартфон', 'айфон', 'iphone']],
  [
    'home-appliances',
    [
      'холодильник',
      'стиральн',
      'посудомоеч',
      'микроволнов',
      'пылесос',
      'плита',
      'плиту',
      'кондиционер',
      'духовк',
      'бойлер',
    ],
  ],
  [
    'home-furniture',
    ['диван', 'шкаф', 'стол', 'стул', 'кроват', 'кресл', 'комод', 'матрас', 'кухонн', 'гарнитур'],
  ],
  [
    'home-materials',
    ['кирпич', 'цемент', 'плитк', 'ламинат', 'доск', 'арматур', 'блок', 'гипсокартон'],
  ],
  [
    'home-tools',
    ['перфоратор', 'дрел', 'шуруповерт', 'болгарк', 'бензопил', 'генератор', 'сварочн'],
  ],
  ['home-plumbing', ['смесител', 'унитаз', 'ванна', 'ванну', 'раковин', 'душев', 'кран']],
  ['home-doors', ['двер', 'окна', 'окно', 'окон']],
  ['home-light', ['люстр', 'светильник', 'бра']],
  ['home-dishes', ['посуд', 'сервиз', 'кастрюл', 'сковород']],
  ['home-plants', ['цветы', 'цветок', 'растени', 'рассад', 'саженц']],
  ['personal-kids-goods', ['коляск', 'автокресл', 'манеж', 'кроватк']],
  ['personal-shoes', ['кроссовк', 'туфл', 'ботинк', 'сапог', 'босоножк', 'кеды']],
  ['personal-bags', ['сумк', 'рюкзак', 'клатч']],
  ['personal-jewelry', ['кольц', 'серьг', 'цепочк', 'золот', 'серебр']],
  ['personal-watches', ['часы']],
  ['personal-beauty', ['духи', 'парфюм', 'крем', 'косметик']],
  [
    'personal-clothes',
    ['куртк', 'плать', 'пальто', 'джинс', 'костюм', 'футболк', 'шуб', 'брюк', 'пуховик'],
  ],
  ['hobby-bikes', ['велосипед', 'самокат', 'электросамокат']],
  ['hobby-music', ['гитар', 'пианино', 'синтезатор', 'барабан', 'скрипк']],
  ['hobby-books', ['книг', 'учебник']],
  ['hobby-fishing', ['удочк', 'спиннинг', 'катушк']],
  ['hobby-sport', ['тренажер', 'гантел', 'штанг', 'беговая']],
  ['hobby-games', ['настольн', 'пазл', 'конструктор', 'lego']],
  ['animals-goods', ['корм', 'клетк', 'аквариум', 'лежанк', 'переноск']],
  ['animals-dogs', ['собак', 'щенк', 'щенок', 'пес', 'овчарк', 'алабай']],
  ['animals-cats', ['кот', 'кошк', 'котен', 'котят']],
  ['animals-birds', ['попуга', 'птиц', 'голуб', 'куры', 'цыплят']],
  [
    'animals-livestock',
    ['коров', 'бычок', 'телк', 'баран', 'овц', 'коза', 'козы', 'козел', 'лошад', 'теленок'],
  ],
  ['business-ready', ['бизнес']],
  ['business-equipment', ['оборудовани']],
];

/** Услуги: «ремонт квартиры» — отделка, «ремонт телефонов» — ремонт техники. */
function serviceGuess(words: readonly string[]): ListingTitleGuess | null {
  if (
    hasStem(words, ['ремонт']) &&
    hasStem(words, ['квартир', 'дом', 'дома', 'офис', 'помещени', 'ванн', 'кухн'])
  ) {
    return plain('services-building');
  }
  return keywordGuess(words, SERVICE_KEYWORDS);
}

function keywordGuess(words: readonly string[], table: KeywordTable): ListingTitleGuess | null {
  const found = table.find(([, stems]) => hasStem(words, stems));
  return found ? plain(found[0]) : null;
}
