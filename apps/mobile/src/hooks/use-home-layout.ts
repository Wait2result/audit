import { useWindowDimensions } from 'react-native';

import { spacing } from '../theme';

/**
 * Самая широкая колонка главной. На планшете главная — та же колонка по
 * центру, а не растянутая на весь экран: плитки сохраняют пропорции фото, а не
 * превращаются в узкие полосы, и надписи остаются там, где их ждёшь.
 */
export const HOME_MAX_CONTENT_WIDTH = 720;

/** Промежуток между плитками. */
export const HOME_GAP = spacing.md;

/**
 * Пропорции плиток — как в референсе главной: верхний ряд чуть ниже
 * второго, «Попутчики» — широкая полоса. Минимальная высота — чтобы на самом
 * узком телефоне заголовок и подпись в две строки помещались целиком.
 */
const ROW_ONE = { ratio: 1.58, min: 104 };
const ROW_TWO = { ratio: 1.42, min: 116 };
const WIDE = { ratio: 3.9, min: 92 };
const BANNER = { ratio: 3.6, min: 100, max: 190 };

export interface HomeLayout {
  /** Ширина колонки вместе с полями по краям */
  outer: number;
  /** Ширина содержимого колонки (без полей) */
  inner: number;
  /** Ширина половинной плитки */
  half: number;
  rowOne: number;
  rowTwo: number;
  wide: number;
  /** Высота карточки рекламной карусели */
  banner: number;
  /** Размер заголовка плиток: 16 на узком телефоне, до 22 на планшете */
  titleSize: number;
}

/** Размеры главной в пикселях — явно, без процентов: веб иначе не растягивает фото. */
export function homeLayout(windowWidth: number): HomeLayout {
  const outer = Math.min(windowWidth, HOME_MAX_CONTENT_WIDTH + spacing.lg * 2);
  const inner = outer - spacing.lg * 2;
  const half = Math.floor((inner - HOME_GAP) / 2);
  const height = (width: number, rule: { ratio: number; min: number }) =>
    Math.max(rule.min, Math.round(width / rule.ratio));

  return {
    outer,
    inner,
    half,
    rowOne: height(half, ROW_ONE),
    rowTwo: height(half, ROW_TWO),
    wide: height(inner, WIDE),
    banner: Math.min(BANNER.max, height(inner, BANNER)),
    titleSize: Math.min(22, Math.max(16, Math.round(half / 10.5))),
  };
}

export function useHomeLayout(): HomeLayout {
  const { width } = useWindowDimensions();
  return homeLayout(width);
}
