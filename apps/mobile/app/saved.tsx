import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useFavoritesSummary } from '../src/api/queries';
import { Button } from '../src/components/Button';
import { FormHeader } from '../src/components/FormHeader';
import { Icon, type IconName } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { useAuthStore } from '../src/store/auth-store';
import { useCityStore } from '../src/store/city-store';
import { radius, spacing, typography, useThemeColors } from '../src/theme';

/**
 * Профиль → Избранное: всё сохранённое одним взглядом.
 *
 * Сами объекты живут в своих разделах — объявления в «Объявлениях»,
 * заведения и блюда в «Доставке», — и здесь не повторяются: только сколько
 * чего сохранено и переход туда, где с этим удобно работать. Так одно и то
 * же объявление не встречается в двух местах с разным состоянием.
 */

interface Section {
  key: string;
  title: string;
  hint: string;
  icon: IconName;
  count: number | undefined;
  href: Href;
}

export default function SavedScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const cityId = useCityStore((s) => s.cityId);
  const summary = useFavoritesSummary(cityId, Boolean(user));

  const sections: Section[] = [
    {
      key: 'listings',
      title: 'Объявления',
      hint: 'Из раздела «Объявления»',
      icon: 'tag',
      count: summary.data?.listings,
      href: '/listings/favorites',
    },
    {
      key: 'places',
      title: 'Рестораны',
      hint: 'Из «Доставки», в вашем городе',
      icon: 'food',
      count: summary.data?.places,
      href: { pathname: '/favorites', params: { tab: 'places' } },
    },
    {
      key: 'dishes',
      title: 'Блюда',
      hint: 'Из «Доставки», в вашем городе',
      icon: 'cart',
      count: summary.data?.dishes,
      href: { pathname: '/favorites', params: { tab: 'dishes' } },
    },
  ];

  return (
    <Screen scroll>
      <FormHeader title="Избранное" description="Всё, что вы отметили сердечком, по разделам." />

      {!user ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Войдите, чтобы сохранять объявления, рестораны и блюда.
          </Text>
          <Button label="Войти" onPress={() => router.push('/auth/login?back=1')} />
        </View>
      ) : summary.isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <View style={styles.list}>
          {sections.map((section) => (
            <Pressable
              key={section.key}
              onPress={() => router.push(section.href)}
              accessibilityRole="button"
              accessibilityLabel={`${section.title}: ${section.count ?? 0}`}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.icon}>
                <Icon name={section.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.texts}>
                <Text style={styles.rowTitle}>{section.title}</Text>
                <Text style={styles.rowHint}>{section.hint}</Text>
              </View>
              <Text style={styles.count}>{section.count ?? 0}</Text>
              <Icon name="chevron-right" size={18} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    loader: { marginTop: spacing.xxl },
    list: { gap: spacing.sm, marginTop: spacing.lg },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 64,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pressed: { opacity: 0.85 },
    icon: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    texts: { flex: 1, gap: 2 },
    rowTitle: { ...typography.subheading, color: colors.text },
    rowHint: { ...typography.caption, color: colors.textMuted },
    count: { ...typography.subheading, color: colors.text },
    empty: { gap: spacing.md, marginTop: spacing.xl, alignItems: 'center' },
    emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  });
