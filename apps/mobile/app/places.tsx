import {
  pluralize,
  type PlaceCategoryDto,
  type PlaceDto,
  type PromoBannerDto,
} from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  usePlaceCategories,
  usePlaces,
  usePromoBanners,
  type PlaceFilters,
} from '../src/api/queries';
import { AdCarousel, type AdSlide } from '../src/components/AdCarousel';
import { CartButton } from '../src/components/CartButton';
import { CATEGORY_GAP, CategoryTile, categoryTileWidth } from '../src/components/CategoryTile';
import { FilterChip } from '../src/components/FilterChip';
import { Icon } from '../src/components/Icon';
import { PlaceCard } from '../src/components/PlaceCard';
import { PlaceTile } from '../src/components/PlaceTile';
import { Screen } from '../src/components/Screen';
import { useFavoriteActions } from '../src/hooks/use-favorite-actions';
import { useCityStore } from '../src/store/city-store';
import { MIN_TOUCH_SIZE, radius, spacing, typography, useThemeColors } from '../src/theme';

type Sort = NonNullable<PlaceFilters['sort']>;

const SORT_LABELS: Record<Sort, string> = {
  default: 'По умолчанию',
  rating: 'По рейтингу',
  fast: 'Быстрее привезут',
  cheap: 'Дешевле',
};

/** «До 30 мин» — граница, дальше которой человек уже не ждёт, а выбирает заново. */
const FAST_MINUTES = 30;

/**
 * Подборки витрины из промо-баннеров панели («Заведения → Реклама»).
 *
 * Картинку и заведение, куда ведёт нажатие, задаёт владелец — карточка сама
 * не решает, что показать. Пока фотографии нет, вместо неё однотонная
 * подложка одного из фирменных цветов, по кругу — так карточки без фото
 * не сливаются друг с другом.
 */
const FALLBACK_TINTS = (colors: ReturnType<typeof useThemeColors>) => [
  colors.ink,
  colors.primaryDark,
  colors.accent,
];

function toSlides(
  banners: PromoBannerDto[] | undefined,
  colors: ReturnType<typeof useThemeColors>,
): AdSlide[] {
  const tints = FALLBACK_TINTS(colors);

  return (banners ?? []).map((banner, index) => ({
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle ?? '',
    imageUrl: banner.image?.url ?? banner.image?.thumbnailUrl ?? null,
    tint: tints[index % tints.length]!,
    targetPlaceId: banner.targetPlaceId,
    // Это подборка владельца, а не сторонняя реклама — метки «Реклама» нет.
    // Появится настоящая рекламная система — здесь будет реальный признак
    isOwn: true,
  }));
}

/**
 * Витрина доставки (Этап 6).
 *
 * Всё на одном экране: категории, подборки, сортировка, фильтры и полный
 * список заведений. Плитка категории, «Все», сортировка и поиск меняют
 * список ниже, а не уводят на отдельную страницу — человек видит результат
 * там же, где выбирал, и не теряет место при возврате.
 *
 * Пока ничего не выбрано, над списком показаны подборки и «Популярное рядом».
 * Как только выбрана категория или введён поиск, витрина уступает место
 * результату: карусель над найденным только мешает.
 */
