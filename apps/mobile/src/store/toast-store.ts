import { create } from 'zustand';

/**
 * Короткое сообщение внизу экрана (Этап 6).
 *
 * Нужно там, где действие происходит без перехода на другой экран и человеку
 * иначе не понять, сработало ли оно: сердечко закрасилось — а куда оно
 * попало? Подсказка отвечает на этот вопрос и сразу предлагает пойти
 * посмотреть.
 */

interface Toast {
  /** Растёт с каждым сообщением: по нему сбрасывается таймер скрытия */
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  toast: Toast | null;
  show: (message: string, action?: { label: string; onPress: () => void }) => void;
  hide: () => void;
}

const VISIBLE_MS = 3200;

let counter = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,

  show: (message, action) => {
    counter += 1;
    const id = counter;

    // Новое сообщение вытесняет старое вместе с его таймером: иначе оно
    // исчезло бы раньше времени по таймеру предыдущего
    if (timer) clearTimeout(timer);

    set({
      toast: {
        id,
        message,
        ...(action ? { actionLabel: action.label, onAction: action.onPress } : {}),
      },
    });

    timer = setTimeout(() => {
      set((state) => (state.toast?.id === id ? { toast: null } : state));
    }, VISIBLE_MS);
  },

  hide: () => {
    if (timer) clearTimeout(timer);
    set({ toast: null });
  },
}));
