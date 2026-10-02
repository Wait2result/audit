import { describeWeatherCode } from '@dagestan/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Asset } from 'expo-asset';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import appBackgroundDark from '../assets/images/app-background-dark.png';
import appBackground from '../assets/images/app-background.jpg';
import splashScene from '../assets/images/splash-scene.jpg';
import { setCityGoneHandler, setSessionExpiredHandler } from '../src/api/client';
import { weatherQueryOptions } from '../src/api/queries';
import { SplashOverlay } from '../src/components/SplashOverlay';
import { weatherBackgroundSource } from '../src/components/WeatherSkyPhoto';
import { useAuthStore } from '../src/store/auth-store';
import { ToastHost } from '../src/components/ToastHost';
import { useCartStore } from '../src/store/cart-store';
import { useCityStore } from '../src/store/city-store';
import { useThemeStore } from '../src/store/theme-store';
import { darkColors, useThemeColors } from '../src/theme';
import { weatherBackgroundKey } from '../src/utils/weather-theme';

/**
 * Системная заставка держится на экране, пока приложение готовится.
 * Без этого человек на долю секунды видит пустой белый экран.
 */
void SplashScreen.preventAutoHideAsync();

/**
 * Настройки работы с серверными данными (пункт 40 ТЗ).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Данные считаются свежими минуту: переход между вкладками
      // не должен заново дёргать сервер
      staleTime: 60_000,
      // Три попытки при сбое сети — обычное дело в дороге между городами.
      // Но ошибки прав и «не найдено» повторять бессмысленно.
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status;
        if (status !== undefined && status >= 400 && status < 500) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
});

/**
 * Сколько заставка готова ждать погоду для главной. Дольше — значит, сеть
 * плохая: лучше открыть приложение, а виджет догрузится сам, чем держать
 * человека на заставке.
 */
const WEATHER_PREFETCH_TIMEOUT_MS = 6000;

/** Погода текущего города и фотография неба под неё — для виджета на главной */
async function prefetchWeather() {
  const cityId = useCityStore.getState().cityId;
  if (!cityId) return;

  const load = async () => {
    const data = await queryClient.fetchQuery(weatherQueryOptions(cityId));
    const key = weatherBackgroundKey(
      describeWeatherCode(data.current.conditionCode).icon,
      data.current.isDay,
    );
    await Asset.loadAsync(weatherBackgroundSource(key));
  };

  await Promise.race([
    load(),
    new Promise((resolve) => setTimeout(resolve, WEATHER_PREFETCH_TIMEOUT_MS)),
  ]);
}

export default function RootLayout() {
  const loadCity = useCityStore((s) => s.load);
  const loadCart = useCartStore((s) => s.load);
  const loadTheme = useThemeStore((s) => s.load);
  const restoreAuth = useAuthStore((s) => s.restore);
  const colors = useThemeColors();

  /** Своя заставка готова к показу — её картинка загружена */
  const [splashReady, setSplashReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  /** Город, вход, корзина и тема восстановлены — можно строить экраны */
  const [isReady, setIsReady] = useState(false);
  /** Вся подготовка к первому экрану закончена, заставку можно убирать */
  const [isLoaded, setIsLoaded] = useState(false);
  /** Доля выполненных шагов подготовки — её показывает полоса на заставке */
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    async function prepare() {
      // Сначала — только картинка своей заставки, чтобы сменить системную
      // заставку на свою без пустого кадра между ними. Без предзагрузки
      // заставка появлялась раньше картинки, и её таймер истекал, пока та
      // ещё скачивалась: человек видел тёмный экран вместо заставки.
      await Asset.loadAsync(splashScene).catch(() => undefined);
      setSplashReady(true);

      // Дальше — всё, что нужно главной, параллельно. Каждый завершённый шаг
      // двигает полосу загрузки, поэтому она показывает настоящий ход
      // подготовки, а не просто отсчитывает время.
      let completed = 0;
      const steps: Promise<unknown>[] = [];
      const step = <T,>(work: Promise<T>) => {
        const tracked = work
          .catch(() => undefined)
          .finally(() => {
            completed += 1;
            setProgress(completed / steps.length);
          });
        steps.push(tracked);
        return tracked;
      };

      // Корзина восстанавливается здесь же: человек собрал заказ, свернул
      // приложение и вернулся — блюда должны остаться на месте
      const cityLoaded = step(loadCity());
      const stores = [cityLoaded, step(loadCart()), step(loadTheme()), step(restoreAuth())];
      // Фон приложения нужно не просто открыть импортом, а разобрать в готовый
      // к отрисовке битмап заранее — иначе на первом экране был бы короткий
      // белый проблеск, пока Image декодирует его в первый раз
      void step(Asset.loadAsync([appBackground, appBackgroundDark]));
      // Погода для виджета на главной и фотография неба под неё: без этого
      // виджет после заставки ещё несколько секунд крутил бы загрузку
      void step(cityLoaded.then(prefetchWeather));

      await Promise.all(stores);
      setIsReady(true);
      await Promise.all(steps);
      setIsLoaded(true);
    }

    void prepare();
  }, [loadCity, loadCart, loadTheme, restoreAuth]);

  useEffect(() => {
    // Когда сессия окончательно потеряна, приложение переходит в режим гостя.
    // Выкидывать на экран входа не нужно: по пункту 6 ТЗ гость видит почти всё.
    setSessionExpiredHandler(() => {
      void useAuthStore.getState().signOut();
    });

    // А вот пропавший город — тупик: без него ни один раздел не покажет
    // данные. Поэтому забываем его и сразу отправляем выбрать заново.
    setCityGoneHandler(() => {
      void useCityStore.getState().forget();
      router.replace('/onboarding/city');
    });

    return () => {
      setSessionExpiredHandler(null);
      setCityGoneHandler(null);
    };
  }, []);

  const handleSplashShown = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  const handleSplashDone = useCallback(() => setShowSplash(false), []);

  if (!splashReady) {
    // Системная заставка ещё видна — своего экрана рисовать не нужно
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <StatusBar style={showSplash || colors === darkColors ? 'light' : 'dark'} />

          {/* Экраны строятся под заставкой, как только восстановлены город
              и вход, — к её уходу главная уже нарисована.

              contentStyle — непрозрачный: и Stack, и вложенные вкладки
              держат соседние экраны смонтированными и полагаются на
              непрозрачный фон активного экрана, чтобы скрыть то, что
              позади. Сама подложка-картинка рисуется на каждом экране
              отдельно — см. AppBackground и Screen — поэтому фон одинаков
              везде, а изоляция экранов друг от друга не ломается. */}
          {isReady && (
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
                animation: 'slide_from_right',
              }}
            />
          )}

          <ToastHost />

          {showSplash && (
            <SplashOverlay
              progress={progress}
              done={isLoaded}
              onShown={handleSplashShown}
              onDone={handleSplashDone}
            />
          )}
        </View>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
