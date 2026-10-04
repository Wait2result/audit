import {
  describeWeatherCode,
  type DailyForecastDto,
  type HourlyForecastDto,
} from '@dagestan/shared';
import Slider from '@react-native-community/slider';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useCities, useWeather } from '../src/api/queries';
import { Button } from '../src/components/Button';
import { FormHeader } from '../src/components/FormHeader';
import { GlassCard } from '../src/components/GlassCard';
import { Icon, type IconName } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { WeatherBackground } from '../src/components/WeatherBackground';
import { WeatherIcon } from '../src/components/WeatherIcon';
import { useCityStore } from '../src/store/city-store';
import { colors, spacing, typography, useThemeColors } from '../src/theme';
import {
  buildDayMetrics,
  buildHourMetrics,
  formatDayTitle,
  formatHour,
  formatWeekdayShort,
} from '../src/utils/weather-metrics';
import {
  WEATHER_ACCENT,
  WEATHER_BACKGROUND_COLOR,
  weatherBackgroundKey,
  weatherSurface,
  type WeatherSurface,
} from '../src/utils/weather-theme';

const OPEN_METEO_URL = 'https://open-meteo.com/';

/** Цвета текста поверх фото неба — всегда светлые: карточка-стекло под ними
 * достаточно затемняет фон, чтобы белый читался в любую погоду, день или ночь. */
const ON_BACKGROUND = {
  text: colors.textOnDark,
  muted: 'rgba(255,255,255,0.82)',
  faint: 'rgba(255,255,255,0.5)',
  accent: 'rgba(255,255,255,0.9)',
};

/**
 * Погода для выбранного города (Этап 3 ТЗ).
 *
 * Время выбирается ползунком с шагом 15 минут, и все показатели на экране
 * относятся к выбранному моменту — отдельных всплывающих окон нет, данные
 * меняются прямо на странице. Дни недели раскрываются здесь же, под строкой.
 *
 * Источник — Open-Meteo (см. docs/ADR/0003-погода-open-meteo.md); фон и
 * карточки живые: тема меняется по факту дня/ночи и погоды в городе.
 */
