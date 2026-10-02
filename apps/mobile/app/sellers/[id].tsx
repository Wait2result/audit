import type { ListingAvailability, SellerListingDto } from '@dagestan/shared';
import { plural } from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSellerListings, useSellerProfile } from '../../src/api/queries';
import { Icon } from '../../src/components/Icon';
import { ListingCard } from '../../src/components/ListingCard';
import { Screen } from '../../src/components/Screen';
import { SellerAvatar } from '../../src/components/SellerAvatar';
import { useFavoriteActions } from '../../src/hooks/use-favorite-actions';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';
import { formatMemberSince } from '../../src/utils/member-since';

/**
 * Публичная страница продавца: кто он и что у него есть.
 *
 * Вкладки «Активные» — то, что продаётся сейчас, и «Завершённые» — проданное
 * и снятое автором. Проданное не исчезает: история продавца — тоже
 * информация для покупателя. Контактов здесь нет — связаться можно из
 * объявления; телефон, почта и адрес не показываются.
 */

type Tab = 'active' | 'completed';

const STATUS_LABEL: Record<ListingAvailability, string | null> = {
  active: null,
  sold: 'Продано',
  archived: 'Снято',
  unavailable: null,
};

export default function SellerScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('active');

  const profile = useSellerProfile(id);
  const listings = useSellerListings(id, tab);
  const { toggleListing } = useFavoriteActions();
  const items = useMemo(
    () => listings.data?.pages.flatMap((page) => page.items) ?? [],
    [listings.data],
  );

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/listings'));

  if (profile.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <Screen>
        <BackRow onBack={goBack} />
        <Text style={styles.notFound}>Продавец не найден или его профиль закрыт.</Text>
      </Screen>
    );
  }

  const seller = profile.data;

  const header = (
    <View>
      <BackRow onBack={goBack} />

      <View style={styles.profile}>
        <SellerAvatar name={seller.name} avatar={seller.avatar} size={72} />
        <View style={styles.profileTexts}>
          <Text style={styles.name}>{seller.name}</Text>
          <Text style={styles.meta}>На площадке с {formatMemberSince(seller.memberSince)}</Text>
          <View style={styles.badges}>
            {seller.isVerified && (
              <View style={styles.badge}>
                <Icon name="check" size={12} color={colors.primary} />
                <Text style={styles.badgeText}>Телефон подтверждён</Text>
              </View>
            )}
            {seller.rating && (
              <View style={styles.badge}>
                <Icon name="star" size={12} color={colors.star} />
                <Text style={styles.badgeText}>
                  {seller.rating.average.toFixed(1)} ·{' '}
                  {plural(seller.rating.count, 'оценка', 'оценки', 'оценок')}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.tabs}>
        <TabButton
          label={`Активные · ${seller.activeCount}`}
          active={tab === 'active'}
          onPress={() => setTab('active')}
        />
        <TabButton
          label={`Завершённые · ${seller.completedCount}`}
          active={tab === 'completed'}
          onPress={() => setTab('completed')}
        />
      </View>
    </View>
  );

  return (
    <Screen padded={false}>
      <FlatList<SellerListingDto>
        key={tab}
        data={items}
        keyExtractor={(row) => row.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            statusLabel={STATUS_LABEL[item.availability]}
            onOpen={() => router.push({ pathname: '/listings/[id]', params: { id: item.id } })}
            onToggleFavorite={
              item.availability === 'active' ? () => toggleListing(item) : undefined
            }
          />
        )}
        onEndReached={() => {
          if (listings.hasNextPage && !listings.isFetchingNextPage) void listings.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          listings.isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <Text style={styles.empty}>
              {tab === 'active'
                ? 'У пользователя пока нет активных объявлений.'
                : 'Завершённых объявлений пока нет.'}
            </Text>
          )
        }
      />
    </Screen>
  );
}

function BackRow({ onBack }: { onBack: () => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.backRow}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Назад"
        hitSlop={12}
      >
        <Icon name="chevron-left" size={24} color={colors.text} />
      </Pressable>
      <Text style={styles.backTitle}>Продавец</Text>
    </View>
  );
}

function TabButton({
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
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    loader: { marginTop: spacing.xxxl },
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
    row: { gap: spacing.md, marginBottom: spacing.md, alignItems: 'stretch' },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    backTitle: { ...typography.heading, color: colors.text },
    notFound: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.xxl,
    },

    profile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      marginTop: spacing.lg,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    profileTexts: { flex: 1, gap: 4 },
    name: { ...typography.heading, color: colors.text },
    meta: { ...typography.caption, color: colors.textMuted },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
    },
    badgeText: { ...typography.label, color: colors.text },

    tabs: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabLabel: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
    tabLabelActive: { color: colors.textOnPrimary },
    empty: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.xxl,
    },
  });
