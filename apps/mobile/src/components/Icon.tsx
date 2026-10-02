import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useThemeColors } from '../theme';

/**
 * Иконки.
 *
 * Нарисованы контуром прямо здесь, а не подключены шрифтовой библиотекой.
 * Причина простая: шрифт иконок — это лишний файл, который нужно загрузить
 * до первой отрисовки. Пока он грузится, на месте иконок пустота или квадраты.
 * Полтора десятка контуров весят несколько килобайт и рисуются мгновенно.
 */

export type IconName =
  | 'home'
  | 'search'
  | 'person'
  | 'location'
  | 'cinema'
  | 'food'
  | 'news'
  | 'rides'
  | 'realty'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'close'
  | 'star'
  | 'heart'
  | 'phone'
  | 'route'
  | 'filter'
  | 'plus'
  | 'minus'
  | 'trash'
  | 'cart'
  | 'receipt'
  | 'map'
  | 'clock'
  | 'settings'
  | 'check'
  | 'sun'
  | 'cloud'
  | 'rain'
  | 'wind'
  | 'humidity'
  | 'pressure'
  | 'sunrise'
  | 'sunset'
  // Рубрика объявлений (Этап 7)
  | 'car'
  | 'smartphone'
  | 'sofa'
  | 'tools'
  | 'briefcase'
  | 'shirt'
  | 'paw'
  | 'leaf'
  | 'grid'
  | 'tag'
  | 'image'
  | 'camera'
  | 'flag'
  | 'arrow-up'
  | 'eye'
  | 'edit';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Залить фигуру вместо контура — для активного состояния */
  filled?: boolean;
  /**
   * Плотность заливки. По умолчанию лёгкая подсветка активной вкладки;
   * 1 — сплошная фигура, как нужно звезде рейтинга: полупрозрачная звезда
   * читается как пустая, и «5.0» выглядит нулём.
   */
  fillOpacity?: number;
}

export function Icon({ name, size = 24, color, filled = false, fillOpacity = 0.15 }: IconProps) {
  // Хук нельзя спрятать в значение параметра по умолчанию: оно вычисляется,
  // только когда цвет не передали, а хуки обязаны вызываться каждый раз
  const colors = useThemeColors();
  const resolvedColor = color ?? colors.text;
  const strokeWidth = 1.8;

  const common = {
    stroke: resolvedColor,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: filled ? resolvedColor : 'none',
    fillOpacity: filled ? fillOpacity : 0,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {paths(name, common, resolvedColor)}
    </Svg>
  );
}

