import type { SmartSearchResponse, SmartSearchRequest } from '@dagestan/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  SmartSearchRequestError,
  requestSmartSearch,
  type SmartSearchFailure,
} from '../api/smart-search';
import { useCityStore } from '../store/city-store';
import { useSmartSearchStore, type SmartSearchChannel } from '../store/smart-search-store';
import { logSmartSearch } from '../utils/smart-search';

type Screen = NonNullable<NonNullable<SmartSearchRequest['context']>['screen']>;

/**
 * Состояние запроса:
 *   idle     — ничего не спрашивали;
 *   thinking — фраза у сервера («Понимаю запрос…»);
 *   done     — ответ сервера (найдено, пусто, уточнение, «не умею» или «недоступно»);
 *   failed   — ответа нет вовсе: нет сети, не дождались, лимит.
 */
export type SmartSearchState =
  | { phase: 'idle' }
  | { phase: 'thinking'; text: string }
  | { phase: 'done'; text: string; response: SmartSearchResponse }
  | { phase: 'failed'; text: string; reason: SmartSearchFailure; message: string };

export interface RunOptions {
  /** Экран-подсказка раздела: «Где искать?» → «Кино» */
  screen?: Screen;
  /** Начать заново, без прошлого контекста */
  fresh?: boolean;
}

/** Ответ модели не разобрался — есть смысл спросить ещё раз без контекста. */
const UNPARSED = new Set(['INVALID_AI_OUTPUT', 'INVALID_INTENT', 'AI_BAD_RESPONSE']);

/**
 * Запрос к умному поиску с сессией канала: последовательные фразы уточняют
 * друг друга. Новый запрос отменяет недождавшийся прежний — на экране всегда
 * ответ на последнюю фразу.
 */
export function useSmartSearch(
  channel: SmartSearchChannel,
  defaults: { screen: Screen; listingCategory?: string | null },
) {
  const cityId = useCityStore((s) => s.cityId);
  const sessionId = useSmartSearchStore((s) => s.sessions[channel]);
  const setSession = useSmartSearchStore((s) => s.setSession);
  const [state, setState] = useState<SmartSearchState>({ phase: 'idle' });
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const run = useCallback(
    async (rawText: string, options: RunOptions = {}): Promise<SmartSearchState> => {
      const text = rawText.trim();
      if (!text) return { phase: 'idle' };

      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setState({ phase: 'thinking', text });
      const started = Date.now();

      const session = options.fresh ? undefined : sessionId;
      const ask = (withSession: string | undefined) =>
        requestSmartSearch(
          {
            text,
            ...(withSession ? { sessionId: withSession } : {}),
            context: {
              ...(cityId ? { cityId } : {}),
              screen: options.screen ?? defaults.screen,
              ...(defaults.listingCategory ? { listingCategory: defaults.listingCategory } : {}),
            },
          },
          controller.signal,
        );
      try {
        let response = await ask(session);
        // С прошлым поиском фраза не разобралась («хочу машину» после Succeed) —
        // одна попытка без него: новая фраза часто вовсе не уточнение
        if (session && response.status === 'error' && UNPARSED.has(response.error?.code ?? '')) {
          response = await ask(undefined);
        }
        if (controller.signal.aborted) return { phase: 'idle' };
        setSession(channel, response.sessionId);
        const next: SmartSearchState = { phase: 'done', text, response };
        setState(next);
        logSmartSearch({
          requestId: response.requestId,
          durationMs: Date.now() - started,
          domain: response.parts[0]?.domain ?? null,
          status: response.status,
          fallback: response.status === 'error',
          clarification: response.parts.some((part) => part.status === 'clarification'),
        });
        return next;
      } catch (error) {
        if (controller.signal.aborted) return { phase: 'idle' };
        const failure =
          error instanceof SmartSearchRequestError
            ? error
            : new SmartSearchRequestError(
                'server',
                'Не удалось обработать запрос. Попробуйте ещё раз.',
              );
        const next: SmartSearchState = {
          phase: 'failed',
          text,
          reason: failure.reason,
          message: failure.message,
        };
        setState(next);
        logSmartSearch({
          durationMs: Date.now() - started,
          status: failure.reason,
          fallback: true,
          clarification: false,
        });
        return next;
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
      }
    },
    [channel, cityId, defaults.listingCategory, defaults.screen, sessionId, setSession],
  );

  /** Новый поиск: прошлый контекст больше не уточняется. */
  const reset = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setSession(channel, null);
    setState({ phase: 'idle' });
  }, [channel, setSession]);

  /** Показать готовый ответ (переданный с другого экрана) без нового запроса. */
  const show = useCallback(
    (text: string, response: SmartSearchResponse) => {
      // Следующая фраза продолжит этот же поиск
      setSession(channel, response.sessionId);
      setState({ phase: 'done', text, response });
    },
    [channel, setSession],
  );

  return { state, run, reset, show };
}
