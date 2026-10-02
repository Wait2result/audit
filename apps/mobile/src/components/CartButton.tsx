import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCartBadge } from '../store/cart-store';
import { radius, shadow, spacing, typography, useThemeColors } from '../theme';
import { Icon } from './Icon';

/**
 * Круглая кнопка корзины в правом нижнем углу (Этап 6).
 *
 * Одна и та же на витрине и в заведении: человек привыкает к месту и
 * не ищет корзину заново на каждом экране. Число рядом — сколько позиций
 * во всех корзинах сразу; какая из них открыть первой, решает `placeId`.
 *
 * Пустая корзина кнопку не показывает: иконка без содержимого только
 * занимает место над списком.
 */
export function CartButton({ placeId }: { placeId?: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const count = useCartBadge();

  if (count === 0) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + spacing.lg }]}>
      <Pressable
        onPress={() => router.push(placeId ? { pathname: '/cart', params: { placeId } } : '/cart')}
        accessibilityRole="button"
        accessibilityLabel={`Корзина, позиций: ${count}`}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Icon name="cart" size={26} color={colors.textOnPrimary} />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const SIZE = 60;

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    wrap: { position: 'absolute', right: spacing.lg },
    button: {
      width: SIZE,
      height: SIZE,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.raised,
    },
    pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
    badge: {
      position: 'absolute',
      top: -2,
      right: -2,
      minWidth: 22,
      height: 22,
      paddingHorizontal: 5,
      borderRadius: radius.full,
      backgroundColor: colors.danger,
      borderWidth: 2,
      borderColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { ...typography.label, fontSize: 11, color: colors.textOnPrimary },
  });
