import { ORDER_STATUS_LABELS, isOrderActive, type OrderDto } from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { useMyOrders } from '../src/api/queries';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { FormHeader } from '../src/components/FormHeader';
import { Icon } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { useAuthStore } from '../src/store/auth-store';
import { spacing, typography, useThemeColors } from '../src/theme';
import { formatMoney } from '../src/utils/money';

/** Мои заказы (Этап 6). Заказы в работе — наверху. */
export default function OrdersScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const feed = useMyOrders(Boolean(user));

  const orders = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);

  return (
    <Screen>
      <FlatList
        data={orders}
        keyExtractor={(order) => order.id}
        ListHeaderComponent={<FormHeader title="Мои заказы" />}
        renderItem={({ item }) => (
          <OrderRow
            order={item}
            onPress={() => router.push({ pathname: '/orders/[id]', params: { id: item.id } })}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          feed.isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <View style={styles.center}>
              <Icon name="food" size={40} color={colors.textFaint} />
              <Text style={styles.stateTitle}>Заказов пока нет</Text>
              <Button
                label="Выбрать заведение"
                variant="secondary"
                onPress={() => router.push('/places')}
                fullWidth={false}
                style={styles.action}
              />
            </View>
          )
        }
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        refreshing={feed.isRefetching}
        onRefresh={() => void feed.refetch()}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

function OrderRow({ order, onPress }: { order: OrderDto; onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Card padded onPress={onPress} accessibilityLabel={`Заказ №${order.number}`}>
      <View style={styles.row}>
        <Text style={styles.place}>{order.placeName}</Text>
        <Text style={[styles.status, isOrderActive(order.status) ? styles.active : styles.done]}>
          {ORDER_STATUS_LABELS[order.status]}
        </Text>
      </View>
      <Text style={styles.meta}>
        Заказ №{order.number} · {order.items.length} поз. · {formatMoney(order.total)}
      </Text>
    </Card>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    content: { paddingBottom: spacing.xxl },
    separator: { height: spacing.md },
    loader: { paddingVertical: spacing.xxl },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    place: { ...typography.subheading, color: colors.text, flex: 1 },
    status: { ...typography.caption, fontSize: 12 },
    active: { color: colors.primaryDark },
    done: { color: colors.textFaint },
    meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

    center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
    stateTitle: { ...typography.subheading, color: colors.text },
    action: { marginTop: spacing.md, paddingHorizontal: spacing.xl },
  });
