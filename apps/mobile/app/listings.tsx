import { ModerationStatus, plural } from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useFavoritesSummary,
  useListingCategories,
  useListings,
  useMyListings,
  type ListingFilters,
} from '../src/api/queries';
import { Icon, type IconName } from '../src/components/Icon';
import { ListingCard } from '../src/components/ListingCard';
import { ListingSearchBox } from '../src/components/ListingSearchBox';
import { Screen } from '../src/components/Screen';
import { useFavoriteActions } from '../src/hooks/use-favorite-actions';
import { useListingArea } from '../src/hooks/use-listing-area';
import { useAuthStore } from '../src/store/auth-store';
import { useCityStore } from '../src/store/city-store';
import {
  countFilters,
  useListingFilterStore,
  type ExtraListingFilters,
} from '../src/store/listing-filter-store';
import { radius, shadow, spacing, typography, useThemeColors } from '../src/theme';
import { sectionIcon } from '../src/utils/listing-icons';

/**
 * Объявления: первый экран раздела (Этап 7).
 *
 * Задача экрана — быстро увести человека дальше: в раздел, в поиск или в
 * конкретное объявление. Поэтому здесь нет ни фильтров по характеристикам,
 * ни сортировки: они появляются там, где категория уже выбрана и в них есть
 * смысл. Показывать «коробку передач» рядом с плитками разделов — значит
 * требовать решений до того, как человек выбрал, что ищет.
 *
 * Разделы идут одной горизонтальной лентой с «Все» в конце: сетка плиток
 * съедала полэкрана, а до объявлений нужно добираться быстро. Сотня
 * подкатегорий живёт на своём экране и открывается по нажатию на раздел.
 */

const EMPTY_FILTERS: ExtraListingFilters = {};

export default function ListingsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const cityId = useCityStore((s) => s.cityId);
  const { toggleListing } = useFavoriteActions();

  // Ссылка вида /listings?category=realty ведёт сразу в раздел
  const params = useLocalSearchParams<{ category?: string }>();
  useEffect(() => {
    if (params.category) {
      router.replace({ pathname: '/listings/category', params: { slug: params.category } });
    }
  }, [params.category, router]);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  // Фильтры общего каталога — свой набор, отдельный от категорий
  const extraFilters = useListingFilterStore((s) => s.byScope[''] ?? EMPTY_FILTERS);
  const activeFilterCount = countFilters(extraFilters);

  const categories = useListingCategories();

  // Счётчики на карточках быстрых переходов — только вошедшему: гостю считать нечего
  const user = useAuthStore((state) => state.user);
  const favoriteSummary = useFavoritesSummary(cityId, Boolean(user));
  const mine = useMyListings({ status: ModerationStatus.APPROVED });
  const favoriteCount = user ? favoriteSummary.data?.listings : undefined;
  const mineCount = user ? mine.data?.pages[0]?.total : undefined;

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const searching = query.length >= 2;

  // Где искать: выбранное место и радиус — одна строка над выдачей
  const area = useListingArea();
  const areaFilters = area.filters;

  const freshBefore = useMemo(
    () => new Date().toISOString(),
    [cityId, query, extraFilters, areaFilters],
  );

  const filters = useMemo<ListingFilters>(
    () => ({
      ...(searching ? { search: query } : {}),
      ...areaFilters,
      ...extraFilters,
      freshBefore,
    }),
    [searching, query, areaFilters, extraFilters, freshBefore],
  );

  const feed = useListings(cityId, filters, area.ready);
  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);

  const roots = categories.data ?? [];

  // Один блок вместо россыпи секций: ближайшее, если выбран радиус, иначе общее
  const feedTitle = searching
    ? 'Найденное'
    : area.radiusKm === null
      ? 'Популярные'
      : 'Рядом с вами';

  const header = (
    <View>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Объявления</Text>
          <Text style={styles.subtitle}>Покупайте, продавайте, находите рядом</Text>
        </View>

        <Pressable
          onPress={() => router.push('/listings/new')}
          accessibilityRole="button"
          accessibilityLabel="Разместить объявление"
          style={({ pressed }) => [styles.publishButton, pressed && styles.pressed]}
        >
          <Icon name="plus" size={16} color={colors.textOnPrimary} />
          <Text style={styles.publishLabel}>Разместить</Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchCell}>
          <ListingSearchBox
            value={search}
            onChange={setSearch}
            onSubmit={(text) => setQuery(text.trim())}
            onOpenCategory={(slug) => router.push({ pathname: '/listings/list', params: { slug } })}
            cityId={cityId}
          />
        </View>

        <Pressable
          onPress={() =>
            router.push({ pathname: '/listings/filters', params: searching ? { q: query } : {} })
          }
          accessibilityRole="button"
          accessibilityLabel={`Фильтры${activeFilterCount > 0 ? `, выбрано ${activeFilterCount}` : ''}`}
          style={({ pressed }) => [
            styles.filterButton,
            activeFilterCount > 0 && styles.filterButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Icon
            name="filter"
            size={20}
            color={activeFilterCount > 0 ? colors.textOnPrimary : colors.textMuted}
          />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <Pressable
        onPress={() => router.push('/listings/location')}
        accessibilityRole="button"
        accessibilityLabel={`Где искать: ${area.summary}`}
        style={({ pressed }) => [styles.areaRow, pressed && styles.pressed]}
      >
        <Icon name="location" size={16} color={colors.primary} />
        <Text style={styles.areaLabel} numberOfLines={1}>
          {area.radiusKm === null ? 'Весь Дагестан' : `${area.label} · ${area.radiusKm} км`}
        </Text>
        <Text style={styles.areaChange}>Изменить</Text>
      </Pressable>

      <View style={styles.shortcuts}>
        <Shortcut
          icon="heart"
          label="Избранное"
          count={favoriteCount}
          onPress={() => router.push('/listings/favorites')}
        />
        <Shortcut
          icon="tag"
          label="Мои объявления"
          count={mineCount}
          onPress={() => router.push('/my-listings')}
        />
      </View>

      {!searching && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesScroll}
          contentContainerStyle={styles.categoriesContent}
          accessibilityLabel="Категории"
        >
          {roots.map((section) => (
            <SectionButton
              key={section.id}
              icon={sectionIcon(section.slug)}
              label={section.name}
              onPress={() =>
                router.push({ pathname: '/listings/category', params: { slug: section.slug } })
              }
            />
          ))}
          <SectionButton
            icon="grid"
            label="Все"
            onPress={() => router.push('/listings/categories')}
          />
        </ScrollView>
      )}

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>{feedTitle}</Text>

        {!searching && (
          <Pressable
            onPress={() => router.push('/listings/list')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.allLink, pressed && styles.pressed]}
          >
            <Text style={styles.allLinkLabel}>Все объявления</Text>
            <Icon name="chevron-right" size={14} color={colors.primary} />
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(listing) => listing.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            onOpen={() => router.push({ pathname: '/listings/[id]', params: { id: item.id } })}
            onToggleFavorite={() => toggleListing(item)}
          />
        )}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          feed.isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {searching
                  ? 'Ничего не нашлось. Попробуйте другое слово.'
                  : area.radiusKm === null
                    ? 'Пока нет объявлений. Разместите первое — его увидят все.'
                    : `Рядом с местом «${area.label}» в радиусе ${area.radiusKm} км объявлений нет. Увеличьте радиус или разместите первое.`}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : null
        }
      />
    </Screen>
  );
}

