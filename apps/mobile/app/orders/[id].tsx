import { useMemo } from 'react';
import {
  canCustomerCancel,
  FULFILLMENT_LABELS,
  ORDER_STATUS_HINTS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@dagestan/shared';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { useCancelOrder, useOrder } from '../../src/api/queries';
import { Button } from '../../src/components/Button';
import { FormHeader } from '../../src/components/FormHeader';
import { GlassCard } from '../../src/components/GlassCard';
import { Screen } from '../../src/components/Screen';
import { spacing, typography, useThemeColors } from '../../src/theme';
import { formatMoney } from '../../src/utils/money';

/**
 * Заказ: состав, сумма и текущее состояние (Этап 6).
 *
 * Статус обновляется сам, пока экран открыт: push-уведомлений пока нет,
 * а человек хочет видеть, что заказ приняли.
 */
export default function OrderScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading } = useOrder(String(id));
  const cancelOrder = useCancelOrder(String(id));

  const confirmCancel = () => {
    Alert.alert('Отменить заказ?', 'Заведение получит уведомление об отмене.', [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Отменить заказ',
        style: 'destructive',
        onPress: () => cancelOrder.mutate(undefined),
      },
    ]);
  };

  if (isLoading || !order) {
    return (
      <Screen scroll>
        <FormHeader title="Заказ" />
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <FormHeader title={`Заказ №${order.number}`} description={order.placeName} />

      <View style={styles.page}>
        <GlassCard style={styles.statusCard}>
          <Text style={styles.status}>{ORDER_STATUS_LABELS[order.status]}</Text>
          <Text style={styles.statusHint}>{ORDER_STATUS_HINTS[order.status]}</Text>
          {order.cancelReason && <Text style={styles.reason}>Причина: {order.cancelReason}</Text>}
        </GlassCard>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Состав</Text>
          {order.items.map((item) => (
            <View key={item.id} style={styles.item}>
              <View style={styles.itemText}>
                <Text style={styles.itemName}>
                  {item.name} × {item.quantity}
                </Text>
                {item.options.length > 0 && (
                  <Text style={styles.itemOptions}>
                    {item.options.map((option) => option.option).join(', ')}
                  </Text>
                )}
              </View>
              <Text style={styles.itemPrice}>{formatMoney(item.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <GlassCard style={styles.summary}>
          <Row label="Блюда" value={formatMoney(order.itemsTotal)} />
          <Row
            label="Доставка"
            value={order.deliveryFee === 0 ? 'бесплатно' : formatMoney(order.deliveryFee)}
          />
          <View style={styles.divider} />
          <Row label="Итого" value={formatMoney(order.total)} strong />
          <Text style={styles.payment}>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</Text>
        </GlassCard>

        <GlassCard style={styles.summary}>
          <Text style={styles.detail}>{FULFILLMENT_LABELS[order.fulfillment]}</Text>
          {order.address && <Text style={styles.detail}>{order.address}</Text>}
          {order.addressComment && <Text style={styles.detail}>{order.addressComment}</Text>}
          {order.comment && <Text style={styles.detail}>Комментарий: {order.comment}</Text>}
          <Text style={styles.detail}>
            {order.customerName}, {order.customerPhone}
          </Text>
        </GlassCard>

        {order.placePhone && (
          <Button
            label="Позвонить в заведение"
            variant="secondary"
            onPress={() => void Linking.openURL(`tel:${order.placePhone}`)}
          />
        )}

        {canCustomerCancel(order.status) && (
          <Button
            label="Отменить заказ"
            variant="ghost"
            onPress={confirmCancel}
            loading={cancelOrder.isPending}
          />
        )}
      </View>
    </Screen>
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

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    loader: { paddingVertical: spacing.xxl },
    page: { gap: spacing.md },

    statusCard: { padding: spacing.lg, gap: 2 },
    status: { ...typography.heading, fontSize: 18, color: colors.text },
    statusHint: { ...typography.caption, color: colors.textMuted },
    reason: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },

    section: { gap: spacing.sm },
    sectionTitle: { ...typography.subheading, color: colors.text },
    item: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
    itemText: { flex: 1 },
    itemName: { ...typography.body, color: colors.text },
    itemOptions: { ...typography.caption, color: colors.textMuted },
    itemPrice: { ...typography.body, color: colors.text },

    summary: { padding: spacing.lg, gap: spacing.xs },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    rowLabel: { ...typography.caption, color: colors.textMuted },
    rowValue: { ...typography.caption, color: colors.text },
    strong: { ...typography.subheading, fontSize: 15, color: colors.text },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
    payment: { ...typography.caption, color: colors.textFaint, marginTop: spacing.xs },
    detail: { ...typography.caption, color: colors.textMuted, lineHeight: 19 },
  });
