import { useMemo } from 'react';
import type { PlaceCategoryDto } from '@dagestan/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';
import { Icon } from './Icon';
import { RemoteImage } from './RemoteImage';

/**
 * Плитка категории в горизонтальной строке витрины (Этап 6).
 *
 * Картинки — иллюстрации на прозрачном фоне, все вписаны в одинаковый
 * квадрат без обрезки. Поэтому плитка их не обрезает по кругу и ничего под
 * ними не подкладывает: любая подложка проступала бы каймой вокруг рисунка.
 *
 * Ширина считается от ширины экрана: строка должна обрываться на половине
 * следующей плитки. Обрезанная плитка — единственное, что говорит человеку,
 * что строку можно листать.
 *
 * Выбранная категория отмечается цветом подписи и чертой под ней: плитка
 * фильтрует список ниже, а не уводит на другой экран.
 */

/** Промежуток между плитками. Снаружи нужен для шага прокрутки. */
export const CATEGORY_GAP = spacing.md;

/** Сколько плиток видно целиком и какая доля следующей выглядывает. */
const VISIBLE_TILES = 4;
const PEEK = 0.45;

/**
 * Границы разумного: слишком узкая плитка ломает название посреди слова,
 * широкая — уже не компактна. Нижняя граница подобрана по самому длинному
 * односложному названию: «Традиционная» при кегле подписи занимает 67 точек.
 */
const MIN_WIDTH = 68;
const MAX_WIDTH = 86;

/** Ширина плитки под доступную ширину строки. */
export function categoryTileWidth(available: number): number {
  const step = (available + CATEGORY_GAP) / (VISIBLE_TILES + PEEK);

  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, step - CATEGORY_GAP)));
}

export function CategoryTile({
  category,
  width,
  selected = false,
  onPress,
}: {
  category: PlaceCategoryDto;
  width: number;
  selected?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const photo = category.image?.thumbnailUrl ?? category.image?.url ?? null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={category.name}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}
    >
      <RemoteImage
        uri={photo}
        style={{ width, height: width }}
        resizeMode="contain"
        containerStyle={styles.placeholder}
        fallback={<Icon name="food" size={24} color={colors.primaryDark} />}
      />

      <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={2}>
        {category.name}
      </Text>
      <View style={[styles.mark, selected && styles.markSelected]} />
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    tile: { alignItems: 'center', gap: spacing.xs },
    pressed: { opacity: 0.65 },
    // Подложка только у заглушки, пока картинки нет
    placeholder: {
      borderRadius: radius.full,
      backgroundColor: colors.tile,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      ...typography.caption,
      // Кегль подобран под ширину плитки: при 11 «Традиционная» не влезает
      // и переносится посреди слова, а это читается как поломка
      fontSize: 10,
      lineHeight: 13,
      color: colors.text,
      textAlign: 'center',
    },
    labelSelected: { color: colors.primaryDark, fontWeight: '700' },
    mark: { width: 18, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
    markSelected: { backgroundColor: colors.primary },
  });
