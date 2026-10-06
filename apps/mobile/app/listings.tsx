import {
  ModerationStatus,
  plural,
  resolveCardLayout,
  type ListingCategoryDto,
} from '@dagestan/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
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
import { ListingSmartPanel, useListingSmartSearch } from '../src/components/ListingSmartSearch';
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
import { sectionIcon, subcategoryIcon } from '../src/utils/listing-icons';

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
  // Путь по дереву категорий: [] — «Все», [Транспорт], [Транспорт, Автомобили].
  // Лента категорий показывает детей последнего узла — каталог «проваливается»
  // внутрь, а не открывает отдельный экран «Подкатегории». Лента объявлений —
  // по последнему узлу вместе со всем, что под ним
  const [trail, setTrail] = useState<ListingCategoryDto[]>([]);
  const section = trail.at(-1)?.slug ?? null;
  /** На уровень выше: «Запчасти ← Автомобили ← Транспорт ← Все». */
  const goUp = useCallback(() => setTrail((current) => current.slice(0, -1)), []);

  // Фильтры хранятся по категории: у общей ленты свой набор, у раздела свой
  const scope = section ?? '';
  const extraFilters = useListingFilterStore((s) => s.byScope[scope] ?? EMPTY_FILTERS);
  const activeFilterCount = countFilters(extraFilters);

  const categories = useListingCategories();

  // Счётчики на карточках быстрых переходов — только вошедшему: гостю считать нечего
  const user = useAuthStore((state) => state.user);
  const favoriteSummary = useFavoritesSummary(cityId, Boolean(user));
  const mine = useMyListings({ status: ModerationStatus.APPROVED });
  const favoriteCount = user ? favoriteSummary.data?.listings : undefined;
  const mineCount = user ? mine.data?.pages[0]?.total : undefined;

  // Фраза уходит в умный поиск по «Найти», а не на каждую букву: «хочу тойота
  // суксид» — это марка и модель, а не слова для поиска по буквам. Обычный
  // поиск по словам остаётся запасным путём, если умный не ответил
  const smart = useListingSmartSearch({
    category: section,
    onListings: (target) =>
      router.push({ pathname: '/listings/list', params: { ...target, smart: '1' } }),
    onFallback: (text) => setQuery(text),
  });

  const submitSearch = (text: string) => {
    const clean = text.trim();
    if (!clean) {
      setQuery('');
      smart.reset();
      return;
    }
    setQuery('');
    void smart.submit(clean);
  };

  const searching = query.length >= 2;

  // Где искать: выбранное место и радиус — одна строка над выдачей
  const area = useListingArea();
  const areaFilters = area.filters;

  const freshBefore = useMemo(
    () => new Date().toISOString(),
    [cityId, query, section, extraFilters, areaFilters],
  );

  const filters = useMemo<ListingFilters>(
    () => ({
      ...(section ? { category: section } : {}),
      ...(searching ? { search: query } : {}),
      ...areaFilters,
      ...extraFilters,
      freshBefore,
    }),
    [section, searching, query, areaFilters, extraFilters, freshBefore],
  );

  const feed = useListings(cityId, filters, area.ready);
  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);
  const total = feed.data?.pages[0]?.total;

  const roots = categories.data ?? [];
  const selected = trail.at(-1) ?? null;
  // Следующий уровень того же списка: дети выбранного узла (без ярлыков-ссылок)
  const level = selected
    ? selected.children.filter((child) => !child.shortcut && !child.deprecatedToSlug)
    : roots;
  const crumbs = trailLabel(trail);

  // Системная «Назад» на Android тоже поднимается по уровням каталога, а не
  // уводит с экрана, пока выбран раздел
  useFocusEffect(
    useCallback(() => {
      if (trail.length === 0) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        goUp();
        return true;
      });
      return () => subscription.remove();
    }, [trail.length, goUp]),
  );

  /** Нажатие в ленте категорий: узел с детьми — глубже, конечная — её объявления. */
  const openNode = (node: ListingCategoryDto) => {
    if (node.children.length > 0) {
      setTrail((current) => [...current, node]);
      return;
    }
    router.push({ pathname: '/listings/list', params: { slug: node.slug } });
  };
  // Квартиры и вакансии читают, а не разглядывают — им нужен список
  const layout = resolveCardLayout(selected);

  // Один блок вместо россыпи секций: ближайшее, если выбран радиус, иначе общее
  const feedTitle = searching
    ? 'Найденное'
    : selected
      ? selected.name
      : area.radiusKm === null
        ? 'Популярные'
        : 'Рядом с вами';

  const header = (
    <View>
      <View style={styles.topRow}>
        {/* Явный выход в главное меню: свайп назад работает, но его знают не все */}
        <Pressable
          // Внутри каталога — на уровень выше, с первого уровня — в главное меню
          onPress={() =>
            trail.length > 0 ? goUp() : router.canGoBack() ? router.back() : router.replace('/')
          }
          accessibilityRole="button"
          accessibilityLabel={trail.length > 0 ? `Назад: ${trail.at(-2)?.name ?? 'Все'}` : 'Назад'}
          hitSlop={12}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Icon name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Объявления</Text>
          {total !== undefined && (
            <Text style={styles.count}>
              {total.toLocaleString('ru-RU')}{' '}
              {plural(total, 'объявление', 'объявления', 'объявлений')}
            </Text>
          )}
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
            onSubmit={submitSearch}
            onOpenCategory={(slug) => router.push({ pathname: '/listings/list', params: { slug } })}
            cityId={cityId}
            busy={smart.busy}
          />
        </View>
      </View>

      {smart.visible && (
        <View style={styles.smartPanel}>
          <ListingSmartPanel
            controller={smart}
            onOpenCategory={(slug) => router.push({ pathname: '/listings/list', params: { slug } })}
          />
        </View>
      )}

      {/* Где искать и фильтры — один ряд */}
      <View style={styles.controls}>
        <Pressable
          onPress={() => router.push('/listings/location')}
          accessibilityRole="button"
          accessibilityLabel={`Где искать: ${area.summary}`}
          style={({ pressed }) => [styles.pill, styles.areaPill, pressed && styles.pressed]}
        >
          <Icon name="location" size={16} color={colors.primary} />
          <Text style={styles.pillLabel} numberOfLines={1}>
            {area.radiusKm === null ? 'Весь Дагестан' : `${area.label} · ${area.radiusKm} км`}
          </Text>
          <Icon name="chevron-right" size={14} color={colors.textMuted} />
        </Pressable>

        <Pressable
          onPress={() =>
            router.push({
              pathname: '/listings/filters',
              params: {
                ...(section ? { category: section } : {}),
                ...(searching ? { q: query } : {}),
              },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Фильтры${activeFilterCount > 0 ? `, выбрано ${activeFilterCount}` : ''}`}
          style={({ pressed }) => [
            styles.pill,
            activeFilterCount > 0 && styles.pillActive,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="filter" size={16} color={colors.primary} />
          <Text style={styles.pillLabel}>Фильтры</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

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

      {!searching && crumbs !== '' && (
        // Где человек в каталоге — одной строкой, без отдельного блока
        <Text style={styles.crumbs} numberOfLines={1} accessibilityLabel={`Раздел: ${crumbs}`}>
          {crumbs}
        </Text>
      )}

      {!searching && (
        <ScrollView
          // Новый уровень — с начала ленты, а не с прокрутки прежнего
          key={section ?? 'root'}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesScroll}
          contentContainerStyle={styles.categoriesContent}
          accessibilityLabel="Категории"
        >
          {selected ? (
            <SectionButton
              icon="chevron-left"
              label={trail.at(-2)?.name ?? 'Все'}
              accessibilityLabel={`Назад: ${trail.at(-2)?.name ?? 'Все'}`}
              onPress={goUp}
            />
          ) : (
            <SectionButton icon="grid" label="Все" active onPress={() => setTrail([])} />
          )}
          {level.map((node) => (
            <SectionButton
              key={node.id}
              icon={selected ? subcategoryIcon(node.slug) : sectionIcon(node.slug)}
              label={node.name}
              onPress={() => openNode(node)}
            />
          ))}
          {!selected && (
            <SectionButton
              icon="chevron-right"
              label="Ещё"
              onPress={() => router.push('/listings/categories')}
            />
          )}
        </ScrollView>
      )}

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>{feedTitle}</Text>

        {!searching && (
          <View style={styles.links}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/listings/list',
                  params: selected ? { slug: selected.slug } : {},
                })
              }
              accessibilityRole="button"
              style={({ pressed }) => [styles.allLink, pressed && styles.pressed]}
            >
              <Text style={styles.allLinkLabel}>Все объявления</Text>
              <Icon name="chevron-right" size={14} color={colors.primary} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(listing) => listing.id}
        // Число колонок нельзя менять на лету — FlatList требует новый key
        key={layout}
        numColumns={layout === 'list' ? 1 : 2}
        columnWrapperStyle={layout === 'list' ? undefined : styles.row}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            layout={layout}
            maxFacts={3}
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
          ) : feed.isError ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Не удалось загрузить объявления.</Text>
              <Pressable onPress={() => void feed.refetch()} accessibilityRole="button">
                <Text style={styles.resetLink}>Повторить</Text>
              </Pressable>
            </View>
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

/** «Транспорт → Автомобили»: путь по каталогу, повтор имени не пишется. */
function trailLabel(trail: readonly ListingCategoryDto[]): string {
  const names: string[] = [];
  for (const node of trail) if (names.at(-1) !== node.name) names.push(node.name);
  return names.join(' → ');
}

/** Плитка раздела. Иконка — умолчание по коду раздела, см. listing-icons. */
function SectionButton({
  icon,
  label,
  active = false,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  label: string;
  accessibilityLabel?: string;
  /** Выбранный раздел выделяется акцентом: тонкая рамка и подпись, без плашки */
  active?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      style={styles.categoryCell}
    >
      <View style={[styles.categoryIcon, active && styles.categoryIconActive]}>
        <Icon name={icon} size={26} color={colors.primary} />
      </View>
      <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Быстрый переход: значок, название и сколько внутри — без собственной рамки. */
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
      <Icon name={icon} size={18} color={colors.primary} />
      <Text style={styles.shortcutLabel}>{label}</Text>
      {count !== undefined && <Text style={styles.shortcutCount}>{count}</Text>}
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
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    back: { width: 36, height: 44, justifyContent: 'center' },
    titleBlock: { flex: 1 },
    title: { ...typography.title, color: colors.text },
    count: { ...typography.caption, color: colors.textMuted },

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
    // Где искать — обычная строка, а не ещё одна капсула рядом с полем поиска:
    // отделяется от него отступом
    areaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      maxWidth: '100%',
      minHeight: 44,
      gap: 6,
    },
    shortcuts: { flexDirection: 'row', gap: spacing.xl, marginBottom: spacing.sm },
    shortcut: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
    },
    shortcutLabel: { ...typography.body, color: colors.text },
    shortcutCount: { ...typography.caption, color: colors.textMuted },
    areaLabel: { ...typography.body, color: colors.text, fontWeight: '600', flexShrink: 1 },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    searchCell: { flex: 1 },
    smartPanel: { marginTop: spacing.sm },

    // Место и фильтры — две капсулы в один ряд; месту — вся оставшаяся ширина
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    areaPill: { flex: 1, minWidth: 0 },
    pillActive: { borderColor: colors.primary },
    pillLabel: { ...typography.body, color: colors.text, flexShrink: 1 },
    filterBadge: {
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
    crumbs: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
    categoriesScroll: { marginHorizontal: -spacing.lg },
    categoriesContent: { paddingHorizontal: spacing.lg, gap: spacing.lg },
    // Ширина по подписи: длинное название не переносится на вторую строку
    categoryCell: { minWidth: 56, alignItems: 'center', gap: 6 },
    categoryIcon: {
      width: 56,
      height: 56,
      borderRadius: radius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    categoryIconActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    categoryLabelActive: { color: colors.primary, fontWeight: '600' },
    categoryLabel: { ...typography.caption, color: colors.text, fontSize: 12, lineHeight: 15 },

    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    sectionTitle: { ...typography.heading, color: colors.text },
    links: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    allLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      minHeight: 44,
      justifyContent: 'center',
    },
    allLinkLabel: { ...typography.caption, color: colors.primary },

    empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
    emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
    resetLink: { ...typography.body, color: colors.primary, fontWeight: '600' },
  });
