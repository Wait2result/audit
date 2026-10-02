import {
  LISTING_RADIUS_OPTIONS,
  placeLabel,
  placeName,
  type GeoCoordinates,
  type GeoPlaceDto,
  type ListingRadiusKm,
} from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { reverseGeocode, useGeoSuggest } from '../../src/api/queries';
import { Button } from '../../src/components/Button';
import { GeoSuggestionList } from '../../src/components/GeoSuggestionList';
import { Icon } from '../../src/components/Icon';
import { LeafletMap, type MapFocus } from '../../src/components/LeafletMap';
import { Screen } from '../../src/components/Screen';
import { useDebouncedValue } from '../../src/hooks/use-debounced-value';
import { useListingArea } from '../../src/hooks/use-listing-area';
import {
  radiusLabel,
  useListingAreaStore,
  type SearchPlace,
} from '../../src/store/listing-area-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';
import { requestCurrentPosition } from '../../src/utils/geo';

/**
 * «Где искать» (ADR-0010): место и радиус поиска объявлений.
 *
 * Место — любое: село из поиска, адрес, точка на карте или своё
 * местоположение по кнопке. Круг радиуса рисуется на карте сразу, как
 * меняется радиус или точка, — видно, какие сёла в него попадут. Выдача
 * обновляется по «Показать объявления», а не на каждое движение метки.
 */

const MAP_ZOOM_BY_RADIUS: Record<ListingRadiusKm, number> = {
  1: 14,
  5: 12,
  10: 11,
  25: 10,
  50: 9,
  100: 8,
};

export default function ListingLocationScreen() {
  const colors = useThemeColors();
  const hydrated = useListingAreaStore((s) => s.hydrated);
  const hydrate = useListingAreaStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Черновик берёт начальные значения из сохранённого выбора — пока он не
  // прочитан с устройства, открывать редактор рано: после перезапуска он
  // показал бы город по умолчанию вместо выбранного села
  if (!hydrated) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxxl }} />
      </Screen>
    );
  }

  return <LocationEditor />;
}

