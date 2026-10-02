import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';

/**
 * Пилюля-фильтр: «Открыто сейчас», «До 30 мин», «С доставкой» (Этап 6).
 *
 * Выбранное состояние показано заливкой, а не только цветом текста:
 * на солнце и у людей с нарушением цветовосприятия разница в оттенке
 * шрифта пропадает, а разница «залито / не залито» остаётся.
 */
export function FilterChip({
  label,
  active,
  onPress,
  disabled = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        disabled && styles.chipDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    chip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 1,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipDisabled: { opacity: 0.5 },
    pressed: { opacity: 0.75 },
    label: { ...typography.caption, fontSize: 13, fontWeight: '500', color: colors.textMuted },
    labelActive: { color: colors.textOnPrimary, fontWeight: '600' },
  });
