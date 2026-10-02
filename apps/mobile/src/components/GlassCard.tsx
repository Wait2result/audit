import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { darkColors, radius, useThemeColors } from '../theme';

interface GlassCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Принудительно тёмное или светлое стекло независимо от темы приложения.
   * Нужен только там, где стекло лежит не на фоне приложения, а на своём
   * цветном фоне (экран погоды — небо светлое днём и тёмное ночью само по
   * себе). Без этого прогноза стекло следует за темой приложения само.
   */
  dark?: boolean;
  /** Сила размытия того, что под карточкой. Держим невысокой: сильный блюр
   *  и есть тот самый «стеклянный» эффект, которого просили поменьше */
  intensity?: number;
  /** Мягкая тень под стеклом — чтобы карточка едва отделялась от фона */
  shadow?: boolean;
  /**
   * Свой цвет подложки вместо цвета из темы. Нужен на цветных фонах: поверх
   * насыщенного неба обычная подложка почти не читается. Цвет — вместе
   * с прозрачностью (rgba).
   */
  tint?: string;
  /** Свой цвет обводки — по умолчанию берётся из темы (еле заметная грань) */
  borderColor?: string;
}

/**
 * Карточка в стиле Liquid Glass: сквозь неё видно фон, но размыто.
 *
 * Без `tint`/`borderColor`/`dark` подложка и грань берутся из темы
 * приложения (`colors.surface`, `colors.border`) — то же полупрозрачное
 * стекло, что и у обычных карточек (`Card.tsx`), только с лёгким размытием
 * позади. Это специально: карточка на главной, в кино или в заказе должна
 * выглядеть частью одной системы, а не отдельным ярким прямоугольником —
 * блюр здесь лишь добавляет глубины, а не меняет саму подложку.
 *
 * Явный `dark` нужен только когда карточка лежит на своём цветном фоне,
 * не на фоне приложения, — например, на экране погоды: там своё «день/ночь»,
 * не связанное с тем, какая тема выбрана в профиле.
 *
 * Две тонкости, без которых эффекта не получается:
 *
 *   1. Размытие приходится класть в ОТДЕЛЬНЫЙ внутренний слой с
 *      `overflow: 'hidden'` — скругление углов у размытия работает только
 *      через обрезку. Но `overflow: 'hidden'` обрезает и тень, поэтому тень
 *      живёт на внешнем слое, а обрезка — на внутреннем. Если сложить их в
 *      один View, тени просто не будет видно.
 *
 *   2. Подложка поверх размытия должна оставаться в меру прозрачной. Стоит
 *      поднять её непрозрачность до полностью сплошной — и стекло превратится
 *      в обычный прямоугольник: размытого фона сквозь него не разглядеть.
 */
export function GlassCard({
  children,
  style,
  dark,
  intensity = 40,
  shadow = false,
  tint,
  borderColor,
}: GlassCardProps) {
  const colors = useThemeColors();
  const isDarkGlass = dark ?? colors === darkColors;

  const overlay = tint ?? colors.surface;
  const border = borderColor ?? colors.border;

  return (
    <View
      style={[
        styles.outer,
        shadow && (isDarkGlass ? styles.shadowDark : styles.shadowLight),
        style,
      ]}
    >
      <View style={[StyleSheet.absoluteFill, styles.clip, { borderColor: border }]}>
        <BlurView
          intensity={intensity}
          tint={isDarkGlass ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: overlay }]} />
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // Внешний слой: скругление + тень. Без overflow — иначе тень обрежется.
  outer: { borderRadius: radius.lg },
  // Внутренний слой: обрезает размытие по скруглению и держит обводку стекла.
  clip: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  // Тень минимальная и нейтрально-чёрная в обеих темах: карточка стекла
  // полупрозрачная, и цветная или сильная тень проступала бы сквозь неё
  shadowLight: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  shadowDark: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 2,
  },
});
