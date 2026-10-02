import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH_SIZE, spacing, typography, useThemeColors } from '../theme';

/**
 * Шапка экрана формы: кнопка «назад», заголовок и пояснение.
 *
 * Кнопка возврата обязательна на каждом шаге регистрации: человек должен
 * иметь возможность вернуться и исправить номер, не начиная заново
 * и не закрывая приложение.
 */
export function FormHeader({
  title,
  description,
  onBack,
  color,
  descriptionColor,
}: {
  title: string;
  description?: string;
  onBack?: () => void;
  /** Цвет заголовка и стрелки назад — переопределяется на цветных/тёмных фонах (экран погоды) */
  color?: string;
  descriptionColor?: string;
}) {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const resolvedColor = color ?? colors.text;
  const resolvedDescriptionColor = descriptionColor ?? colors.textMuted;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
  };

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel="Назад"
        hitSlop={12}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Text style={[styles.backIcon, { color: resolvedColor }]}>←</Text>
      </Pressable>

      <View style={styles.texts}>
        <Text style={[styles.title, { color: resolvedColor }]}>{title}</Text>
        {description && (
          <Text style={[styles.description, { color: resolvedDescriptionColor }]}>
            {description}
          </Text>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    wrapper: { gap: spacing.lg, paddingTop: spacing.md },
    backButton: {
      width: MIN_TOUCH_SIZE,
      height: MIN_TOUCH_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -spacing.md,
    },
    backIcon: { fontSize: 26, color: colors.text },
    pressed: { opacity: 0.6 },
    texts: { gap: spacing.sm },
    title: { ...typography.title, color: colors.text },
    description: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  });
