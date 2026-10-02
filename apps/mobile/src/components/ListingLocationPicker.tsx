import {
  formatAddress,
  isInDagestan,
  placeName,
  type GeoCoordinates,
  type GeoPlaceDto,
  type ListingAddressVisibility,
  type ListingLocationInput,
} from '@dagestan/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { reverseGeocode, useGeoSuggest } from '../api/queries';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { radius, spacing, typography, useThemeColors } from '../theme';
import { placeToLocation, requestCurrentPosition, zoomFor } from '../utils/geo';
import { GeoSuggestionList, geoErrorText } from './GeoSuggestionList';
import { Icon } from './Icon';
import { LeafletMap, type MapFocus } from './LeafletMap';
import { Field, createStyles as createFieldStyles } from './ListingFormFields';

/**
 * «Где находится» — место объявления (ADR-0010).
 *
 * Три способа указать место, и все три держат друг друга в согласии:
 *   - населённый пункт из подсказок — точка встаёт в его центр;
 *   - «Адрес или ориентир» с подсказками рядом с выбранным пунктом — точка
 *     встаёт на найденный адрес, карта перелетает к ней;
 *   - нажатие или перетаскивание метки на карте — адрес подбирается по
 *     точке (обратное геокодирование) и вписывается в поля.
 *
 * Своё местоположение подставляется только по кнопке: молча брать GPS и
 * публиковать объявление «у меня дома» нельзя. Точка сохраняется, даже
 * если адрес по ней не нашёлся или геокодер недоступен — без неё не
 * работает поиск по расстоянию, а адрес можно дописать словами.
 */

interface Props {
  value: ListingLocationInput | null;
  onChange: (value: ListingLocationInput | null) => void;
  visibility: ListingAddressVisibility;
  onChangeVisibility: (value: ListingAddressVisibility) => void;
  /** Где открыть карту, пока точки нет: выбранный в приложении город */
  defaultCenter: GeoCoordinates;
  error?: string;
}

type Status = { tone: 'muted' | 'warning' | 'danger'; text: string } | null;
type ActiveField = 'settlement' | 'address' | null;

/** Пауза набора перед запросом подсказок: запрос уходит, когда человек остановился. */
const SUGGEST_DEBOUNCE_MS = 350;
/** Пауза перед «адрес по точке»: несколько быстрых нажатий — один запрос. */
const REVERSE_DEBOUNCE_MS = 400;

