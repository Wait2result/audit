import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Адрес сервера API.
 *
 * Тонкость, которая иначе съедает полдня отладки: «localhost» на телефоне
 * означает сам телефон, а не компьютер разработчика. Приложение, запущенное
 * на настоящем устройстве, по адресу localhost достучится в пустоту.
 *
 * Expo при запуске сообщает адрес компьютера в локальной сети — берём его
 * автоматически. В браузере предпросмотра localhost работает как обычно.
 * В собранном для магазинов приложении подставляется боевой адрес.
 */

const DEV_PORT = 3000;

/** Адрес, который на другом устройстве указывает на само это устройство. */
function isLoopback(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url);
}

function resolveBaseUrl(): string {
  // Боевой адрес задаётся при сборке через переменную окружения
  const configured = process.env.EXPO_PUBLIC_API_URL;

  if (configured && (Platform.OS === 'web' || !isLoopback(configured))) return configured;

  // На телефоне «localhost» — это сам телефон. Такой адрес в настройках
  // остаётся после проверки в браузере и молча ломает все запросы: не
  // грузится ни одна рубрика, а причина не видна нигде, кроме этого файла.
  // Поэтому на устройстве он игнорируется, а в консоль пишется предупреждение.
  if (configured) {
    console.warn(
      `EXPO_PUBLIC_API_URL=${configured} указывает на localhost и на телефоне не сработает — ` +
        'адрес определяется автоматически. Для туннеля укажите адрес туннеля.',
    );
  }

  if (Platform.OS === 'web') {
    return `http://localhost:${DEV_PORT}/api/v1`;
  }

  // hostUri выглядит как «192.168.1.5:8081» — берём из него адрес компьютера
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];

  if (host) {
    return `http://${host}:${DEV_PORT}/api/v1`;
  }

  // Запасной вариант: эмулятор Android обращается к компьютеру по 10.0.2.2
  return Platform.OS === 'android'
    ? `http://10.0.2.2:${DEV_PORT}/api/v1`
    : `http://localhost:${DEV_PORT}/api/v1`;
}

export const API_BASE_URL = resolveBaseUrl();

/**
 * Сколько ждать ответа сервера, прежде чем считать запрос неудавшимся.
 *
 * Без ограничения приложение в метро или лифте «зависает» на минуты:
 * запрос не отвечает и не отваливается, а человек смотрит на крутящийся
 * кружок и решает, что приложение сломалось (пункт 40 ТЗ).
 */
export const REQUEST_TIMEOUT_MS = 15_000;
