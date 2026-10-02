import {
  LISTING_ARCHIVE_REASON_LABELS,
  ModerationStatus,
  plural,
  type MyListingDto,
} from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  useArchiveListing,
  useBumpListing,
  useDeleteListing,
  useMyListings,
  usePublishListing,
  useResubmitListing,
} from '../src/api/queries';
import { Icon } from '../src/components/Icon';
import { RemoteImage } from '../src/components/RemoteImage';
import { Screen } from '../src/components/Screen';
import { formatPrice, formatWhen } from '../src/components/ListingCard';
import { useToastStore } from '../src/store/toast-store';
import { radius, shadow, spacing, typography, useThemeColors } from '../src/theme';
import { confirmAsync } from '../src/utils/confirm';
import { shareListing } from '../src/utils/share';

/**
 * Мои объявления (Этап 7, часть 2).
 *
 * Кабинет автора, а не витрина: здесь видно то, чего в ленте нет вообще, —
 * черновики и снятое, а у каждой карточки есть действия. Поэтому карточка
 * своя, горизонтальная и в один столбец: в кабинете человек читает цифры и
 * нажимает кнопки, а не разглядывает фотографии.
 *
 * Вкладки — по состоянию: «Активные», «На проверке» (ждёт решения или
 * снято модератором — с причиной), «Черновики», «Архив». Смешивать их в
 * одном списке значит показывать рядом то, что видят покупатели, и то, что
 * не видит никто.
 */

const TABS = [
  { key: 'active', label: 'Активные', filter: { status: ModerationStatus.APPROVED } },
  { key: 'review', label: 'На проверке', filter: { group: 'review' } },
  { key: 'drafts', label: 'Черновики', filter: { status: ModerationStatus.DRAFT } },
  { key: 'archive', label: 'Архив', filter: { status: ModerationStatus.ARCHIVED } },
] as const;

export default function MyListingsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const toast = useToastStore((s) => s.show);

  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('active');
  const filter = TABS.find((item) => item.key === tab)?.filter ?? {};

  const feed = useMyListings(filter);
  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);

  const bump = useBumpListing();
  const publish = usePublishListing();
  const archive = useArchiveListing();
  const remove = useDeleteListing();
  const resubmit = useResubmitListing();

  const onResubmit = (listing: MyListingDto) => {
    resubmit.mutate(listing.id, {
      onSuccess: () => toast('Отправлено на проверку'),
      // «Заполните обязательные поля» — сервер скажет, чего не хватает
      onError: (error: Error) => toast(error.message),
    });
  };

  const onBump = (listing: MyListingDto) => {
    bump.mutate(listing.id, {
      onSuccess: () => toast('Объявление поднято наверх'),
      // Сервер отвечает «через сколько часов» — это полезнее, чем «ошибка»
      onError: (error: Error) => toast(error.message),
    });
  };

  const onSold = async (listing: MyListingDto) => {
    const confirmed = await confirmAsync(
      'Отметить проданным?',
      'Объявление уйдёт в архив. Вернуть его можно одной кнопкой.',
      { confirmLabel: 'Продано' },
    );
    if (!confirmed) return;

    archive.mutate(
      { id: listing.id, reason: 'sold' },
      { onSuccess: () => toast('Объявление в архиве') },
    );
  };

  const onPublish = (listing: MyListingDto) => {
    publish.mutate(listing.id, {
      onSuccess: () => toast('Объявление опубликовано'),
      onError: (error: Error) => toast(error.message),
    });
  };

  const onRemove = async (listing: MyListingDto) => {
    const confirmed = await confirmAsync(
      'Удалить объявление?',
      'Его не будет ни в ленте, ни в кабинете.',
      { confirmLabel: 'Удалить', destructive: true },
    );
    if (!confirmed) return;

    remove.mutate(listing.id, { onSuccess: () => toast('Объявление удалено') });
  };

  const header = (
    <View>
      <View style={styles.topRow}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/listings'))}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={12}
        >
          <Icon name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Мои объявления</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setTab(item.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === item.key }}
            style={({ pressed }) => [
              styles.tab,
              tab === item.key && styles.tabActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.tabLabel, tab === item.key && styles.tabLabelActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(listing) => listing.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <MyListingRow
            listing={item}
            onOpen={() => router.push({ pathname: '/listings/[id]', params: { id: item.id } })}
            onBump={() => onBump(item)}
            onSold={() => void onSold(item)}
            onPublish={() => onPublish(item)}
            onRemove={() => void onRemove(item)}
            onEdit={() => router.push({ pathname: '/listings/edit/[id]', params: { id: item.id } })}
            onResubmit={() => onResubmit(item)}
            onShare={() =>
              void shareListing({ id: item.id, title: item.title, priceText: formatPrice(item) })
            }
          />
        )}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          feed.isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{EMPTY_TEXT[tab]}</Text>
              {tab !== 'archive' && (
                <Pressable
                  onPress={() => router.push('/listings/new')}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.publishButton, pressed && styles.pressed]}
                >
                  <Icon name="plus" size={16} color={colors.textOnPrimary} />
                  <Text style={styles.publishLabel}>Разместить</Text>
                </Pressable>
              )}
            </View>
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : null
        }
      />
    </Screen>
  );
}

const EMPTY_TEXT: Record<(typeof TABS)[number]['key'], string> = {
  active: 'Активных объявлений нет. Разместите первое — его увидят все.',
  review:
    'Здесь нет объявлений на проверке. Если модератор снимет объявление, оно появится здесь с причиной.',
  drafts: 'Черновиков нет. Незаконченное объявление сохранится здесь само.',
  archive: 'В архиве пусто. Сюда попадает проданное и снятое.',
};

