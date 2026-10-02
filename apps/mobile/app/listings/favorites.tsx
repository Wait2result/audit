import type { FavoriteListingAvailability, FavoriteListingDto } from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useFavoriteListings } from '../../src/api/queries';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { ListingCard } from '../../src/components/ListingCard';
import { Screen } from '../../src/components/Screen';
import { useFavoriteActions } from '../../src/hooks/use-favorite-actions';
import { useAuthStore } from '../../src/store/auth-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';

/**
 * Объявления → Избранное.
 *
 * Здесь только объявления: заведения и блюда — в избранном «Доставки»,
 * сводка по всему — в профиле. Проданное и снятое не исчезает молча, а
 * остаётся с пометкой: человек сохранил вещь и должен узнать, что с ней.
 */

const AVAILABILITY_LABEL: Record<FavoriteListingAvailability, string | null> = {
  active: null,
  sold: 'Продано',
  archived: 'Снято с публикации',
  unavailable: 'Недоступно',
};

export default function ListingFavoritesScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const favorites = useFavoriteListings(Boolean(user));
  const { toggleListing } = useFavoriteActions();
  const items = useMemo(
    () => favorites.data?.pages.flatMap((page) => page.items) ?? [],
    [favorites.data],
  );

  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/listings'))}
        accessibilityRole="button"
        accessibilityLabel="Назад"
        hitSlop={12}
      >
        <Icon name="chevron-left" size={24} color={colors.text} />
      </Pressable>
      <Text style={styles.title}>Избранные объявления</Text>
    </View>
  );

  if (!user) {
    return (
      <Screen>
        {header}
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Войдите, чтобы сохранять объявления</Text>
          <Text style={styles.emptyText}>
            Отмеченные сердечком объявления соберутся здесь и будут на любом телефоне.
          </Text>
          <Button label="Войти" onPress={() => router.push('/auth/login?back=1')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList<FavoriteListingDto>
        data={items}
        keyExtractor={(row) => row.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            statusLabel={AVAILABILITY_LABEL[item.availability]}
            onOpen={() => router.push({ pathname: '/listings/[id]', params: { id: item.id } })}
            onToggleFavorite={() => toggleListing(item)}
          />
        )}
        onEndReached={() => {
          if (favorites.hasNextPage && !favorites.isFetchingNextPage) {
            void favorites.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        refreshing={favorites.isRefetching}
        onRefresh={() => void favorites.refetch()}
        ListEmptyComponent={
          favorites.isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Icon name="heart" size={28} color={colors.danger} />
              </View>
              <Text style={styles.emptyTitle}>Пока нет избранных объявлений</Text>
              <Text style={styles.emptyText}>
                Нажмите ♡ на объявлении — оно сохранится здесь. Если его продадут или снимут, здесь
                будет видно.
              </Text>
              <Button label="К объявлениям" onPress={() => router.replace('/listings')} />
            </View>
          )
        }
      />
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
    row: { gap: spacing.md, marginBottom: spacing.md, alignItems: 'stretch' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    title: { ...typography.heading, color: colors.text },
    loader: { marginTop: spacing.xxxl },
    empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.dangerSoft,
    },
    emptyTitle: { ...typography.subheading, color: colors.text, textAlign: 'center' },
    emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  });
