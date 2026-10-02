import type { GeoPlaceDto } from '@dagestan/shared';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { radius, spacing, typography, useThemeColors } from '../theme';
import { Icon, type IconName } from './Icon';

/**
 * Список подсказок адреса или населённого пункта — общий для формы
 * объявления и выбора места поиска. Показывает и три «пустых» состояния:
 * ищем, ничего не нашлось, поиск адреса недоступен.
 */

interface Props {
  places: readonly GeoPlaceDto[] | undefined;
  loading: boolean;
  error: unknown;
  onSelect: (place: GeoPlaceDto) => void;
  /** Что сказать, когда ничего не нашлось */
  emptyText?: string;
}

const KIND_ICON: Record<GeoPlaceDto['kind'], IconName> = {
  settlement: 'location',
  area: 'map',
  street: 'route',
  house: 'home',
  poi: 'flag',
};

/** Понятный текст ошибки геокодера: сеть, недоступность, лимит. */
export function geoErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) return 'Нет связи с сервером. Точку можно поставить на карте.';
    if (error.status === 429) return 'Слишком много запросов — подождите пару секунд.';
    return error.message;
  }
  return 'Поиск адреса временно недоступен. Поставьте точку на карте вручную.';
}

export function GeoSuggestionList({ places, loading, error, onSelect, emptyText }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (error && !places?.length) {
    return (
      <View style={styles.box}>
        <Text style={styles.error}>{geoErrorText(error)}</Text>
      </View>
    );
  }

  if (!places?.length) {
    return (
      <View style={styles.box}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <Text style={styles.empty}>
            {emptyText ?? 'Ничего не нашлось. Уточните запрос или поставьте точку на карте.'}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.box} accessibilityRole="list">
      {places.map((place, index) => (
        <Pressable
          key={`${place.latitude},${place.longitude},${place.title}`}
          onPress={() => onSelect(place)}
          accessibilityRole="button"
          accessibilityLabel={[place.title, place.subtitle].filter(Boolean).join(', ')}
          style={({ pressed }) => [
            styles.row,
            index > 0 && styles.rowDivider,
            pressed && styles.pressed,
          ]}
        >
          <Icon name={KIND_ICON[place.kind]} size={18} color={colors.primary} />
          <View style={styles.texts}>
            <Text style={styles.title} numberOfLines={1}>
              {place.title}
            </Text>
            {place.subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {place.subtitle}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
      {loading && <ActivityIndicator color={colors.primary} style={styles.inlineLoader} />}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    box: {
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    loader: { paddingVertical: spacing.md },
    inlineLoader: { position: 'absolute', right: spacing.md, top: spacing.md },
    empty: { ...typography.caption, color: colors.textMuted, padding: spacing.md },
    error: { ...typography.caption, color: colors.warning, padding: spacing.md },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 48,
    },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    pressed: { opacity: 0.7 },
    texts: { flex: 1, gap: 1 },
    title: { ...typography.body, color: colors.text },
    subtitle: { ...typography.caption, color: colors.textMuted },
  });
