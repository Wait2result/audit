import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_SIZE, useThemeColors } from '../theme';
import { Icon } from './Icon';

/**
 * Пять звёзд (Этап 6).
 *
 * Без `onChange` — просто показ оценки. С `onChange` становится полем
 * ввода: каждая звезда получает полную область нажатия, иначе попадание
 * мимо цели ставит не ту оценку, а человек этого не замечает.
 */
export function Stars({
  value,
  size = 16,
  onChange,
}: {
  value: number;
  size?: number;
  onChange?: (rating: number) => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        const icon = (
          <Icon
            name="star"
            size={size}
            color={filled ? colors.star : colors.borderStrong}
            filled={filled}
            fillOpacity={1}
          />
        );

        if (!onChange) return <View key={star}>{icon}</View>;

        return (
          <Pressable
            key={star}
            onPress={() => onChange(star)}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === star }}
            accessibilityLabel={`Оценка ${star} из 5`}
            style={({ pressed }) => [styles.touch, pressed && styles.pressed]}
          >
            {icon}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  touch: {
    minWidth: MIN_TOUCH_SIZE,
    minHeight: MIN_TOUCH_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
