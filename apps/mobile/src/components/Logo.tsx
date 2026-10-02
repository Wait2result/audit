import { Image, type ImageStyle, type StyleProp } from 'react-native';

import logoMark from '../../assets/images/logo-mark.png';

/**
 * Знак приложения: орёл над горами (готовая иллюстрация, а не наш рисунок).
 *
 * Источник — apps/mobile/assets/images/logo-mark.png: то же изображение, что
 * и на заставке и в фирменных материалах, только вырезанное из чёрной
 * подложки в прозрачный PNG (см. `docs/ADR/`), — чтобы знак одинаково
 * ложился и на светлые экраны онбординга, и на тёмные.
 *
 * variant:
 *  - emblem — обычный, в фирменных тонах;
 *  - mono   — приглушённый (ниже непрозрачность) для служебных экранов
 *             («раздел в работе»), где яркий знак был бы неуместен.
 */

/** Соотношение сторон исходного файла (600×421) — чтобы Image не искажал знак */
const ASPECT_RATIO = 421 / 600;

export function Logo({
  size = 96,
  variant = 'emblem',
  style,
}: {
  size?: number;
  variant?: 'emblem' | 'mono';
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={logoMark}
      resizeMode="contain"
      style={[
        { width: size, height: size * ASPECT_RATIO, opacity: variant === 'mono' ? 0.32 : 1 },
        style,
      ]}
    />
  );
}
