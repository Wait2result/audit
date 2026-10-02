import type { FavoriteDishDto, PlaceDto } from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useFavoriteDishes, useFavoritesSummary, usePlaces } from '../src/api/queries';
import { Button } from '../src/components/Button';
import { Icon } from '../src/components/Icon';
import { MenuItemRow } from '../src/components/MenuItemRow';
import { PlaceCard } from '../src/components/PlaceCard';
import { Screen } from '../src/components/Screen';
import { useAddToCart } from '../src/hooks/use-add-to-cart';
import { useFavoriteActions } from '../src/hooks/use-favorite-actions';
import { useAuthStore } from '../src/store/auth-store';
import { useCartLines } from '../src/store/cart-store';
import { useCityStore } from '../src/store/city-store';
import { MIN_TOUCH_SIZE, radius, spacing, typography, useThemeColors } from '../src/theme';

type Tab = 'places' | 'dishes';

/**
 * Доставка → Избранное: заведения и блюда (Этап 6). Объявления — в своём
 * разделе (app/listings/favorites.tsx), сводка по всему — в профиле
 * (app/saved.tsx).
 *
 * Два списка под вкладками, потому что это разные вещи: человек любит
 * конкретный хинкал, а само заведение может не отмечать, и наоборот.
 *
 * Пустой экран здесь — главное место, где человеку объясняют, как это
 * работает. Поэтому он говорит прямо, какую кнопку нажать, а не просто
 * «ничего нет».
 */
export default function FavoritesScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const user = useAuthStore((s) => s.user);
  const cityId = useCityStore((s) => s.cityId);
  const cityName = useCityStore((s) => s.cityName);

  const [tab, setTab] = useState<Tab>(params.tab === 'dishes' ? 'dishes' : 'places');
  const signedIn = Boolean(user);

  const summary = useFavoritesSummary(cityId, signedIn);
  const places = usePlaces(cityId, { favoritesOnly: true }, signedIn && tab === 'places');
  const dishes = useFavoriteDishes(cityId, signedIn && tab === 'dishes');

  const { togglePlace } = useFavoriteActions();

  const placeItems = useMemo(
    () => places.data?.pages.flatMap((page) => page.items) ?? [],
    [places.data],
  );
  const dishItems = useMemo(
    () => dishes.data?.pages.flatMap((page) => page.items) ?? [],
    [dishes.data],
  );

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/places'));

  const openPlace = (place: PlaceDto) =>
    router.push({ pathname: '/places/[id]', params: { id: place.id } });

  const header = (
    <View>
      <View style={styles.topBar}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={10}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>Избранное</Text>
      {cityName && <Text style={styles.subtitle}>{cityName}</Text>}

      <View style={styles.tabs}>
        <TabButton
          label="Рестораны"
          count={summary.data?.places}
          active={tab === 'places'}
          onPress={() => setTab('places')}
        />
        <TabButton
          label="Блюда"
          count={summary.data?.dishes}
          active={tab === 'dishes'}
          onPress={() => setTab('dishes')}
        />
      </View>
    </View>
  );

  if (!signedIn) {
    return (
      <Screen>
        {header}
        <EmptyState
          title="Войдите, чтобы сохранять"
          text="Отмечайте сердечком рестораны и блюда, которые понравились, — они соберутся здесь и не потеряются."
          actionLabel="Войти"
          onAction={() => router.push('/auth/login?back=1')}
          secondaryLabel="Создать аккаунт"
          onSecondary={() => router.push('/auth/phone')}
        />
      </Screen>
    );
  }

  const loading = tab === 'places' ? places.isLoading : dishes.isLoading;
  const isEmpty = tab === 'places' ? placeItems.length === 0 : dishItems.length === 0;

  return (
    <Screen>
      <FlatList<PlaceDto | FavoriteDishDto>
        data={tab === 'places' ? placeItems : dishItems}
        keyExtractor={(row) => ('item' in row ? row.item.id : row.id)}
        ListHeaderComponent={header}
        renderItem={({ item: row }) =>
          'item' in row ? (
            <DishRow entry={row} />
          ) : (
            <PlaceCard
              place={row}
              onOpen={() => openPlace(row)}
              onToggleFavorite={() => togglePlace(row)}
            />
          )
        }
        ItemSeparatorComponent={() => <View style={tab === 'places' ? styles.gap : undefined} />}
        contentContainerStyle={styles.list}
        onEndReached={() => {
          const feed = tab === 'places' ? places : dishes;
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        refreshing={tab === 'places' ? places.isRefetching : dishes.isRefetching}
        onRefresh={() => void (tab === 'places' ? places.refetch() : dishes.refetch())}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : isEmpty && tab === 'places' ? (
            <EmptyState
              title="Пока нет любимых ресторанов"
              text="Нажмите ♡ на карточке ресторана — он появится здесь, и до него будет один шаг."
              actionLabel="К ресторанам"
              onAction={() => router.replace('/places')}
            />
          ) : (
            <EmptyState
              title="Пока нет любимых блюд"
              text="Откройте меню ресторана и нажмите ♡ рядом с блюдом. Понравившееся можно будет заказать отсюда."
              actionLabel="К ресторанам"
              onAction={() => router.replace('/places')}
            />
          )
        }
      />
    </Screen>
  );
}

