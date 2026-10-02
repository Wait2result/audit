import {
  DAGESTAN_BOUNDS,
  LISTING_PRICE_UNIT_SUFFIX,
  boundsAround,
  formatPriceCompact,
  type GeoBounds,
} from '@dagestan/shared';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useListingMapPoints, type ListingFilters } from '../api/queries';
import type { ListingSearchArea } from '../hooks/use-listing-area';
import { radius, shadow, spacing, typography, useThemeColors } from '../theme';
import { formatMoney } from '../utils/money';
import { Icon } from './Icon';
import { LeafletMap } from './LeafletMap';
import type { MapPricePoint, MapViewport } from './leaflet-map-html';
import { RemoteImage } from './RemoteImage';

/** Сколько точек отдаёт сервер за раз: больше на экране всё равно не разглядеть. */
const MAP_LIMIT = 500;

interface ListingsMapViewProps {
  /** Условия выдачи без места: категория, текст, цена, характеристики */
  filters: ListingFilters;
  area: ListingSearchArea;
  cityId: string | null;
  onOpen: (id: string) => void;
}

/**
 * Выдача на карте (режим «Карта» рядом со «Списком»).
 *
 * Карта открывается так, чтобы круг поиска был виден целиком, и показывает
 * объявления из этой области. Человек двигает карту — запрос не уходит: на
 * каждый пиксель движения это сотни запросов. Вместо этого появляется кнопка
 * «Искать в этой области», и новые объявления запрашиваются по нажатию.
 * Если карта двигается командой приложения (первый показ, нажатие на
 * кластер), кнопка не появляется: страница карты отличает эти случаи.
 */
export function ListingsMapView({ filters, area, cityId, onOpen }: ListingsMapViewProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Область первого показа: круг поиска целиком или весь Дагестан
  const initial = useMemo<GeoBounds>(
    () => (area.radiusKm ? boundsAround(area.center, area.radiusKm) : { ...DAGESTAN_BOUNDS }),
    [area.center, area.radiusKm],
  );

  // Область, по которой запрошены объявления, и область, в которую человек
  // успел сдвинуть карту (ждёт нажатия на кнопку)
  const [applied, setApplied] = useState<GeoBounds>(initial);
  const [pending, setPending] = useState<MapViewport | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Сменилось место поиска — карта возвращается к нему
  useEffect(() => {
    setApplied(initial);
    setPending(null);
    setSelectedId(null);
  }, [initial]);

  // Условия карты: всё, что в кадре, а не только в радиусе от точки
  const mapFilters = useMemo<ListingFilters>(() => ({ ...filters, regionWide: true }), [filters]);
  const points = useListingMapPoints(cityId, mapFilters, applied, area.ready);
  const data = points.data;

  const markers = useMemo<MapPricePoint[]>(
    () =>
      (data ?? []).map((point) => ({
        id: point.id,
        latitude: point.latitude,
        longitude: point.longitude,
        label: formatPriceCompact(point.price.value, point.price.unit),
        rank: point.price.value,
      })),
    [data],
  );

  const selected = useMemo(
    () => (data ?? []).find((point) => point.id === selectedId) ?? null,
    [data, selectedId],
  );

  const search = () => {
    if (!pending) return;
    const { zoom: _zoom, ...bounds } = pending;
    setApplied(bounds);
    setPending(null);
    setSelectedId(null);
  };

  const count = data?.length ?? 0;

  return (
    <View style={styles.root}>
      <LeafletMap
        center={area.center}
        zoom={11}
        marker={null}
        points={markers}
        selectedId={selectedId}
        bounds={initial}
        onSelect={setSelectedId}
        onViewport={setPending}
        style={styles.map}
      />

      {pending && (
        <Pressable
          onPress={search}
          accessibilityRole="button"
          accessibilityLabel="Искать в этой области"
          style={({ pressed }) => [styles.searchHere, pressed && styles.pressed]}
        >
          <Icon name="search" size={15} color={colors.primary} />
          <Text style={styles.searchHereLabel}>Искать в этой области</Text>
        </Pressable>
      )}

      {points.isFetching && (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      )}

      {!selected && data && (
        <View style={styles.countPill} pointerEvents="none">
          <Text style={styles.countText}>
            {count === 0
              ? 'В этой области ничего нет'
              : count >= MAP_LIMIT
                ? `Показаны первые ${MAP_LIMIT} — приблизьте карту`
                : `${count} на карте`}
          </Text>
        </View>
      )}

      {selected && (
        <Pressable
          onPress={() => onOpen(selected.id)}
          accessibilityRole="button"
          accessibilityLabel={`${selected.title}. Открыть объявление`}
          style={({ pressed }) => [styles.preview, pressed && styles.pressed]}
        >
          <RemoteImage
            uri={selected.cover?.thumbnailUrl ?? selected.cover?.url ?? null}
            style={styles.previewImage}
            containerStyle={styles.previewPlaceholder}
            fallback={<Icon name="image" size={22} color="rgba(255,255,255,0.5)" />}
          />
          <View style={styles.previewText}>
            <Text style={styles.previewPrice} numberOfLines={1}>
              {selected.price.value === null
                ? 'Цена договорная'
                : `${formatMoney(selected.price.value)}${LISTING_PRICE_UNIT_SUFFIX[selected.price.unit]}`}
            </Text>
            <Text style={styles.previewTitle} numberOfLines={2}>
              {selected.title}
            </Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root: { flex: 1, minHeight: 320 },
    // Карта на всю область, без своей рамки: её края — края экрана
    map: { flex: 1, borderRadius: 0, borderWidth: 0 },
    pressed: { opacity: 0.85 },

    searchHere: {
      position: 'absolute',
      top: spacing.md,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.raised,
    },
    searchHereLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },

    loader: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      width: 36,
      height: 36,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },

    countPill: {
      position: 'absolute',
      left: spacing.md,
      bottom: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    countText: { ...typography.caption, color: colors.text },

    preview: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      bottom: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.raised,
    },
    previewImage: { width: 64, height: 64, borderRadius: radius.md },
    previewPlaceholder: {
      width: 64,
      height: 64,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inkSoft,
    },
    previewText: { flex: 1, minWidth: 0, gap: 2 },
    previewPrice: { ...typography.subheading, color: colors.text, fontSize: 16 },
    previewTitle: { ...typography.caption, color: colors.textMuted },
  });
