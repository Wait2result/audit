import { create } from 'zustand';

import { StorageKey, plainStorage } from '../api/storage';

export type ThemeMode = 'light' | 'dark' | 'system';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Выбор темы оформления.
 *
 * По умолчанию — «системная»: приложение следует настройке телефона и не
 * заставляет решать за человека. Переключатель в профиле позволяет
 * закрепить светлую или тёмную вне зависимости от системы.
 *
 * Хранится так же, как город (`city-store.ts`): читается один раз при
 * старте, дальше живёт в памяти и пишется на устройство при каждой смене.
 */
interface ThemeState {
  mode: ThemeMode;
  isLoaded: boolean;

  load: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'system',
  isLoaded: false,

  load: async () => {
    const stored = await plainStorage.get(StorageKey.THEME_MODE);
    set({ mode: isThemeMode(stored) ? stored : 'system', isLoaded: true });
  },

  setMode: async (mode) => {
    set({ mode });
    await plainStorage.set(StorageKey.THEME_MODE, mode);
  },
}));
