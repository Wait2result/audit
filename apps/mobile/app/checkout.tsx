import {
  FULFILLMENT_LABELS,
  FulfillmentType,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  type OrderQuoteDto,
} from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCreateOrder, useOrderQuote, usePlace } from '../src/api/queries';
import { Button } from '../src/components/Button';
import { FormHeader } from '../src/components/FormHeader';
import { GlassCard } from '../src/components/GlassCard';
import { Screen } from '../src/components/Screen';
import { TextField } from '../src/components/TextField';
import { useAuthStore } from '../src/store/auth-store';
import { useCartStore } from '../src/store/cart-store';
import { radius, spacing, typography, useThemeColors } from '../src/theme';
import { formatMoney } from '../src/utils/money';

/**
 * Оформление заказа (Этап 6).
 *
 * Все цифры на экране приходят с сервера: он пересчитывает заказ по своим
 * ценам и заодно говорит, можно ли заказать сейчас. Оплата — при получении:
 * онлайн-оплаты не будет до юрлица, кассы и договора с платёжным сервисом.
 */
export default function CheckoutScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const params = useLocalSearchParams<{ placeId?: string }>();
  const carts = useCartStore((s) => s.carts);
  const clearCart = useCartStore((s) => s.clear);
  const user = useAuthStore((s) => s.user);

  // Заказ оформляется в одно заведение — в то, чья корзина открыта.
  // Без параметра берём корзину, которую трогали последней
  const cart =
    carts.find((item) => item.placeId === params.placeId) ??
    [...carts].sort((a, b) => b.updatedAt - a.updatedAt)[0] ??
    null;
  const lines = cart?.lines ?? [];

  const { data: place } = usePlace(cart?.placeId ?? '');

  const [fulfillment, setFulfillment] = useState<FulfillmentType>(FulfillmentType.DELIVERY);
  const [payment, setPayment] = useState<PaymentMethod>(PaymentMethod.CASH_ON_DELIVERY);
  const [name, setName] = useState(user?.firstName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [address, setAddress] = useState('');
  const [addressComment, setAddressComment] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Если заведение не доставляет, выбор за человека уже сделан
  useEffect(() => {
    if (place && !place.delivery.hasDelivery) setFulfillment(FulfillmentType.PICKUP);
  }, [place]);

  const draft = useMemo(
    () => ({
      placeId: cart?.placeId ?? '',
      fulfillment,
      items: lines.map((line) => ({
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        optionIds: line.optionIds,
      })),
    }),
    [cart?.placeId, lines, fulfillment],
  );

  const { data: quote, isLoading } = useOrderQuote(draft, lines.length > 0);
  const createOrder = useCreateOrder();

  const isDelivery = fulfillment === FulfillmentType.DELIVERY;
  const ready =
    quote?.canOrder === true &&
    name.trim().length >= 2 &&
    phone.trim().length >= 10 &&
    (!isDelivery || address.trim().length >= 3);

  const submit = () => {
    if (!quote) return;
    setError(null);

    createOrder.mutate(
      {
        ...draft,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        address: isDelivery ? address.trim() : null,
        addressComment: addressComment.trim() || null,
        comment: comment.trim() || null,
        paymentMethod: payment,
        expectedTotal: quote.total,
      },
      {
        onSuccess: (order) => {
          // Очищаем только корзину этого заведения: остальные ждут своей очереди
          if (cart) clearCart(cart.placeId);
          router.replace({ pathname: '/orders/[id]', params: { id: order.id } });
        },
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : 'Не удалось оформить заказ';
          setError(message);
        },
      },
    );
  };

  if (!cart || lines.length === 0) {
    return (
      <Screen scroll>
        <FormHeader title="Оформление" />
        <Text style={styles.hint}>Корзина пуста.</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <FormHeader title="Оформление" description={cart.placeName} />

      <View style={styles.form}>
        <View style={styles.switcher}>
          {([FulfillmentType.DELIVERY, FulfillmentType.PICKUP] as FulfillmentType[])
            .filter(
              (type) =>
                !place ||
                (type === FulfillmentType.DELIVERY
                  ? place.delivery.hasDelivery
                  : place.delivery.hasPickup),
            )
            .map((type) => (
              <Option
                key={type}
                label={FULFILLMENT_LABELS[type]}
                active={fulfillment === type}
                onPress={() => setFulfillment(type)}
              />
            ))}
        </View>

        <TextField label="Имя" value={name} onChangeText={setName} />
        <TextField label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

        {isDelivery && (
          <>
            <TextField
              label="Адрес доставки"
              value={address}
              onChangeText={setAddress}
              placeholder="улица, дом, квартира"
            />
            <TextField
              label="Подъезд, этаж, домофон"
              value={addressComment}
              onChangeText={setAddressComment}
            />
          </>
        )}

        <TextField
          label="Комментарий заведению"
          value={comment}
          onChangeText={setComment}
          multiline
          placeholder="Без лука, позвонить заранее"
        />

        <Text style={styles.sectionTitle}>Оплата</Text>
        <View style={styles.switcher}>
          {(
            [PaymentMethod.CASH_ON_DELIVERY, PaymentMethod.CARD_ON_DELIVERY] as PaymentMethod[]
          ).map((method) => (
            <Option
              key={method}
              label={PAYMENT_METHOD_LABELS[method]}
              active={payment === method}
              onPress={() => setPayment(method)}
            />
          ))}
        </View>
        <Text style={styles.hint}>
          Онлайн-оплаты пока нет — рассчитываетесь с заведением при получении.
        </Text>

        <Summary quote={quote} isLoading={isLoading} />

        {error && <Text style={styles.error}>{error}</Text>}

        <Button
          label="Заказать"
          onPress={submit}
          disabled={!ready}
          loading={createOrder.isPending}
        />
      </View>
    </Screen>
  );
}

function Summary({ quote, isLoading }: { quote: OrderQuoteDto | undefined; isLoading: boolean }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (isLoading || !quote) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }

  return (
    <GlassCard style={styles.summary}>
      <Row label="Блюда" value={formatMoney(quote.itemsTotal)} />
      <Row
        label="Доставка"
        value={quote.deliveryFee === 0 ? 'бесплатно' : formatMoney(quote.deliveryFee)}
      />
      <View style={styles.divider} />
      <Row label="Итого" value={formatMoney(quote.total)} strong />

      {quote.problem && <Text style={styles.problem}>{quote.problem}</Text>}
    </GlassCard>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

function Option({
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
      style={({ pressed }) => [
        styles.option,
        active && styles.optionActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    form: { gap: spacing.md },
    sectionTitle: { ...typography.subheading, color: colors.text, marginTop: spacing.sm },
    hint: { ...typography.caption, color: colors.textFaint, lineHeight: 18 },
    error: { ...typography.caption, color: colors.danger, lineHeight: 18 },
    loader: { paddingVertical: spacing.lg },

    switcher: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    option: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    optionActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
    optionLabel: { ...typography.caption, color: colors.textMuted },
    optionLabelActive: { color: colors.primaryDark },
    pressed: { opacity: 0.85 },

    summary: { padding: spacing.lg, gap: spacing.xs, marginTop: spacing.sm },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    rowLabel: { ...typography.caption, color: colors.textMuted },
    rowValue: { ...typography.caption, color: colors.text },
    strong: { ...typography.subheading, fontSize: 15, color: colors.text },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
    problem: { ...typography.caption, color: colors.danger, marginTop: spacing.xs, lineHeight: 18 },
  });
