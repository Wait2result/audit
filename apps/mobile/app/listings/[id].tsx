import {
  APPROXIMATE_AREA_METERS,
  LISTING_CONDITION_LABELS,
  attributeValueLabel,
  catalogLayer,
  isAttributeVisible,
  isPartsCategory,
  cardFacts,
  formatListingAge,
  plural,
  type ListingAttribute,
  type ListingDetailsDto,
} from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  useListing,
  useListingCategories,
  useListings,
  useRevealPhone,
  useSellerProfile,
  type ListingFilters,
} from '../../src/api/queries';
import { Button } from '../../src/components/Button';
import { FavoriteButton } from '../../src/components/FavoriteButton';
import { LeafletMap } from '../../src/components/LeafletMap';
import { Icon } from '../../src/components/Icon';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Screen } from '../../src/components/Screen';
import { ListingCard, formatPrice, placeLine } from '../../src/components/ListingCard';
import { useFavoriteActions } from '../../src/hooks/use-favorite-actions';
import { useListingArea } from '../../src/hooks/use-listing-area';
import { SellerAvatar } from '../../src/components/SellerAvatar';
import { useCityStore } from '../../src/store/city-store';
import { formatMemberSince } from '../../src/utils/member-since';
import { shareListing } from '../../src/utils/share';
import { radius, shadow, spacing, typography, useThemeColors } from '../../src/theme';
import { PART_BLOCK_KEYS, PartBlock } from '../../src/components/PartBlock';
import { attributesOfCategory } from '../../src/utils/listing-category-lookup';

/**
 * Объявление целиком (Этап 7).
 *
 * Телефон приходит не вместе с карточкой, а по нажатию «Показать номер»:
 * так номера не собирает первый же скрипт, а продавец видит в кабинете,
 * сколько раз его открыли — эта цифра говорит ему больше, чем просмотры.
 */
