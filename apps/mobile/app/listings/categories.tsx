import type { ListingCategoryDto } from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useListingCategories } from '../../src/api/queries';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';
import { leafCategories } from '../../src/utils/listing-category-lookup';
import { sectionIcon, subcategoryIcon } from '../../src/utils/listing-icons';

/**
 * Все категории: полный каталог одним экраном.
 *
 * На первом экране разделы идут горизонтальной лентой, и чтобы не искать
 * нужный среди десятка плиток, сюда ведёт «Все». Поиск работает сразу по
 * разделам и подкатегориям: «шины» найдёт «Транспорт → Шины и диски», не
 * заставляя помнить, в каком разделе они лежат.
 */
export default function ListingAllCategoriesScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  const [search, setSearch] = useState('');
  const categories = useListingCategories();

  const query = search.trim().toLowerCase();
  const roots = categories.data ?? [];

  // Подкатегории, подходящие под запрос, вместе с названием раздела
  // Поиск — по всем подкатегориям, в том числе внутри основных типов:
  // «запчасти» найдёт и «Автомобили → Запчасти», и «Телефоны → Запчасти»
  const found = useMemo(
    () =>
      query.length < 2
        ? []
        : leafCategories(roots)
            .filter(
              ({ leaf, path }) =>
                path.slice(1).some((node) => node.name.toLowerCase().includes(query)) ||
                leaf.name.toLowerCase().includes(query),
            )
            .map(({ leaf, path }) => ({
              section: path[0]!,
              child: leaf,
              hint: path
                .slice(0, -1)
                .map((node) => node.name)
                .join(' → '),
            })),
    [roots, query],
  );

  // Ярлык («Посуточная аренда») — не отдельная категория, а фильтр внутри
  // другой, поэтому ведёт в раздел, где этот фильтр ставится
  const openChild = (section: ListingCategoryDto, child: ListingCategoryDto) => {
    if (child.shortcut) {
      router.push({ pathname: '/listings/category', params: { slug: section.slug } });
      return;
    }
    router.push({ pathname: '/listings/list', params: { slug: child.slug } });
  };

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
        <Text style={styles.title}>Все категории</Text>
      </View>

      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.textFaint} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Найти категорию"
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          accessibilityLabel="Найти категорию"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Очистить">
            <Icon name="close" size={16} color={colors.textFaint} />
          </Pressable>
        )}
      </View>

      <View style={styles.list}>
        {query.length >= 2
          ? found.map(({ section, child, hint }) => (
              <Pressable
                key={child.id}
                onPress={() => openChild(section, child)}
                accessibilityRole="button"
                accessibilityLabel={`${hint}, ${child.name}`}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.rowIcon}>
                  <Icon name={subcategoryIcon(child.slug)} size={20} color={colors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{child.name}</Text>
                  <Text style={styles.rowHint}>{hint}</Text>
                </View>
                <Icon name="chevron-right" size={18} color={colors.textFaint} />
              </Pressable>
            ))
          : roots.map((section) => (
              <Pressable
                key={section.id}
                onPress={() =>
                  router.push({ pathname: '/listings/category', params: { slug: section.slug } })
                }
                accessibilityRole="button"
                accessibilityLabel={section.name}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.rowIcon}>
                  <Icon name={sectionIcon(section.slug)} size={22} color={colors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{section.name}</Text>
                  <Text style={styles.rowHint} numberOfLines={1}>
                    {section.children
                      .slice(0, 3)
                      .map((child) => child.name)
                      .join(', ')}
                    {section.children.length > 3 ? '…' : ''}
                  </Text>
                </View>
                <Icon name="chevron-right" size={18} color={colors.textFaint} />
              </Pressable>
            ))}
      </View>

      {query.length >= 2 && found.length === 0 && (
        <Text style={styles.empty}>Такой категории нет. Попробуйте другое слово.</Text>
      )}
    </Screen>
  );
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
      minHeight: 60,
    },
    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    rowText: { flex: 1, minWidth: 0 },
    rowLabel: { ...typography.body, color: colors.text, fontWeight: '600' },
    rowHint: { ...typography.caption, color: colors.textMuted },

    empty: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.xxl,
    },
  });
