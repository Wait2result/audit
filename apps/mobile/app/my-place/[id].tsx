import { useMemo } from 'react';
import { canManagePlace, PLACE_MEMBER_ROLE_LABELS, pluralize } from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';

import { useMyMenu, useMyPlace, useMyPlaces, useUpdateMyPlace } from '../../src/api/queries';
import { Card } from '../../src/components/Card';
import { FormHeader } from '../../src/components/FormHeader';
import { GlassCard } from '../../src/components/GlassCard';
import { Screen } from '../../src/components/Screen';
import { useAuthStore } from '../../src/store/auth-store';
import { spacing, typography, useThemeColors } from '../../src/theme';

/**
 * Главный экран заведения (Этап 6).
 *
 * Показывает только то, что доступно этому уровню: сотрудник видит меню
 * со стоп-листом, управляющий — ещё настройки. Скрытые кнопки — удобство,
 * а не защита: сервер проверяет права на каждом запросе.
 */
export default function MyPlaceScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const placeId = String(id);

  const user = useAuthStore((s) => s.user);
  const { data: places } = useMyPlaces(Boolean(user));
  const { data: place, isLoading } = useMyPlace(placeId);
  const { data: menu } = useMyMenu(placeId);
  const updatePlace = useUpdateMyPlace(placeId);

  const membership = places?.find((item) => item.id === placeId);
  const isManager = membership ? canManagePlace(membership.role) : false;

  const itemCount = menu?.categories.reduce((sum, category) => sum + category.items.length, 0) ?? 0;
  const stopped =
    menu?.categories.reduce(
      (sum, category) => sum + category.items.filter((item) => !item.isAvailable).length,
      0,
    ) ?? 0;

  return (
    <Screen scroll>
      <FormHeader
        title={place?.name ?? 'Заведение'}
        description={membership ? PLACE_MEMBER_ROLE_LABELS[membership.role] : undefined}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
      />

      {isLoading && <ActivityIndicator color={colors.primary} style={styles.loader} />}

      {place && (
        <View style={styles.page}>
          <GlassCard style={styles.statusCard}>
            <View style={styles.statusRow}>
              <View style={styles.statusText}>
                <Text style={styles.statusTitle}>Принимаем заказы</Text>
                <Text style={styles.statusHint}>
                  {place.ordersEnabled
                    ? 'Покупатели могут оформить заказ'
                    : 'Заведение видно в каталоге, но заказать нельзя'}
                </Text>
              </View>
              <Switch
                value={place.ordersEnabled}
                disabled={!isManager || updatePlace.isPending}
                onValueChange={(value) => updatePlace.mutate({ ordersEnabled: value })}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
            <Text style={styles.state}>{place.openState.label}</Text>
          </GlassCard>

          <Card
            padded
            onPress={() =>
              router.push({ pathname: '/my-place/[id]/orders', params: { id: placeId } })
            }
            accessibilityLabel="Заказы заведения"
          >
            <Text style={styles.linkTitle}>Заказы</Text>
            <Text style={styles.linkHint}>Принять, отметить готовность и выдачу</Text>
          </Card>

          <Card
            padded
            onPress={() =>
              router.push({ pathname: '/my-place/[id]/menu', params: { id: placeId } })
            }
            accessibilityLabel="Меню заведения"
          >
            <Text style={styles.linkTitle}>Меню</Text>
            <Text style={styles.linkHint}>
              {itemCount === 0
                ? 'Пока пусто — добавьте первый раздел'
                : `${pluralize(itemCount, 'позиция', 'позиции', 'позиций')}${
                    stopped > 0 ? `, ${stopped} в стоп-листе` : ''
                  }`}
            </Text>
          </Card>

          {isManager && (
            <Card
              padded
              onPress={() =>
                router.push({ pathname: '/my-place/[id]/settings', params: { id: placeId } })
              }
              accessibilityLabel="Настройки заведения"
            >
              <Text style={styles.linkTitle}>Настройки</Text>
              <Text style={styles.linkHint}>Часы работы, контакты, доставка, фотография</Text>
            </Card>
          )}

          {!isManager && (
            <Text style={styles.note}>
              Цены и настройки заведения меняет управляющий. Вам доступен стоп-лист.
            </Text>
          )}
        </View>
      )}
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    loader: { paddingVertical: spacing.xxl },
    page: { gap: spacing.md },

    statusCard: { padding: spacing.lg, gap: spacing.sm },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    statusText: { flex: 1, gap: 2 },
    statusTitle: { ...typography.subheading, color: colors.text },
    statusHint: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
    state: { ...typography.caption, color: colors.primaryDark },

    linkTitle: { ...typography.subheading, color: colors.text },
    linkHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    note: {
      ...typography.caption,
      color: colors.textFaint,
      lineHeight: 19,
      paddingHorizontal: spacing.xs,
    },
  });