function paths(
  name: IconName,
  common: Record<string, unknown>,
  color: string,
): React.ReactElement | React.ReactElement[] {
  switch (name) {
    case 'home':
      return (
        <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" {...common} />
      );

    case 'search':
      return [
        <Circle key="c" cx={11} cy={11} r={7} {...common} />,
        <Path key="l" d="m20 20-3.5-3.5" {...common} />,
      ];

    case 'person':
      return [
        <Circle key="c" cx={12} cy={8} r={4} {...common} />,
        <Path key="b" d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" {...common} />,
      ];

    case 'location':
      return [
        <Path key="p" d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" {...common} />,
        <Circle key="c" cx={12} cy={10} r={2.5} {...common} />,
      ];

    case 'cinema':
      return [
        <Path key="b" d="M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...common} />,
        <Path key="t" d="m4 8 3-5m5 5 3-5m2 5 3-5" {...common} />,
      ];

    case 'food':
      return [
        <Path key="f" d="M6 3v8a3 3 0 0 0 6 0V3M9 11v10" {...common} />,
        <Path key="s" d="M17 3c-1.5 2-2 4-2 6.5 0 1.4.8 2.5 2 2.5v9" {...common} />,
      ];

    case 'news':
      return [
        <Path
          key="b"
          d="M4 5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"
          {...common}
        />,
        <Path key="l" d="M7 9h7M7 13h7M7 17h4" {...common} />,
      ];

    case 'rides':
      return [
        <Path key="b" d="M4 16v-3.5L6 8h9l2 4.5V16" {...common} />,
        <Path
          key="l"
          d="M3 16h18v2a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-11v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"
          {...common}
        />,
        <Circle key="w1" cx={7.5} cy={16} r={0.8} fill={color} stroke="none" />,
        <Circle key="w2" cx={16.5} cy={16} r={0.8} fill={color} stroke="none" />,
      ];

    case 'realty':
      return [
        <Path key="b" d="M4 21V9l8-5 8 5v12" {...common} />,
        <Path key="d" d="M10 21v-6h4v6" {...common} />,
      ];

    // ── Категории объявлений ──────────────────────────────────────────────
    case 'car':
      return [
        <Path key="b" d="M4 16v-3l2-5h12l2 5v3" {...common} />,
        <Path key="w" d="M4 16h16v3h-3v-3M7 19H4v-3" {...common} />,
      ];

    case 'smartphone':
      return [
        <Rect key="b" x={7} y={3} width={10} height={18} rx={2} {...common} />,
        <Path key="h" d="M11 18h2" {...common} />,
      ];

    case 'sofa':
      return [
        <Path key="b" d="M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" {...common} />,
        <Path key="s" d="M3 12h18v5H3zM6 17v2M18 17v2" {...common} />,
      ];

    case 'tools':
      return [
        <Path key="a" d="m4 20 7-7M14 6l4 4" {...common} />,
        <Path key="b" d="M13 4a4 4 0 0 0 5 5l3 3-4 4-3-3a4 4 0 0 0-5-5z" {...common} />,
      ];

    case 'briefcase':
      return [
        <Rect key="b" x={3} y={8} width={18} height={12} rx={2} {...common} />,
        <Path key="h" d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" {...common} />,
      ];

    case 'shirt':
      return <Path d="M8 4 5 6l2 3-1 11h12l-1-11 2-3-3-2-2 2h-4z" {...common} />;

    case 'paw':
      return [
        <Circle key="a" cx={7} cy={9} r={2} {...common} />,
        <Circle key="b" cx={12} cy={7} r={2} {...common} />,
        <Circle key="c" cx={17} cy={9} r={2} {...common} />,
        <Path key="d" d="M12 12c-3 0-5 2-5 4.5S9 20 12 20s5-1 5-3.5S15 12 12 12z" {...common} />,
      ];

    case 'leaf':
      return [
        <Path key="a" d="M20 4c0 9-5 13-11 13-2 0-4-1-4-3 0-6 6-10 15-10z" {...common} />,
        <Path key="b" d="M4 20c2-5 6-8 11-9" {...common} />,
      ];

    case 'grid':
      return [
        <Circle key="a" cx={7} cy={7} r={1.4} {...common} />,
        <Circle key="b" cx={12} cy={7} r={1.4} {...common} />,
        <Circle key="c" cx={17} cy={7} r={1.4} {...common} />,
        <Circle key="d" cx={7} cy={12} r={1.4} {...common} />,
        <Circle key="e" cx={12} cy={12} r={1.4} {...common} />,
        <Circle key="f" cx={17} cy={12} r={1.4} {...common} />,
        <Circle key="g" cx={7} cy={17} r={1.4} {...common} />,
        <Circle key="h" cx={12} cy={17} r={1.4} {...common} />,
        <Circle key="i" cx={17} cy={17} r={1.4} {...common} />,
      ];

    case 'tag':
      return [
        <Path key="b" d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" {...common} />,
        <Circle key="d" cx={8} cy={8} r={1.4} {...common} />,
      ];

    case 'image':
      return [
        <Rect key="b" x={3} y={5} width={18} height={14} rx={2} {...common} />,
        <Path key="p" d="m5 17 5-5 4 4 2-2 3 3" {...common} />,
      ];

    case 'camera':
      return [
        <Path key="b" d="M3 8h4l2-2h6l2 2h4v11H3z" {...common} />,
        <Circle key="l" cx={12} cy={13} r={3.2} {...common} />,
      ];

    case 'flag':
      return <Path d="M6 21V4h12l-2 4 2 4H6" {...common} />;

    case 'arrow-up':
      return <Path d="M12 19V5m0 0-6 6m6-6 6 6" {...common} />;

    case 'eye':
      return [
        <Path key="b" d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" {...common} />,
        <Circle key="p" cx={12} cy={12} r={2.6} {...common} />,
      ];

    case 'edit':
      return [
        <Path key="a" d="M4 20h4l10-10-4-4L4 16z" {...common} />,
        <Path key="b" d="m14 6 4 4" {...common} />,
      ];

    case 'chevron-right':
      return <Path d="m9 5 7 7-7 7" {...common} />;

    case 'chevron-left':
      return <Path d="m15 5-7 7 7 7" {...common} />;

    case 'chevron-down':
      return <Path d="m5 9 7 7 7-7" {...common} />;

    case 'close':
      return <Path d="M6 6l12 12M18 6L6 18" {...common} />;

    case 'star':
      return (
        <Path
          d="m12 3.5 2.6 5.6 6 .8-4.4 4.2 1.1 6.1-5.3-2.9-5.3 2.9 1.1-6.1L3.4 9.9l6-.8z"
          {...common}
        />
      );

    // ── Рубрика «Заказать» (Этап 6) ──────────────────────────────────────────

    case 'heart':
      return (
        <Path
          d="M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5-7.5 9.6-7.5 9.6z"
          {...common}
        />
      );

    case 'phone':
      return (
        <Path
          d="M7 3.5h2.2l1.5 3.6-1.8 1.3a11 11 0 0 0 4.7 4.7l1.3-1.8 3.6 1.5V15c0 3-2.4 4.2-4.6 3.4C10 17 6.4 13.4 4.6 8.8 3.8 6.6 5 4.3 7 3.5z"
          {...common}
        />
      );

    case 'route':
      return [
        <Path
          key="p"
          d="M12 21s6.5-6.1 6.5-11a6.5 6.5 0 1 0-13 0c0 4.9 6.5 11 6.5 11z"
          {...common}
        />,
        <Circle key="c" cx={12} cy={10} r={2.4} {...common} />,
      ];

    case 'filter':
      return [<Path key="l" d="M4 7h16M7 12h10M10 17h4" {...common} />];

    case 'plus':
      return <Path d="M12 5.5v13M5.5 12h13" {...common} />;

    case 'minus':
      return <Path d="M5.5 12h13" {...common} />;

    case 'trash':
      return [
        <Path key="b" d="M6 7.5h12l-1 12H7z" {...common} />,
        <Path key="t" d="M9.5 7.5V5h5v2.5M4.5 7.5h15" {...common} />,
      ];

    case 'cart':
      return [
        <Path key="b" d="M6 8h12l-1.2 9.5H7.2z" {...common} />,
        <Path key="h" d="M9 8V6.2a3 3 0 0 1 6 0V8" {...common} />,
      ];

    case 'receipt':
      return [
        <Path key="b" d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4z" {...common} />,
        <Path key="l" d="M9 8.5h6M9 12.5h6" {...common} />,
      ];

    case 'map':
      return [
        <Path key="m" d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" {...common} />,
        <Path key="f" d="M9 4.5v13M15 6.5v13" {...common} />,
      ];

    case 'clock':
      return [
        <Circle key="c" cx={12} cy={12} r={8.5} {...common} />,
        <Path key="h" d="M12 7.5V12l3 1.8" {...common} />,
      ];

    case 'settings':
      return [
        <Circle key="c" cx={12} cy={12} r={3} {...common} />,
        <Path
          key="g"
          d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18"
          {...common}
        />,
      ];

    case 'check':
      return <Path d="m5 12.5 4.5 4.5L19 7.5" {...common} />;

    // ── Состояния погоды (Этап 3) ────────────────────────────────────────────

    case 'sun':
      return [
        <Circle key="c" cx={12} cy={12} r={4.5} {...common} />,
        <Path
          key="r"
          d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8"
          {...common}
        />,
      ];

    case 'cloud':
      return (
        <Path
          d="M7 18h10a3.8 3.8 0 0 0 .4-7.6 5.5 5.5 0 0 0-10.3-1.7A4 4 0 0 0 7 18z"
          {...common}
        />
      );

    case 'rain':
      return [
        <Path
          key="c"
          d="M7 14h10a3.8 3.8 0 0 0 .4-7.6 5.5 5.5 0 0 0-10.3-1.7A4 4 0 0 0 7 14z"
          {...common}
        />,
        <Path key="d" d="M9 18.5v2M13 18.5v2M17 18.5v2" {...common} />,
      ];

    case 'wind':
      return (
        <Path
          d="M3 8h11a2.5 2.5 0 1 0-2.2-3.7M3 12.5h15a2.5 2.5 0 1 1-2.2 3.7M3 17h9a2 2 0 1 1-1.8 2.9"
          {...common}
        />
      );

    case 'humidity':
      return <Path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 1 1-13 0C5.5 10 12 3 12 3z" {...common} />;

    case 'pressure':
      return [
        <Circle key="c" cx={12} cy={13} r={7.5} {...common} />,
        <Path key="n" d="M12 13 15.5 9M12 6.5v1.2M6.5 13H8M12 19.5v-1.2M18 13h-1.5" {...common} />,
      ];

    case 'sunrise':
      return [
        <Circle key="s" cx={12} cy={13} r={3.2} {...common} />,
        <Path key="h" d="M3 17.5h18" {...common} />,
        <Path key="a" d="M12 3.5V6M5 8l1.6 1.6M19 8l-1.6 1.6" {...common} />,
      ];

    case 'sunset':
      return [
        <Circle key="s" cx={12} cy={13} r={3.2} {...common} />,
        <Path key="h" d="M3 17.5h18" {...common} />,
        <Path key="a" d="M12 6.5V4M5 9.6 6.6 8M19 9.6 17.4 8" {...common} />,
      ];
  }
}
