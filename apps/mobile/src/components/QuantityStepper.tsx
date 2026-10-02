import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';
import { Icon } from './Icon';

/**
 * Счётчик «− 1 +» (Этап 6).
 *
 * `min = 0` превращает минус в удаление строки корзины: отдельная корзина
 * без кнопки «убрать» заставляет уменьшать количество до нуля и гадать,
 * исчезнет строка или останется с нулём.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  compact = false,
  disabled = false,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  compact?: boolean;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const size = compact ? 28 : 34;

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Pressable
        onPress={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        accessibilityRole="button"
        accessibilityLabel="Убрать одну"
        style={({ pressed }) => [
          styles.button,
          { width: size, height: size },
          (disabled || value <= min) && styles.buttonOff,
          pressed && styles.pressed,
        ]}
      >
        <Icon name="minus" size={compact ? 14 : 16} color={colors.text} />
      </Pressable>

      <Text style={[styles.value, compact && styles.valueCompact]}>{value}</Text>

      <Pressable
        onPress={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        accessibilityRole="button"
        accessibilityLabel="Добавить одну"
        style={({ pressed }) => [
          styles.button,
          { width: size, height: size },
          (disabled || value >= max) && styles.buttonOff,
          pressed && styles.pressed,
        ]}
      >
        <Icon name="plus" size={compact ? 14 : 16} color={colors.text} />
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowCompact: { gap: spacing.xs },
    button: {
      borderRadius: radius.full,
      backgroundColor: colors.tile,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonOff: { opacity: 0.4 },
    pressed: { opacity: 0.6 },
    value: { ...typography.subheading, color: colors.text, minWidth: 24, textAlign: 'center' },
    valueCompact: { fontSize: 14, minWidth: 20 },
  });
