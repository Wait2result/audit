import type { SmartSearchDomain } from '../schemas/smart-search.schema.js';

/**
 * Словарь умного поиска: как люди называют то, что уже есть в приложении.
 *
 * Каждая запись указывает на существующую сущность — код подкатегории
 * объявлений, код варианта характеристики, раздел приложения, плитку
 * витрины еды. Своих «вторых» каталогов словарь не заводит: если слово
 * нельзя привязать к существующему коду, его здесь нет.
 */
export type SearchEntryType =
  /** Подкатегория объявлений: canonical — slug из SEED_LISTING_CATEGORIES */
  | 'category'
  /** Раздел приложения: canonical — SmartSearchDomain */
  | 'domain'
  /** Значение характеристики объявления: field — ключ, canonical — код варианта */
  | 'attribute'
  /** Сделка: canonical — sale | rent */
  | 'deal'
  /** Срок аренды: canonical — daily | monthly */
  | 'period'
  /** Блюдо или товар еды: canonical — слово для поиска по витрине */
  | 'dish'
  /** Лента новостей: canonical — city | dagestan | russia | world */
  | 'scope'
  /** Порядок выдачи: canonical — SmartSearchSort */
  | 'sort'
  /** «Рядом со мной» */
  | 'near'
  /** Действие, которого поиск не делает: оплатить, отследить */
  | 'action'
  /** Слово-наполнитель: само по себе ничего не ищет */
  | 'filler';

export interface SearchDictionaryEntry {
  /** Существующий код проекта: slug, код варианта, раздел, слово поиска */
  canonical: string;
  /** Как это пишут люди: синонимы, сленг, сокращения, частые опечатки */
  aliases: readonly string[];
  type: SearchEntryType;
  /** Раздел, к которому ведёт слово (у type 'domain' совпадает с canonical) */
  domain?: SmartSearchDomain;
  /** Поле фильтра намерения: gearbox, rooms, dish, scope … */
  field?: string;
  /** Значение фильтра, если оно не равно canonical (комнат: 2) */
  value?: string | number | boolean;
}

/**
 * Устойчивое выражение из нескольких слов, которое само называет раздел
 * («где поесть», «кто едет», «что нового»). Неоднозначное выражение
 * («что посмотреть») перечисляет все разделы — выбирает контекст или человек.
 */
export interface SearchPhrase {
  phrase: string;
  domains: readonly SmartSearchDomain[];
  /** Действие вместо поиска: «где курьер», «оплатить заказ» */
  action?: boolean;
}

/** Единица измерения после числа → поле характеристики, которому число принадлежит. */
export interface SearchUnit {
  field: string;
  aliases: readonly string[];
  /** Множитель к числу: «1 тб» = 1024 ГБ */
  multiplier?: number;
}