export default function WeatherScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  /**
   * Час, выбранный на главной (тап по часу в виджете погоды); город и день —
   * от умного поиска («погода завтра в Дербенте»). Город запроса — только для
   * этого экрана: выбранный город приложения не меняется (D8)
   */
  const {
    hour,
    cityId: requestedCity,
    day,
  } = useLocalSearchParams<{
    hour?: string;
    cityId?: string;
    day?: string;
  }>();
  const appCityName = useCityStore((s) => s.cityName);
  const appCityId = useCityStore((s) => s.cityId);
  const { data: allCities } = useCities();
  const cityId = requestedCity ?? appCityId;
  const cityName = requestedCity
    ? (allCities?.find((city) => city.id === requestedCity)?.name ?? appCityName)
    : appCityName;

  const { data, isLoading, isError, refetch, isFetching, refresh } = useWeather(cityId);

  /**
   * Выбранный момент — само время точки, а не её номер в ряду: ряд
   * пересобирается при каждом обновлении, и номер после него указывал бы уже
   * на другой момент. `null` — «сейчас».
   */
  const [selectedTime, setSelectedTime] = useState<string | null>(hour ?? null);
  // День из умного поиска раскрывается сразу — его прогноз виден без лишнего нажатия
  const [openDay, setOpenDay] = useState<string | null>(day ?? null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Час с главной должен пережить первое обновление при заходе на экран —
  // обычно после обновления ползунок возвращается к «сейчас»
  const keepRequestedHour = useRef(Boolean(hour));

  const reload = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
      // Показанное время относится к «сейчас», поэтому после обновления
      // возвращаем ползунок к текущему моменту
      if (keepRequestedHour.current) keepRequestedHour.current = false;
      else setSelectedTime(null);
    } catch {
      // Сеть отвалилась — обычный запрос ниже покажет ошибку сам
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh, refetch]);

  // Прогноз, открытый час назад, — уже не прогноз. При каждом заходе на экран
  // данные запрашиваются заново, в обход кеша сервера: иначе человек видит
  // то же время обновления, что и полчаса назад, и решает, что всё зависло.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const surface = weatherSurface(data?.current.isDay ?? true);
  const moments = data?.quarterHourly ?? [];
  /** Номер выбранной точки в 15-минутном ряду; 0 — «сейчас» */
  const momentIndex = selectedTime ? findMomentIndex(moments, selectedTime) : 0;
  const moment = moments[Math.min(momentIndex, moments.length - 1)];
  const isNow = momentIndex === 0;
  const selectMoment = (index: number) =>
    setSelectedTime(index === 0 ? null : (moments[index]?.time ?? null));

  const backgroundKey = data
    ? weatherBackgroundKey(describeWeatherCode(data.current.conditionCode).icon, data.current.isDay)
    : null;

  // Показываем настоящие «сейчас» для нулевой точки: у неё те же цифры, но
  // в current есть восход и закат, которых в 15-минутном ряду нет.
  const shown: HourlyForecastDto | undefined =
    isNow && data ? { ...data.current, time: data.updatedAt } : moment;

  const hourlyPreview = useMemo(() => data?.hourly.slice(0, 24) ?? [], [data]);

  return (
    <Screen
      scroll
      background={backgroundKey ? <WeatherBackground backgroundKey={backgroundKey} /> : undefined}
      backgroundColor={backgroundKey ? WEATHER_BACKGROUND_COLOR[backgroundKey] : undefined}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing || (isFetching && !isLoading)}
          onRefresh={() => void reload()}
          tintColor={colors.textOnDark}
          colors={[WEATHER_ACCENT]}
        />
      }
    >
      <FormHeader
        title={cityName ?? 'Погода'}
        description={data ? `Обновлено в ${formatHour(data.updatedAt)}` : undefined}
        color={data ? colors.textOnDark : colors.text}
        descriptionColor={data ? 'rgba(255,255,255,0.8)' : colors.textMuted}
      />

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {isError && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Не удалось загрузить погоду</Text>
          <Text style={styles.errorText}>
            Проверьте подключение к интернету и попробуйте снова.
          </Text>
          <Button
            label="Повторить"
            variant="secondary"
            loading={isFetching}
            onPress={() => void refetch()}
            fullWidth={false}
            style={styles.retryButton}
          />
        </View>
      )}

      {data && shown && (
        <>
          <View style={styles.currentBlock}>
            <Text style={[styles.momentLabel, { color: ON_BACKGROUND.muted }]}>
              {isNow ? 'Сейчас' : formatMomentLabel(moment?.time ?? '', data.daily[0]?.date ?? '')}
            </Text>

            <View style={styles.currentTop}>
              <WeatherIcon name={describeWeatherCode(shown.conditionCode).icon} size={64} />
              <View>
                <Text style={[styles.temperature, { color: ON_BACKGROUND.text }]}>
                  {round(shown.temperature)}°
                </Text>
                <Text style={[styles.condition, { color: ON_BACKGROUND.text }]}>
                  {shown.conditionText}
                </Text>
                <Text style={[styles.feelsLike, { color: ON_BACKGROUND.muted }]}>
                  Ощущается как {round(shown.feelsLike)}°
                </Text>
              </View>
            </View>

            <GlassCard
              style={styles.detailsCard}
              tint={surface.tint}
              borderColor={surface.border}
              shadow
            >
              {moments.length > 1 && (
                <View style={styles.sliderBlock}>
                  <Slider
                    value={momentIndex}
                    minimumValue={0}
                    maximumValue={moments.length - 1}
                    step={1}
                    onValueChange={selectMoment}
                    minimumTrackTintColor={surface.accent}
                    maximumTrackTintColor={surface.track}
                    thumbTintColor={surface.accent}
                    style={styles.slider}
                  />
                  <View style={styles.sliderScale}>
                    <Text style={[styles.sliderEdge, { color: surface.faint }]}>Сейчас</Text>
                    <Text style={[styles.sliderEdge, { color: surface.faint }]}>Через сутки</Text>
                  </View>
                  {!isNow && (
                    <Pressable
                      onPress={() => selectMoment(0)}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
                    >
                      <Text style={[styles.resetLabel, { color: surface.accent }]}>
                        Вернуться к текущему времени
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              <View style={[styles.metricsGrid, { borderTopColor: surface.border }]}>
                {buildHourMetrics(shown).map((metric) => (
                  <Metric
                    key={metric.label}
                    icon={metric.icon}
                    label={metric.label}
                    value={metric.value}
                    surface={surface}
                  />
                ))}
                {isNow && (
                  <>
                    <Metric
                      icon="sunrise"
                      label="Восход"
                      value={formatHour(data.current.sunrise)}
                      surface={surface}
                    />
                    <Metric
                      icon="sunset"
                      label="Закат"
                      value={formatHour(data.current.sunset)}
                      surface={surface}
                    />
                  </>
                )}
              </View>
            </GlassCard>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Почасовой прогноз</Text>
            <Text style={styles.sectionHint}>Нажмите на час, чтобы посмотреть его погоду</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hourlyRow}
            >
              {hourlyPreview.map((hour) => {
                const index = findMomentIndex(moments, hour.time);
                const active = !isNow && index === momentIndex;

                return (
                  <Pressable
                    key={hour.time}
                    onPress={() => selectMoment(index)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${formatHour(hour.time)}, ${hour.conditionText}, ${round(hour.temperature)} градусов`}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <GlassCard
                      // Активный час — не толстая рамка, а мягкий бирюзовый
                      // оттенок подложки: заметно, но без резкого контура
                      tint={active ? surface.activeTint : surface.tileTint}
                      borderColor={active ? surface.accent : surface.border}
                      style={styles.hourlyTile}
                    >
                      <Text style={[styles.hourlyTime, { color: surface.muted }]}>
                        {formatHour(hour.time)}
                      </Text>
                      <WeatherIcon name={describeWeatherCode(hour.conditionCode).icon} size={30} />
                      <Text style={[styles.hourlyTemp, { color: surface.text }]}>
                        {round(hour.temperature)}°
                      </Text>
                    </GlassCard>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.sectionWide}>
            <Text style={styles.sectionTitle}>На 7 дней</Text>
            <Text style={styles.sectionHint}>Нажмите на день, чтобы увидеть его целиком</Text>
            <View style={styles.dailyList}>
              {data.daily.map((day) => (
                <DailyRow
                  key={day.date}
                  day={day}
                  surface={surface}
                  expanded={openDay === day.date}
                  onPress={() => setOpenDay(openDay === day.date ? null : day.date)}
                />
              ))}
            </View>
          </View>

          <Text style={styles.attribution} onPress={() => void Linking.openURL(OPEN_METEO_URL)}>
            {data.attribution}
          </Text>
        </>
      )}
    </Screen>
  );
}

function Metric({
  icon,
  label,
  value,
  surface,
}: {
  icon: IconName;
  label: string;
  value: string;
  surface: WeatherSurface;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.metric}>
      <Icon name={icon} size={22} color={surface.accent} />
      <View style={styles.metricTexts}>
        <Text style={[styles.metricLabel, { color: surface.faint }]}>{label}</Text>
        <Text style={[styles.metricValue, { color: surface.text }]}>{value}</Text>
      </View>
    </View>
  );
}

/**
 * Строка дня: по нажатию раскрывается здесь же, под собой. Показатели —
 * средние и крайние за сутки, без разбивки по часам: за весь день точное
 * время ни к чему, для него есть ползунок выше.
 */
function DailyRow({
  day,
  surface,
  expanded,
  onPress,
}: {
  day: DailyForecastDto;
  surface: WeatherSurface;
  expanded: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const palette = surface;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${formatDayTitle(day.date)}, ${day.conditionText}, от ${round(day.tempMin)} до ${round(day.tempMax)} градусов`}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <GlassCard style={styles.dailyCard} tint={surface.tileTint} borderColor={surface.border}>
        <View style={styles.dailyRow}>
          <Text style={[styles.dailyDay, { color: palette.text }]}>
            {formatWeekdayShort(day.date)}
          </Text>
          <WeatherIcon name={describeWeatherCode(day.conditionCode).icon} size={28} />
          <Text style={[styles.dailyPrecip, { color: palette.accent }]}>
            {day.precipitationProbability}%
          </Text>
          <Text style={[styles.dailyTemp, { color: palette.text }]}>
            {round(day.tempMin)}° / {round(day.tempMax)}°
          </Text>
          <Icon name={expanded ? 'close' : 'chevron-right'} size={16} color={palette.faint} />
        </View>

        {expanded && (
          <View style={[styles.dailyDetails, { borderTopColor: palette.faint }]}>
            <Text style={[styles.dailyDetailsTitle, { color: palette.text }]}>
              {formatDayTitle(day.date)} · {day.conditionText}
            </Text>
            <View style={styles.dailyMetrics}>
              {buildDayMetrics(day).map((metric) => (
                <View key={metric.label} style={styles.metric}>
                  <Icon name={metric.icon} size={20} color={palette.accent} />
                  <View style={styles.metricTexts}>
                    <Text style={[styles.metricLabel, { color: palette.faint }]}>
                      {metric.label}
                    </Text>
                    <Text style={[styles.metricValue, { color: palette.text }]}>
                      {metric.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </GlassCard>
    </Pressable>
  );
}

/** «Сегодня, 14:45» или «Завтра, 09:15» — чтобы было видно, что именно выбрано. */
function formatMomentLabel(time: string, today: string): string {
  if (!time) return '';
  const day = time.slice(0, 10) === today ? 'Сегодня' : 'Завтра';
  return `${day}, ${formatHour(time)}`;
}

/** Ближайшая к указанному часу точка 15-минутного ряда. */
function findMomentIndex(moments: HourlyForecastDto[], time: string): number {
  const index = moments.findIndex((point) => point.time >= time);
  return index < 0 ? moments.length - 1 : index;
}

function round(value: number): number {
  return Math.round(value);
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
    errorTitle: { ...typography.subheading, color: colors.text },
    errorText: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
    retryButton: { marginTop: spacing.md, paddingHorizontal: spacing.xl },

    currentBlock: { marginTop: spacing.lg },
    detailsCard: { marginTop: spacing.lg, padding: spacing.lg },
    momentLabel: { ...typography.subheading, marginBottom: spacing.sm },
    currentTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
    temperature: { fontSize: 48, fontWeight: '700', letterSpacing: -1 },
    condition: { ...typography.subheading },
    feelsLike: { ...typography.caption },

    sliderBlock: {},
    slider: { width: '100%', height: 36 },
    sliderScale: { flexDirection: 'row', justifyContent: 'space-between' },
    sliderEdge: { ...typography.caption },
    resetButton: { alignSelf: 'flex-start', marginTop: spacing.sm, minHeight: 32 },
    resetLabel: { ...typography.caption, textDecorationLine: 'underline' },

    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
    },
    metric: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, width: '46%' },
    metricTexts: { flexShrink: 1 },
    metricLabel: { ...typography.caption },
    metricValue: { ...typography.body, fontWeight: '600' },

    section: { marginTop: spacing.xxl },
    // Блок «На 7 дней» отделён сильнее: иначе заголовок читается как подпись
    // к ленте часов над ним, а не как начало нового раздела.
    sectionWide: { marginTop: spacing.xxxl },
    sectionTitle: { ...typography.heading, color: colors.textOnDark },
    sectionHint: {
      ...typography.caption,
      color: 'rgba(255,255,255,0.7)',
      marginBottom: spacing.md,
    },

    pressed: { opacity: 0.85 },

    hourlyRow: { gap: spacing.sm, paddingRight: spacing.lg },
    hourlyTile: {
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      minWidth: 68,
    },
    hourlyTime: { ...typography.caption },
    hourlyTemp: { ...typography.body, fontWeight: '600' },

    dailyList: { gap: spacing.sm },
    dailyCard: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    dailyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 36 },
    dailyDay: { ...typography.body, fontWeight: '600', width: 36 },
    dailyPrecip: { ...typography.caption, width: 40 },
    dailyTemp: { ...typography.body, marginLeft: 'auto' },

    dailyDetails: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1 },
    dailyDetailsTitle: { ...typography.subheading, marginBottom: spacing.md },
    dailyMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },

    attribution: {
      ...typography.caption,
      color: 'rgba(255,255,255,0.7)',
      textAlign: 'center',
      textDecorationLine: 'underline',
      marginTop: spacing.xl,
      marginBottom: spacing.lg,
    },
  });