/** Плитка раздела. Иконка — умолчание по коду раздела, см. listing-icons. */
function SectionButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.categoryCell}
    >
      <View style={styles.categoryIcon}>
        <Icon name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={styles.categoryLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Компактная карточка быстрого перехода: иконка, название и сколько внутри. */
function Shortcut({
  icon,
  label,
  count,
  onPress,
}: {
  icon: IconName;
  label: string;
  count: number | undefined;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        count === undefined
          ? label
          : `${label}: ${count} ${plural(count, 'объявление', 'объявления', 'объявлений')}`
      }
      style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}
    >
      <View style={styles.shortcutIcon}>
        <Icon name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.shortcutText}>
        <Text style={styles.shortcutLabel} numberOfLines={1}>
          {label}
        </Text>
        {count !== undefined && <Text style={styles.shortcutCount}>{count}</Text>}
      </View>
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
    row: { gap: spacing.md, alignItems: 'stretch' },
    loader: { marginVertical: spacing.xl },

    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    titleBlock: { flexShrink: 1 },
    title: { ...typography.title, color: colors.text },
    subtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

    publishButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      ...shadow.raised,
    },
    publishLabel: { ...typography.body, fontWeight: '600', color: colors.textOnPrimary },
    pressed: { opacity: 0.85 },

    // Кнопка фильтров стоит вровень с полем ввода, а подсказки под полем
    // растягивают только левую ячейку
    areaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      maxWidth: '100%',
      // Отдельно от поиска: это другая настройка — где, а не что
      marginTop: spacing.md,
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: spacing.md,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    shortcuts: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
    shortcut: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 52,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    shortcutIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    shortcutText: { flex: 1, minWidth: 0 },
    shortcutLabel: { ...typography.caption, color: colors.text, fontWeight: '600' },
    shortcutCount: { ...typography.label, color: colors.textMuted },
    areaLabel: { ...typography.body, color: colors.text, fontWeight: '600', flexShrink: 1 },
    areaChange: { ...typography.caption, color: colors.primary },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    searchCell: { flex: 1 },

    filterButton: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: radius.full,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadgeText: { ...typography.label, color: colors.textOnPrimary },

    // Лента выходит за поля экрана: так видно, что прокручивается дальше
    categoriesScroll: { marginHorizontal: -spacing.lg },
    categoriesContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    categoryCell: { width: 88, alignItems: 'center', gap: 6 },
    categoryIcon: {
      width: 64,
      height: 64,
      borderRadius: radius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryLabel: {
      ...typography.caption,
      color: colors.text,
      textAlign: 'center',
      fontSize: 12,
      lineHeight: 15,
    },

    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    sectionTitle: { ...typography.heading, color: colors.text },
    allLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    allLinkLabel: { ...typography.caption, color: colors.primary },

    empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
    emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  });