export function ListingLocationPicker({
  value,
  onChange,
  visibility,
  onChangeVisibility,
  defaultCenter,
  error,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [settlementText, setSettlementText] = useState(() =>
    value ? (placeName(value) ?? '') : '',
  );
  const [addressText, setAddressText] = useState(() => value?.address ?? '');
  const [active, setActive] = useState<ActiveField>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);

  // Ответ «адрес по точке» может прийти после того, как метку уже
  // передвинули ещё раз: применяется только ответ на последнее нажатие
  const reverseRequest = useRef(0);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  const point: GeoCoordinates | null = value
    ? { latitude: value.latitude, longitude: value.longitude }
    : null;
  // Подсказки адреса ищутся рядом с выбранным местом, а не по всей стране
  const near = point ?? defaultCenter;

  const settlementQuery = useDebouncedValue(settlementText, SUGGEST_DEBOUNCE_MS);
  const addressQuery = useDebouncedValue(addressText, SUGGEST_DEBOUNCE_MS);
  const settlements = useGeoSuggest(settlementQuery, {
    kind: 'settlement',
    near: defaultCenter,
    enabled: active === 'settlement',
  });
  const addresses = useGeoSuggest(addressQuery, {
    kind: 'any',
    near,
    enabled: active === 'address',
  });

  const flyTo = (target: GeoCoordinates, zoom: number) =>
    setFocus((current) => ({ point: target, zoom, version: (current?.version ?? 0) + 1 }));

  const closeSuggestions = () => {
    setActive(null);
    Keyboard.dismiss();
  };

  const onFieldFocus = (field: ActiveField) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setActive(field);
  };

  // Список закрывается с задержкой: в браузере потеря фокуса наступает
  // раньше нажатия на подсказку, и без паузы нажатие уходило бы в пустоту
  const onFieldBlur = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => setActive(null), 250);
  };

  const chooseSettlement = (place: GeoPlaceDto) => {
    reverseRequest.current += 1;
    setResolving(false);
    setSettlementText(place.title);
    setAddressText('');
    setStatus(null);
    onChange(placeToLocation(place));
    flyTo(place, zoomFor(place.kind));
    closeSuggestions();
  };

  const chooseAddress = (place: GeoPlaceDto) => {
    reverseRequest.current += 1;
    setResolving(false);
    const next = placeToLocation(place);
    setAddressText(next.address ?? '');
    setSettlementText(placeName(place.components) ?? settlementText);
    setStatus(null);
    onChange(next);
    flyTo(place, zoomFor(place.kind));
    closeSuggestions();
  };

  const changeAddressText = (text: string) => {
    setAddressText(text);
    // Ориентир словами («рядом с рынком») — тоже адрес: точка остаётся прежней
    if (value) onChange({ ...value, address: text.trim() || null });
  };

  /** Точку поставили руками: сразу сохраняем её, адрес подбираем следом. */
  const pickPoint = (picked: GeoCoordinates) => {
    const base: ListingLocationInput = value ?? {
      latitude: picked.latitude,
      longitude: picked.longitude,
      accuracy: 'point',
    };
    onChange({
      ...base,
      latitude: picked.latitude,
      longitude: picked.longitude,
      accuracy: 'point',
    });
    setActive(null);

    const request = ++reverseRequest.current;
    setResolving(true);
    setStatus(null);
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    reverseTimer.current = setTimeout(() => {
      reverseGeocode(picked)
        .then((place) => {
          if (request !== reverseRequest.current) return;
          if (!place) {
            setStatus({
              tone: 'warning',
              text: 'По этой точке адрес не нашёлся. Точка сохранится — ориентир можно написать самому.',
            });
            return;
          }
          const next = placeToLocation(place, picked);
          setAddressText(next.address ?? '');
          setSettlementText(placeName(place.components) ?? '');
          onChange(next);
        })
        .catch((reason: unknown) => {
          if (request !== reverseRequest.current) return;
          setStatus({
            tone: 'warning',
            text: `${geoErrorText(reason)} Точка на карте при этом сохранится.`,
          });
        })
        .finally(() => {
          if (request === reverseRequest.current) setResolving(false);
        });
    }, REVERSE_DEBOUNCE_MS);
  };

  const locateMe = async () => {
    closeSuggestions();
    setLocating(true);
    const result = await requestCurrentPosition();
    setLocating(false);
    if (result.status === 'denied') {
      setStatus({
        tone: 'danger',
        text: 'Нет доступа к геолокации. Разрешите его в настройках телефона или укажите место вручную.',
      });
      return;
    }
    if (result.status === 'unavailable') {
      setStatus({
        tone: 'danger',
        text: 'Не удалось определить местоположение. Выберите населённый пункт или нажмите на карту.',
      });
      return;
    }
    flyTo(result.point, 16);
    pickPoint(result.point);
  };

  const showSettlementList = active === 'settlement' && settlementText.trim().length >= 2;
  const showAddressList = active === 'address' && addressText.trim().length >= 2;
  const outside = point !== null && !isInDagestan(point);
  const description = value
    ? value.formattedAddress || formatAddress(value) || coordinatesText(value)
    : null;

  return (
    <View style={styles.wrapper}>
      <Field label="Населённый пункт">
        <TextInput
          value={settlementText}
          onChangeText={setSettlementText}
          onFocus={() => onFieldFocus('settlement')}
          onBlur={onFieldBlur}
          placeholder="Город или село, например Манаскент"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Населённый пункт"
        />
        {showSettlementList && (
          <GeoSuggestionList
            places={settlements.data}
            loading={settlements.isFetching || settlementQuery !== settlementText}
            error={settlements.error}
            onSelect={chooseSettlement}
            emptyText="Такого населённого пункта не нашлось. Проверьте написание или поставьте точку на карте."
          />
        )}
      </Field>

      <Field label="Адрес или ориентир">
        <TextInput
          value={addressText}
          onChangeText={changeAddressText}
          onFocus={() => onFieldFocus('address')}
          onBlur={onFieldBlur}
          placeholder="Улица и дом или ориентир: у рынка, напротив школы"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoCorrect={false}
          maxLength={300}
          accessibilityLabel="Адрес или ориентир"
        />
        {showAddressList && (
          <GeoSuggestionList
            places={addresses.data}
            loading={addresses.isFetching || addressQuery !== addressText}
            error={addresses.error}
            onSelect={chooseAddress}
          />
        )}
      </Field>

      <View style={styles.mapHeader}>
        <Text style={styles.fieldLabel}>Место на карте</Text>
        <Pressable
          onPress={() => void locateMe()}
          disabled={locating}
          accessibilityRole="button"
          accessibilityLabel="Моё местоположение"
          hitSlop={8}
          style={({ pressed }) => [styles.locate, pressed && styles.pressed]}
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon name="location" size={16} color={colors.primary} />
          )}
          <Text style={styles.locateLabel}>Моё местоположение</Text>
        </Pressable>
      </View>

      <LeafletMap
        center={point ?? defaultCenter}
        zoom={point ? zoomFor(value?.accuracy ?? 'point') : 12}
        marker={point}
        interactive
        onPick={pickPoint}
        focus={focus}
        style={[styles.map, error && !value ? styles.mapError : null]}
      />

      <View style={styles.statusRow}>
        {resolving ? (
          <>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.statusMuted}>Определяем адрес по точке…</Text>
          </>
        ) : description ? (
          <>
            <Icon name="location" size={14} color={colors.primary} />
            <Text style={styles.statusText} numberOfLines={3}>
              {description}
            </Text>
          </>
        ) : (
          <Text style={styles.statusMuted}>
            Нажмите на карту или выберите адрес из подсказок — метку можно перетащить.
          </Text>
        )}
      </View>

      {status && (
        <Text
          style={[
            styles.hint,
            status.tone === 'warning' && styles.warning,
            status.tone === 'danger' && styles.danger,
          ]}
        >
          {status.text}
        </Text>
      )}
      {outside && (
        <Text style={[styles.hint, styles.warning]}>
          Точка за пределами Дагестана — проверьте, что выбрано правильное место.
        </Text>
      )}
      {error && !value && <Text style={[styles.hint, styles.danger]}>{error}</Text>}

      <View style={styles.switchRow}>
        <View style={styles.switchTexts}>
          <Text style={styles.switchLabel}>Показывать точный адрес</Text>
          <Text style={styles.hint}>
            {visibility === 'exact'
              ? 'Покупатели увидят адрес с домом и точку на карте.'
              : 'Покупатели увидят населённый пункт и улицу, на карте — примерную область. Поиск по расстоянию всё равно работает точно.'}
          </Text>
        </View>
        <Switch
          value={visibility === 'exact'}
          onValueChange={(exact) => onChangeVisibility(exact ? 'exact' : 'approximate')}
          accessibilityLabel="Показывать точный адрес"
        />
      </View>
    </View>
  );
}

function coordinatesText(point: GeoCoordinates): string {
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    ...createFieldStyles(colors),
    wrapper: { gap: spacing.lg },
    mapHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: -spacing.sm,
    },
    locate: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
    },
    locateLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    map: { height: 260 },
    mapError: { borderColor: colors.danger },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: -spacing.sm,
    },
    statusText: { ...typography.caption, color: colors.text, flex: 1 },
    statusMuted: { ...typography.caption, color: colors.textMuted, flex: 1 },
    warning: { color: colors.warning },
    danger: { color: colors.danger },
    switchTexts: { flex: 1, gap: 2, paddingRight: spacing.md },
  });
