import {
  LISTING_SORT_LABELS,
  ListingSort,
  PRICE_UNIT_LABELS,
  RENT_PERIOD_LABELS,
  operationLabels,
  attributeValueLabel,
  plural,
  resolveCardLayout,
  type ListingAttribute,
  type ListingCategoryDto,
} from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';

import {
  useDictionary,
  useListingCategories,
  useListings,
  type ListingFilters,
} from '../../src/api/queries';
import { Icon } from '../../src/components/Icon';
import { ListingCard } from '../../src/components/ListingCard';
import { ListingSearchBox } from '../../src/components/ListingSearchBox';
import { ListingSmartPanel, useListingSmartSearch } from '../../src/components/ListingSmartSearch';
import { SmartNotice, SmartUnderstood } from '../../src/components/SmartSearchBlocks';
import { ListingsMapView } from '../../src/components/ListingsMapView';
import { Screen } from '../../src/components/Screen';
import { useFavoriteActions } from '../../src/hooks/use-favorite-actions';
import { useListingArea } from '../../src/hooks/use-listing-area';
import { useCityStore } from '../../src/store/city-store';
import { useListingAreaStore } from '../../src/store/listing-area-store';
import {
  useListingFilterStore,
  type ExtraListingFilters,
} from '../../src/store/listing-filter-store';
import { useSmartSearchStore } from '../../src/store/smart-search-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';
import { formatMoney } from '../../src/utils/money';
import { listingFiltersKey, widerRadius } from '../../src/utils/smart-search';

/**
 * Объявления выбранной категории (Этап 7).
 *
 * Отдельный экран от каталога: здесь человек уже знает, что ищет, и ему
 * нужны не плитки разделов, а выбранные фильтры на виду, число найденного и
 * порядок выдачи. Выбранное показано снимаемыми чипсами — так видно, почему
 * список сузился, и любое условие снимается одним нажатием, без захода в
 * отдельный экран фильтров.
 */
