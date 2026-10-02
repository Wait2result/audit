import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Хранение данных на устройстве.
 *
 * Разделено на два вида, и это принципиально:
 *
 *   secureStorage — токены сессии. Ложатся в системное защищённое хранилище:
 *                   Keychain на iOS, Keystore на Android. Эти хранилища
 *                   защищены самой операционной системой, и другое
 *                   приложение прочитать их не может.
 *
 *   plainStorage  — обычные настройки: выбранный город, факт прохождения
 *                   первого запуска. Ничего секретного, обычное хранилище.
 *
 * Класть токены в обычное хранилище нельзя: на устройстве с открытым
 * доступом к системным файлам их можно вытащить и войти в чужой аккаунт.
 */

/**
 * В браузере (режим предпросмотра) системного защищённого хранилища нет.
 * Подменяем его обычным — исключительно для разработки: в собранном
 * приложении для телефона выполняется настоящая ветка.
 */
const isWeb = Platform.OS === 'web';

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (isWeb) return AsyncStorage.getItem(`secure:${key}`);
    return SecureStore.getItemAsync(key);
  },

  async set(key: string, value: string): Promise<void> {
    if (isWeb) {
      await AsyncStorage.setItem(`secure:${key}`, value);
      return;
    }
    await SecureStore.setItemAsync(key, value, {
      // Токены доступны только когда устройство разблокировано хотя бы раз
      // после перезагрузки. Фоновое обновление при этом продолжает работать.
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  },

  async remove(key: string): Promise<void> {
    if (isWeb) {
      await AsyncStorage.removeItem(`secure:${key}`);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const plainStorage = {
  get: (key: string) => AsyncStorage.getItem(key),
  set: (key: string, value: string) => AsyncStorage.setItem(key, value),
  remove: (key: string) => AsyncStorage.removeItem(key),
};

/** Ключи хранения. Собраны в одном месте, чтобы не разъезжались по коду. */
export const StorageKey = {
  ACCESS_TOKEN: 'dg.accessToken',
  REFRESH_TOKEN: 'dg.refreshToken',
  CITY_ID: 'dg.cityId',
  CITY_NAME: 'dg.cityName',
  ONBOARDING_DONE: 'dg.onboardingDone',
  /** Корзина: одно заведение и его позиции (Этап 6) */
  CART: 'dg.cart',
  /** Тема оформления: 'light' | 'dark' | 'system' */
  THEME_MODE: 'dg.themeMode',
  /** Последние запросы в поиске объявлений, до десяти */
  LISTING_SEARCH_HISTORY: 'dg.listingSearchHistory',
  /** Где искать объявления: выбранное место и радиус */
  LISTING_SEARCH_AREA: 'dg.listingSearchArea',
  /** Недавние места поиска объявлений */
  LISTING_RECENT_PLACES: 'dg.listingRecentPlaces',
} as const;
