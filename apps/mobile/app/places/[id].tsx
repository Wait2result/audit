import {
  PLACE_TYPE_LABELS,
  WEEKDAYS,
  type MenuItemDto,
  type PlaceDetailsDto,
} from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { usePlace, usePlaceMenu, usePlaceReviews } from '../../src/api/queries';
import { Button } from '../../src/components/Button';
import { CartButton } from '../../src/components/CartButton';
import { FavoriteButton } from '../../src/components/FavoriteButton';
import { Icon } from '../../src/components/Icon';
import { MenuItemRow } from '../../src/components/MenuItemRow';
import { Rating } from '../../src/components/Rating';
import { ReviewList } from '../../src/components/ReviewList';
import { Screen } from '../../src/components/Screen';
import { useAddToCart } from '../../src/hooks/use-add-to-cart';
import { useFavoriteActions } from '../../src/hooks/use-favorite-actions';
import { useCartLines } from '../../src/store/cart-store';
import { radius, shadow, spacing, typography, useThemeColors } from '../../src/theme';
import { formatMoney } from '../../src/utils/money';

type Tab = 'menu' | 'about' | 'reviews';

const TAB_LABELS: Record<Tab, string> = {
  menu: 'Меню',
  about: 'О заведении',
  reviews: 'Отзывы',
};

/**
 * Карточка заведения (Этап 6).
 *
 * Три вкладки вместо одной длинной простыни: за меню человек приходит
 * в девяти случаях из десяти, а часы работы и отзывы читает, только когда
 * сомневается. Меню открыто сразу, остальное — на расстоянии одного нажатия.
 */
