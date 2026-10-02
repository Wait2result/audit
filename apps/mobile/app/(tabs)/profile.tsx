import { useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackground } from '../../src/components/AppBackground';
import { Button } from '../../src/components/Button';
import { Icon, type IconName } from '../../src/components/Icon';
import { useMyPlaces } from '../../src/api/queries';
import { useAuthStore } from '../../src/store/auth-store';
import { useCityStore } from '../../src/store/city-store';
import { useThemeStore, type ThemeMode } from '../../src/store/theme-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';
import { confirmAsync } from '../../src/utils/confirm';

/**
 * Профиль (пункты 9 и 23 ТЗ).
 *
 * У гостя и у вошедшего пользователя это один экран с разным содержимым,
 * а не два разных. Гостю показывается то же меню, но пункты, требующие
 * аккаунта, ведут на регистрацию — так человек видит, что он получит,
 * а не упирается в пустую страницу с одной кнопкой «Войти».
 */

interface MenuItem {
  key: string;
  title: string;
  icon: IconName;
  /** Требует аккаунта */
  needsAuth: boolean;
}

const MENU: MenuItem[] = [
  { key: 'favorites', title: 'Избранное', icon: 'heart', needsAuth: true },
  { key: 'orders', title: 'Мои заказы', icon: 'food', needsAuth: true },
  { key: 'rides', title: 'Мои поездки', icon: 'rides', needsAuth: true },
  { key: 'listings', title: 'Мои объявления', icon: 'realty', needsAuth: true },
];

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Светлая' },
  { mode: 'dark', label: 'Тёмная' },
  { mode: 'system', label: 'Системная' },
];

export default function ProfileScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  // Раздел заведения видят только те, кому выдали доступ: у остальных
  // список пустой, и пункт меню не появляется
  const { data: myPlaces } = useMyPlaces(Boolean(user));
  const { cityName } = useCityStore();
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);

  const [isSigningOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    // Подтверждение обязательно: случайный выход означает повторный ввод
    // пароля, а если человек его не помнит — ещё и SMS
    const confirmed = await confirmAsync(
      'Выйти из аккаунта?',
      'Для входа снова понадобится пароль.',
      { confirmLabel: 'Выйти', destructive: true },
    );
    if (!confirmed) return;

    setSigningOut(true);
    await signOut().finally(() => setSigningOut(false));
  };

  const handleMenuPress = (item: MenuItem) => {
    if (item.needsAuth && !user) {
      router.push('/auth/phone');
      return;
    }
    if (item.key === 'orders') {
      router.push('/orders');
      return;
    }
    if (item.key === 'favorites') {
      // Сводка по всем разделам; сами объекты — в своих разделах
      router.push('/saved');
      return;
    }
    if (item.key === 'listings') {
      router.push('/my-listings');
      return;
    }

    router.push(`/coming-soon?title=${encodeURIComponent(item.title)}`);
  };

  return (
    <View style={styles.root}>
      <AppBackground />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Профиль</Text>

        {user ? (
          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user.firstName.charAt(0).toUpperCase()}</Text>
            </View>

            <View style={styles.userTexts}>
              <Text style={styles.userName}>
                {[user.firstName, user.lastName].filter(Boolean).join(' ')}
              </Text>
              <Text style={styles.userPhone}>{user.phone}</Text>
            </View>

            {user.isVerified && (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>Проверен</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.guestCard}>
            <Text style={styles.guestTitle}>Вы не вошли</Text>
            <Text style={styles.guestText}>
              Смотреть приложение можно и так. Аккаунт нужен, чтобы заказывать, публиковать
              объявления и сохранять избранное.
            </Text>
            <View style={styles.guestActions}>
              <Button label="Создать аккаунт" onPress={() => router.push('/auth/phone')} />
              <Button
                label="Войти"
                variant="secondary"
                onPress={() => router.push('/auth/login')}
              />
            </View>
          </View>
        )}

        {myPlaces && myPlaces.length > 0 && (
          <View style={styles.section}>
            <Pressable
              onPress={() =>
                router.push(
                  myPlaces.length === 1
                    ? { pathname: '/my-place/[id]', params: { id: myPlaces[0]!.id } }
                    : '/my-place',
                )
              }
              accessibilityRole="button"
              accessibilityLabel="Моё заведение"
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
            >
              <Icon name="food" size={22} color={colors.primary} />
              <Text style={styles.menuTitle}>
                {myPlaces.length === 1 ? myPlaces[0]!.name : 'Мои заведения'}
              </Text>
              <Text style={styles.menuValue}>меню и заказы</Text>
              <Icon name="chevron-right" size={18} color={colors.textFaint} />
            </Pressable>
          </View>
        )}

        <View style={styles.section}>
          {MENU.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => handleMenuPress(item)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
            >
              <Icon name={item.icon} size={22} color={colors.textMuted} />
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Icon name="chevron-right" size={18} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <Pressable
            onPress={() => router.push('/city-picker')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <Icon name="location" size={22} color={colors.textMuted} />
            <Text style={styles.menuTitle}>Город</Text>
            <Text style={styles.menuValue}>{cityName ?? 'не выбран'}</Text>
            <Icon name="chevron-right" size={18} color={colors.textFaint} />
          </Pressable>

          <View style={styles.themeRow}>
            <Icon name="sun" size={22} color={colors.textMuted} />
            <Text style={styles.menuTitle}>Тема</Text>
            <View style={styles.themeSwitch}>
              {THEME_OPTIONS.map((option) => {
                const active = themeMode === option.mode;
                return (
                  <Pressable
                    key={option.mode}
                    onPress={() => void setThemeMode(option.mode)}
                    accessibilityRole="button"
                    accessibilityLabel={`Тема: ${option.label}`}
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.themeOption,
                      active && styles.themeOptionActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.themeOptionText, active && styles.themeOptionTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {user && (
          <View style={styles.signOut}>
            <Button
              label="Выйти из аккаунта"
              variant="secondary"
              onPress={() => void handleSignOut()}
              loading={isSigningOut}
            />
          </View>
        )}

        <Text style={styles.version}>Версия 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },

    title: { ...typography.title, color: colors.text },

    userCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { ...typography.title, color: colors.textOnPrimary },
    userTexts: { flex: 1, gap: 2 },
    userName: { ...typography.subheading, color: colors.text },
    userPhone: { ...typography.caption, color: colors.textMuted },
    verifiedBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.sm,
      backgroundColor: colors.primarySoft,
    },
    verifiedText: { ...typography.label, color: colors.primaryDark },

    guestCard: {
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    guestTitle: { ...typography.subheading, color: colors.text },
    guestText: { ...typography.caption, color: colors.textMuted, lineHeight: 19 },
    guestActions: { gap: spacing.sm, marginTop: spacing.xs },

    section: {
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    menuTitle: { ...typography.body, color: colors.text, flex: 1 },
    menuValue: { ...typography.caption, color: colors.textMuted },

    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      paddingHorizontal: spacing.lg,
    },
    themeSwitch: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.full,
      padding: 3,
    },
    themeOption: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radius.full,
    },
    themeOptionActive: { backgroundColor: colors.primary },
    themeOptionText: { ...typography.label, color: colors.textMuted, fontSize: 11 },
    themeOptionTextActive: { color: colors.textOnPrimary },

    signOut: { marginTop: spacing.sm },
    version: { ...typography.caption, color: colors.textFaint, textAlign: 'center' },

    pressed: { opacity: 0.7 },
  });
