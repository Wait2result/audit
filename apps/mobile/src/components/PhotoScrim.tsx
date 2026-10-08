import { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * Затемнение фото под белым текстом: плотнее там, где надпись, и сходит на
 * нет к противоположному краю. Ровная полупрозрачная заливка гасила бы всё
 * фото целиком, а градиент оставляет главное — справа — ярким.
 *
 * `from` — откуда идёт тень: «слева сверху» для плиток (заголовок в углу),
 * «слева» для рекламной полосы (текст по высоте посередине).
 */
export function PhotoScrim({
  width,
  height,
  from = 'top-left',
  strength = 0.72,
}: {
  width: number;
  height: number;
  from?: 'top-left' | 'left';
  strength?: number;
}) {
  // id градиента — свой у каждой плитки: на одной странице их несколько
  const id = `scrim${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const end = from === 'left' ? { x2: '1', y2: '0' } : { x2: '0.9', y2: '1' };

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" {...end}>
          <Stop offset="0" stopColor="#05090B" stopOpacity={strength} />
          <Stop offset="0.45" stopColor="#05090B" stopOpacity={strength * 0.45} />
          <Stop offset="1" stopColor="#05090B" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}
