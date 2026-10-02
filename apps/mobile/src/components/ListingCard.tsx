import { LISTING_PRICE_UNIT_SUFFIX, formatDistance, type ListingDto } from '@dagestan/shared';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, shadow, spacing, typography, useThemeColors } from '../theme';
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
}

/**
 * Карточка объявления в сетке (Этап 7).
 *
 * Фотография сверху во всю ширину плитки, под ней крупная цена: на доске
 * объявлений человек сначала смотрит на вещь и на цену, а название читает
 * третьим. Этим карточка отличается от заведения, где фотография слева
 * квадратом, а главное — название и то, открыто ли сейчас.
 *
 * Сердечко — сосед нажимаемой области, а не её содержимое: кнопка внутри
 * кнопки даёт недопустимую разметку в вебе и путает голосовой доступ.
 */
export function ListingCard({
  listing,
  onOpen,
  onToggleFavorite,
  statusLabel = null,
}: ListingCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const photo = listing.cover?.thumbnailUrl ?? listing.cover?.url ?? null;
  const price = formatPrice(listing);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${listing.title}. ${price}. ${listing.attributesSummary}`}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <View style={styles.imageBox}>
          <RemoteImage
            uri={photo}
            style={styles.image}
            containerStyle={styles.placeholder}
            fallback={<Icon name="image" size={28} color="rgba(255,255,255,0.5)" />}
          />
          {statusLabel && (
            <View style={styles.status}>
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.price} numberOfLines={1}>
            {price}
          </Text>
          <Text style={styles.title} numberOfLines={2}>
            {listing.title}
          </Text>

          {listing.attributesSummary.length > 0 && (
            <Text style={styles.summary} numberOfLines={1}>
              {listing.attributesSummary}
            </Text>
          )}

          {/* Место и время — разными строками. В одну они не помещаются на
              узкой плитке, а обрезанное «Махачкала · 3 к…» бесполезно */}
          <View style={styles.footer}>
            <Icon name="location" size={12} color={colors.textFaint} />
            <Text style={styles.meta} numberOfLines={1}>
              {placeLine(listing)}
            </Text>
          </View>
          <View style={styles.whenRow}>
            <Text style={[styles.when, styles.whenText]} numberOfLines={1}>
              {formatWhen(listing.bumpedAt)}
            </Text>
            <Icon name="eye" size={12} color={colors.textFaint} />
            <Text style={styles.when} accessibilityLabel={`Просмотров: ${listing.viewsCount}`}>
              {formatViews(listing.viewsCount)}
            </Text>
          </View>
        </View>
      </Pressable>

      {onToggleFavorite && (
        <View style={styles.favorite}>
          <FavoriteButton
            isFavorite={listing.isFavorite}
            onToggle={onToggleFavorite}
            onDark
            size={18}
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
export function formatViews(count: number): string {
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  return `${thousands < 10 ? thousands.toFixed(1).replace('.', ',') : Math.round(thousands)} тыс`;
}

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

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    card: {
      flex: 1,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      ...shadow.card,
    },
    // Продвигаемые объявления выглядят ТОЧНО так же, как обычные: ни рамки,
    // ни подложки, ни ярлыка. Платное влияет только на место в выдаче
    pressed: { opacity: 0.85 },

    imageBox: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surfaceMuted },
    image: { width: '100%', height: '100%' },
    placeholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inkSoft,
    },

    body: { padding: spacing.md, gap: 2 },
    price: { ...typography.subheading, color: colors.text, fontSize: 17 },
    // Две строки под заголовок всегда: иначе соседние карточки в ряду
    // расходятся по высоте и сетка выглядит рваной
    title: { ...typography.body, color: colors.text, fontSize: 14, lineHeight: 18, minHeight: 36 },
    summary: { ...typography.caption, color: colors.textMuted },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    meta: { ...typography.caption, color: colors.textFaint, flexShrink: 1 },
    when: { ...typography.label, color: colors.textFaint, marginTop: 1 },
    whenRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    whenText: { flex: 1 },

    favorite: { position: 'absolute', top: spacing.sm, right: spacing.sm },
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
