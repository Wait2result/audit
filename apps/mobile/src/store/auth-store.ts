import type { AuthResponse, AuthenticatedUser } from '@dagestan/shared';
import { create } from 'zustand';

import { apiFetch, clearTokens, hasSession, saveTokens } from '../api/client';

/**
 * Сессия пользователя.
 *
 * Ключевое требование ТЗ (пункт 6): аккаунт нужен НЕ для просмотра.
 * Погода, кино, новости, каталоги и поиск работают у гостя без регистрации.
 * Аккаунт запрашивается только в момент действия — оформить заказ, написать
 * сообщение, добавить в избранное.
 *
 * Поэтому «не вошёл» — это нормальное рабочее состояние приложения,
 * а не экран-заглушка перед входом.
 */

interface AuthState {
  user: AuthenticatedUser | null;
  /** Идёт восстановление сессии при запуске */
  isLoading: boolean;

  restore: () => Promise<void>;
  applyAuth: (response: AuthResponse) => Promise<void>;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  /** Пытается восстановить сессию при запуске приложения. */
  restore: async () => {
    if (!(await hasSession())) {
      set({ user: null, isLoading: false });
      return;
    }

    try {
      const user = await apiFetch<AuthenticatedUser>('/users/me');
      set({ user, isLoading: false });
    } catch {
      // Сессия недействительна или сети нет. Второе не повод выкидывать
      // человека из аккаунта — токены оставляем, попробуем позже.
      set({ user: null, isLoading: false });
    }
  },

  applyAuth: async (response) => {
    await saveTokens(response.tokens);
    set({ user: response.user, isLoading: false });
  },

  refreshUser: async () => {
    try {
      const user = await apiFetch<AuthenticatedUser>('/users/me');
      set({ user });
    } catch {
      /* оставляем прежние данные */
    }
  },

  signOut: async () => {
    // Гасим сессию и на сервере: иначе украденный токен обновления
    // продолжал бы работать ещё месяц.
    try {
      const { secureStorage, StorageKey } = await import('../api/storage');
      const refreshToken = await secureStorage.get(StorageKey.REFRESH_TOKEN);
      if (refreshToken) {
        await apiFetch('/auth/logout', {
          method: 'POST',
          body: { refreshToken },
          anonymous: true,
        });
      }
    } catch {
      /* даже если сервер недоступен, локально выходим */
    }

    await clearTokens();
    set({ user: null });
  },
}));

/** Удобная проверка для экранов: вошёл ли пользователь. */
export const useIsSignedIn = (): boolean => useAuthStore((s) => s.user !== null);

/** Текущий пользователь без подписки на загрузку. */
export const useCurrentUser = (): AuthenticatedUser | null => useAuthStore((s) => s.user);

/** Прямой доступ вне компонентов — например, из обработчика ошибок сети. */
export const authStore = useAuthStore;
export const getAuthState = () => useAuthStore.getState();
export const isSignedInNow = () => getAuthState().user !== null;
export const signOutNow = () => void getAuthState().signOut();
