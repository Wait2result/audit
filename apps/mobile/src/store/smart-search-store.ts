import type { SmartSearchChoice, SmartSearchResponse } from '@dagestan/shared';
import { create } from 'zustand';

/**
 * Состояние умного поиска между экранами.
 *
 * Сессия — номер разговора с поиском: с ним «до миллиона» и «а автомат?»
 * уточняют прошлый запрос, а не начинают новый. У глобального поиска и у
 * объявлений сессии свои: уточнение в объявлениях не должно продолжать
 * вчерашний вопрос про кино. Сессия помнит категорию, в которой начата: в
 * другой категории поиск начинается заново («NCP165» в «Запчастях» не
 * продолжает «рейку» из «Дома и ремонта»).
 *
 * Не сохраняется на устройство: контекст на сервере живёт 20 минут, и
 * продолжать после перезапуска приложения нечего.
 */

export type SmartSearchChannel = 'global' | 'listings';

/**
 * Последний понятый запрос объявлений. Над выдачей показывается не «Понял
 * запрос», а только вопрос «Найдена категория — подходит?», и только когда
 * умный поиск узнал одну категорию (needsConfirmation).
 */
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
  /** Узнана только категория («Конь» → Сельхозживотные): спросить «Подходит?» */
  needsConfirmation: boolean;
  /** Человек нажал «Подходит» — вопрос больше не показывается */
  confirmed: boolean;
  /**
   * Слова похожи на другую категорию, а поиск остался в открытой («Конь» в
   * «Запчастях»): «Возможно, вы ищете …» — переход только по нажатию
   */
  elsewhere: { slug: string; name: string } | null;
}

/**
 * Фраза, переданная с экрана объявлений в общий поиск: с готовым ответом —
 * чтобы не спрашивать дважды, или с подсказкой раздела («Где искать?» → «Кино»).
 */
export interface SmartSearchHandoff {
  text: string;
  response?: SmartSearchResponse;
  screen?: 'cinema' | 'news' | 'delivery' | 'home';
  /** Нажатый на экране объявлений вариант «другой раздел» — исполняется без модели */
  choice?: SmartSearchChoice;
  /** Исходная фраза для этого выбора */
  phrase?: string;
}

/**
 * Реплика диалога на экране «Поиск»: фраза человека и ответ на неё. Живёт до
 * «Новый поиск» или перезапуска приложения — переход в раздел и обратно
 * диалог не стирает.
 */
export interface SmartDialogTurn {
  id: string;
  /** Фраза или подпись нажатого варианта */
  text: string;
  /** Исходная фраза: у нажатого варианта — та, к которой он относился */
  phrase: string;
  /** Уточнение прошлого поиска (короткая фраза или выбор условия) */
  refined: boolean;
  phase: 'thinking' | 'done' | 'failed';
  response?: SmartSearchResponse;
  /** Сообщение, если ответа нет вовсе (сеть, не дождались) */
  failure?: string;
}

/** Сессия умного поиска и категория, в которой она начата ('' — без категории). */
export interface SmartSearchSession {
  id: string;
  scope: string;
}

interface SmartSearchState {
  sessions: Partial<Record<SmartSearchChannel, SmartSearchSession>>;
  listing: ListingUnderstanding | null;
  handoff: SmartSearchHandoff | null;
  dialog: SmartDialogTurn[];

  setSession: (channel: SmartSearchChannel, sessionId: string | null, scope?: string) => void;
  setListing: (listing: ListingUnderstanding | null) => void;
  setHandoff: (handoff: SmartSearchHandoff | null) => void;
  pushTurn: (turn: SmartDialogTurn) => void;
  updateTurn: (id: string, patch: Partial<SmartDialogTurn>) => void;
  dropTurn: (id: string) => void;
  /** «Новый поиск»: диалог и сессия общего поиска — с чистого листа */
  clearDialog: () => void;
}

/** Не больше стольких реплик: старые уходят, экран не растёт бесконечно. */
const DIALOG_LIMIT = 20;

export const useSmartSearchStore = create<SmartSearchState>((set) => ({
  sessions: {},
  listing: null,
  handoff: null,
  dialog: [],

  setSession: (channel, sessionId, scope = '') =>
    set((state) => {
      const sessions = { ...state.sessions };
      if (sessionId) sessions[channel] = { id: sessionId, scope };
      else delete sessions[channel];
      return { sessions };
    }),

  setListing: (listing) => set({ listing }),

  setHandoff: (handoff) => set({ handoff }),

  pushTurn: (turn) => set((state) => ({ dialog: [...state.dialog, turn].slice(-DIALOG_LIMIT) })),

  updateTurn: (id, patch) =>
    set((state) => ({
      dialog: state.dialog.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)),
    })),

  dropTurn: (id) => set((state) => ({ dialog: state.dialog.filter((turn) => turn.id !== id) })),

  clearDialog: () =>
    set((state) => {
      const sessions = { ...state.sessions };
      delete sessions.global;
      return { dialog: [], sessions };
    }),
}));
