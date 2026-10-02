import { useEffect, useRef, useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastStore } from '../store/toast-store';
import { radius, shadow, spacing, typography, useThemeColors } from '../theme';

/**
 * Место, где показываются подсказки (Этап 6). Ставится один раз в корне
 * приложения и лежит поверх любого экрана.
 *
 * Поднята выше нижнего края: на экранах доставки там висит полоса корзины,
 * и подсказка, севшая на неё, закрывала бы кнопку «Оформить».
 */
export function ToastHost() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toast = useToastStore((s) => s.toast);
  const hide = useToastStore((s) => s.hide);
  const insets = useSafeAreaInsets();

  const opacity = useRef(new Animated.Value(0)).current;
  const lastId = useRef<number | null>(null);

  useEffect(() => {
    if (toast && toast.id !== lastId.current) {
      lastId.current = toast.id;
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    }
  }, [toast, opacity]);

  if (!toast) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 92, opacity }]}
    >
      <Pressable
        onPress={hide}
        accessibilityRole="alert"
        accessibilityLabel={toast.message}
        style={styles.toast}
      >
        <Text style={styles.message} numberOfLines={2}>
          {toast.message}
        </Text>

        {toast.actionLabel && toast.onAction && (
          <Pressable
            onPress={() => {
              hide();
              toast.onAction?.();
            }}
            accessibilityRole="button"
            hitSlop={10}
          >
            <Text style={styles.action}>{toast.actionLabel}</Text>
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center' },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      maxWidth: 420,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.ink,
      ...shadow.raised,
    },
    message: { ...typography.body, fontSize: 14, color: colors.textOnDark, flexShrink: 1 },
    action: { ...typography.subheading, fontSize: 14, color: colors.primaryLight },
  });
