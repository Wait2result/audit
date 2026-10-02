import { useMemo } from 'react';
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  isOrderActive,
  type OrderDto,
  type OrderStatus,
} from '@dagestan/shared';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useChangeOrderStatus, usePlaceOrders } from '../../../src/api/queries';
import { Card } from '../../../src/components/Card';
import { FormHeader } from '../../../src/components/FormHeader';
import { Screen } from '../../../src/components/Screen';
import { radius, spacing, typography, useThemeColors } from '../../../src/theme';
import { formatMoney } from '../../../src/utils/money';

/**
 * Лента заказов заведения (Этап 6).
 *
 * Push-уведомлений о новом заказе пока нет, поэтому лента сама обновляется,
 * пока экран открыт. Это и есть причина, по которой приём заказов у каждого
 * заведения включается отдельно: кто-то должен смотреть в экран.
 */
export default function PlaceOrdersScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const placeId = String(id);

  const { data, isLoading } = usePlaceOrders(placeId);
  const changeStatus = useChangeOrderStatus(placeId);

  const orders = data?.items ?? [];
  const active = orders.filter((order) => isOrderActive(order.status));
  const finished = orders.filter((order) => !isOrderActive(order.status));

  return (
    <Screen scroll>
      <FormHeader title="Заказы" description="Список обновляется сам" />

      {isLoading && <ActivityIndicator color={colors.primary} style={styles.loader} />}

      {orders.length === 0 && !isLoading && (
        <Text style={styles.empty}>
          Заказов пока нет. Они появятся здесь, как только кто-то оформит заказ.
        </Text>
      )}

      {active.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>В работе</Text>
          {active.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={changeStatus.isPending}
              onChange={(status) => changeStatus.mutate({ orderId: order.id, status })}
            />
          ))}
        </View>
      )}

      {finished.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Завершённые</Text>
          {finished.map((order) => (
            <OrderCard key={order.id} order={order} busy={false} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function OrderCard({
  order,
  busy,
  onChange,
}: {
  order: OrderDto;
  busy: boolean;
  /** У завершённых заказов кнопок нет — менять уже нечего */
  onChange?: (status: OrderStatus) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const next = ORDER_TRANSITIONS[order.status];

  return (
    <Card padded style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.number}>Заказ №{order.number}</Text>
        <Text style={styles.status}>{ORDER_STATUS_LABELS[order.status]}</Text>
      </View>

      <Text style={styles.meta}>
        {FULFILLMENT_LABELS[order.fulfillment]} · {formatMoney(order.total)} ·{' '}
        {order.createdAt.slice(11, 16)}
      </Text>

      {order.items.map((item) => (
        <Text key={item.id} style={styles.item}>
          {item.name} × {item.quantity}
          {item.options.length > 0 ? ` (${item.options.map((o) => o.option).join(', ')})` : ''}
        </Text>
      ))}

      {order.address && <Text style={styles.detail}>Адрес: {order.address}</Text>}
      {order.addressComment && <Text style={styles.detail}>{order.addressComment}</Text>}
      {order.comment && <Text style={styles.detail}>Комментарий: {order.comment}</Text>}

      <Pressable
        onPress={() => void Linking.openURL(`tel:${order.customerPhone}`)}
        accessibilityRole="button"
        accessibilityLabel={`Позвонить ${order.customerName}`}
      >
        <Text style={styles.phone}>
          {order.customerName}, {order.customerPhone}
        </Text>
      </Pressable>

      {next.length > 0 && (
        <View style={styles.actions}>
          {next.map((status) => (
            <Pressable
              key={status}
              onPress={() => onChange?.(status)}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.action,
                status === 'cancelled' && styles.actionDanger,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[styles.actionLabel, status === 'cancelled' && styles.actionLabelDanger]}
              >
                {ORDER_STATUS_LABELS[status]}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    loader: { paddingVertical: spacing.xxl },
    empty: { ...typography.caption, color: colors.textMuted, lineHeight: 19 },
    group: { gap: spacing.md, marginBottom: spacing.xl },
    groupTitle: { ...typography.heading, fontSize: 17, color: colors.text },

    card: { gap: 4 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    number: { ...typography.subheading, color: colors.text },
    status: { ...typography.caption, color: colors.primaryDark },
    meta: { ...typography.caption, color: colors.textMuted },
    item: { ...typography.body, fontSize: 14, color: colors.text },
    detail: { ...typography.caption, color: colors.textMuted },
    phone: { ...typography.caption, color: colors.primaryDark, marginTop: spacing.xs },

    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    action: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
    },
    actionDanger: { backgroundColor: colors.dangerSoft },
    actionLabel: { ...typography.subheading, fontSize: 13, color: colors.primaryDark },
    actionLabelDanger: { color: colors.danger },
    pressed: { opacity: 0.8 },
  });