export default function ListingsListScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const cityId = useCityStore((s) => s.cityId);
  // q — слова для поиска (с первого экрана раздела или остаток умного
  // поиска); smart — экран открыт умным поиском, фильтры уже разложены
  const {
    slug,
    q,
    smart: fromSmart,
  } = useLocalSearchParams<{
    slug?: string;
    q?: string;
    smart?: string;
  }>();
  const { toggleListing } = useFavoriteActions();

  const [sortOpen, setSortOpen] = useState(false);
  // «Список» или «Карта»: те же условия, другой способ смотреть
  const [mode, setMode] = useState<'list' | 'map'>('list');

  // Где искать: точка и радиус (или весь Дагестан). Меняется на отдельном
  // экране — выдача обновится сама, как только он применит выбор
  const area = useListingArea();
  const areaFilters = area.filters;

  // Фильтры хранятся по категории: у автомобилей свои, у телефонов свои
  const scope = slug ?? '';
  const extraFilters = useListingFilterStore((s) => s.byScope[scope] ?? EMPTY_FILTERS);
  const setScoped = useListingFilterStore((s) => s.set);
  const resetScoped = useListingFilterStore((s) => s.reset);
  const setFilters = (next: ExtraListingFilters) => setScoped(scope, next);
  // Порядок выдачи живёт в тех же фильтрах: его выбирают и здесь, и на экране фильтров
  const sort: ListingSort = extraFilters.sort ?? ListingSort.RECOMMENDED;
  const setSort = (next: ListingSort) => setFilters({ ...extraFilters, sort: next });
  const resetFilters = () => resetScoped(scope);

  // Понятый умным поиском запрос — строка «Понял запрос» над выдачей. Пока
  // фильтры те же, что он разложил: снял чипс — строка про другое и скрывается
  const understood = useSmartSearchStore((s) => s.listing);
  const setUnderstood = useSmartSearchStore((s) => s.setListing);
  const showUnderstood =
    understood !== null &&
    understood.scope === scope &&
    understood.filtersKey === listingFiltersKey(extraFilters);

  // В поле — фраза человека; в поиск по словам уходит только то, что умный
  // поиск не разложил по фильтрам (или вся фраза, если он не ответил)
  const [search, setSearch] = useState(
    fromSmart && understood?.scope === scope ? understood.text : (q ?? ''),
  );
  const [query, setQuery] = useState(q ?? '');
  const searching = query.length >= 2;
  const inputRef = useRef<TextInput>(null);

  const smart = useListingSmartSearch({
    category: slug ?? null,
    onListings: (target) => {
      if ((target.slug ?? '') !== scope) {
        router.replace({ pathname: '/listings/list', params: { ...target, smart: '1' } });
        return;
      }
      setQuery(target.q ?? '');
    },
    onFallback: (text) => {
      setUnderstood(null);
      setQuery(text);
    },
  });

  const submitSearch = (text: string) => {
    const clean = text.trim();
    if (!clean) {
      setQuery('');
      setUnderstood(null);
      smart.reset();
      return;
    }
    void smart.submit(clean);
  };

  const setRadius = useListingAreaStore((s) => s.setRadius);

  const categories = useListingCategories();
  const category = findCategory(categories.data ?? [], slug);
  const fields = category?.attributes ?? [];

  const freshBefore = useMemo(
    () => new Date().toISOString(),
    [cityId, slug, sort, query, extraFilters, areaFilters],
  );

  const filters = useMemo<ListingFilters>(
    () => ({
      ...(slug ? { category: slug } : {}),
      ...(searching ? { search: query } : {}),
      sort,
      ...areaFilters,
      ...extraFilters,
      freshBefore,
    }),
    [slug, searching, query, sort, areaFilters, extraFilters, freshBefore],
  );

  const feed = useListings(cityId, filters, area.ready && mode === 'list');
  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);
  const total = feed.data?.pages[0]?.total;
  // Квартиры, вакансии и услуги читают, а не разглядывают — им нужен список
  const layout = resolveCardLayout(category);

  // Подписи моделей выбранной марки: в чипсе «Succeed», а не код справочника
  const modelField = fields.find((field) => field.type === 'model' && field.dictionary);
  const chosenBrand = modelField?.parentKey
    ? extraFilters.attributes?.[modelField.parentKey]
    : undefined;
  // Без марки модели не запрашиваются: весь справочник моделей — тысячи строк
  const models = useDictionary(
    typeof chosenBrand === 'string' ? modelField?.dictionary : undefined,
    typeof chosenBrand === 'string' ? chosenBrand : null,
  );
  const modelLabels = useMemo(
    () => Object.fromEntries((models.data ?? []).map((entry) => [entry.value, entry.label])),
    [models.data],
  );

  const chips = useMemo(
    () => describeFilters(extraFilters, fields, slug, modelLabels),
    [extraFilters, fields, slug, modelLabels],
  );

  const mapFilters = useMemo<ListingFilters>(
    () => ({
      ...(slug ? { category: slug } : {}),
      ...(searching ? { search: query } : {}),
      ...extraFilters,
    }),
    [slug, searching, query, extraFilters],
  );

  /** Снять одно условие, не заходя в экран фильтров. */
  const removeChip = (key: string) => {
    const next = { ...extraFilters };

    if (key === 'price') {
      delete next.priceFrom;
      delete next.priceTo;
      delete next.priceUnit;
    } else if (key === 'transactionType') {
      delete next.transactionType;
      delete next.rentPeriod;
    } else if (key === 'rentPeriod') {
      delete next.rentPeriod;
    } else if (key === 'onlyWithPhoto') {
      delete next.onlyWithPhoto;
    } else {
      const attributes = { ...(next.attributes ?? {}) };
      delete attributes[key];
      next.attributes = Object.keys(attributes).length > 0 ? attributes : undefined;
    }

    setFilters(next);
  };

  const header = (
    <View>
      <View style={styles.topRow}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/listings'))}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={12}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Icon name="chevron-left" size={24} color={colors.text} />
        </Pressable>

        <View style={styles.titleBlock}>
          <Text style={styles.title}>{category?.name ?? 'Объявления'}</Text>
          <Text style={styles.count}>
            {total === undefined
              ? 'Ищем…'
              : `${formatCount(total)} ${plural(total, 'объявление', 'объявления', 'объявлений')}`}
          </Text>
        </View>

        <Pressable
          onPress={() =>
            router.push({
              pathname: '/listings/filters',
              params: { ...(slug ? { category: slug } : {}), ...(searching ? { q: query } : {}) },
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Фильтры"
          style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}
        >
          <Icon name="filter" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <ListingSearchBox
          inputRef={inputRef}
          value={search}
          onChange={setSearch}
          onSubmit={submitSearch}
          onOpenCategory={(target) =>
            router.replace({ pathname: '/listings/list', params: { slug: target } })
          }
          cityId={cityId}
          placeholder={category ? `Поиск в «${category.name}»` : 'Поиск объявлений'}
        />
      </View>

      {smart.visible && (
        <View style={styles.smartPanel}>
          <ListingSmartPanel
            controller={smart}
            onOpenCategory={(target) =>
              router.replace({ pathname: '/listings/list', params: { slug: target } })
            }
          />
        </View>
      )}

      {showUnderstood && understood && smart.state.phase !== 'thinking' && (
        <View style={styles.smartPanel}>
          <SmartUnderstood
            summary={understood.summary}
            notes={understood.notes}
            onWrong={() =>
              smart.openFeedback({
                requestId: understood.requestId,
                originalQuery: understood.text,
                failureType: 'wrong_conditions',
                screen: 'listings',
              })
            }
            onClose={() => setUnderstood(null)}
          />
        </View>
      )}

      <View style={styles.modeSwitch} accessibilityRole="tablist">
        {(
          [
            { value: 'list', label: 'Список', icon: 'grid' },
            { value: 'map', label: 'Карта', icon: 'map' },
          ] as const
        ).map((option) => {
          const active = mode === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                setSortOpen(false);
                setMode(option.value);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.modeOption,
                active && styles.modeOptionActive,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                name={option.icon}
                size={16}
                color={active ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {chips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.hScroll}
          contentContainerStyle={styles.chips}
        >
          {chips.map((chip) => (
            <Pressable
              key={chip.key}
              onPress={() => removeChip(chip.key)}
              accessibilityRole="button"
              accessibilityLabel={`Снять фильтр ${chip.label}`}
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            >
              <Text style={styles.chipLabel}>{chip.label}</Text>
              <Icon name="close" size={13} color={colors.primary} />
            </Pressable>
          ))}

          <Pressable
            onPress={resetFilters}
            accessibilityRole="button"
            style={({ pressed }) => [styles.chipReset, pressed && styles.pressed]}
          >
            <Text style={styles.chipResetLabel}>Сбросить</Text>
          </Pressable>
        </ScrollView>
      )}

      <View style={styles.controls}>
        <Pressable
          onPress={() => {
            setSortOpen(false);
            router.push('/listings/location');
          }}
          accessibilityRole="button"
          accessibilityLabel={`Где искать: ${area.summary}`}
          style={({ pressed }) => [styles.controlRow, styles.areaRow, pressed && styles.pressed]}
        >
          <Icon name="location" size={14} color={colors.primary} />
          <Text style={styles.sortLabel} numberOfLines={1}>
            {area.summary}
          </Text>
          <Icon name="chevron-right" size={14} color={colors.primary} />
        </Pressable>

        {mode === 'list' && (
          <Pressable
            onPress={() => setSortOpen((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: sortOpen }}
            style={({ pressed }) => [styles.controlRow, pressed && styles.pressed]}
          >
            <Text style={styles.sortLabel} numberOfLines={1}>
              {LISTING_SORT_LABELS[sort]}
            </Text>
            <Icon name="chevron-down" size={16} color={colors.primary} />
          </Pressable>
        )}
      </View>

      {mode === 'list' && sortOpen && (
        <View style={styles.sortList}>
          {Object.entries(LISTING_SORT_LABELS).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => {
                // «Ближе» считается от выбранного места поиска — разрешение
                // на геолокацию для этого не нужно
                setSort(value as ListingSort);
                setSortOpen(false);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.sortOption, pressed && styles.pressed]}
            >
              <Text style={styles.sortOptionText}>{label}</Text>
              {sort === value && <Icon name="check" size={16} color={colors.primary} />}
            </Pressable>
          ))}

          {/* «Только с фото» — не порядок, а условие, поэтому стоит отдельно
              и включается галочкой, а не выбором из списка */}
          <Pressable
            onPress={() =>
              setFilters({
                ...extraFilters,
                onlyWithPhoto: extraFilters.onlyWithPhoto ? undefined : true,
              })
            }
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.sortOption,
              styles.sortOptionLast,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.sortOptionText}>Только с фото</Text>
            {extraFilters.onlyWithPhoto && <Icon name="check" size={16} color={colors.primary} />}
          </Pressable>
        </View>
      )}
    </View>
  );

  if (mode === 'map') {
    return (
      <Screen padded={false}>
        <View style={styles.mapScreen}>
          <View style={styles.mapHeader}>{header}</View>
          <ListingsMapView
            filters={mapFilters}
            area={area}
            cityId={cityId}
            onOpen={(id) => router.push({ pathname: '/listings/[id]', params: { id } })}
          />
        </View>
      </Screen>
    );
  }

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
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            layout={layout}
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
          ) : showUnderstood ? (
            <SmartNotice
              title="По вашему запросу ничего не найдено"
              actions={[
                { label: 'Изменить запрос', onPress: () => inputRef.current?.focus() },
                { label: 'Изменить город', onPress: () => router.push('/city-picker') },
                ...(area.radiusKm !== null
                  ? [
                      {
                        label: 'Увеличить радиус',
                        onPress: () => setRadius(widerRadius(area.radiusKm)),
                      },
                    ]
                  : []),
                ...(chips.length > 0
                  ? [
                      {
                        label: 'Убрать один из фильтров',
                        onPress: () => removeChip(lastChip(chips)),
                      },
                    ]
                  : []),
              ]}
            />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {searching
                  ? 'Ничего не нашлось. Попробуйте другое слово или снимите фильтры.'
                  : chips.length > 0
                    ? 'Под такие условия ничего не нашлось. Попробуйте снять часть фильтров.'
                    : 'В этой категории пока нет объявлений. Разместите первое — его увидят все.'}
              </Text>
              {chips.length > 0 && (
                <Pressable onPress={resetFilters} accessibilityRole="button">
                  <Text style={styles.resetLink}>Сбросить фильтры</Text>
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
  );
}

interface FilterChipInfo {
  key: string;
  label: string;
}

/**
 * Короткие подписи выбранных условий: «до 3 млн», «Автомат», «2 комнаты».
 * Названия полей берутся из описания категории — те же, по которым построен
 * экран фильтров, поэтому подписи не разъедутся с формой.
 */
/**
 * Какое условие снять первым, чтобы расширить выдачу: последнее добавленное,
 * но не марку и модель — без них запрос теряет смысл, а модель без марки
 * сервер не примет.
 */
function lastChip(chips: readonly FilterChipInfo[]): string {
  const loose = chips.filter((chip) => chip.key !== 'brand' && chip.key !== 'model');
  return (loose[loose.length - 1] ?? chips.find((chip) => chip.key === 'model') ?? chips[0]!).key;
}

function describeFilters(
  filters: ExtraListingFilters,
  fields: readonly ListingAttribute[],
  categorySlug: string | undefined,
  dictionaryLabels: Readonly<Record<string, string>> = {},
): FilterChipInfo[] {
  const chips: FilterChipInfo[] = [];

  if (filters.priceFrom !== undefined || filters.priceTo !== undefined) {
    const unit = filters.priceUnit ? ` ${PRICE_UNIT_LABELS[filters.priceUnit]}` : '';
    chips.push({ key: 'price', label: priceLabel(filters.priceFrom, filters.priceTo) + unit });
  }

  if (filters.transactionType) {
    chips.push({
      key: 'transactionType',
      // «Купить», «Снять» у жилья, «Арендовать» у техники — как на экране фильтров
      label: operationLabels(categorySlug, filters.transactionType).search,
    });
  }

  if (filters.transactionType === 'rent' && filters.rentPeriod) {
    chips.push({ key: 'rentPeriod', label: RENT_PERIOD_LABELS[filters.rentPeriod] });
  }

  if (filters.onlyWithPhoto) chips.push({ key: 'onlyWithPhoto', label: 'С фото' });

  for (const [key, value] of Object.entries(filters.attributes ?? {})) {
    const field = fields.find((item) => item.key === key);
    if (!field) continue;
    chips.push({ key, label: valueLabel(field, value, dictionaryLabels) });
  }

  return chips;
}

function valueLabel(
  field: ListingAttribute,
  value: unknown,
  dictionaryLabels: Readonly<Record<string, string>>,
): string {
  if (Array.isArray(value)) {
    const labels = value.map((item) => attributeValueLabel(field, item, dictionaryLabels));
    // Три значения в чипсе уже не читаются: «2, 3 и ещё 1»
    return labels.length > 2 ? `${field.label}: ${labels.length}` : labels.join(', ');
  }

  if (value !== null && typeof value === 'object') {
    const bounds = value as { from?: number; to?: number };
    const unit = field.unit ? ` ${field.unit}` : '';
    if (bounds.from !== undefined && bounds.to !== undefined) {
      return `${field.label}: ${bounds.from}–${bounds.to}${unit}`;
    }
    if (bounds.from !== undefined) return `${field.label}: от ${bounds.from}${unit}`;
    if (bounds.to !== undefined) return `${field.label}: до ${bounds.to}${unit}`;
    return field.label;
  }

  if (field.type === 'boolean') return field.label;
  // Текстовый фильтр без названия поля не читается: «cam» — что это?
  if (field.filter === 'text') return `${field.label}: ${String(value)}`;
  return attributeValueLabel(field, value, dictionaryLabels);
}

/** «до 3 млн», «от 500 тыс», «1–3 млн» — короче, чем полная сумма в чипсе. */
function priceLabel(from?: number, to?: number): string {
  if (from !== undefined && to !== undefined) return `${shortMoney(from)}–${shortMoney(to)}`;
  if (from !== undefined) return `от ${shortMoney(from)}`;
  return `до ${shortMoney(to ?? 0)}`;
}

function shortMoney(rubles: number): string {
  if (rubles >= 1_000_000) {
    const millions = rubles / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1).replace('.', ',')} млн`;
  }
  if (rubles >= 1000) return `${Math.round(rubles / 1000)} тыс`;
  return formatMoney(rubles * 100);
}

const EMPTY_FILTERS: ExtraListingFilters = {};

/** «1 284» — с разделителем тысяч: четырёхзначные числа иначе не читаются. */
function formatCount(total: number): string {
  return total.toLocaleString('ru-RU');
}

/** Категория по коду — в дереве из двух уровней. */
function findCategory(roots: ListingCategoryDto[], slug: string | undefined) {
  if (!slug) return null;
  for (const root of roots) {
    if (root.slug === slug) return root;
    const child = root.children.find((item) => item.slug === slug);
    if (child) return child;
  }
  return null;
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    mapScreen: { flex: 1 },
    mapHeader: { paddingHorizontal: spacing.lg },
    // Без собственной рамки и подложки: выбранный режим виден по тону, а
    // не по ещё одной капсуле вокруг двух слов
    modeSwitch: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    modeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
    },
    modeOptionActive: { backgroundColor: colors.primarySoft },
    modeLabel: { ...typography.caption, color: colors.textMuted },
    modeLabelActive: { color: colors.primary, fontWeight: '600' },
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
    row: { gap: spacing.md, alignItems: 'stretch' },
    loader: { marginVertical: spacing.xl },

    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    titleBlock: { flex: 1 },
    title: { ...typography.heading, color: colors.text },
    count: { ...typography.caption, color: colors.textMuted },
    pressed: { opacity: 0.85 },

    filterButton: {
      width: 42,
      height: 42,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },

    searchRow: { marginBottom: spacing.sm },
    smartPanel: { marginBottom: spacing.sm },
    hScroll: { flexGrow: 0, marginBottom: spacing.sm },
    chips: { gap: spacing.sm, paddingRight: spacing.lg },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    chipLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    chipReset: {
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    chipResetLabel: { ...typography.caption, color: colors.textMuted },

    // Две кнопки в ряд: «где искать» и «как отсортировать». Рядом, потому
    // что это один и тот же вопрос — что показать первым
    // Обычные строки без рамок: слева место, справа порядок. Разделены
    // отступом, а не капсулами
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    controlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 44,
    },
    sortLabel: { ...typography.caption, color: colors.text, flexShrink: 1 },
    // Место — главное условие выдачи, ему больше места, чем сортировке
    areaRow: { flexShrink: 1 },
    sortList: {
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    sortOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    sortOptionLast: { borderTopWidth: 1, borderTopColor: colors.border },
    sortOptionText: { ...typography.body, color: colors.text },

    empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
    emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
    resetLink: { ...typography.body, color: colors.primary, fontWeight: '600' },
  });
