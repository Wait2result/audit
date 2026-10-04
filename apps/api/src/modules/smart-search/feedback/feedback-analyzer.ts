import { norm, sameStem, words } from '../normalize/text.js';

/**
 * Разбор накопленных исправлений «Я имел в виду другое».
 *
 * Анализатор ничего не применяет. Он только собирает повторяющиеся ошибки
 * в предложения для человека: «слово «оперативки» трижды потерялось в
 * объявлениях — кандидат в правило нормализатора и в регрессионный тест».
 * Решение принимает разработчик, и каждое принятое предложение становится
 * обычным изменением кода — правилом справочника или нормализатора, примером
 * подсказки и регрессионным тестом — с прогоном всех проверок. Так поиск
 * учится на реальных фразах, а подсказка модели не раздувается от каждой
 * жалобы и не меняется от одного сообщения.
 */

/** Во что может превратиться подтверждённое исправление. */
export const FEEDBACK_FIXES = [
  /** Новое написание в справочнике: «суксид» → Toyota Succeed */
  'dictionary_rule',
  /** Правило нормализатора: «оперативка» → ram, «двушка» → rooms=2 */
  'normalization_rule',
  /** Пример «фраза → JSON» в подсказке модели */
  'prompt_example',
  /** Фраза и ожидаемый разбор — в регрессионные тесты */
  'regression_test',
] as const;
export type FeedbackFix = (typeof FEEDBACK_FIXES)[number];

/** Жизненный цикл записи: разбор делает человек. */
export const FEEDBACK_STATUSES = ['new', 'reviewed', 'accepted', 'rejected'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** То, что анализатор читает из записи исправления. */
export interface FeedbackRecord {
  id: string;
  originalQuery: string;
  /** Намерение модели (прошедшее схему), если след ответа нашёлся */
  modelIntent: unknown;
  /** Один из SMART_SEARCH_FAILURE_TYPES (из базы приходит строкой) */
  failureType: string;
  userCorrection: string;
  domain: string | null;
}

/** Предложение для разбора. Статус всегда «нужна проверка»: применять — не дело анализатора. */
export interface FeedbackProposal {
  fixes: FeedbackFix[];
  domain: string | null;
  failureType: string;
  /** Слово, которое модель раз за разом упускает (если удалось выделить) */
  word: string | null;
  occurrences: number;
  examples: { query: string; correction: string }[];
  feedbackIds: string[];
  status: 'needs_review';
}

export interface FeedbackAnalyzer {
  analyze(records: readonly FeedbackRecord[]): FeedbackProposal[];
}

/** Служебные слова, которые не бывают «потерянным смыслом». */
const STOP_WORDS = new Set([
  'хочу',
  'нужен',
  'нужна',
  'нужно',
  'ищу',
  'найди',
  'найти',
  'покажи',
  'где',
  'что',
  'как',
  'какой',
  'какая',
  'какие',
  'в',
  'во',
  'на',
  'до',
  'от',
  'с',
  'со',
  'и',
  'а',
  'или',
  'не',
  'по',
  'за',
  'мне',
  'для',
  'сегодня',
  'завтра',
]);

/**
 * Простой анализатор: группирует исправления по разделу, виду ошибки и слову
 * фразы, которого нет в разборе модели (или по фразе целиком, если такого
 * слова нет). Группа от `minOccurrences` записей — предложение.
 */
export class RecurringWordAnalyzer implements FeedbackAnalyzer {
  constructor(private readonly minOccurrences = 3) {}

  analyze(records: readonly FeedbackRecord[]): FeedbackProposal[] {
    const groups = new Map<string, { word: string | null; items: FeedbackRecord[] }>();
    for (const record of records) {
      const word = lostWord(record);
      const key = [
        record.domain ?? '-',
        record.failureType,
        word ?? norm(record.originalQuery),
      ].join('|');
      const group = groups.get(key) ?? { word, items: [] };
      group.items.push(record);
      groups.set(key, group);
    }

    const proposals: FeedbackProposal[] = [];
    for (const { word, items } of groups.values()) {
      if (items.length < this.minOccurrences) continue;
      const first = items[0]!;
      proposals.push({
        fixes: fixesFor(first.failureType, word),
        domain: first.domain,
        failureType: first.failureType,
        word,
        occurrences: items.length,
        examples: items
          .slice(0, 5)
          .map((item) => ({ query: item.originalQuery, correction: item.userCorrection })),
        feedbackIds: items.map((item) => item.id),
        status: 'needs_review',
      });
    }
    return proposals.sort((a, b) => b.occurrences - a.occurrences);
  }
}

/**
 * Слово, на котором ошиблась модель. Лучший признак — человек сам повторил
 * его в исправлении («Под оперативкой я имел в виду ОЗУ»): берётся слово
 * фразы, которое есть в исправлении (с точностью до окончания) и которого нет
 * в разборе модели. Иначе — первое значимое слово, которого нет в разборе.
 */
export function lostWord(
  record: Pick<FeedbackRecord, 'originalQuery' | 'modelIntent'> &
    Partial<Pick<FeedbackRecord, 'userCorrection'>>,
): string | null {
  const understood = words(JSON.stringify(record.modelIntent ?? {}));
  const correction = words(record.userCorrection ?? '');
  const candidates = words(record.originalQuery).filter(
    (word) =>
      word.length >= 3 &&
      !STOP_WORDS.has(word) &&
      !/^\d+$/.test(word) &&
      !understood.some((item) => item === word || sameStem(item, word)),
  );
  return (
    candidates.find((word) => correction.some((item) => item === word || sameStem(item, word))) ??
    candidates[0] ??
    null
  );
}

function fixesFor(failureType: string, word: string | null): FeedbackFix[] {
  switch (failureType) {
    case 'wrong_domain':
    case 'not_understood':
      return ['prompt_example', 'regression_test'];
    case 'wrong_conditions':
    case 'missing_conditions':
      // Потерянное слово — чаще всего новое написание или синоним
      return word
        ? ['dictionary_rule', 'normalization_rule', 'regression_test']
        : ['normalization_rule', 'regression_test'];
    default:
      return ['regression_test'];
  }
}
