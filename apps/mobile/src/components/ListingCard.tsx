import {
  CARD_FACTS_LIMIT,
  LISTING_PRICE_UNIT_SUFFIX,
  cardEmphasis,
  cardFacts,
  formatDistance,
  formatListingAge,
  formatViewsShort,
  type ListingCardLayout,
  type ListingDto,
} from '@dagestan/shared';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useIsDarkTheme, useThemeColors } from '../theme';
import { formatMoney } from '../utils/money';
import { FavoriteButton } from './FavoriteButton';
import { Icon } from './Icon';
import { RemoteImage } from './RemoteImage';

interface ListingCardProps {
  listing: ListingDto;
  onOpen: () => void;
  onToggleFavorite?: () => void;
  /** Нейтральная пометка поверх фото: «Продано», «Снято с публикации» */
  statusLabel?: string | null;
  /**
   * Вид карточки: плитка для сетки или строка для списка. Выбирает экран по
   * категории (resolveCardLayout): квартиру и вакансию читают, а не разглядывают
   */
  layout?: ListingCardLayout;
  /** Сколько характеристик показать. По умолчанию — по виду; на главной — три */
  maxFacts?: number;
}

/**
 * Карточка объявления.
 *
 * Один порядок для всех категорий: фото → цена → название → характеристики →
 * место и возраст. Цена и название — главное, остальное тише и не
 * конкурирует с ними. Характеристики — одна строка через « · » (до трёх на
 * главной, до четырёх в поиске), без цветных плашек: какие именно, решает
 * конфигурация категории (CARD_FACTS в shared), а не компонент.
 *
 * У вакансии и резюме главное — должность, поэтому название выше цены, а
 * фотографии у них почти не бывает: без неё карточка — текст, а не пустой
 * блок-заглушка.
 *
 * Сердечко — сосед нажимаемой области, а не её содержимое: кнопка внутри
 * кнопки даёт недопустимую разметку в вебе и путает голосовой доступ.
 */
