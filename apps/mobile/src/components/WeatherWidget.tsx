import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { describeWeatherCode } from '@dagestan/shared';

import { useWeather } from '../api/queries';
import { useCityStore } from '../store/city-store';
import { radius, shadow, spacing, typography, useThemeColors } from '../theme';
import { formatHour } from '../utils/weather-metrics';
import { weatherBackgroundKey, weatherSurface } from '../utils/weather-theme';
import { GlassCard } from './GlassCard';
import { Icon } from './Icon';
import { WeatherIcon } from './WeatherIcon';
import { WeatherSkyPhoto } from './WeatherSkyPhoto';

/**
 * Высота карточки. Ниже, чем была (220): под погодой теперь рекламная полоса,
 * и экран не должен вырасти. Ужаты отступы, а не температура и часы.
 */
const CARD_HEIGHT = 186;
/** Сколько часов показываем в виджете на главной — вкладке погоды нужна вся
 * лента на 48 часов, а тут только «на ближайшее время», чтобы не раздувать
 * главную страницу. */
const PREVIEW_HOURS = 12;

/**
 * Погода на главной (Этап 3 ТЗ): графический виджет между рекламой и
 * разделами, вместо обычной плитки-рубрики. Тап по верхней части открывает
 * полный экран погоды (7 дней, 48 часов); тап по конкретному часу — тот же
 * экран, но сразу с выбранным этим часом: подробности часа там уже есть,
 * отдельное всплывающее окно на главной их только дублировало.
 */
/** `width` — ширина карточки; без неё — экран минус поля (на планшете главная передаёт свою колонку). */
export function WeatherWidget({ width: givenWidth }: { width?: number } = {}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cityId = useCityStore((s) => s.cityId);

  const { data, isLoading, isError } = useWeather(cityId);

  const cardWidth = givenWidth ?? width - spacing.lg * 2;

  if (!cityId) return null;

  const backgroundKey = data
    ? weatherBackgroundKey(describeWeatherCode(data.current.conditionCode).icon, data.current.isDay)
    : null;
  // Плитки часов — то же стекло, что и на экране погоды: на фотографии неба
  // полупрозрачная заливка без размытия и обводки сливалась с облаками
  const surface = weatherSurface(data?.current.isDay ?? true);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.card, { width: cardWidth, height: CARD_HEIGHT }]}>
        {backgroundKey ? (
          <WeatherSkyPhoto backgroundKey={backgroundKey} width={cardWidth} height={CARD_HEIGHT} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceMuted }]} />
        )}

        {isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textOnDark} />
          </View>
        )}

        {isError && !isLoading && (
          <View style={styles.center}>
            <Text style={styles.errorText}>Не удалось загрузить погоду</Text>
          </View>
        )}

        {data && (
          <>
            <Pressable
              onPress={() => router.push('/weather')}
              accessibilityRole="button"
              accessibilityLabel={`Погода в городе: ${data.current.conditionText}, ${Math.round(data.current.temperature)} градусов. Открыть подробный прогноз`}
              style={({ pressed }) => [styles.summary, pressed && styles.pressed]}
            >
              <WeatherIcon name={describeWeatherCode(data.current.conditionCode).icon} size={48} />
              <View style={styles.summaryTexts}>
                <Text style={styles.temperature}>{Math.round(data.current.temperature)}°</Text>
                <Text style={styles.condition}>{data.current.conditionText}</Text>
              </View>
              <View style={styles.summaryRight}>
                <Text style={styles.feelsLike}>
                  Ощущается{'\n'}как {Math.round(data.current.feelsLike)}°
                </Text>
                <Icon name="chevron-right" size={18} color={colors.textOnDark} />
              </View>
            </Pressable>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hourlyRow}
            >
              {data.hourly.slice(0, PREVIEW_HOURS).map((hour) => (
                <Pressable
                  key={hour.time}
                  onPress={() => router.push({ pathname: '/weather', params: { hour: hour.time } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatHour(hour.time)}, ${hour.conditionText}, ${Math.round(hour.temperature)} градусов. Открыть прогноз на это время`}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <GlassCard
                    tint={surface.tileTint}
                    borderColor={surface.border}
                    style={styles.hourTile}
                  >
                    <Text style={[styles.hourTime, { color: surface.muted }]}>
                      {formatHour(hour.time)}
                    </Text>
                    <WeatherIcon name={describeWeatherCode(hour.conditionCode).icon} size={26} />
                    <Text style={[styles.hourTemp, { color: surface.text }]}>
                      {Math.round(hour.temperature)}°
                    </Text>
                  </GlassCard>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    wrapper: { paddingHorizontal: spacing.lg },
    card: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      justifyContent: 'space-between',
      ...shadow.raised,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorText: { ...typography.body, color: colors.textOnDark },

    summary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    summaryTexts: { flex: 1 },
    temperature: {
      fontSize: 38,
      lineHeight: 44,
      fontWeight: '700',
      color: colors.textOnDark,
      letterSpacing: -1,
    },
    condition: { ...typography.body, color: colors.textOnDark, opacity: 0.9 },
    summaryRight: { alignItems: 'flex-end', gap: spacing.xs },
    feelsLike: {
      ...typography.caption,
      color: colors.textOnDark,
      opacity: 0.85,
      textAlign: 'right',
    },
    pressed: { opacity: 0.85 },

    hourlyRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    hourTile: {
      alignItems: 'center',
      gap: 2,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      minWidth: 60,
    },
    hourTime: { ...typography.caption },
    hourTemp: { ...typography.body, fontWeight: '600' },
  });
