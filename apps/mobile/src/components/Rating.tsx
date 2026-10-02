import { useMemo } from 'react';
import { plural } from '@dagestan/shared';
import type { PlaceRatingDto } from '@dagestan/shared';
import { StyleSheet, Text, View } from 'react-native';

import { typography, useThemeColors } from '../theme';
import { Icon } from './Icon';

/**
 * Оценка заведения (Этап 6).
 *
 * Когда отзывов нет, показывается «Нет оценок», а не «0.0»: ноль читается
 * как «очень плохо», хотя означает «никто не оценивал». Разница для нового
 * заведения существенная.
 */
export function Rating({
  rating,
  size = 'small',
  withCount = true,
}: {
  rating: PlaceRatingDto;
  size?: 'small' | 'large';
  withCount?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const large = size === 'large';

  if (rating.count === 0) {
    return <Text style={[styles.empty, large && styles.emptyLarge]}>Нет оценок</Text>;
  }

  return (
    <View style={styles.row}>
      <Icon name="star" size={large ? 18 : 14} color={colors.star} filled fillOpacity={1} />
      <Text style={[styles.value, large && styles.valueLarge]}>{rating.average.toFixed(1)}</Text>
      {withCount && (
        <Text style={[styles.count, large && styles.countLarge]}>
          {large
            ? `(${rating.count} ${plural(rating.count, 'отзыв', 'отзыва', 'отзывов')})`
            : `(${rating.count})`}
        </Text>
      )}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    value: { ...typography.subheading, fontSize: 13, color: colors.text },
    valueLarge: { fontSize: 16 },
    count: { ...typography.caption, fontSize: 12, color: colors.textFaint },
    countLarge: { fontSize: 14, color: colors.textMuted },
    empty: { ...typography.caption, fontSize: 12, color: colors.textFaint },
    emptyLarge: { fontSize: 14 },
  });