/** Карточка кабинета: цифры и действия, а не витрина. */
function MyListingRow({
  listing,
  onOpen,
  onBump,
  onSold,
  onPublish,
  onRemove,
  onEdit,
  onResubmit,
  onShare,
}: {
  listing: MyListingDto;
  onOpen: () => void;
  onBump: () => void;
  onSold: () => void;
  onPublish: () => void;
  onRemove: () => void;
  onEdit: () => void;
  onResubmit: () => void;
  onShare: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const photo = listing.cover?.thumbnailUrl ?? listing.cover?.url ?? null;
  const isActive = listing.status === ModerationStatus.APPROVED;
  const isDraft = listing.status === ModerationStatus.DRAFT;
  const isSuspended =
    listing.status === ModerationStatus.SUSPENDED || listing.status === ModerationStatus.REJECTED;
  const isPending = listing.status === ModerationStatus.PENDING;

  return (
    <View style={styles.card}>
      <Pressable onPress={onOpen} accessibilityRole="button" style={styles.cardTop}>
        <View style={styles.thumb}>
          <RemoteImage
            uri={photo}
            style={styles.thumbImage}
            containerStyle={styles.thumbPlaceholder}
            fallback={<Icon name="image" size={20} color="rgba(255,255,255,0.5)" />}
          />
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {listing.title}
          </Text>
          <Text style={styles.cardPrice}>{formatPrice(listing)}</Text>

          {/* Снятое сотрудником — с причиной: «снято без объяснений» это
              повод для спора, который нечем закрыть */}
          {isSuspended && (
            <Text style={styles.suspended} numberOfLines={3}>
              Снято модератором
              {listing.statusReason ? `: ${listing.statusReason}` : ''}. Исправьте и отправьте на
              проверку.
            </Text>
          )}
          {isPending && (
            <Text style={styles.cardMeta}>На проверке у модератора — обычно до суток</Text>
          )}

          {listing.archiveReason && (
            <Text style={styles.cardMeta}>
              {LISTING_ARCHIVE_REASON_LABELS[listing.archiveReason]}
            </Text>
          )}

          {isDraft ? (
            <Text style={styles.cardMeta}>Черновик — его не видит никто</Text>
          ) : (
            <Text style={styles.cardMeta}>
              {listing.viewsCount}{' '}
              {plural(listing.viewsCount, 'просмотр', 'просмотра', 'просмотров')}
              {' · '}
              {listing.phoneViewsCount}{' '}
              {plural(listing.phoneViewsCount, 'звонок', 'звонка', 'звонков')}
              {' · '}
              {formatWhen(listing.bumpedAt)}
            </Text>
          )}
        </View>
      </Pressable>

      <View style={styles.actions}>
        {isActive && (
          <>
            <Action
              icon="arrow-up"
              label={listing.canBump ? 'Поднять' : `Через ${listing.hoursUntilBump} ч`}
              disabled={!listing.canBump}
              onPress={onBump}
            />
            <Action icon="check" label="Продано" onPress={onSold} />
          </>
        )}

        {isSuspended && <Action icon="arrow-up" label="На проверку" onPress={onResubmit} />}

        {(isDraft || listing.status === ModerationStatus.ARCHIVED) && (
          <Action
            icon="arrow-up"
            label={isDraft ? 'Опубликовать' : 'Вернуть'}
            onPress={onPublish}
          />
        )}

        {/* Снятое сотрудником и архив правятся тоже, но со своего экрана —
            здесь только то, что можно поправить без лишних вопросов */}
        {(isActive || isDraft || isSuspended) && (
          <Action icon="edit" label="Изменить" onPress={onEdit} />
        )}
        {isActive && <Action icon="route" label="Поделиться" onPress={onShare} />}

        <Action icon="close" label="Удалить" onPress={onRemove} />
      </View>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.action,
        disabled && styles.actionDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Icon name={icon} size={14} color={disabled ? colors.textFaint : colors.primary} />
      <Text style={[styles.actionLabel, disabled && styles.actionLabelDisabled]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
    loader: { marginVertical: spacing.xl },
    pressed: { opacity: 0.85 },

    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    title: { ...typography.heading, color: colors.text },

    tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    tab: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabLabel: { ...typography.caption, color: colors.textMuted },
    tabLabelActive: { color: colors.textOnPrimary, fontWeight: '600' },

    card: {
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      ...shadow.card,
    },
    cardTop: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
    thumb: { width: 84, height: 84, borderRadius: radius.md, overflow: 'hidden' },
    thumbImage: { width: '100%', height: '100%' },
    thumbPlaceholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inkSoft,
    },
    cardBody: { flex: 1, gap: 2 },
    cardTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
    cardPrice: { ...typography.body, color: colors.text },
    cardMeta: { ...typography.label, color: colors.textFaint, marginTop: 2 },
    suspended: { ...typography.caption, color: colors.danger },

    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    action: {
      flexGrow: 1,
      flexBasis: '30%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: spacing.md,
    },
    actionDisabled: { opacity: 0.6 },
    actionLabel: { ...typography.caption, color: colors.primary },
    actionLabelDisabled: { color: colors.textFaint },

    empty: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xxxl },
    emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
    publishButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
    },
    publishLabel: { ...typography.body, fontWeight: '600', color: colors.textOnPrimary },
  });