/**
 * Строка избранного блюда. Отдельным компонентом, потому что блюда из разных
 * заведений, а корзина у каждого заведения своя — хук добавления привязан
 * к заведению и должен жить рядом со строкой.
 */
function DishRow({ entry }: { entry: FavoriteDishDto }) {
  const router = useRouter();
  const { toggleDish } = useFavoriteActions();
  const addToCart = useAddToCart({ id: entry.place.id, name: entry.place.name });
  const lines = useCartLines(entry.place.id);

  const inCart = lines
    .filter((line) => line.menuItemId === entry.item.id)
    .reduce((n, l) => n + l.quantity, 0);

  const open = () =>
    router.push({
      pathname: '/places/dish',
      params: { placeId: entry.place.id, itemId: entry.item.id },
    });
  const openPlace = () => router.push({ pathname: '/places/[id]', params: { id: entry.place.id } });

  return (
    <MenuItemRow
      item={entry.item}
      placeName={entry.place.name}
      note={entry.place.canOrder ? undefined : entry.place.openLabel}
      inCart={inCart}
      onOpen={open}
      onOpenPlace={openPlace}
      onToggleFavorite={() => toggleDish(entry.item, entry.place.id)}
      onQuickAdd={() => {
        // Заказать нельзя — покажем карточку блюда, а не будем молча ничего делать
        if (!entry.place.canOrder) {
          open();
          return;
        }
        addToCart(entry.item);
      }}
    />
  );
}

function TabButton({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number | undefined;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      {count !== undefined && count > 0 && (
        <View style={[styles.badge, active && styles.badgeActive]}>
          <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

function EmptyState({
  title,
  text,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  text: string;
  actionLabel: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name="heart" size={30} color={colors.danger} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      <Button label={actionLabel} variant="secondary" onPress={onAction} fullWidth={false} />
      {secondaryLabel && onSecondary && (
        <Button label={secondaryLabel} variant="ghost" onPress={onSecondary} fullWidth={false} />
      )}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    list: { paddingBottom: spacing.xxl },
    gap: { height: spacing.md },
    pressed: { opacity: 0.75 },
    loader: { paddingVertical: spacing.xxl },

    topBar: { flexDirection: 'row', marginBottom: spacing.sm },
    back: {
      width: MIN_TOUCH_SIZE,
      height: MIN_TOUCH_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -spacing.md,
    },
    backIcon: { fontSize: 26, color: colors.text },
    title: { ...typography.title, color: colors.text },
    subtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

    tabs: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.lg },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 1,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabLabel: { ...typography.caption, fontSize: 14, fontWeight: '500', color: colors.textMuted },
    tabLabelActive: { color: colors.textOnPrimary, fontWeight: '600' },
    badge: {
      minWidth: 20,
      paddingHorizontal: 6,
      borderRadius: radius.full,
      backgroundColor: colors.tile,
      alignItems: 'center',
    },
    badgeActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
    badgeText: { ...typography.label, fontSize: 11, color: colors.textMuted },
    badgeTextActive: { color: colors.textOnPrimary },

    empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: radius.full,
      backgroundColor: colors.dangerSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: { ...typography.heading, fontSize: 18, color: colors.text, textAlign: 'center' },
    emptyText: {
      ...typography.body,
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: spacing.lg,
    },
  });
