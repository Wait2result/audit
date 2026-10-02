import type { NewsScope, NewsSummaryDto } from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCities, useNewsFeed } from '../src/api/queries';
import { Button } from '../src/components/Button';
import { FormHeader } from '../src/components/FormHeader';
import { Icon } from '../src/components/Icon';
import { NewsCard, NewsCardSkeleton } from '../src/components/NewsCard';
import { Screen } from '../src/components/Screen';
import { useCityStore } from '../src/store/city-store';
import { radius, spacing, typography, useThemeColors } from '../src/theme';

/**
 * Новости (Этап 5 ТЗ): четыре ленты — «Город», «Дагестан», «Россия», «Мир».
 *
 * Новости не пишутся у нас, а собираются сервером из проверенных источников
 * и отбираются по правилам (см. docs/ADR/0005-новости-агрегатор.md). «Дагестан»
 * одинаков во всех городах, «Город» — только выбранный.
 */
export default function NewsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const cityName = useCityStore((s) => s.cityName);
  const cityId = useCityStore((s) => s.cityId);

  const { data: cities } = useCities();
  const timeZone = cities?.find((city) => city.id === cityId)?.timezone ?? 'Europe/Moscow';

  // Раздел открывается на «Дагестане»: это главная лента, одинаковая для всех
  // городов. Городская вкладка рядом — у небольших городов новостей в ней мало
  const [scope, setScope] = useState<NewsScope>('dagestan');

  const feed = useNewsFeed(cityId, scope);
  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);

  const tabs: { scope: NewsScope; label: string }[] = [
    { scope: 'city', label: cityName ?? 'Город' },
    { scope: 'dagestan', label: 'Дагестан' },
    { scope: 'russia', label: 'Россия' },
    { scope: 'world', label: 'Мир' },
  ];

  const open = (item: NewsSummaryDto) =>
    router.push({ pathname: '/news/[id]', params: { id: item.id } });

  const header = (
    <View style={styles.header}>
      <FormHeader title="Новости" description={cityName ?? undefined} />

      <View style={styles.tabs}>
        {tabs.map((tab) => {
          const active = tab.scope === scope;
          return (
            <Pressable
              key={tab.scope}
              onPress={() => setScope(tab.scope)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.tab,
                // Название города длиннее остальных вкладок — ему нужно больше места
                tab.scope === 'city' && styles.tabCity,
                active && styles.tabActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[styles.tabLabel, active && styles.tabLabelActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NewsCard item={item} timeZone={timeZone} onOpen={() => open(item)} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          feed.isLoading ? (
            <View style={styles.list}>
              <NewsCardSkeleton />
              <NewsCardSkeleton />
            </View>
          ) : feed.isError ? (
            <View style={styles.center}>
              <Text style={styles.stateTitle}>Не удалось загрузить новости</Text>
              <Text style={styles.stateText}>
                Проверьте подключение к интернету и попробуйте снова.
              </Text>
              <Button
                label="Повторить"
                variant="secondary"
                loading={feed.isFetching}
                onPress={() => void feed.refetch()}
                fullWidth={false}
                style={styles.retry}
              />
            </View>
          ) : (
            <View style={styles.center}>
              <Icon name="news" size={40} color={colors.textFaint} />
              <Text style={styles.stateTitle}>
                {scope === 'city' ? 'Городских новостей пока нет' : 'Пока нет новостей'}
              </Text>
              <Text style={styles.stateText}>
                {scope === 'city'
                  ? 'За последние дни местные издания ничего не опубликовали о вашем городе. Новости всей республики — во вкладке «Дагестан».'
                  : 'Загляните позже — сервер обновляет ленту каждые 15 минут.'}
              </Text>
              {scope === 'city' && (
                <Button
                  label="Открыть «Дагестан»"
                  variant="secondary"
                  onPress={() => setScope('dagestan')}
                  fullWidth={false}
                  style={styles.retry}
                />
              )}
            </View>
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={styles.footerSpinner} />
          ) : null
        }
        ItemSeparatorComponent={Separator}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        refreshing={feed.isRefetching && !feed.isFetchingNextPage}
        onRefresh={() => void feed.refetch()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      />
    </Screen>
  );
}

function Separator() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.separator} />;
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    content: { paddingBottom: spacing.xxl },
    header: { gap: spacing.lg, marginBottom: spacing.lg },
    list: { gap: spacing.lg },
    separator: { height: spacing.lg },

    tabs: {
      flexDirection: 'row',
      gap: spacing.xs,
      padding: 4,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceMuted,
    },
    tab: {
      flex: 1,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
      borderRadius: radius.full,
    },
    tabCity: { flex: 1.45 },
    tabActive: { backgroundColor: colors.primary },
    tabLabel: { ...typography.subheading, fontSize: 14, color: colors.textMuted },
    tabLabelActive: { color: colors.textOnPrimary },
    pressed: { opacity: 0.85 },

    center: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xxxl,
      paddingHorizontal: spacing.lg,
    },
    stateTitle: { ...typography.subheading, color: colors.text, textAlign: 'center' },
    stateText: {
      ...typography.caption,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
    retry: { marginTop: spacing.md, paddingHorizontal: spacing.xl },
    footerSpinner: { paddingVertical: spacing.xl },
  });
