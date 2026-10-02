import { Image, useWindowDimensions } from 'react-native';

import appBackgroundDark from '../../assets/images/app-background-dark.png';
import appBackground from '../../assets/images/app-background.jpg';
import { darkColors, useThemeColors } from '../theme';

/**
 * Фоновая подложка приложения — используется на каждом экране (кроме
 * тёмных вроде заставки).
 *
 * Почему не один общий слой на всё приложение: и Stack, и вкладки в
 * expo-router держат соседние экраны смонтированными и полагаются на то,
 * что у активного экрана непрозрачный фон — это и скрывает то, что под
 * ним. Один общий прозрачный слой на всех экранах ломает это: сквозь
 * прозрачные места активного экрана становится виден предыдущий экран
 * позади него. Поэтому подложка рисуется per-экранно, но всегда одной
 * и той же картинкой — так фон один и тот же везде, а изоляция экранов
 * друг от друга остаётся исправной.
 *
 * Явные пиксельные размеры вместо flex/процентов — на вебе, особенно
 * в широком окне компьютера, вложенный flex не всегда пробрасывает
 * высоту экрана до конца цепочки, и подложка получается «на пол-экрана».
 *
 * У каждой темы своя картинка: светлое фото снято под светлый фон и на
 * тёмных карточках выглядело бы светлым пятном, поэтому в тёмной теме —
 * отдельный тёмный абстрактный фон.
 */
export function AppBackground() {
  const { width, height } = useWindowDimensions();
  const colors = useThemeColors();

  return (
    <Image
      source={colors === darkColors ? appBackgroundDark : appBackground}
      resizeMode="cover"
      style={{ position: 'absolute', top: 0, left: 0, width, height }}
    />
  );
}