export function ListingCard({
  listing,
  onOpen,
  onToggleFavorite,
  statusLabel = null,
  layout = 'grid',
  maxFacts,
}: ListingCardProps) {
  const colors = useThemeColors();
  const dark = useIsDarkTheme();
  // Подложка под пустым фото: бледно-бирюзовая днём и почти фон ночью —
  // без тёмного блока в пол-карточки
  const styles = useMemo(
    () => createStyles(colors, dark ? colors.surfaceMuted : colors.primarySoft),
    [colors, dark],
  );

  const photo = listing.cover?.thumbnailUrl ?? listing.cover?.url ?? null;
  const price = formatPrice(listing);
  const isList = layout === 'list';
  const facts = cardFacts(
    listing.attributesSummary,
    listing.title,
    maxFacts ?? CARD_FACTS_LIMIT[layout],
  );
  const titleFirst = cardEmphasis(listing.categorySlug) === 'title';
  // Текстовая карточка: вакансия без фото не получает пустой блок слева
  const textOnly = isList && titleFirst && !photo;

  const priceText = (
    <Text style={styles.price} numberOfLines={1}>
      {price}
    </Text>
  );
  const titleText = (
    <Text style={titleFirst ? styles.titleFirst : styles.title} numberOfLines={2}>
      {listing.title}
    </Text>
  );

  const image = (
    <View style={isList ? styles.imageBoxList : styles.imageBox}>
      <RemoteImage
        uri={photo}
        style={styles.image}
        containerStyle={styles.placeholder}
        fallback={<Icon name="image" size={24} color={colors.primary} />}
      />
      {statusLabel && (
        <View style={styles.status}>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.card, isList && styles.cardList]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${listing.promoted ? 'Продвигается. ' : ''}${listing.title}. ${price}. ${facts.join(', ')}`}
        style={({ pressed }) => [isList && styles.pressableList, pressed && styles.pressed]}
      >
        {!textOnly && image}

        <View style={[styles.body, isList && styles.bodyList, textOnly && styles.bodyText]}>
          {/* Продвигаемое объявление отмечено явно: почему оно выше — видно сразу */}
          {listing.promoted && <Text style={styles.promoted}>Продвигается</Text>}
          {titleFirst ? titleText : priceText}
          {titleFirst ? priceText : titleText}

          {facts.length > 0 && (
            <Text style={styles.facts} numberOfLines={isList ? 1 : 2}>
              {facts.join(' · ')}
            </Text>
          )}

          <View style={styles.meta}>
            <Text style={styles.place} numberOfLines={1}>
              {placeLine(listing)}
            </Text>
            <View style={styles.whenRow}>
              <Text style={styles.when} numberOfLines={1}>
                {formatListingAge(listing.bumpedAt)}
              </Text>
              <Icon name="eye" size={11} color={colors.textFaint} />
              <Text style={styles.when} accessibilityLabel={`Просмотров: ${listing.viewsCount}`}>
                {formatViewsShort(listing.viewsCount)}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>

      {onToggleFavorite && (
        <View
          style={textOnly ? styles.favoriteText : isList ? styles.favoriteList : styles.favorite}
        >
          <FavoriteButton
            isFavorite={listing.isFavorite}
            onToggle={onToggleFavorite}
            onDark={!textOnly}
            compact
            size={16}
          />
        </View>
      )}
    </View>
  );
}

/**
 * «Манаскент · 3 км», «Махачкала, Советский район», «Каспийск».
 *
 * Подпись места собирает сервер (село без города — тоже место). Расстояние
 * приходит, когда поиск идёт от выбранной точки, и считается от неё.
 */
export function placeLine(listing: ListingDto): string {
  const distance = formatDistance(listing.distanceKm);
  return distance ? `${listing.placeLabel} · ${distance}` : listing.placeLabel;
}

/** «38», «1,2 тыс» — на узкой плитке длинное число не помещается. */
export const formatViews = formatViewsShort;

/** «2 890 000 ₽», «25 000 ₽/мес» или «Цена договорная». */
export function formatPrice(listing: ListingDto): string {
  const { value, unit, isNegotiable } = listing.price;
  if (value === null) return isNegotiable ? 'Цена договорная' : 'Цена не указана';
  return `${formatMoney(value)}${LISTING_PRICE_UNIT_SUFFIX[unit]}`;
}

/**
 * «Сегодня, 12:30», «Вчера, 20:15», «14 сентября» — на доске объявлений
 * свежесть важнее точной даты: «сегодня» говорит больше, чем «23.09».
 */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `Сегодня, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Вчера, ${time}`;

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

const createStyles = (colors: ReturnType<typeof useThemeColors>, placeholderBg: string) =>
  StyleSheet.create({
    promoted: { ...typography.label, color: colors.primary },
    // Одна поверхность: рамка и фон — как у остальных карточек приложения.
    // Продвигаемые объявления выглядят ТОЧНО так же: платное влияет только на
    // место в выдаче
    card: {
      flex: 1,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    cardList: { flexGrow: 0, flexBasis: 'auto', width: '100%' },
    pressableList: { flexDirection: 'row' },
    pressed: { opacity: 0.85 },

    // Фото — главный элемент: одна пропорция у всех, обрезка по центру
    imageBox: { width: '100%', aspectRatio: 4 / 3, backgroundColor: placeholderBg },
    imageBoxList: { width: 120, minHeight: 120, backgroundColor: placeholderBg },
    image: { width: '100%', height: '100%' },
    // Спокойная подложка вместо тёмного блока: бледный бирюзовый тон и
    // маленький значок, чтобы пустая карточка не выглядела технической заглушкой
    placeholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: placeholderBg,
    },

    body: { padding: spacing.md, gap: 3 },
    bodyList: { flex: 1, minWidth: 0 },
    bodyText: { paddingRight: spacing.xxl },

    price: { ...typography.subheading, color: colors.text, fontSize: 18, fontWeight: '700' },
    // Высота по тексту: пустой зазор под однострочным названием выглядел дырой
    title: { ...typography.body, color: colors.text, fontSize: 14, lineHeight: 18 },
    titleFirst: { ...typography.subheading, color: colors.text, fontSize: 16, lineHeight: 20 },
    facts: { ...typography.caption, color: colors.textMuted, lineHeight: 16 },

    // Вторичное: место и «когда», мельче и бледнее цены с названием
    meta: { marginTop: spacing.xs, gap: 1 },
    place: { ...typography.label, color: colors.textFaint },
    whenRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    when: { ...typography.label, color: colors.textFaint },

    favorite: { position: 'absolute', top: spacing.sm, right: spacing.sm },
    // В списке сердечко — на фото слева (ширина фото 120), а не над названием
    favoriteList: { position: 'absolute', top: spacing.sm, left: 120 - 32 - spacing.sm },
    favoriteText: { position: 'absolute', top: spacing.xs, right: spacing.xs },
    // Пометка состояния, а не реклама: одинаковая у всех, без цвета акцента
    status: {
      position: 'absolute',
      left: spacing.sm,
      bottom: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
      backgroundColor: 'rgba(13,24,26,0.78)',
    },
    statusText: { ...typography.label, color: '#F0F4F3' },
  });
