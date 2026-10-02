import { Redirect } from 'expo-router';

import { useCityStore } from '../src/store/city-store';

/**
 * Точка входа: решает, куда отправить человека при запуске.
 *
 * Город не выбран — значит, приложение открыто впервые: показываем выбор.
 * Город есть — сразу главная. Экран выбора города при последующих запусках
 * больше не появляется никогда (пункт 7 ТЗ), сменить его можно на главной.
 */
export default function Index() {
  const { cityId, isLoaded } = useCityStore();

  // Данные с устройства ещё читаются — ничего не решаем, чтобы не мигнуть
  // чужим экраном и не увести человека не туда
  if (!isLoaded) return null;

  return cityId ? <Redirect href="/(tabs)" /> : <Redirect href="/onboarding/city" />;
}
