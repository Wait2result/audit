import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { MIN_TOUCH_SIZE, radius, spacing, typography, useThemeColors } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  /** Растянуть на всю ширину */
  fullWidth?: boolean;
  /** Подпись в одну строку (без переноса): для кнопок в ряду с соседом */
  singleLine?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Подпись для незрячих, если текста кнопки недостаточно */
  accessibilityLabel?: string;
}

/**
 * Кнопка.
 *
 * Во время выполнения действия кнопка блокируется и показывает индикатор.
 * Это не украшение: без блокировки нетерпеливое двойное нажатие создаёт
 * два заказа или два объявления вместо одного.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  fullWidth = true,
  singleLine = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const colors = useThemeColors();
  const variantStyles = useMemo(() => buildVariantStyles(colors), [colors]);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'md' ? styles.sizeMd : styles.sizeLg,
        variantStyles[variant].container,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'danger' ? colors.textOnPrimary : colors.primary
          }
          size="small"
        />
      ) : (
        <View style={styles.content}>
          <Text
            style={[styles.label, variantStyles[variant].label]}
            numberOfLines={singleLine ? 1 : undefined}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// Не зависит от темы: ни один из этих стилей не задаёт цвет — цвета
// отдельно в buildVariantStyles ниже
const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  sizeMd: { paddingVertical: spacing.sm, minHeight: MIN_TOUCH_SIZE },
  sizeLg: { paddingVertical: spacing.md, minHeight: 52 },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '100%' },
  label: { ...typography.subheading },
  // Лёгкое затемнение вместо анимации: отклик должен быть мгновенным
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});

/** Цвета по варианту кнопки — зависят от темы, поэтому пересчитываются, а не
 *  лежат готовым объектом на уровне модуля (см. `useThemeColors` в теме). */
function buildVariantStyles(
  colors: ReturnType<typeof useThemeColors>,
): Record<Variant, { container: ViewStyle; label: { color: string } }> {
  return {
    primary: {
      container: { backgroundColor: colors.primary },
      label: { color: colors.textOnPrimary },
    },
    secondary: {
      container: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderStrong,
      },
      label: { color: colors.text },
    },
    ghost: {
      container: { backgroundColor: 'transparent' },
      label: { color: colors.primary },
    },
    danger: {
      container: { backgroundColor: colors.danger },
      label: { color: colors.textOnPrimary },
    },
  };
}
