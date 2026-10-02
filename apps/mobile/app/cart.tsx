import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { usePlace } from '../src/api/queries';
import { Button } from '../src/components/Button';
import { FormHeader } from '../src/components/FormHeader';
import { Icon } from '../src/components/Icon';
import { QuantityStepper } from '../src/components/QuantityStepper';
import { RemoteImage } from '../src/components/RemoteImage';
import { Screen } from '../src/components/Screen';
import { cartCount, cartTotal, useCartStore, type CartLine } from '../src/store/cart-store';
import { radius, shadow, spacing, typography, useThemeColors } from '../src/theme';
import { formatMoney } from '../src/utils/money';
import { pluralize } from '@dagestan/shared';

/**
 * Корзины (Этап 6).
 *
 * У каждого заведения своя корзина, вверху — переключатель между ними.
 * Заказ всё равно оформляется в одно заведение: это одна кухня и одна
 * доставка. Открывается та корзина, из которой пришли, а если пришли с
 * витрины — та, что трогали последней.
 *
 * Суммы здесь предварительные: окончательный счёт считает сервер на экране
 * оформления. Поля промокода нет — системы промокодов в этом этапе нет, а
 * пустое поле обещало бы скидку, которой не существует.
 */
export default function CartScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const params = useLocalSearchParams<{ placeId?: string }>();
  const carts = useCartStore((s) => s.carts);
  const isLoaded = useCartStore((s) => s.isLoaded);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);

  // Свежие корзины первыми: последнюю собранную человек и ищет
  const ordered = useMemo(() => [...carts].sort((a, b) => b.updatedAt - a.updatedAt), [carts]);

  const [activeId, setActiveId] = useState<string | null>(
    params.placeId ? String(params.placeId) : null,
  );

  // Выбранная корзина могла опустеть — тогда переходим на соседнюю
  const active = ordered.find((cart) => cart.placeId === activeId) ?? ordered[0] ?? null;

  useEffect(() => {
    if (active && active.placeId !== activeId) setActiveId(active.placeId);
  }, [active, activeId]);

  const { data: place } = usePlace(active?.placeId ?? '');

  // Пока корзины не поднялись из памяти телефона, показывать «пусто» нельзя:
  // человек решит, что заказ потерялся, и начнёт собирать его заново
  if (!isLoaded) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  if (!active) {
    return (
      <Screen scroll>
        <FormHeader title="Корзина" />
        <View style={styles.center}>
          <Icon name="cart" size={40} color={colors.textFaint} />
          <Text style={styles.stateTitle}>Корзина пуста</Text>
          <Text style={styles.stateText}>Выберите ресторан и добавьте блюда.</Text>
          <Button
            label="К ресторанам"
            variant="secondary"
            onPress={() => router.replace('/places')}
            fullWidth={false}
            style={styles.action}
          />
        </View>
      </Screen>
    );
  }

  const total = cartTotal(active.lines);
  const freeFrom = place?.delivery.hasDelivery ? place.delivery.freeDeliveryFrom : null;
  const toFree = freeFrom ? Math.max(0, freeFrom - total) : null;

  const confirmClear = () => {
    Alert.alert(
      'Очистить корзину?',
      `Блюда из «${active.placeName}» исчезнут. Остальные корзины останутся.`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Очистить', style: 'destructive', onPress: () => clear(active.placeId) },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <Screen scroll>
        <View style={styles.head}>
          <View style={styles.headTitle}>
            <FormHeader title="Корзина" />
          </View>
          <Pressable
            onPress={confirmClear}
            accessibilityRole="button"
            accessibilityLabel={`Очистить корзину ${active.placeName}`}
            hitSlop={10}
            style={({ pressed }) => [styles.trash, pressed && styles.pressed]}
          >
            <Icon name="trash" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Переключатель корзин: по одной на заведение */}
        {ordered.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.switcherScroll}
            contentContainerStyle={styles.switcher}
          >
            {ordered.map((cart) => {
              const selected = cart.placeId === active.placeId;

              return (
                <Pressable
                  key={cart.placeId}
                  onPress={() => setActiveId(cart.placeId)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.chipName} numberOfLines={1}>
                    {cart.placeName}
                  </Text>
                  <Text style={styles.chipMeta}>
                    {formatMoney(cartTotal(cart.lines))} ·{' '}
                    {pluralize(cartCount(cart.lines), 'позиция', 'позиции', 'позиций')}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {ordered.length === 1 && <Text style={styles.place}>{active.placeName}</Text>}

        <View style={styles.lines}>
          {active.lines.map((line) => (
            <CartRow
              key={line.key}
              line={line}
              onChange={(quantity) => setQuantity(active.placeId, line.key, quantity)}
              onRemove={() => remove(active.placeId, line.key)}
            />
          ))}
        </View>

        <Pressable
          onPress={() => router.push({ pathname: '/places/[id]', params: { id: active.placeId } })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
        >
          <Text style={styles.menuButtonText}>Открыть меню</Text>
        </Pressable>

        {toFree !== null && freeFrom !== null && (
          <View style={styles.freeBox}>
            <View style={styles.freeTrack}>
              <View
                style={[styles.freeFill, { width: `${Math.min(100, (total / freeFrom) * 100)}%` }]}
              />
            </View>
            <Text style={styles.freeText}>
              {toFree > 0
                ? `Ещё ${formatMoney(toFree)} до бесплатной доставки`
                : 'Доставка будет бесплатной'}
            </Text>
          </View>
        )}
      </Screen>

      <View style={styles.bottomBar}>
        <View style={styles.bottomSummary}>
          <Text style={styles.bottomLabel}>Блюда</Text>
          <Text style={styles.bottomValue}>{formatMoney(total)}</Text>
        </View>
        <Text style={styles.hint}>Доставку и итог посчитает ресторан на следующем шаге.</Text>
        <Button
          label="Оформить заказ"
          onPress={() =>
            router.push({ pathname: '/checkout', params: { placeId: active.placeId } })
          }
        />
      </View>
    </View>
  );
}

function CartRow({
  line,
  onChange,
  onRemove,
}: {
  line: CartLine;
  onChange: (quantity: number) => void;
  onRemove: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <RemoteImage
        uri={line.imageUrl}
        style={styles.thumb}
        containerStyle={styles.thumbPlaceholder}
        fallback={<Icon name="food" size={20} color="rgba(255,255,255,0.5)" />}
      />

      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          <Text style={styles.rowName} numberOfLines={2}>
            {line.name}
          </Text>
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Убрать «${line.name}» из корзины`}
            hitSlop={10}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Icon name="trash" size={17} color={colors.textFaint} />
          </Pressable>
        </View>

        {(line.portion || line.optionNames.length > 0) && (
          <Text style={styles.rowMeta} numberOfLines={2}>
            {[line.portion, ...line.optionNames].filter(Boolean).join(' · ')}
          </Text>
        )}

        <View style={styles.rowFoot}>
          <Text style={styles.rowPrice}>{formatMoney(line.unitPrice * line.quantity)}</Text>
          <QuantityStepper value={line.quantity} onChange={onChange} min={1} max={99} compact />
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    pressed: { opacity: 0.7 },
    loader: { paddingVertical: spacing.xxxl },

    center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
    stateTitle: { ...typography.heading, fontSize: 18, color: colors.text },
    stateText: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
    action: { marginTop: spacing.md },

    head: { flexDirection: 'row', alignItems: 'flex-end' },
    headTitle: { flex: 1 },
    trash: { padding: spacing.sm, marginBottom: spacing.xs },

    switcherScroll: { flexGrow: 0, marginHorizontal: -spacing.lg, marginVertical: spacing.lg },
    switcher: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: 'flex-start' },
    chip: {
      maxWidth: 220,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      gap: 2,
    },
    chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    chipName: { ...typography.subheading, fontSize: 15, color: colors.text },
    chipMeta: { ...typography.caption, fontSize: 12, color: colors.textMuted },

    place: { ...typography.caption, color: colors.textMuted, marginVertical: spacing.lg },

    lines: { gap: spacing.sm },
    row: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      ...shadow.card,
    },
    thumb: { width: 60, height: 60, borderRadius: radius.md },
    thumbPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#8a7a5f',
    },

    rowBody: { flex: 1, gap: 2 },
    rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    rowName: { ...typography.subheading, fontSize: 14, color: colors.text, flex: 1 },
    rowMeta: { ...typography.caption, fontSize: 12, color: colors.textFaint },
    rowFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    rowPrice: { ...typography.subheading, fontSize: 14, color: colors.text },

    menuButton: {
      marginTop: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.tile,
      alignItems: 'center',
    },
    menuButtonText: { ...typography.subheading, fontSize: 15, color: colors.text },

    freeBox: { marginTop: spacing.xl, gap: spacing.sm },
    freeTrack: { height: 6, borderRadius: 3, backgroundColor: colors.tile, overflow: 'hidden' },
    freeFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
    freeText: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },

    bottomBar: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl + spacing.sm,
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    bottomSummary: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    bottomLabel: { ...typography.body, fontSize: 14, color: colors.textMuted },
    bottomValue: { ...typography.heading, fontSize: 18, color: colors.text },
    hint: { ...typography.caption, fontSize: 12, color: colors.textFaint },
  });
