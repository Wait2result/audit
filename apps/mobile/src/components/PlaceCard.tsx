import { useMemo } from 'react';
import { PLACE_TYPE_LABELS, type PlaceDto } from '@dagestan/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, shadow, spacing, typography, useThemeColors } from '../theme';
import { formatMoney } from '../utils/money';
import { FavoriteButton } from './FavoriteButton';
import { Icon } from './Icon';
import { Rating } from './Rating';
import { RemoteImage } from './RemoteImage';

interface PlaceCardProps {
  place: PlaceDto;
  onOpen: () => void;
  onToggleFavorite?: () => void;
}

/**
 * Карточка заведения в списке (Этап 6).
 *
 * Фотография слева квадратом, а не полосой сверху: так в высоту экрана
 * помещается пять заведений вместо двух, а человек в списке сравнивает
 * варианты, а не любуется снимками.
 *
 * Сердечко — сосед нажимаемой области, а не её содержимое: вложенная кнопка
 * внутри кнопки даёт недопустимую разметку в вебе и путает голосовой доступ,
 * который не понимает, какое из двух действий он объявляет.
 *
 * Состояние «открыто» считает сервер в часовом поясе города: у человека
 * в другом поясе иначе показывалось бы его время, а не время заведения.
 */
export function PlaceCard({ place, onOpen, onToggleFavorite }: PlaceCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const photo = place.cover?.thumbnailUrl ?? place.cover?.url ?? null;

  const tags = [PLACE_TYPE_LABELS[place.type], ...place.cuisines.slice(0, 2)].join(' · ');
  const minutes = place.delivery.deliveryMinutes;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${place.name}. ${tags}. ${place.openState.label}`}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        <View style={styles.imageBox}>
          <RemoteImage
            uri={photo}
            style={styles.image}
            containerStyle={styles.placeholder}
            fallback={<Icon name="food" size={26} color="rgba(255,255,255,0.55)" />}
          />

          <Text style={[styles.badgeText, !place.openState.isOpenNow && styles.badgeTextClosed]}>
            {place.openState.isOpenNow ? 'Открыто' : 'Закрыто'}
          </Text>
        </View>

        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {place.name}
          </Text>

          <Rating rating={place.rating} />

          <Text style={styles.tags} numberOfLines={1}>
            {tags}
          </Text>

          <Text style={styles.terms} numberOfLines={1}>
            {[
              minutes ? `${minutes} мин` : null,
              place.delivery.hasDelivery ? formatMoney(place.delivery.deliveryFee) : 'Самовывоз',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>

          {place.delivery.hasDelivery && place.delivery.minOrderAmount > 0 && (
            <Text style={styles.minOrder} numberOfLines={1}>
              Минимальный заказ {formatMoney(place.delivery.minOrderAmount)}
            </Text>
          )}
        </View>
      </Pressable>

      {onToggleFavorite && (
        <View style={styles.heart}>
          <FavoriteButton isFavorite={place.isFavorite} onToggle={onToggleFavorite} size={20} />
        </View>
      )}
    </View>
  );
}

const IMAGE_SIZE = 92;

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    card: {
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      ...shadow.card,
    },
    body: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
    pressed: { opacity: 0.85 },

    imageBox: {
      width: IMAGE_SIZE,
      height: IMAGE_SIZE,
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    image: { width: '100%', height: '100%' },
    placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#8a7a5f' },

    // Просто подпись поверх фото, без плашки: рамка с заливкой на разных
    // снимках то сливалась с фоном, то спорила с ним. Тень вместо заливки
    // держит текст читаемым на любом снимке и не выглядит вывеской.
    badgeText: {
      ...typography.label,
      position: 'absolute',
      left: spacing.xs,
      bottom: spacing.xs,
      fontSize: 11,
      // Мягкий зелёный, а не сплошная плашка: цвет говорит «открыто» с одного
      // взгляда, а тень вместо заливки держит его читаемым на любом снимке
      color: '#8fe6ac',
      textShadowColor: 'rgba(0,0,0,0.55)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    // «Закрыто» — спокойный светлый, не тревожный: это сведение, а не предупреждение
    badgeTextClosed: { color: 'rgba(255,255,255,0.82)' },

    // Место под сердечко: без отступа справа название заезжало бы под него
    text: { flex: 1, gap: 2, justifyContent: 'center', paddingRight: spacing.xl },
    title: { ...typography.subheading, fontSize: 16, color: colors.text },
    tags: { ...typography.caption, fontSize: 12, color: colors.textMuted },
    terms: { ...typography.caption, fontSize: 12, color: colors.text },
    minOrder: { ...typography.caption, fontSize: 11, color: colors.textFaint },

    heart: { position: 'absolute', right: spacing.sm, top: spacing.sm },
  });
