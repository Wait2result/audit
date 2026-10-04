import { plural, type SmartSearchDomain, type SmartSearchPart } from '@dagestan/shared';
import { router } from 'expo-router';

import type { IconName } from '../components/Icon';
import { useListingFilterStore } from '../store/listing-filter-store';
import { sectionIcon } from './listing-icons';
import { applySmartListing } from './smart-search';

/**
 * Куда ведёт умный поиск: раздел приложения, его значок, подпись кнопки и
 * как открыть экран раздела с подготовленными условиями.
 *
 * Экран «Поиск» про устройство разделов не знает — только вызывает
 * `openSection`. Условия применяются существующими механизмами раздела:
 * у объявлений — хранилищем фильтров и места, у остальных — параметрами
 * маршрута, которые экран раздела читает сам. Новый раздел — новая строка.
 */
export interface SmartSection {
  /** Подпись над путём в карточке: «ОБЪЯВЛЕНИЯ» */
  label: string;
  icon: IconName;
  /** Подпись главной кнопки; null — переходить некуда (раздел в работе) */
  cta: (total: number | null) => string | null;
}

/** «1 284» — пробел между тысячами (Hermes ставит неразрывный, как и нужно). */
const formatCount = (value: number) => value.toLocaleString('ru-RU');

export const SMART_SECTIONS: Readonly<Record<SmartSearchDomain, SmartSection>> = {
  listings: {
    label: 'Объявления',
    icon: 'tag',
    cta: (total) =>
      total
        ? `Открыть ${formatCount(total)} ${plural(total, 'объявление', 'объявления', 'объявлений')}`
        : 'Открыть объявления',
  },
  cinema: { label: 'Кино', icon: 'cinema', cta: () => 'Открыть кино' },
  news: { label: 'Новости', icon: 'news', cta: () => 'Открыть новости' },
  delivery: { label: 'Доставка еды', icon: 'cart', cta: () => 'Открыть доставку' },
  places: { label: 'Заведения', icon: 'food', cta: () => 'Открыть заведения' },
  weather: { label: 'Погода', icon: 'sun', cta: () => 'Открыть погоду' },
  rides: { label: 'Попутчики', icon: 'rides', cta: () => null },
};

/** Значок карточки: у объявлений — значок раздела категории (машина, дом, телефон). */
export function sectionIconOf(part: SmartSearchPart): IconName {
  const domain = part.domain;
  if (!domain) return 'search';
  if (domain === 'listings') {
    const category = part.query?.params.category;
    if (typeof category === 'string') return sectionIcon(category.split('-')[0] ?? category);
  }
  return SMART_SECTIONS[domain].icon;
}

/** Сколько найдено — для кнопки. Известно только у объявлений (лента считает всё). */
export function totalOf(part: SmartSearchPart): number | null {
  const results = part.results;
  if (results?.domain === 'listings') return results.page.total ?? null;
  return null;
}

/** Условия навигации → параметры маршрута (строки). */
function routeParams(filters: Record<string, string | number | boolean>): Record<string, string> {
  return Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, String(value)]));
}

/**
 * Открыть раздел с условиями. `plain` — без условий: «Открыть все
 * автомобили», когда по условиям ничего нет.
 */
export function openSection(
  part: SmartSearchPart,
  context: { requestId: string; text: string },
  plain = false,
): void {
  const domain = part.domain;
  const filters = part.navigation?.filters ?? {};
  switch (domain) {
    case 'listings': {
      if (plain) {
        const slug =
          typeof part.query?.params.category === 'string' ? part.query.params.category : '';
        useListingFilterStore.getState().reset(slug);
        router.push({ pathname: '/listings/list', params: slug ? { slug } : {} });
        return;
      }
      const target = applySmartListing(part, context.text, context.requestId);
      router.push({ pathname: '/listings/list', params: { ...target, smart: '1' } });
      return;
    }
    case 'places':
    case 'delivery':
      router.push({
        pathname: '/places',
        params: plain
          ? { section: domain, ...(domain === 'delivery' ? { hasDelivery: 'true' } : {}) }
          : { section: domain, ...routeParams(filters) },
      });
      return;
    case 'cinema':
      router.push({ pathname: '/cinema', params: plain ? {} : routeParams(filters) });
      return;
    case 'news':
      router.push({ pathname: '/news', params: plain ? {} : routeParams(filters) });
      return;
    case 'weather': {
      const { date, ...rest } = filters;
      router.push({
        pathname: '/weather',
        params: plain ? {} : { ...routeParams(rest), ...(date ? { day: String(date) } : {}) },
      });
      return;
    }
    default:
      return;
  }
}

/** «Изменить» у объявлений: условия раскладываются в фильтры и открывается экран фильтров. */
export function openListingFilters(
  part: SmartSearchPart,
  context: { requestId: string; text: string },
): void {
  const target = applySmartListing(part, context.text, context.requestId);
  router.push({
    pathname: '/listings/filters',
    params: {
      ...(target.slug ? { category: target.slug } : {}),
      ...(target.q ? { q: target.q } : {}),
    },
  });
}

/** «Хочу купить Toyota до 2015 года» → «купить Toyota 2015» — для поиска по словам. */
export function plainWords(text: string): string {
  const cleaned = text
    .replace(
      /(^|\s)(хочу|хотел|хотела|нужен|нужна|нужно|нужны|ищу|найди|найти|покажи|подбери|помоги|пожалуйста|мне|где|можно|какой|какая|какие)(?=\s|$)/giu,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || text.trim();
}
