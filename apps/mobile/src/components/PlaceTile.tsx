import { useMemo } from 'react';
import type { PlaceDto } from '@dagestan/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, shadow, spacing, typography, useThemeColors } from '../theme';
import { formatMoney } from '../utils/money';
import { FavoriteButton } from './FavoriteButton';
import { Icon } from './Icon';
import { Rating } from './Rating';
import { RemoteImage } from './RemoteImage';

/**
 * Широкая карточка для полосы «Популярное рядом» (Этап 6).
 *
 * Отличается от `PlaceCard` не украшением, а задачей: в списке человек
 * сравнивает варианты и ему важны условия доставки, а в горизонтальной
 * полосе он скользит взглядом — там работает фотография и одна строка.
 */
export function PlaceTile({
  place,
  onOpen,
  onToggleFavorite,
}: {
  place: PlaceDto;
  onOpen: () => void;
  onToggleFavorite?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const photo = place.cover?.thumbnailUrl ?? place.cover?.url ?? null;
  const minutes = place.delivery.deliveryMinutes;

  return (
    <View style={styles.tile}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${place.name}. ${place.openState.label}`}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <View style={styles.imageBox}>
          <RemoteImage
            uri={photo}
            style={styles.image}
            containerStyle={styles.placeholder}
            fallback={<Icon name="food" size={28} color="rgba(255,255,255,0.55)" />}
          />

          <Text style={[styles.badgeText, !place.openState.isOpenNow && styles.badgeTextClosed]}>
            {place.openState.isOpenNow ? 'Открыто' : 'Закрыто'}
          </Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {place.name}
          </Text>
          <Rating rating={place.rating} />
          <Text style={styles.terms} numberOfLines={1}>
            {[
              minutes ? `${minutes} мин` : null,
              place.delivery.hasDelivery ? formatMoney(place.delivery.deliveryFee) : 'Самовывоз',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </Pressable>

      {onToggleFavorite && (
        <View style={styles.heart}>
          <FavoriteButton
            isFavorite={place.isFavorite}
            onToggle={onToggleFavorite}
            onDark
            size={18}
          />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    tile: {
      width: 190,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      ...shadow.card,
    },
    pressed: { opacity: 0.85 },

    imageBox: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.surfaceMuted },
    image: { width: '100%', height: '100%' },
    placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#8a7a5f' },

    // Просто подпись поверх фото, без плашки — см. комментарий в PlaceCard.tsx
    badgeText: {
      ...typography.label,
      position: 'absolute',
      left: spacing.sm,
      bottom: spacing.sm,
      fontSize: 11,
      color: '#8fe6ac',
      textShadowColor: 'rgba(0,0,0,0.55)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    badgeTextClosed: { color: 'rgba(255,255,255,0.82)' },

    heart: { position: 'absolute', right: 4, top: 4 },

    body: { padding: spacing.md, gap: 2 },
    title: { ...typography.subheading, fontSize: 15, color: colors.text },
    terms: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  });
