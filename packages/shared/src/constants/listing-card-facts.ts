import { TRANSACTION_CREATE_LABELS } from './transactions.js';

/**
 * Характеристики для карточки: из строки сервера — короткий список без шума.
 *
 * Сервер собирает строку по полям с showInCard, и в ней бывает то, что в
 * карточке только мешает: «Продам» (цена и так говорит, что это продажа;
 * сдача — «Сдам надолго» — остаётся) и марка с моделью, которые уже написаны
 * в заголовке («Chery Tiggo 8» и тут же «Chery · Tiggo 8»). Пользователь
 * должен получить максимум нового, не открывая объявление.
 */

/** «Ё» и регистр не должны мешать сравнению: «Тойота» = «тойота». */
function plain(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** Сколько характеристик умещается: до четырёх в обоих видах (в плитке — в две строки). */
export const CARD_FACTS_LIMIT = { grid: 4, list: 4 } as const;

export function cardFacts(summary: string, title: string, max: number): string[] {
  const inTitle = plain(title);
  const seen = new Set<string>();
  const facts: string[] = [];

  for (const raw of summary.split(' · ')) {
    const fact = raw.trim();
    const key = plain(fact);
    if (!fact || seen.has(key)) continue;
    seen.add(key);

    // Обычная продажа — умолчание, а не характеристика
    if (fact === TRANSACTION_CREATE_LABELS.sale) continue;
    // Уже сказано в заголовке. Короткое («3», «4x4») в нём находится
    // случайно, поэтому сравниваем от трёх знаков
    if (key.length >= 3 && inTitle.includes(key)) continue;

    facts.push(fact);
    if (facts.length >= max) break;
  }

  return facts;
}

/**
 * Что в карточке главное. У товара и квартиры — цена, у вакансии — должность:
 * на вакансию смотрят «кто и кого ищет», а зарплата идёт следом.
 */
export type CardEmphasis = 'price' | 'title';

const TITLE_FIRST_SECTIONS = new Set(['job']);

export function cardEmphasis(categorySlug: string): CardEmphasis {
  // Код подкатегории начинается с кода раздела: «job-vacancies» → «job»
  const section = categorySlug.split('-')[0] ?? '';
  return TITLE_FIRST_SECTIONS.has(section) ? 'title' : 'price';
}
