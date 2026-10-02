import { forwardRef, useMemo } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  /** Текст ошибки. Появляется под полем и подсвечивает рамку */
  error?: string | undefined;
  /** Подсказка под полем, когда ошибки нет */
  hint?: string;
}

/**
 * Поле ввода.
 *
 * Ошибка показывается прямо под полем, а не всплывающим окном: человек
 * видит, что именно исправить, не теряя из виду само поле.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, style, ...props },
  ref,
) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hasError = Boolean(error);

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}

      <TextInput
        ref={ref}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={label}
        // Сообщаем вспомогательным технологиям, что поле заполнено неверно
        accessibilityState={{ disabled: props.editable === false }}
        {...props}
        style={[styles.input, hasError && styles.inputError, style]}
      />

      {hasError ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    wrapper: { gap: spacing.xs },
    label: { ...typography.caption, color: colors.textMuted },
    input: {
      ...typography.body,
      minHeight: 52,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    inputError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
    error: { ...typography.caption, color: colors.danger },
    hint: { ...typography.caption, color: colors.textFaint },
  });
