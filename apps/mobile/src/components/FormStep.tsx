import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';

/**
 * Один шаг пошаговой формы.
 *
 *   • заполненный — одна строка «Что вы делаете · Продам ✓»; нажатие
 *     открывает его снова, чтобы поменять;
 *   • текущий — открыт целиком, с кнопкой «Далее» там, где выбор не
 *     заканчивается сам (текст, число, несколько вариантов);
 *   • следующие шаги не рисуются вовсе — их показывает форма, когда до них
 *     дошла очередь.
 */
export function FormStep({
  title,
  summary,
  state,
  onEdit,
  next,
  onLayout,
  children,
}: {
  title: string;
  /** Что выбрано — для свёрнутого шага: строка или подпись из справочника */
  summary: ReactNode;
  state: 'done' | 'open';
  onEdit: () => void;
  /** Кнопка под шагом: «Далее», «Пропустить», «Готово». Нет — шаг закрывается выбором */
  next?: { label: string; enabled: boolean; onPress: () => void } | null;
  onLayout?: (event: LayoutChangeEvent) => void;
  children?: ReactNode;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (state === 'done') {
    return (
      <Pressable
        onPress={onEdit}
        onLayout={onLayout}
        accessibilityRole="button"
        accessibilityLabel={
          typeof summary === 'string' ? `${title}: ${summary}. Изменить` : `${title}. Изменить`
        }
        style={({ pressed }) => [styles.done, pressed && styles.pressed]}
      >
        <View style={styles.check}>
          <Icon name="check" size={14} color={colors.textOnPrimary} />
        </View>
        <View style={styles.doneTexts}>
          <Text style={styles.doneTitle}>{title}</Text>
          <Text style={styles.doneSummary} numberOfLines={2}>
            {summary}
          </Text>
        </View>
        <Text style={styles.change}>Изменить</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.open} onLayout={onLayout} accessibilityLabel={`Шаг: ${title}`}>
      <Text style={styles.openTitle}>{title}</Text>
      {children}
      {next && (
        <Button
          label={next.label}
          onPress={next.onPress}
          disabled={!next.enabled}
          variant={next.enabled ? 'primary' : 'secondary'}
          fullWidth
        />
      )}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    pressed: { opacity: 0.85 },
    done: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 52,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    check: {
      width: 22,
      height: 22,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    doneTexts: { flex: 1, gap: 2 },
    doneTitle: { ...typography.caption, color: colors.textMuted },
    doneSummary: { ...typography.body, color: colors.text },
    change: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    open: {
      gap: spacing.lg,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
      marginBottom: spacing.lg,
    },
    openTitle: { ...typography.subheading, color: colors.text },
  });
