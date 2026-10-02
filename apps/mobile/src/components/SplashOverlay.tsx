import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

import splashScene from '../../assets/images/splash-scene.jpg';

/**
 * Не меньше этого заставка на экране — по ТЗ (п. 7) её должны успеть
 * рассмотреть, а не увидеть мельком. Если загрузка дольше — заставка ждёт
 * загрузку, полоса честно показывает, сколько осталось.
 */
const MIN_VISIBLE_MS = 3000;

/** Размер исходной картинки заставки в пикселях */
const SCENE = { width: 1000, height: 1727 };

/**
 * Где на картинке нарисована полоса загрузки (в пикселях исходника), с
 * запасом в пиксель со всех сторон — живая полоса ложится ровно поверх
 * нарисованной и полностью её закрывает, включая сглаженные края.
 */
const BAR = { left: 337, top: 1543.5, width: 343, height: 8 };

/**
 * Цвета нарисованной полосы, снятые с самой картинки: незаполненная часть —
 * светлая полупрозрачная линия поверх тёмного склона (в итоге этот ровный
 * тёплый серый), заполненная — почти белая.
 */
const TRACK_COLOR = 'rgb(123,111,97)';
const FILL_COLOR = 'rgb(243,243,241)';

/**
 * Нарисованная полоса заполнена на треть. Живая начинает с того же места:
 * к моменту, когда появляется заставка, код приложения уже скачан и
 * запущен — эта часть загрузки действительно позади.
 */
export const SPLASH_START_PROGRESS = 0.35;

/**
 * Заставка при каждом запуске приложения (пункт 7 ТЗ): фирменная картинка
 * как есть и полоса загрузки, которая показывает настоящий ход подготовки —
 * город, вход, корзина, фон, погода для главной. Пока она на экране, под ней
 * уже собирается главная, поэтому после неё приложение сразу готово.
 *
 * Картинка растягивается `cover` на весь экран, поэтому положение полосы
 * пересчитывается из координат исходника тем же масштабом и сдвигом, что
 * применяет `cover`, — иначе живая полоса съехала бы с нарисованной.
 *
 * `progress` — доля выполненной подготовки (0…1), `done` — всё готово.
 * `onShown` — картинка на экране, можно убирать системную заставку.
 */
export function SplashOverlay({
  progress,
  done,
  onShown,
  onDone,
}: {
  progress: number;
  done: boolean;
  onShown: () => void;
  onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();

  const fill = useRef(new Animated.Value(SPLASH_START_PROGRESS)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const [minTimePassed, setMinTimePassed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimePassed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  // Полоса плавно догоняет настоящий прогресс, а не прыгает скачками по
  // мере того, как завершается очередной шаг. До конца она доходит только
  // вместе с уходом заставки — иначе полная полоса стояла бы и ждала.
  useEffect(() => {
    if (done && minTimePassed) return;
    const target = SPLASH_START_PROGRESS + (1 - SPLASH_START_PROGRESS) * progress;
    const animation = Animated.timing(fill, {
      toValue: Math.min(target, 0.96),
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, done, minTimePassed, fill]);

  useEffect(() => {
    if (!done || !minTimePassed) return;

    const finish = Animated.sequence([
      Animated.timing(fill, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 400,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }),
    ]);
    finish.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => finish.stop();
  }, [done, minTimePassed, fill, screenOpacity, onDone]);

  // Тот же масштаб и сдвиг, что у resizeMode="cover"
  const scale = Math.max(width / SCENE.width, height / SCENE.height);
  const offsetX = (width - SCENE.width * scale) / 2;
  const offsetY = (height - SCENE.height * scale) / 2;
  const barWidth = BAR.width * scale;
  const barHeight = Math.max(BAR.height * scale, 3);

  return (
    <Animated.View style={[styles.root, { opacity: screenOpacity }]}>
      <Animated.Image
        source={splashScene}
        resizeMode="cover"
        style={{ width, height }}
        onLoad={onShown}
      />

      <View
        style={[
          styles.track,
          {
            left: offsetX + BAR.left * scale,
            top: offsetY + BAR.top * scale,
            width: barWidth,
            height: barHeight,
            borderRadius: barHeight / 2,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              borderRadius: barHeight / 2,
              width: fill.interpolate({ inputRange: [0, 1], outputRange: [0, barWidth] }),
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Тот же тёмный цвет, что и у системной заставки, — на случай кадра,
    // пока картинка ещё не отрисовалась
    backgroundColor: '#0d2b31',
    zIndex: 100,
    pointerEvents: 'none',
  },
  track: { position: 'absolute', backgroundColor: TRACK_COLOR, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: FILL_COLOR },
});