export default function PlaceScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const placeId = String(id);

  const { data: place, isLoading, isError, refetch, isFetching } = usePlace(placeId);
  const { data: menu } = usePlaceMenu(placeId);

  const [tab, setTab] = useState<Tab>('menu');
  const [category, setCategory] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  // Отзывы грузятся только когда открыли вкладку: на карточке нужна лишь
  // средняя оценка, а она приходит вместе с заведением
  const reviews = usePlaceReviews(placeId, tab === 'reviews');
  const { togglePlace, toggleDish } = useFavoriteActions();

  const linesHere = useCartLines(placeId);
  const addToCart = useAddToCart(place ? { id: place.id, name: place.name } : null);

  const categories = menu?.categories ?? [];
  const visible = useMemo(
    () => (category ? categories.filter((group) => group.id === category) : categories),
    [categories, category],
  );

  const inCart = (item: MenuItemDto): number =>
    linesHere
      .filter((line) => line.menuItemId === item.id)
      .reduce((sum, line) => sum + line.quantity, 0);

  const openDish = (item: MenuItemDto) =>
    router.push({ pathname: '/places/dish', params: { placeId, itemId: item.id } });

  const openRoute = () => {
    if (!place) return;

    // Геосхема понятна и Яндекс.Картам, и 2ГИС, и картам системы
    const query = encodeURIComponent(`${place.name}, ${place.address}`);
    const url =
      place.latitude && place.longitude
        ? `geo:${place.latitude},${place.longitude}?q=${query}`
        : `geo:0,0?q=${query}`;

    void Linking.openURL(url);
  };

  if (isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  if (isError || !place) {
    return (
      <Screen scroll>
        <Text style={styles.error}>Не удалось загрузить заведение.</Text>
        <Button label="Повторить" onPress={() => void refetch()} loading={isFetching} />
      </Screen>
    );
  }

  const photo = place.cover?.url ?? null;
  const orderable = place.ordersEnabled && place.openState.isOpenNow;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Шапка-фотография */}
        <View style={styles.hero}>
          {photo && !imageFailed ? (
            <Image
              source={{ uri: photo }}
              style={styles.heroImage}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Icon name="food" size={44} color="rgba(255,255,255,0.45)" />
            </View>
          )}

          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/places'))}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            style={({ pressed }) => [styles.heroButton, styles.heroLeft, pressed && styles.pressed]}
          >
            <Text style={styles.heroBackIcon}>←</Text>
          </Pressable>

          <View style={[styles.heroButton, styles.heroRight]}>
            <FavoriteButton
              isFavorite={place.isFavorite}
              onToggle={() => togglePlace(place)}
              size={20}
            />
          </View>

          {/* Позвонить и маршрут висят на границе фотографии: это то, зачем
              карточку открывают, когда заказывать не собираются */}
          <View style={styles.heroActions}>
            {place.phone && (
              <Pressable
                onPress={() => void Linking.openURL(`tel:${place.phone ?? ''}`)}
                accessibilityRole="button"
                accessibilityLabel="Позвонить в заведение"
                style={({ pressed }) => [styles.circleAction, pressed && styles.pressed]}
              >
                <Icon name="phone" size={20} color={colors.textOnPrimary} />
              </Pressable>
            )}
            <Pressable
              onPress={openRoute}
              accessibilityRole="button"
              accessibilityLabel="Построить маршрут"
              style={({ pressed }) => [styles.circleAction, pressed && styles.pressed]}
            >
              <Icon name="route" size={20} color={colors.textOnPrimary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.page}>
          <Text style={styles.title}>{place.name}</Text>
          <Rating rating={place.rating} size="large" />

          <Text style={styles.tags}>
            {[PLACE_TYPE_LABELS[place.type], ...place.cuisines].join(' · ')}
          </Text>

          {/* Условия доставки — три цифры, ради которых человек листает вниз */}
          <View style={styles.facts}>
            <Fact
              value={place.delivery.deliveryMinutes ? `${place.delivery.deliveryMinutes} мин` : '—'}
              label="Доставка"
            />
            <Fact
              value={place.delivery.hasDelivery ? formatMoney(place.delivery.deliveryFee) : 'Нет'}
              label="Стоимость"
            />
            <Fact
              value={
                place.delivery.minOrderAmount > 0
                  ? `от ${formatMoney(place.delivery.minOrderAmount)}`
                  : 'Любой'
              }
              label="Мин. заказ"
            />
          </View>

          <Pressable
            onPress={() => setTab('about')}
            accessibilityRole="button"
            accessibilityLabel={`${place.openState.label}. Показать часы работы`}
            style={({ pressed }) => [styles.stateRow, pressed && styles.pressed]}
          >
            <View
              style={[styles.dot, place.openState.isOpenNow ? styles.dotOpen : styles.dotClosed]}
            />
            <Text style={styles.stateText}>{place.openState.label}</Text>
            <Icon name="chevron-right" size={16} color={colors.textFaint} />
          </Pressable>

          {/* Вкладки */}
          <View style={styles.tabs}>
            {(Object.keys(TAB_LABELS) as Tab[]).map((value) => (
              <Pressable
                key={value}
                onPress={() => setTab(value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === value }}
                style={[styles.tab, tab === value && styles.tabActive]}
              >
                <Text style={[styles.tabLabel, tab === value && styles.tabLabelActive]}>
                  {TAB_LABELS[value]}
                </Text>
                {value === 'reviews' && place.rating.count > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{place.rating.count}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>

          {tab === 'menu' && (
            <>
              {categories.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                >
                  <CategoryChip
                    label="Всё меню"
                    active={category === null}
                    onPress={() => setCategory(null)}
                  />
                  {categories.map((group) => (
                    <CategoryChip
                      key={group.id}
                      label={group.name}
                      active={category === group.id}
                      onPress={() => setCategory(group.id)}
                    />
                  ))}
                </ScrollView>
              )}

              {categories.length === 0 && <Text style={styles.empty}>Меню пока не заполнено.</Text>}

              {visible.map((group) => (
                <View key={group.id} style={styles.menuGroup}>
                  <Text style={styles.menuGroupTitle}>{group.name}</Text>
                  {group.items.map((item) => (
                    <MenuItemRow
                      key={item.id}
                      item={item}
                      inCart={inCart(item)}
                      onOpen={() => openDish(item)}
                      onToggleFavorite={() => toggleDish(item, placeId)}
                      onQuickAdd={() => {
                        if (!orderable) {
                          openDish(item);
                          return;
                        }
                        addToCart(item);
                      }}
                    />
                  ))}
                </View>
              ))}

              {!orderable && categories.length > 0 && (
                <Text style={styles.note}>
                  {place.ordersEnabled
                    ? 'Сейчас закрыто — заказ можно будет оформить в рабочие часы.'
                    : 'Заведение пока не принимает заказы через приложение. Позвоните, чтобы заказать.'}
                </Text>
              )}
            </>
          )}

          {tab === 'about' && <About place={place} />}

          {tab === 'reviews' && (
            <ReviewList
              placeId={placeId}
              data={reviews.data}
              isLoading={reviews.isLoading}
              onWrite={() => router.push({ pathname: '/places/review', params: { placeId } })}
            />
          )}
        </View>
      </ScrollView>

      <CartButton placeId={placeId} />
    </View>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

function CategoryChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function About({ place }: { place: PlaceDetailsDto }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.about}>
      {place.description && <Text style={styles.description}>{place.description}</Text>}

      <View style={styles.aboutRow}>
        <Icon name="location" size={18} color={colors.textMuted} />
        <Text style={styles.aboutText}>
          {place.address}
          {place.districtName ? `, ${place.districtName}` : ''}
        </Text>
      </View>

      {place.phone && (
        <Pressable
          onPress={() => void Linking.openURL(`tel:${place.phone ?? ''}`)}
          accessibilityRole="button"
          style={styles.aboutRow}
        >
          <Icon name="phone" size={18} color={colors.textMuted} />
          <Text style={[styles.aboutText, styles.link]}>{place.phone}</Text>
        </Pressable>
      )}

      <Text style={styles.aboutTitle}>Часы работы</Text>
      {place.schedule.map((day) => (
        <View key={day.weekday} style={styles.dayRow}>
          <Text style={styles.dayName}>
            {WEEKDAYS.find((item) => item.value === day.weekday)?.full ?? ''}
          </Text>
          <Text style={styles.dayHours}>
            {day.isClosed ? 'Выходной' : `${day.opensAt} — ${day.closesAt}`}
          </Text>
        </View>
      ))}

      {place.delivery.hasDelivery && (
        <>
          <Text style={styles.aboutTitle}>Доставка</Text>
          <Text style={styles.aboutText}>
            {formatMoney(place.delivery.deliveryFee)}
            {place.delivery.freeDeliveryFrom
              ? `, бесплатно от ${formatMoney(place.delivery.freeDeliveryFrom)}`
              : ''}
            {place.delivery.minOrderAmount > 0
              ? `. Минимальный заказ ${formatMoney(place.delivery.minOrderAmount)}`
              : ''}
          </Text>
        </>
      )}

      {place.delivery.hasPickup && <Text style={styles.aboutText}>Есть самовывоз</Text>}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: 110 },
    loader: { paddingVertical: spacing.xxxl },
    error: { ...typography.body, color: colors.textMuted, marginBottom: spacing.lg },
    pressed: { opacity: 0.8 },

    hero: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.surfaceMuted },
    heroImage: { width: '100%', height: '100%' },
    heroPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#8a7a5f' },
    heroBackIcon: { fontSize: 22, lineHeight: 26, color: colors.text },
    heroButton: {
      position: 'absolute',
      top: spacing.xxl + spacing.md,
      width: 38,
      height: 38,
      borderRadius: radius.full,
      backgroundColor: 'rgba(255,255,255,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroLeft: { left: spacing.lg },
    heroRight: { right: spacing.lg },
    heroActions: {
      position: 'absolute',
      right: spacing.lg,
      bottom: -22,
      flexDirection: 'row',
      gap: spacing.sm,
    },
    circleAction: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.raised,
    },

    page: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.sm },
    title: { ...typography.title, fontSize: 24, color: colors.text },
    tags: { ...typography.caption, color: colors.textMuted },

    facts: {
      flexDirection: 'row',
      gap: spacing.lg,
      paddingVertical: spacing.lg,
      marginTop: spacing.sm,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    fact: { flex: 1, gap: 2 },
    factValue: { ...typography.subheading, fontSize: 15, color: colors.text },
    factLabel: { ...typography.caption, fontSize: 12, color: colors.textFaint },

    stateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dotOpen: { backgroundColor: colors.openBadge },
    dotClosed: { backgroundColor: colors.textFaint },
    stateText: { ...typography.body, fontSize: 14, color: colors.text, flex: 1 },

    tabs: {
      flexDirection: 'row',
      gap: spacing.lg,
      borderBottomWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderBottomWidth: 2,
      borderColor: 'transparent',
    },
    tabActive: { borderColor: colors.primary },
    tabLabel: { ...typography.body, fontSize: 14, color: colors.textMuted },
    tabLabelActive: { color: colors.text, fontWeight: '600' },
    tabBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.sm,
      backgroundColor: colors.tile,
    },
    tabBadgeText: { ...typography.label, fontSize: 10, color: colors.textMuted },

    chips: { gap: spacing.sm, paddingBottom: spacing.md, paddingRight: spacing.lg },
    chip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.tile,
    },
    chipActive: { backgroundColor: colors.primary },
    chipLabel: { ...typography.caption, fontSize: 13, color: colors.textMuted },
    chipLabelActive: { color: colors.textOnPrimary, fontWeight: '600' },

    menuGroup: { marginBottom: spacing.lg },
    menuGroupTitle: { ...typography.heading, fontSize: 17, color: colors.text },
    empty: { ...typography.caption, color: colors.textMuted, paddingVertical: spacing.lg },
    note: {
      ...typography.caption,
      color: colors.textFaint,
      lineHeight: 19,
      marginTop: spacing.sm,
    },

    about: { gap: spacing.md, paddingTop: spacing.sm },
    description: { ...typography.body, fontSize: 14, color: colors.text, lineHeight: 21 },
    aboutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    aboutText: { ...typography.body, fontSize: 14, color: colors.textMuted, flex: 1 },
    link: { color: colors.primaryDark },
    aboutTitle: { ...typography.subheading, color: colors.text, marginTop: spacing.md },
    dayRow: { flexDirection: 'row', justifyContent: 'space-between' },
    dayName: { ...typography.caption, color: colors.textMuted },
    dayHours: { ...typography.caption, color: colors.text },
  });
