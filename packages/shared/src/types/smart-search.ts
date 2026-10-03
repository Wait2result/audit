import type {
  SmartSearchDomain,
  SmartSearchIntentKind,
  SmartSearchSort,
} from '../schemas/smart-search.schema.js';
import type { CinemaScheduleDto, NewsSummaryDto, PaginatedResponse } from './api.js';
import type { ListingDto } from './listings.js';
import type { PlaceDto } from './places.js';

/**
 * Ответ умного поиска. Один тип на все разделы: приложение по `status` и
 * `domain` понимает, что показать, а сами результаты — те же DTO, что
 * отдают существующие экраны (карточка объявления, расписание, новость,
 * заведение). Отдельных «урезанных» форм нет.
 */

/**
 *   results       — найдено, показываем;
 *   clarification — нужно уточнить (варианты — из реальных данных);
 *   no_results    — запрос понят, но ничего не нашлось;
 *   unsupported   — такое действие поиск не выполняет (заказать, купить);
 *   error         — модель недоступна или ответила неверно: обычный поиск работает.
 */
export type SmartSearchStatus =
  'results' | 'clarification' | 'no_results' | 'unsupported' | 'error';

/** Применённое точное условие — для чипа «Автомат», «до 1 200 000 ₽». */
export interface SmartSearchCondition {
  field: string;
  /** Подпись поля: «Коробка передач» */
  label: string;
  /** Значение в форме существующего API (код, число, границы) */
  value: unknown;
  /** Как показать человеку: «Автомат», «до 1 200 000 ₽» */
  display: string;
}

/** Пожелание: показывается отдельно, жёстким фильтром не становится. */
export interface SmartSearchPreference extends SmartSearchCondition {
  /** Повлияло ли пожелание на выдачу (например, порядок «ближе к Каспийску») */
  applied: boolean;
  /** Как именно учтено или почему нет */
  note: string;
}

/** Условие, которое не применено: неизвестно разделу, не подтверждено справочником … */
export interface SmartSearchIgnored {
  field: string;
  reason: string;
}

export interface SmartSearchNormalizedQuery {
  domain: SmartSearchDomain;
  intent: SmartSearchIntentKind;
  /** Слова, ушедшие в текстовый поиск раздела */
  text: string | null;
  conditions: SmartSearchCondition[];
  preferences: SmartSearchPreference[];
  ignored: SmartSearchIgnored[];
  unresolved: string[];
  location: {
    cityId: string | null;
    cityName: string | null;
    mode: 'exact' | 'preferred' | 'near_me' | 'context';
  } | null;
  time: { date: string | null; from: string | null; to: string | null } | null;
  sort: SmartSearchSort | null;
  /**
   * Параметры запроса к существующему API раздела ровно в том виде, в каком
   * их принимает его экран: приложение может открыть обычный экран выдачи
   * с теми же фильтрами, ничего не пересчитывая.
   */
  params: Record<string, unknown>;
}

export type SmartSearchResults =
  | { domain: 'listings'; page: PaginatedResponse<ListingDto> }
  | {
      domain: 'cinema';
      cityId: string;
      date: string;
      schedule: CinemaScheduleDto;
    }
  | { domain: 'news'; items: NewsSummaryDto[] }
  | { domain: 'delivery'; page: PaginatedResponse<PlaceDto> };

export interface SmartSearchClarificationOption {
  label: string;
  /** Значение, которое приложение может отправить ответом */
  value: string;
  /** Что это за вариант: категория, раздел, фильм, город … */
  kind: 'domain' | 'category' | 'brand' | 'model' | 'movie' | 'city' | 'price' | 'other';
}

export interface SmartSearchClarification {
  /** Машинная причина: ambiguous_category, unknown_city, price_not_grounded … */
  reason: string;
  question: string;
  options: SmartSearchClarificationOption[];
}

export interface SmartSearchPart {
  status: Exclude<SmartSearchStatus, 'error'>;
  domain: SmartSearchDomain | null;
  query: SmartSearchNormalizedQuery | null;
  results: SmartSearchResults | null;
  clarification: SmartSearchClarification | null;
  /** Короткая фраза для человека: «Нашлось 12 объявлений» */
  message: string;
}

export interface SmartSearchResponse {
  schemaVersion: 1;
  /** Сессия: передать в следующем запросе, чтобы продолжить поиск */
  sessionId: string;
  status: SmartSearchStatus;
  message: string;
  /** Части ответа: первая — основной запрос, остальные — составные подзапросы */
  parts: SmartSearchPart[];
  error: { code: string; message: string } | null;
  /** Что делать, если умный поиск не сработал: обычный текстовый поиск */
  fallback: { kind: 'text_search'; text: string } | null;
}

/** Состояние умного поиска и его модели — для мониторинга и панели. */
export interface SmartSearchHealthDto {
  enabled: boolean;
  aiEnabled: boolean;
  provider: string;
  model: string | null;
  status: 'ok' | 'unavailable' | 'disabled';
  latencyMs: number | null;
  message: string | null;
}
