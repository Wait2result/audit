import type { ListingCategoryDto } from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useListingCategories } from '../../src/api/queries';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { useListingFilterStore } from '../../src/store/listing-filter-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';
import { subcategoryIcon } from '../../src/utils/listing-icons';

/**
 * Подкатегории раздела (Этап 7).
 *
 * Отдельный экран, а не длинный список на главной: в «Услугах» четырнадцать
 * подкатегорий, в «Доме и ремонте» одиннадцать, и вывалить сотню строк сразу
 * — значит заставить человека читать каталог вместо того, чтобы искать вещь.
 *
 * Поиск по подкатегориям здесь же: он короче, чем листать список глазами.
 */
export default function ListingCategoryScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const [search, setSearch] = useState('');
  const categories = useListingCategories();
  const setFilters = useListingFilterStore((s) => s.set);
  const filtersFor = useListingFilterStore((s) => s.filtersFor);

  const section = (categories.data ?? []).find((item) => item.slug === slug) ?? null;
  const children = filterChildren(section, search);

  if (categories.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/listings'))}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={12}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Icon name="chevron-left" size={24} color={colors.text} />
        </Pressable>

        <Text style={styles.title}>{section?.name ?? 'Категория'}</Text>
      </View>

      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.textFaint} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск по разделу"
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          accessibilityLabel="Поиск по разделу"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Очистить">
            <Icon name="close" size={16} color={colors.textFaint} />
          </Pressable>
        )}
      </View>

      {/* Весь раздел целиком — первой строкой: человек мог зайти сюда, чтобы
          посмотреть всё, а не выбирать подкатегорию */}
      {section && (
        <Pressable
          onPress={() =>
            router.push({ pathname: '/listings/list', params: { slug: section.slug } })
          }
          accessibilityRole="button"
          style={({ pressed }) => [styles.row, styles.rowAll, pressed && styles.pressed]}
        >
          <View style={styles.rowIcon}>
            <Icon name="grid" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.rowLabel, styles.rowLabelAll]}>Все объявления раздела</Text>
          <Icon name="chevron-right" size={18} color={colors.textFaint} />
        </Pressable>
      )}

      <View style={styles.list}>
        {children.map((child) => (
          <Pressable
            key={child.id}
            onPress={() => {
              // Ярлык — это другая категория с готовым фильтром: «Посуточная
              // аренда» открывает квартиры со сделкой «Снять посуточно»
              if (child.shortcut) {
                const target = child.shortcut.category;
                const current = filtersFor(target);
                setFilters(target, {
                  ...current,
                  transactionType: child.shortcut.transactionType,
                  rentPeriod: child.shortcut.rentPeriod,
                  ...(child.shortcut.attributes
                    ? { attributes: { ...current.attributes, ...child.shortcut.attributes } }
                    : {}),
                });
                router.push({ pathname: '/listings/list', params: { slug: target } });
                return;
              }
              router.push({ pathname: '/listings/list', params: { slug: child.slug } });
            }}
            accessibilityRole="button"
            accessibilityLabel={child.name}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.rowIcon}>
              <Icon name={subcategoryIcon(child.slug)} size={20} color={colors.textMuted} />
            </View>
            <Text style={styles.rowLabel}>{child.name}</Text>
            <Icon name="chevron-right" size={18} color={colors.textFaint} />
          </Pressable>
        ))}
      </View>

      {children.length === 0 && search.length > 0 && (
        <Text style={styles.empty}>Ничего не нашлось. Попробуйте другое слово.</Text>
      )}
    </Screen>
  );
}

function filterChildren(section: ListingCategoryDto | null, search: string): ListingCategoryDto[] {
  if (!section) return [];
  const query = search.trim().toLowerCase();
  if (query.length === 0) return section.children;
  return section.children.filter((child) => child.name.toLowerCase().includes(query));
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    loader: { marginTop: spacing.xxxl },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    title: { ...typography.heading, color: colors.text },
    pressed: { opacity: 0.85 },

    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      minHeight: 46,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.lg,
    },
    searchInput: { flex: 1, ...typography.body, color: colors.text },

    list: { gap: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 56,
    },
    rowAll: { marginBottom: spacing.sm, borderColor: colors.primary },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    rowLabel: { ...typography.body, color: colors.text, flex: 1 },
    rowLabelAll: { color: colors.primary, fontWeight: '600' },

    empty: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.xxl,
    },
  });