export default function ListingScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();

  const area = useListingArea();
  const { data: listing, isLoading, isError, refetch, isFetching } = useListing(id, area.filters);
  const categories = useListingCategories();
  const { toggleListing } = useFavoriteActions();
  const revealPhone = useRevealPhone();
  // Профиль продавца — то, чего нет в самой карточке: подтверждён ли телефон,
  // сколько у него активных объявлений, есть ли оценки
  const sellerProfile = useSellerProfile(listing?.seller.id);

  const [photoIndex, setPhotoIndex] = useState(0);
  const [phone, setPhone] = useState<string | null>(null);
  const galleryWidth = useRef(width);

  if (isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  if (isError || !listing) {
    return (
      <Screen scroll>
        <Text style={styles.error}>Объявление не найдено или снято с публикации.</Text>
        <Button label="Повторить" onPress={() => void refetch()} loading={isFetching} />
      </Screen>
    );
  }

  const photos = listing.photos;
  const categoryAttributes = attributesOfCategory(categories.data ?? [], listing.categorySlug);
  // У запчасти деталь, производитель, тип и состояние — в своём блоке «Запчасть»
  const isPart = isPartsCategory(listing.categorySlug);
  // «Подходит к» — и у запчастей, и у направлений с совместимостью (коврики, магнитолы)
  const hasLayer = catalogLayer(listing.categorySlug) !== null;
  // Условия аренды («можно с животными») у продажи не показываются, даже если
  // остались в старом объявлении
  const attributes = (
    isPart
      ? categoryAttributes.filter((attribute) => !PART_BLOCK_KEYS.has(attribute.key))
      : categoryAttributes
  ).filter((attribute) =>
    isAttributeVisible(attribute, listing.attributes, {
      transactionType: listing.transactionType,
    }),
  );
  // Главное о вещи — одной строкой под названием; полный набор ниже, после описания
  const keyFacts = cardFacts(listing.attributesSummary, listing.title, 4);

  const openPhone = () => {
    if (phone) {
      void Linking.openURL(`tel:${phone}`);
      return;
    }

    revealPhone.mutate(listing.id, {
      onSuccess: (result) => {
        setPhone(result.phone);
        void Linking.openURL(`tel:${result.phone}`);
      },
    });
  };

  // Главное действие не прячется внизу длинной страницы: оно закреплено над
  // краем экрана и учитывает безопасную область (это делает Screen)
  const canCall = !listing.isMine && listing.availability === 'active' && listing.allowCalls;
  const callBar = canCall ? (
    <Button
      label={phone ?? (revealPhone.isPending ? 'Показываем…' : 'Позвонить')}
      onPress={openPhone}
      loading={revealPhone.isPending}
      accessibilityLabel={phone ? `Позвонить ${phone}` : 'Позвонить продавцу'}
    />
  ) : undefined;

  return (
    <Screen padded={false} scroll footer={callBar}>
      <View style={styles.hero}>
        {photos.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onLayout={(event) => (galleryWidth.current = event.nativeEvent.layout.width)}
            onMomentumScrollEnd={(event) => {
              const page = Math.round(event.nativeEvent.contentOffset.x / galleryWidth.current);
              setPhotoIndex(page);
            }}
          >
            {photos.map((photo) => (
              <RemoteImage
                key={photo.id}
                uri={photo.url}
                style={[styles.photo, { width: galleryWidth.current }]}
                fallback={<Icon name="image" size={40} color={colors.primary} />}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Icon name="image" size={40} color={colors.primary} />
          </View>
        )}

        {photos.length > 1 && (
          // «1/10»: сразу видно, сколько фотографий и на какой человек
          <View
            style={styles.counter}
            accessible
            accessibilityLabel={`Фото ${photoIndex + 1} из ${photos.length}`}
          >
            <Text style={styles.counterText}>
              {photoIndex + 1}/{photos.length}
            </Text>
          </View>
        )}

        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/listings'))}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          style={({ pressed }) => [styles.heroButton, styles.heroLeft, pressed && styles.pressed]}
        >
          <Text style={styles.backIcon}>←</Text>
        </Pressable>

        <Pressable
          onPress={() =>
            void shareListing({
              id: listing.id,
              title: listing.title,
              priceText: formatPrice(listing),
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Поделиться"
          style={({ pressed }) => [styles.heroButton, styles.heroShare, pressed && styles.pressed]}
        >
          <Icon name="route" size={18} color="#12211F" />
        </Pressable>

        <View style={[styles.heroButton, styles.heroRight]}>
          <FavoriteButton
            isFavorite={listing.isFavorite}
            onToggle={() => toggleListing(listing)}
            size={20}
          />
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.price}>{formatPrice(listing)}</Text>
        <Text style={styles.title}>{listing.title}</Text>

        {/* Место, возраст и просмотры — одна тихая строка: цена и название
            остаются главным, а «где» и «когда» читаются рядом */}
        <Text style={styles.meta}>
          {placeLine(listing)} · {formatListingAge(listing.bumpedAt)} · {listing.viewsCount}{' '}
          {plural(listing.viewsCount, 'просмотр', 'просмотра', 'просмотров')}
        </Text>

        {keyFacts.length > 0 && <Text style={styles.keyFacts}>{keyFacts.join(' · ')}</Text>}

        <Text style={styles.sectionTitle}>Описание</Text>
        <Text style={styles.description}>{listing.description}</Text>

        {hasLayer && (
          <PartBlock
            showPart={isPart}
            part={listing.part}
            attributes={categoryAttributes}
            values={listing.attributes}
            labels={listing.attributeLabels}
          />
        )}

        {attributes.some((attribute) => listing.attributes[attribute.key] !== undefined) && (
          <>
            <Text style={styles.sectionTitle}>Характеристики</Text>
            {/* Строки с тонкими разделителями, без отдельной карточки вокруг */}
            <View>
              {attributes
                .filter((attribute) => listing.attributes[attribute.key] !== undefined)
                .map((attribute) => (
                  <AttributeRow
                    key={attribute.key}
                    attribute={attribute}
                    value={listing.attributes[attribute.key]}
                    labels={listing.attributeLabels}
                  />
                ))}

              {listing.condition && !listing.attributes.condition && (
                <View style={styles.attributeRow}>
                  <Text style={styles.attributeLabel}>Состояние</Text>
                  <Text style={styles.attributeValue}>
                    {LISTING_CONDITION_LABELS[listing.condition]}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        <View style={styles.divided}>
          <Text style={styles.sectionTitleFirst}>Продавец</Text>
          {/* Блок продавца — часть страницы, а не отдельная кнопка: нажатие
              открывает его публичную страницу со всеми объявлениями */}
          <Pressable
            onPress={() =>
              router.push({ pathname: '/sellers/[id]', params: { id: listing.seller.id } })
            }
            accessibilityRole="button"
            accessibilityLabel={`Продавец ${listing.seller.name}. Открыть профиль`}
            style={({ pressed }) => [styles.sellerRow, pressed && styles.pressed]}
          >
            <SellerAvatar name={listing.seller.name} avatar={listing.seller.avatar} />
            <View style={styles.sellerTexts}>
              <Text style={styles.sellerName}>{listing.seller.name}</Text>
              <Text style={styles.sellerMeta}>
                {[
                  `На площадке с ${formatMemberSince(listing.seller.memberSince)}`,
                  sellerProfile.data?.isVerified ? 'телефон подтверждён' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Text style={styles.sellerMeta}>
                {[
                  sellerProfile.data
                    ? `${sellerProfile.data.activeCount} ${plural(sellerProfile.data.activeCount, 'объявление', 'объявления', 'объявлений')}`
                    : null,
                  listing.seller.rating.count > 0
                    ? `★ ${listing.seller.rating.average.toFixed(1).replace('.', ',')} (${listing.seller.rating.count})`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textFaint} />
          </Pressable>
        </View>

        <View style={styles.divided}>
          <Text style={styles.sectionTitleFirst}>Где находится</Text>
          <Text style={styles.address}>
            {[listing.location.label, listing.location.address].filter(Boolean).join(', ')}
          </Text>
          {listing.location.point && (
            // Скрытый адрес — круг «примерно здесь» вокруг округлённой точки,
            // а не булавка: иначе булавка на округлённой точке выглядела бы
            // точным адресом чужого дома
            <LeafletMap
              center={listing.location.point}
              zoom={listing.location.isApproximate ? 14 : 16}
              marker={listing.location.point}
              areaMeters={listing.location.isApproximate ? APPROXIMATE_AREA_METERS : null}
              style={styles.map}
            />
          )}
          {listing.location.isApproximate && (
            <Text style={styles.mapHint}>Продавец показывает место примерно, без номера дома.</Text>
          )}
        </View>

        {!listing.isMine && listing.availability !== 'active' ? (
          // Проданное и снятое — история продавца: страница открывается, но
          // связаться и пожаловаться уже не о чем
          <View style={styles.closedBox}>
            <Text style={styles.closedTitle}>
              {listing.availability === 'sold' ? 'Продано' : 'Снято с публикации'}
            </Text>
            <Text style={styles.closedText}>
              Объявление больше не активно. Посмотрите другие объявления продавца.
            </Text>
          </View>
        ) : listing.isMine ? (
          // Своё объявление: смотреть номер и жаловаться на себя незачем —
          // сервер вторую кнопку и так отклонит, но лучше не показывать её
          // вовсе. Полное управление (поднять, продано, снять) — в кабинете,
          // где уже есть все нужные для этого данные (срок поднятия, статус)
          <Button
            label="Управлять объявлением"
            onPress={() => router.push('/my-listings')}
            style={styles.action}
          />
        ) : (
          <>
            {/* «Позвонить» закреплена внизу экрана. «Написать» появится вместе с
                чатом: кнопка, которая ничего не делает, хуже, чем её отсутствие */}

            <Pressable
              onPress={() =>
                router.push({ pathname: '/listings/report', params: { id: listing.id } })
              }
              accessibilityRole="button"
              style={({ pressed }) => [styles.reportRow, pressed && styles.pressed]}
            >
              <Icon name="flag" size={15} color={colors.textFaint} />
              <Text style={styles.reportLabel}>Пожаловаться на объявление</Text>
            </Pressable>
          </>
        )}

        <SellerListings sellerId={listing.seller.id} excludeId={listing.id} />
        <SimilarListings listing={listing} />
      </View>
    </Screen>
  );
}

/**
 * Похожие объявления: та же категория и та же сделка рядом с человеком.
 *
 * Отдельного запроса «похожих» на сервере нет и не нужно: обычная лента с
 * теми же категорией, сделкой и местом ранжируется так же, как везде. Сделка
 * учитывается, чтобы рядом с «Сдам посуточно» не оказалась продажа.
 */
function SimilarListings({ listing }: { listing: ListingDetailsDto }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const cityId = useCityStore((s) => s.cityId);
  const area = useListingArea();
  const { toggleListing } = useFavoriteActions();

  const filters = useMemo<ListingFilters>(
    () => ({
      category: listing.categorySlug,
      ...(listing.transactionType ? { transactionType: listing.transactionType } : {}),
      ...(listing.rentPeriod ? { rentPeriod: listing.rentPeriod } : {}),
      ...area.filters,
    }),
    [listing.categorySlug, listing.transactionType, listing.rentPeriod, area.filters],
  );
  const feed = useListings(cityId, filters, area.ready);
  const items = (feed.data?.pages[0]?.items ?? []).filter((item) => item.id !== listing.id);

  if (items.length === 0) return null;

  return (
    <>
      <Text style={styles.sectionTitle}>Похожие объявления</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.moreList}
      >
        {items.slice(0, 8).map((item) => (
          <View key={item.id} style={styles.moreItem}>
            <ListingCard
              listing={item}
              onOpen={() => router.push({ pathname: '/listings/[id]', params: { id: item.id } })}
              onToggleFavorite={() => toggleListing(item)}
            />
          </View>
        ))}
      </ScrollView>
    </>
  );
}

/**
 * Другие объявления продавца — лентой в ряд. Без отдельного экрана
 * продавца: пока его нет, это самый короткий путь «что ещё у него есть».
 */
function SellerListings({ sellerId, excludeId }: { sellerId: string; excludeId: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const cityId = useCityStore((s) => s.cityId);
  const { toggleListing } = useFavoriteActions();
  // Все его объявления, а не только рядом: продавец один, место у вещей разное
  const feed = useListings(cityId, { sellerId, regionWide: true, sort: 'date' });
  const items = (feed.data?.pages[0]?.items ?? []).filter((item) => item.id !== excludeId);

  if (items.length === 0) return null;

  return (
    <>
      <View style={styles.moreHeader}>
        <Text style={styles.sectionTitle}>Другие объявления продавца</Text>
        <Pressable
          onPress={() => router.push({ pathname: '/sellers/[id]', params: { id: sellerId } })}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.moreLink}>Все</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.moreList}
      >
        {items.slice(0, 8).map((item) => (
          <View key={item.id} style={styles.moreItem}>
            <ListingCard
              listing={item}
              onOpen={() => router.push({ pathname: '/listings/[id]', params: { id: item.id } })}
              onToggleFavorite={() => toggleListing(item)}
            />
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function AttributeRow({
  attribute,
  value,
  labels,
}: {
  attribute: ListingAttribute;
  value: unknown;
  labels: Record<string, string>;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.attributeRow}>
      <Text style={styles.attributeLabel}>{attribute.label}</Text>
      <Text style={styles.attributeValue}>{attributeValueLabel(attribute, value, labels)}</Text>
    </View>
  );
}

/**
 * «марта 2026» — точная дата регистрации покупателю не нужна.
 *
 * Названия месяцев списком, а не через toLocaleDateString: он даёт
 * именительный падеж, и получается «с сентябрь 2026 г.».
 */
const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    loader: { marginTop: spacing.xxxl },
    error: { ...typography.body, color: colors.text, marginBottom: spacing.lg },

    hero: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surfaceMuted },
    photo: { width: '100%', height: '100%' },
    photoPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    counter: {
      position: 'absolute',
      right: spacing.md,
      bottom: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
      borderRadius: radius.full,
      // Подложка поверх фотографии, как у пометки «Продано» в карточке
      backgroundColor: 'rgba(13,24,26,0.7)',
    },
    counterText: { ...typography.caption, color: '#F0F4F3', fontWeight: '600' },
    dots: {
      position: 'absolute',
      bottom: spacing.md,
      alignSelf: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: radius.full,
      backgroundColor: 'rgba(255,255,255,0.5)',
    },
    dotActive: { backgroundColor: '#FFFFFF', width: 18 },

    heroButton: {
      position: 'absolute',
      top: spacing.xxl + spacing.md,
      width: 38,
      height: 38,
      borderRadius: radius.full,
      backgroundColor: 'rgba(255,255,255,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.card,
    },
    heroLeft: { left: spacing.lg },
    heroRight: { right: spacing.lg },
    heroShare: { right: spacing.lg + 46 },
    moreHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    moreLink: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    moreList: { gap: spacing.md, paddingVertical: spacing.xs },
    moreItem: { width: 168 },
    backIcon: { fontSize: 22, lineHeight: 26, color: '#12211F' },
    pressed: { opacity: 0.85 },

    body: { padding: spacing.lg, gap: spacing.xs },
    price: { ...typography.title, color: colors.text },
    title: { ...typography.subheading, color: colors.text },
    meta: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
    // Главное о вещи — заметнее мета-строки, но тише цены и названия
    keyFacts: { ...typography.body, color: colors.text, marginTop: spacing.md },

    // Строка характеристики: тонкая линия снизу вместо карточки вокруг списка
    attributeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    attributeLabel: { ...typography.body, color: colors.textMuted, flexShrink: 1 },
    attributeValue: { ...typography.body, color: colors.text, fontWeight: '600' },

    sectionTitle: { ...typography.subheading, color: colors.text, marginTop: spacing.xl },
    sectionTitleFirst: { ...typography.subheading, color: colors.text },
    // Раздел отделён линией и воздухом, а не рамкой
    divided: {
      marginTop: spacing.xl,
      paddingTop: spacing.xl,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: spacing.sm,
    },
    description: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
    address: { ...typography.body, color: colors.text, flexShrink: 1 },
    map: { height: 180, marginTop: spacing.md },
    mapHint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },

    sellerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sellerTexts: { flexShrink: 1 },
    sellerName: { ...typography.body, color: colors.text, fontWeight: '600' },
    sellerMeta: { ...typography.caption, color: colors.textFaint },

    action: { marginTop: spacing.xl },
    closedBox: {
      gap: 4,
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    closedTitle: { ...typography.subheading, color: colors.text },
    closedText: { ...typography.caption, color: colors.textMuted },
    reportRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'center',
      marginTop: spacing.xl,
      paddingVertical: spacing.sm,
    },
    reportLabel: { ...typography.caption, color: colors.textFaint },
  });
