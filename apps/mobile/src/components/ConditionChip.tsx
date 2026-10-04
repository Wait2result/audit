import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';
import { Icon } from './Icon';

/**
 * Применённое условие: «Toyota», «до 1 млн ₽», «с 17:00».
 *
 * Тот же вид, что у выбранных фильтров в выдаче объявлений: бирюзовая
 * подложка и тонкая рамка. С `onRemove` — снимается нажатием (крестик);
 * без него — просто показывает, что применено (карточка умного поиска).
 */
export function ConditionChip({
  label,
  onRemove,
  muted = false,
}: {
  label: string;
  onRemove?: () => void;
  /** «ещё 2» — не условие, а счётчик: без акцента */
  muted?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const content = (
    <>
      <Text style={[styles.label, muted && styles.labelMuted]} numberOfLines={1}>
        {label}
      </Text>
      {onRemove && <Icon name="close" size={13} color={colors.primary} />}
    </>
  );

  if (!onRemove) return <View style={[styles.chip, muted && styles.chipMuted]}>{content}</View>;
  return (
    <Pressable
      onPress={onRemove}
      accessibilityRole="button"
      accessibilityLabel={`Снять условие ${label}`}
      hitSlop={8}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      minHeight: 30,
      paddingHorizontal: spacing.md - 2,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    chipMuted: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
    label: { ...typography.caption, color: colors.primary, fontWeight: '600', flexShrink: 1 },
    labelMuted: { color: colors.textMuted },
    pressed: { opacity: 0.85 },
  });
