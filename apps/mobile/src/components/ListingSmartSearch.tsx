import {
  listingPartOf,
  smartSearchOutcome,
  type SmartSearchChoice,
  type SmartSearchClarificationOption,
  type SmartSearchPart,
} from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { useSmartSearch, type SmartSearchState } from '../hooks/use-smart-search';
import { useSmartSearchStore } from '../store/smart-search-store';
import { applySmartListing, type SmartListingTarget } from '../utils/smart-search';
import {
  SmartClarificationBlock,
  SmartFeedbackSheet,
  SmartNotice,
  SmartThinking,
  type SmartFeedbackTarget,
} from './SmartSearchBlocks';

/**
 * Умный поиск в строке объявлений.
 *
 * Фраза уходит на сервер, а не в поиск по буквам: «хочу тойота суксид»
 * становится категорией «Автомобили», маркой Toyota и моделью Succeed — и
 * раскладывается в обычные фильтры ленты. Обычные фильтры, место и
 * сортировка остаются как были; умный поиск только заполняет их за человека.
 *
 * Если умный поиск не ответил, экран ищет по словам фразы, как раньше.
 */

export interface ListingSmartSearchOptions {
  /** Открытая категория — подсказка для коротких фраз («до миллиона») */
  category: string | null;
  /** Понятый запрос объявлений: фильтры уже разложены, осталось показать выдачу */
  onListings: (target: SmartListingTarget) => void;
  /** Умный поиск не сработал: обычный поиск по словам фразы */
  onFallback: (text: string) => void;
}

export function useListingSmartSearch({
  category,
  onListings,
  onFallback,
}: ListingSmartSearchOptions) {
  const smart = useSmartSearch('listings', { screen: 'listings', listingCategory: category });
  const [feedback, setFeedback] = useState<SmartFeedbackTarget | null>(null);

  const submit = useCallback(
    async (rawText: string, choice?: SmartSearchChoice) => {
      const text = rawText.trim();
      const next = await smart.run(text, choice ? { choice } : {});
      if (next.phase === 'failed') {
        onFallback(text);
        return;
      }
      if (next.phase !== 'done') return;

      const listing = listingPartOf(next.response);
      if (listing) {
        onListings(applySmartListing(listing, text, next.response.requestId));
        return;
      }
      if (smartSearchOutcome(next.response).kind === 'fallback') onFallback(text);
    },
    [smart, onFallback, onListings],
  );

  const openFeedback = useCallback((target: SmartFeedbackTarget) => setFeedback(target), []);
  const closeFeedback = useCallback(() => setFeedback(null), []);

  const { state } = smart;
  return {
    state,
    /** Есть что показать под строкой (найденные объявления показывает сама лента) */
    visible:
      state.phase === 'thinking' ||
      state.phase === 'failed' ||
      (state.phase === 'done' && !listingPartOf(state.response)) ||
      feedback !== null,
    submit,
    reset: smart.reset,
    run: smart.run,
    /** Обычный поиск по словам фразы — без умного разбора */
    fallback: onFallback,
    feedback,
    openFeedback,
    closeFeedback,
  };
}

export type ListingSmartSearch = ReturnType<typeof useListingSmartSearch>;

/**
 * Что показать под строкой поиска: «Понимаю запрос…», уточнение, «это не
 * про объявления», «умный поиск недоступен — показан обычный». Найденные
 * объявления показывает сама лента экрана.
 */
export function ListingSmartPanel({
  controller,
  onOpenCategory,
}: {
  controller: ListingSmartSearch;
  onOpenCategory: (slug: string) => void;
}) {
  const router = useRouter();
  const setHandoff = useSmartSearchStore((s) => s.setHandoff);
  const { state } = controller;

  const wrong = (failureType: SmartFeedbackTarget['failureType']) => {
    if (state.phase !== 'done' && state.phase !== 'failed') return;
    controller.openFeedback({
      ...(state.phase === 'done' ? { requestId: state.response.requestId } : {}),
      originalQuery: state.text,
      failureType,
      screen: 'listings',
    });
  };

  const pick = (option: SmartSearchClarificationOption, text: string) => {
    const response = state.phase === 'done' ? state.response : null;
    // Вариант с выбором кодом — без модели: «Автомобили» к «Toyota», раздел и т. п.
    if (option.choice && response) {
      const choice = { requestId: response.requestId, ...option.choice };
      if (option.choice.kind === 'domain' && option.choice.value !== 'listings') {
        // Другой раздел — продолжаем в общем поиске тем же выбором
        setHandoff({ text: option.label, choice, phrase: text });
        router.push('/search');
        return;
      }
      void controller.submit(text, choice);
      return;
    }
    if (option.kind === 'category') {
      onOpenCategory(option.value);
      return;
    }
    if (option.kind === 'domain') {
      if (option.value === 'listings') {
        // Раздел и так объявления, а фраза не разобралась — ищем по её словам
        controller.fallback(text);
        return;
      }
      // Не про объявления — та же фраза в общем поиске, с подсказкой раздела
      setHandoff({ text, screen: option.value as 'cinema' | 'news' | 'delivery' });
      router.push('/search');
      return;
    }
    void controller.submit(option.value);
  };

  return (
    <>
      <PanelBody state={state} onPick={pick} onWrong={wrong} onHandoff={setHandoff} />
      <SmartFeedbackSheet target={controller.feedback} onClose={controller.closeFeedback} />
    </>
  );
}

function PanelBody({
  state,
  onPick,
  onWrong,
  onHandoff,
}: {
  state: SmartSearchState;
  onPick: (option: SmartSearchClarificationOption, text: string) => void;
  onWrong: (failureType: SmartFeedbackTarget['failureType']) => void;
  onHandoff: ReturnType<typeof useSmartSearchStore.getState>['setHandoff'];
}) {
  const router = useRouter();

  if (state.phase === 'thinking') return <SmartThinking />;

  if (state.phase === 'failed') {
    return (
      <SmartNotice
        title={state.message}
        text={state.reason === 'network' ? undefined : 'Показан обычный поиск по словам.'}
      />
    );
  }

  if (state.phase !== 'done') return null;
  const { response, text } = state;
  const outcome = smartSearchOutcome(response);

  if (outcome.kind === 'fallback') {
    return (
      <SmartNotice
        title={
          outcome.code === 'AI_TIMEOUT'
            ? 'Не удалось обработать запрос. Попробуйте ещё раз.'
            : outcome.message
        }
        text="Показан обычный поиск по словам."
        onWrong={() => onWrong('not_understood')}
      />
    );
  }

  // Объявления открыты лентой — здесь показывать нечего
  if (listingPartOf(response)) return null;

  const part: SmartSearchPart | undefined = outcome.parts[0];
  if (!part) return null;

  if (part.status === 'clarification' && part.clarification) {
    return (
      <SmartClarificationBlock
        clarification={part.clarification}
        onPick={(option) => onPick(option, text)}
        onWrong={() => onWrong('not_understood')}
      />
    );
  }

  if (part.domain && part.domain !== 'listings') {
    return (
      <SmartNotice
        title="Похоже, это не про объявления"
        text={part.message}
        actions={[
          {
            label: 'Показать в общем поиске',
            onPress: () => {
              onHandoff({ text, response });
              router.push('/search');
            },
          },
        ]}
        onWrong={() => onWrong('wrong_domain')}
      />
    );
  }

  return <SmartNotice title={part.message} onWrong={() => onWrong('not_understood')} />;
}