function LocationEditor() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  const area = useListingArea();
  const storedPlace = useListingAreaStore((s) => s.place);
  const recent = useListingAreaStore((s) => s.recent);
  const apply = useListingAreaStore((s) => s.apply);
  const clearRecent = useListingAreaStore((s) => s.clearRecent);

  // Черновик: применяется по кнопке, «назад» ничего не меняет
  const [place, setPlace] = useState<SearchPlace | null>(storedPlace);
  const [radiusKm, setRadiusKm] = useState<ListingRadiusKm | null>(area.radiusKm);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reverseRequest = useRef(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  const center: GeoCoordinates = place ?? area.cityCenter;
  const label = place?.label ?? area.cityLabel;

  const query = useDebouncedValue(search, 350);
  const suggestions = useGeoSuggest(query, { kind: 'any', near: center, enabled: searchFocused });
  const showSuggestions = searchFocused && search.trim().length >= 2;

  const flyTo = (point: GeoCoordinates, zoom: number) =>
    setFocus((current) => ({ point, zoom, version: (current?.version ?? 0) + 1 }));

  const zoomForRadius = (value: ListingRadiusKm | null) =>
    value === null ? 8 : MAP_ZOOM_BY_RADIUS[value];

  const choose = (next: SearchPlace) => {
    reverseRequest.current += 1;
    setResolving(false);
    setNotice(null);
    setPlace(next);
    setSearch('');
    setSearchFocused(false);
    Keyboard.dismiss();
    // С радиусом карта сама впишет круг; без радиуса — перелёт к точке
    if (radiusKm === null) flyTo(next, 12);
  };

  const chooseSuggestion = (found: GeoPlaceDto) => {
    const name = placeName(found.components);
    const isPlace = found.kind === 'settlement' || found.kind === 'area';
    choose({
      latitude: found.latitude,
      longitude: found.longitude,
      label: isPlace || !name ? found.title : `${found.title}, ${name}`,
    });
  };

  /** Точка с карты или GPS: сразу ставим, подпись подбираем следом. */
  const choosePoint = (point: GeoCoordinates, fallbackLabel: string) => {
    const request = ++reverseRequest.current;
    setNotice(null);
    setPlace({ ...point, label: fallbackLabel });
    setResolving(true);
    reverseGeocode(point)
      .then((found) => {
        if (request !== reverseRequest.current || !found) return;
        // Название того, что нашлось по точке: город, село, а вне сёл —
        // район («Карабудахкентский район»), но не безликая «Точка на карте»
        setPlace({ ...point, label: placeLabel(found.components, found.title || fallbackLabel) });
      })
      .catch(() => {
        // Подпись не нашлась — не беда: искать можно и от безымянной точки
      })
      .finally(() => {
        if (request === reverseRequest.current) setResolving(false);
      });
  };

  const locateMe = async () => {
    Keyboard.dismiss();
    setSearchFocused(false);
    setLocating(true);
    const result = await requestCurrentPosition();
    setLocating(false);
    if (result.status === 'denied') {
      setNotice(
        'Нет доступа к геолокации. Разрешите его в настройках телефона или выберите место поиском или на карте.',
      );
      return;
    }
    if (result.status === 'unavailable') {
      setNotice('Не удалось определить местоположение. Выберите место поиском или на карте.');
      return;
    }
    if (radiusKm === null) flyTo(result.point, 12);
    choosePoint(result.point, 'Моё местоположение');
  };

  const submit = () => {
    apply(place, radiusKm);
    if (router.canGoBack()) router.back();
    else router.replace('/listings/list');
  };

  return (
    <Screen padded={false}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/listings'))}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            hitSlop={12}
          >
            <Icon name="chevron-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Где искать</Text>
        </View>

        <View style={styles.searchBox}>
          <Icon name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onFocus={() => {
              if (blurTimer.current) clearTimeout(blurTimer.current);
              setSearchFocused(true);
            }}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setSearchFocused(false), 250);
            }}
            placeholder="Город, село или адрес"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Поиск места"
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch('')}
              accessibilityRole="button"
              accessibilityLabel="Очистить"
              hitSlop={8}
            >
              <Icon name="close" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {showSuggestions ? (
          <GeoSuggestionList
            places={suggestions.data}
            loading={suggestions.isFetching || query !== search}
            error={suggestions.error}
            onSelect={chooseSuggestion}
            emptyText="Ничего не нашлось. Проверьте написание или отметьте место на карте."
          />
        ) : (
          <View style={styles.rows}>
            <Pressable
              onPress={() => void locateMe()}
              disabled={locating}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              {locating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Icon name="location" size={18} color={colors.primary} />
              )}
              <Text style={styles.rowAccent}>Моё местоположение</Text>
            </Pressable>

            {storedPlace !== null || place !== null ? (
              <Pressable
                onPress={() => {
                  reverseRequest.current += 1;
                  setResolving(false);
                  setPlace(null);
                  if (radiusKm === null) flyTo(area.cityCenter, 12);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.pressed]}
              >
                <Icon name="home" size={18} color={colors.textMuted} />
                <Text style={styles.rowText}>{area.cityLabel} — город приложения</Text>
              </Pressable>
            ) : null}

            {recent.map((item) => (
              <Pressable
                key={`${item.latitude},${item.longitude}`}
                onPress={() => choose(item)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.pressed]}
              >
                <Icon name="clock" size={18} color={colors.textMuted} />
                <Text style={styles.rowText} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            ))}

            {recent.length > 0 && (
              <Pressable
                onPress={clearRecent}
                accessibilityRole="button"
                style={({ pressed }) => [styles.clearRecent, pressed && styles.pressed]}
              >
                <Text style={styles.clearRecentLabel}>Очистить недавние</Text>
              </Pressable>
            )}
          </View>
        )}

        {notice && <Text style={styles.notice}>{notice}</Text>}

        <Text style={styles.sectionLabel}>Радиус поиска</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.radii}
        >
          {[...LISTING_RADIUS_OPTIONS, null].map((option) => {
            const active = option === radiusKm;
            return (
              <Pressable
                key={option ?? 'region'}
                onPress={() => {
                  setRadiusKm(option);
                  if (option === null) flyTo(center, zoomForRadius(null));
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.radius,
                  active && styles.radiusActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.radiusLabel, active && styles.radiusLabelActive]}>
                  {radiusLabel(option)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <LeafletMap
          center={center}
          zoom={zoomForRadius(radiusKm)}
          marker={center}
          radiusKm={radiusKm}
          interactive
          onPick={(point) => choosePoint(point, 'Точка на карте')}
          focus={focus}
          style={styles.map}
        />

        <View style={styles.summary}>
          {resolving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon name="location" size={14} color={colors.primary} />
          )}
          <Text style={styles.summaryText} numberOfLines={2}>
            {radiusKm === null
              ? `Весь Дагестан, расстояние — от места «${label}»`
              : `${label} и всё в радиусе ${radiusKm} км`}
          </Text>
        </View>
        <Text style={styles.hint}>
          Нажмите на карту или перетащите метку, чтобы искать от другой точки.
        </Text>

        <Button label="Показать объявления" onPress={submit} fullWidth style={styles.submit} />
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
    pressed: { opacity: 0.8 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    title: { ...typography.heading, color: colors.text },

    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: { ...typography.body, color: colors.text, flex: 1, paddingVertical: spacing.sm },

    rows: {
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 48,
      paddingHorizontal: spacing.md,
    },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    rowAccent: { ...typography.body, color: colors.primary, fontWeight: '600' },
    rowText: { ...typography.body, color: colors.text, flex: 1 },
    clearRecent: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    clearRecentLabel: { ...typography.caption, color: colors.textMuted },

    notice: { ...typography.caption, color: colors.danger },
    sectionLabel: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
    radii: { gap: spacing.sm, paddingVertical: 2 },
    radius: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    radiusActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    radiusLabel: { ...typography.caption, color: colors.textMuted },
    radiusLabelActive: { color: colors.textOnPrimary, fontWeight: '600' },

    map: { height: 300 },
    summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    summaryText: { ...typography.body, color: colors.text, flex: 1 },
    hint: { ...typography.caption, color: colors.textMuted, marginTop: -spacing.xs },
    submit: { marginTop: spacing.sm },
  });
