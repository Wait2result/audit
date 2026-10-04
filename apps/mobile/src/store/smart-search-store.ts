import type { SmartSearchResponse } from '@dagestan/shared';
import { create } from 'zustand';

/**
 * Состояние умного поиска между экранами.
 *
 * Сессия — номер разговора с поиском: с ним «до миллиона» и «а автомат?»
 * уточняют прошлый запрос, а не начинают новый. У глобального поиска и у
 * объявлений сессии свои: уточнение в объявлениях не должно продолжать
 * вчерашний вопрос про кино.
 *
 * Не сохраняется на устройство: контекст на сервере живёт 20 минут, и
 * продолжать после перезапуска приложения нечего.
 */

export type SmartSearchChannel = 'global' | 'listings';

/** Последний понятый запрос объявлений — для строки «Понял запрос» над выдачей. */
export interface ListingUnderstanding {
  /** Фраза человека, как он её написал */
  text: string;
  /** «Toyota Succeed · до 1,2 млн ₽ · автомат» */
  summary: string;
  /** Что сказано, но не учтено */
  notes: string[];
  /** Номер ответа — для «Я имел в виду другое» */
  requestId: string;
  /** Категория выдачи ('' — без категории): строка показывается только там */
  scope: string;
  /**
   * Применённые фильтры (снимок): человек снял чипс или поменял фильтры —
   * строка «Понял запрос» больше не про то, что на экране, и скрывается
   */
  filtersKey: string;
}

/**
 * Фраза, переданная с экрана объявлений в общий поиск: с готовым ответом —
 * чтобы не спрашивать дважды, или с подсказкой раздела («Где искать?» → «Кино»).
 */
export interface SmartSearchHandoff {
  text: string;
  response?: SmartSearchResponse;
  screen?: 'cinema' | 'news' | 'delivery' | 'home';
}

interface SmartSearchState {
  sessions: Partial<Record<SmartSearchChannel, string>>;
  listing: ListingUnderstanding | null;
  handoff: SmartSearchHandoff | null;

  setSession: (channel: SmartSearchChannel, sessionId: string | null) => void;
  setListing: (listing: ListingUnderstanding | null) => void;
  setHandoff: (handoff: SmartSearchHandoff | null) => void;
}

export const useSmartSearchStore = create<SmartSearchState>((set) => ({
  sessions: {},
  listing: null,
  handoff: null,

  setSession: (channel, sessionId) =>
    set((state) => {
      const sessions = { ...state.sessions };
      if (sessionId) sessions[channel] = sessionId;
      else delete sessions[channel];
      return { sessions };
    }),

  setListing: (listing) => set({ listing }),

  setHandoff: (handoff) => set({ handoff }),
}));