export default function PlacesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const promoBanners = usePromoBanners('delivery');
  const foodSlides = useMemo(
    () => toSlides(promoBanners.data, colors),
    [promoBanners.data, colors],
  );
  const cityId = useCityStore((s) => s.cityId);
  const cityName = useCityStore((s) => s.cityName);

  const listRef = useRef<FlatList<PlaceDto>>(null);
  const listTop = useRef(0);
  // До какого момента сдвиг раскладки ещё считается ответом на нажатие
  const scrollUntil = useRef(0);
  const [listOffset, setListOffset] = useState(0);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PlaceCategoryDto | null>(null);
  const [openNow, setOpenNow] = useState(false);
  const [fastOnly, setFastOnly] = useState(false);
  const [hasDelivery, setHasDelivery] = useState(false);
  const [sort, setSort] = useState<Sort>('default');
  const [sortOpen, setSortOpen] = useState(false);

  // Поиск срабатывает не на каждую букву, а когда человек остановился:
  // иначе список мигал бы и дёргал сервер на каждое нажатие
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const tileWidth = categoryTileWidth(screenWidth - spacing.lg * 2);

  const { data: categories = [] } = usePlaceCategories();
  const { togglePlace } = useFavoriteActions();

  const filters = useMemo<PlaceFilters>(
    () => ({
      ...(category ? { category: category.slug } : {}),
      ...(query.length >= 2 ? { search: query } : {}),
      ...(openNow ? { openNow: true } : {}),
      ...(fastOnly ? { maxMinutes: FAST_MINUTES } : {}),
      ...(hasDelivery ? { hasDelivery: true } : {}),
      ...(sort !== 'default' ? { sort } : {}),
    }),
    [category, query, openNow, fastOnly, hasDelivery, sort],
  );

  const feed = usePlaces(cityId, filters);
  const popular = usePlaces(cityId, { sort: 'rating' });

  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);
  const popularItems = useMemo(
    () => popular.data?.pages.flatMap((page) => page.items).slice(0, 10) ?? [],
    [popular.data],
  );

  const browsing = !category && query.length < 2;
  const anyFilter = openNow || fastOnly || hasDelivery || sort !== 'default';

  const openPlace = (place: PlaceDto) =>
    router.push({ pathname: '/places/[id]', params: { id: place.id } });

  /**
   * Прокрутка к началу списка. «Все» возвращает подборки над списком, и его
   * верх уезжает вниз, но когда именно — зависит от скорости отрисовки.
   * Поэтому крутим сразу и ещё раз, если в течение секунды раскладка
   * над списком изменилась. Второй раз — только после перерисовки: пока
   * список не вырос до новой высоты, прокрутка упёрлась бы в старый низ.
   */
  const jumpToList = () =>
    listRef.current?.scrollToOffset({ offset: listTop.current, animated: true });

  useEffect(() => {
    if (Date.now() < scrollUntil.current) jumpToList();
  }, [listOffset]); // крутим только на сдвиг списка

  const scrollToList = () => {
    scrollUntil.current = Date.now() + 1000;
    setTimeout(jumpToList, 60);
  };

  // Выбранная категория прячет подборки, и список сам встаёт сразу под
  // строкой категорий — прокручивать не нужно, выбранная плитка остаётся
  // на виду. «Все» возвращает подборки, поэтому к списку подводим прокруткой
  const pickCategory = (next: PlaceCategoryDto | null) => {
    setCategory((current) => (next && current?.id === next.id ? null : next));
    if (!next) scrollToList();
  };

  const resetAll = () => {
    setCategory(null);
    setSearch('');
    setQuery('');
    setOpenNow(false);
    setFastOnly(false);
    setHasDelivery(false);
    setSort('default');
  };

  const header = (
    <View>
      {/*
        Всё, что над списком, в одной обёртке: её высота и есть начало списка.
        Мерить именно высоту, а не положение самого списка: в вебе onLayout
        срабатывает только при смене размера, и сдвиг вниз он бы пропустил
      */}
      <View
        onLayout={(event) => {
          listTop.current = event.nativeEvent.layout.height;
          setListOffset(event.nativeEvent.layout.height);
        }}
      >
        {/* Стрелка та же, что во всех разделах: отдельной строкой над заголовком */}
        <View style={styles.topRow}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            hitSlop={12}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={styles.backIcon}>←</Text>
          </Pressable>

          <View style={styles.topActions}>
            <Pressable
              onPress={() => router.push('/favorites')}
              accessibilityRole="button"
              accessibilityLabel="Избранное"
              style={({ pressed }) => [styles.lightButton, pressed && styles.pressed]}
            >
              <Icon name="heart" size={20} color={colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => {
                setSortOpen((value) => !value);
                scrollToList();
              }}
              accessibilityRole="button"
              accessibilityLabel="Сортировка и фильтры"
              accessibilityState={{ expanded: sortOpen }}
              style={({ pressed }) => [
                styles.roundButton,
                (sortOpen || anyFilter) && styles.roundButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="filter" size={20} color={colors.textOnPrimary} />
            </Pressable>
          </View>
        </View>

        <Text style={styles.title}>Доставка</Text>
        <Pressable
          onPress={() => router.push('/city-picker')}
          accessibilityRole="button"
          accessibilityLabel={`Город ${cityName ?? 'не выбран'}. Сменить`}
          style={({ pressed }) => [styles.cityRow, pressed && styles.pressed]}
        >
          <Icon name="location" size={15} color={colors.primary} />
          <Text style={styles.city}>{cityName ?? 'Выберите город'}</Text>
        </Pressable>

        <View style={styles.searchBox}>
          <Icon name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={scrollToList}
            returnKeyType="search"
            placeholder="Найти ресторан, блюдо или магазин..."
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            accessibilityLabel="Поиск заведений и блюд"
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch('')}
              hitSlop={10}
              accessibilityLabel="Очистить поиск"
            >
              <Icon name="close" size={16} color={colors.textFaint} />
            </Pressable>
          )}
        </View>

        {categories.length > 0 && (
          <View style={styles.block}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Категории</Text>
              <Pressable
                onPress={() => pickCategory(null)}
                accessibilityRole="button"
                accessibilityLabel="Все заведения"
                hitSlop={8}
              >
                <Text style={styles.sectionLink}>Все →</Text>
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.hScroll}
              contentContainerStyle={styles.categoriesRow}
              decelerationRate="fast"
              snapToInterval={tileWidth + CATEGORY_GAP}
              snapToAlignment="start"
            >
              {categories.map((item) => (
                <CategoryTile
                  key={item.id}
                  category={item}
                  width={tileWidth}
                  selected={category?.id === item.id}
                  onPress={() => pickCategory(item)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {browsing && (
          <>
            {foodSlides.length > 0 && (
              // Карусель во всю ширину экрана, как на главной
              <View style={styles.carousel}>
                <AdCarousel
                  slides={foodSlides}
                  onPressSlide={(slide) => {
                    if (slide.targetPlaceId) {
                      router.push({
                        pathname: '/places/[id]',
                        params: { id: slide.targetPlaceId },
                      });
                    }
                  }}
                />
              </View>
            )}

            {popularItems.length > 0 && (
              <View style={styles.block}>
                <Text style={[styles.sectionTitle, styles.sectionTitleAlone]}>
                  Популярное рядом
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.hScroll}
                  contentContainerStyle={styles.row}
                >
                  {popularItems.map((place) => (
                    <PlaceTile
                      key={place.id}
                      place={place}
                      onOpen={() => openPlace(place)}
                      onToggleFavorite={() => togglePlace(place)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </View>

      {/* Отсюда начинается список: к этой точке прокручивают «Все» и фильтры */}
      <View>
        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>
            {category ? category.name : query.length >= 2 ? `«${query}»` : 'Все заведения'}
          </Text>
          {!feed.isLoading && (
            <Text style={styles.listCount}>
              {pluralize(items.length, 'заведение', 'заведения', 'заведений')}
              {feed.hasNextPage ? '+' : ''}
            </Text>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.hScroll}
          contentContainerStyle={styles.chips}
        >
          <FilterChip
            label="Открыто сейчас"
            active={openNow}
            onPress={() => setOpenNow((v) => !v)}
          />
          <FilterChip
            label={`До ${FAST_MINUTES} мин`}
            active={fastOnly}
            onPress={() => setFastOnly((v) => !v)}
          />
          <FilterChip
            label="С доставкой"
            active={hasDelivery}
            onPress={() => setHasDelivery((v) => !v)}
          />
          {sort !== 'default' && (
            <FilterChip label={SORT_LABELS[sort]} active onPress={() => setSort('default')} />
          )}
        </ScrollView>

        {sortOpen && (
          <View style={styles.sortBox}>
            {(Object.keys(SORT_LABELS) as Sort[]).map((value) => (
              <Pressable
                key={value}
                onPress={() => {
                  setSort(value);
                  setSortOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: sort === value }}
                style={({ pressed }) => [styles.sortRow, pressed && styles.pressed]}
              >
                <Text style={[styles.sortLabel, sort === value && styles.sortLabelActive]}>
                  {SORT_LABELS[value]}
                </Text>
                {sort === value && <Icon name="check" size={16} color={colors.primary} />}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <Screen>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(place) => place.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <PlaceCard
              place={item}
              onOpen={() => openPlace(item)}
              onToggleFavorite={() => togglePlace(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          // Список не короче экрана: иначе при одном-двух заведениях прокручивать
          // некуда и «Все →» или выбранная категория не подводят его под шапку
          contentContainerStyle={[styles.list, { minHeight: listOffset + screenHeight }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
                  {browsing && !anyFilter
                    ? 'В городе пока нет заведений, принимающих заказы. Они появятся здесь, как только подключатся первые.'
                    : 'Ничего не нашлось. Попробуйте снять фильтры или поискать другое слово.'}
                </Text>
                {(!browsing || anyFilter) && (
                  <Pressable onPress={resetAll} accessibilityRole="button" hitSlop={8}>
                    <Text style={styles.sectionLink}>Сбросить всё</Text>
                  </Pressable>
                )}
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

      <CartButton />
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    // Место под плавающей кнопкой корзины: последняя карточка не прячется за ней
    list: { paddingBottom: 110 },
    separator: { height: spacing.md },
    pressed: { opacity: 0.7 },
    loader: { paddingVertical: spacing.xl },

    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: spacing.md,
    },
    backButton: {
      width: MIN_TOUCH_SIZE,
      height: MIN_TOUCH_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -spacing.md,
    },
    backIcon: { fontSize: 26, color: colors.text },
    topActions: { flexDirection: 'row', gap: spacing.sm },
    lightButton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    roundButton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    roundButtonActive: { backgroundColor: colors.primaryDark },

    title: { ...typography.title, color: colors.text, marginTop: spacing.sm },
    cityRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    city: { ...typography.caption, color: colors.textMuted },

    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      height: 46,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: spacing.lg,
      marginBottom: spacing.lg,
    },
    searchInput: { flex: 1, ...typography.body, fontSize: 14, color: colors.text, padding: 0 },

    block: { marginBottom: spacing.xl },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    sectionTitle: { ...typography.heading, fontSize: 18, color: colors.text },
    sectionTitleAlone: { marginBottom: spacing.md },
    sectionLink: { ...typography.caption, color: colors.primary, fontWeight: '600' },

    /**
     * У горизонтальной прокрутки в React Native flexGrow равен единице: она
     * забирает всю свободную высоту экрана, а её содержимое растягивается
     * следом. Поэтому строка не растёт, а дети в ней прижаты к верху.
     */
    hScroll: { flexGrow: 0 },
    categoriesRow: { gap: CATEGORY_GAP, alignItems: 'flex-start' },
    row: {
      gap: spacing.md,
      alignItems: 'flex-start',
      paddingRight: spacing.lg,
      paddingBottom: spacing.sm,
    },

    // Карусель сама отступает от краёв, поэтому выходит за поля экрана
    carousel: { marginHorizontal: -spacing.lg, marginBottom: spacing.xl },

    listHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    listCount: { ...typography.caption, color: colors.textMuted },
    chips: { gap: spacing.sm, paddingVertical: spacing.md, alignItems: 'flex-start' },

    sortBox: {
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    sortRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    sortLabel: { ...typography.body, fontSize: 14, color: colors.textMuted },
    sortLabelActive: { color: colors.text, fontWeight: '600' },

    empty: { gap: spacing.md, paddingVertical: spacing.xl, alignItems: 'flex-start' },
    emptyText: { ...typography.caption, color: colors.textMuted, lineHeight: 19 },
  });
