import type { MovieDto, MovieShowtimesDto, ShowtimeDto } from '@dagestan/shared';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useCinemaSchedule, useCities } from '../src/api/queries';
import { Button } from '../src/components/Button';
import { ConditionChip } from '../src/components/ConditionChip';
import { FormHeader } from '../src/components/FormHeader';
import { GlassCard } from '../src/components/GlassCard';
import { Icon } from '../src/components/Icon';
import { MovieTrailerModal } from '../src/components/MovieTrailerModal';
import { Screen } from '../src/components/Screen';
import { useCityStore } from '../src/store/city-store';
import { radius, spacing, typography, useThemeColors } from '../src/theme';
import { toIsoDate } from '../src/utils/city-date';

interface DateTab {
  label: string;
  value: string;
}

/** Даты, доступные для переключения. Kinoplan редко публикует расписание
 * дальше чем на день-два вперёд — длинный список вкладок создал бы пустые. */
function useDateTabs(timezone: string): [DateTab, DateTab] {
  return useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return [
      { label: formatDayLabel(now, timezone), value: toIsoDate(now, timezone) },
      { label: formatDayLabel(tomorrow, timezone), value: toIsoDate(tomorrow, timezone) },
    ];
  }, [timezone]);
}

/** «18 сентября» — тоже по времени города, чтобы подпись совпадала с датой,
 * за которую запрашивается расписание. */
function formatDayLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/**
 * Время сеанса берётся прямо из строки вида «2026-09-18T09:30:00.000+03:00» —
 * в ней уже записано местное время кинотеатра. Приводить её через Date нельзя:
 * телефон пересчитает время в свой часовой пояс, и утренний сеанс превратится
 * в ночной.
 */
function formatShowtime(iso: string): string {
  return iso.slice(11, 16);
}

/** Слова для сравнения: строчные, «ё» как «е», без знаков. */
function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}\d]+/u)
    .filter(Boolean);
}

/** Все слова условия — начала слов названия («дюна» ~ «Дюна: Часть вторая»). */
function matchesWords(title: string, wanted: string): boolean {
  const titleWords = words(title);
  return words(wanted).every((word) =>
    titleWords.some((item) => item.startsWith(word.slice(0, Math.max(3, word.length - 2)))),
  );
}

/** Минуты от начала дня расписания: сеанс в 00:10 следующих суток — это 24:10. */
function minutesOf(startTime: string, date: string): number {
  const [hours, minutes] = startTime.slice(11, 16).split(':').map(Number) as [number, number];
  return (startTime.slice(0, 10) > date ? 24 * 60 : 0) + hours * 60 + minutes;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

function filterSchedule(
  schedule: MovieShowtimesDto[],
  filter: {
    movie: string | null;
    genre: string | null;
    window: { from: string; to: string } | null;
    date: string;
  },
): MovieShowtimesDto[] {
  return schedule
    .filter((item) => !filter.movie || matchesWords(item.movie.title, filter.movie))
    .filter(
      (item) =>
        !filter.genre || item.movie.genres.some((name) => matchesWords(name, filter.genre!)),
    )
    .map((item) => {
      if (!filter.window) return item;
      const from = toMinutes(filter.window.from);
      // «Вечер» без конца включает ночные сеансы после полуночи
      const to = filter.window.to === '23:59' ? 30 * 60 : toMinutes(filter.window.to);
      return {
        ...item,
        showtimes: item.showtimes.filter((showtime) => {
          const minutes = minutesOf(showtime.startTime, filter.date);
          return minutes >= from && minutes <= to;
        }),
      };
    })
    .filter((item) => item.showtimes.length > 0);
}

function windowLabel(range: { from: string; to: string }): string {
  if (range.to === '23:59') return `с ${range.from}`;
  if (range.from === '00:00') return `до ${range.to}`;
  return `${range.from}–${range.to}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** «от 300 ₽», если цена зависит от места в зале, и просто «300 ₽», если нет. */
function formatPrice(min: number, max: number): string {
  return min === max ? `${min} ₽` : `от ${min} ₽`;
}

/**
 * Во сколько сеанс закончится. Считается сложением минут прямо по строке,
 * без Date, — по той же причине, что и время начала: любой пересчёт через
 * Date увёл бы время в часовой пояс телефона.
 *
 * Это время окончания самого фильма: рекламный блок перед сеансом добавит
 * ещё несколько минут, но сколько именно — знает только кинотеатр.
 */
function formatEndTime(iso: string, durationMinutes: number | null): string | null {
  if (!durationMinutes) return null;

  const minutes = Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) + durationMinutes;
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');

  return `${hh}:${mm}`;
}

/**
 * Расписание кино (Этап 4 ТЗ).
 *
 * Данные о сеансах не наши — это зеркало сайтов самих кинотеатров
 * (см. docs/ADR/0004-кино-kinoplan.md), поэтому в приложении нет покупки
 * билетов: тап по сеансу открывает сайт кинотеатра, где выбирается место.
 * Пустой список — законное состояние (нет сеансов в этот день, а для
 * городов без подключённого кинотеатра, например Дербента, — всегда).
 */
export default function CinemaScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Условия от умного поиска: день, фильм, жанр, время и город запроса.
  // Город запроса не меняет город приложения — он только для этого экрана (D8)
  const params = useLocalSearchParams<{
    date?: string;
    movie?: string;
    genre?: string;
    from?: string;
    to?: string;
    cityId?: string;
  }>();
  const appCityName = useCityStore((s) => s.cityName);
  const appCityId = useCityStore((s) => s.cityId);
  const [cityOverride, setCityOverride] = useState(params.cityId ?? null);
  const firstAppCity = useRef(appCityId);
  useEffect(() => {
    if (appCityId !== firstAppCity.current) setCityOverride(null);
  }, [appCityId]);
  const cityId = cityOverride ?? appCityId;

  // Пояс города нужен, чтобы «Сегодня» означало сегодня в этом городе.
  // До загрузки списка городов берём общий для всех наших городов пояс —
  // он же стоит значением по умолчанию в базе.
  const { data: cities } = useCities();
  const timezone = cities?.find((city) => city.id === cityId)?.timezone ?? 'Europe/Moscow';
  const cityName = cityOverride
    ? (cities?.find((city) => city.id === cityOverride)?.name ?? appCityName)
    : appCityName;

  const dateTabs = useDateTabs(timezone);
  // Храним именно выбранный день, а не дату строкой: даты пересчитываются,
  // когда становится известен часовой пояс города, и строка бы устарела.
  const [dayIndex, setDayIndex] = useState<0 | 1>(
    params.date && params.date === dateTabs[1].value ? 1 : 0,
  );
  const date = dateTabs[dayIndex].value;

  // Отбор по расписанию — снимается чипсом, как фильтр в объявлениях
  const [movie, setMovie] = useState(params.movie ?? null);
  const [genre, setGenre] = useState(params.genre ?? null);
  const [timeWindow, setTimeWindow] = useState(
    params.from || params.to ? { from: params.from ?? '00:00', to: params.to ?? '23:59' } : null,
  );

  const [trailerMovie, setTrailerMovie] = useState<MovieDto | null>(null);

  const {
    data: schedule,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useCinemaSchedule(cityId, date);
  const data = useMemo(
    () =>
      schedule ? filterSchedule(schedule, { movie, genre, window: timeWindow, date }) : schedule,
    [schedule, movie, genre, timeWindow, date],
  );
  const conditions = [
    movie ? { label: capitalize(movie), clear: () => setMovie(null) } : null,
    genre ? { label: genre, clear: () => setGenre(null) } : null,
    timeWindow ? { label: windowLabel(timeWindow), clear: () => setTimeWindow(null) } : null,
  ].filter((item): item is { label: string; clear: () => void } => item !== null);

  return (
    <Screen scroll>
      <FormHeader title="Сейчас в кино" description={cityName ?? undefined} />

      <View style={styles.tabs}>
        {dateTabs.map((tab, index) => {
          const active = index === dayIndex;
          return (
            <Pressable
              key={tab.label}
              onPress={() => setDayIndex(index === 0 ? 0 : 1)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.tab,
                active && styles.tabActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {conditions.length > 0 && (
        <View style={styles.conditions}>
          {conditions.map((item) => (
            <ConditionChip key={item.label} label={item.label} onRemove={item.clear} />
          ))}
        </View>
      )}

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {isError && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Не удалось загрузить расписание</Text>
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

      {data && data.length === 0 && !isLoading && (
        <View style={styles.center}>
          <Icon name="cinema" size={40} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>Сеансов нет</Text>
          <Text style={styles.errorText}>
            {conditions.length > 0
              ? 'Под эти условия сеансов нет — снимите одно из них или выберите другой день.'
              : 'На эту дату в вашем городе сеансов не найдено — попробуйте другой день.'}
          </Text>
        </View>
      )}

      {data && data.length > 0 && (
        <View style={styles.list}>
          {data.map((item) => (
            <MovieCard
              key={item.movie.title}
              item={item}
              onOpenTrailer={() => setTrailerMovie(item.movie)}
            />
          ))}
        </View>
      )}

      {trailerMovie && (
        <MovieTrailerModal
          visible
          onClose={() => setTrailerMovie(null)}
          cityId={cityId}
          movie={trailerMovie}
        />
      )}
    </Screen>
  );
}

function MovieCard({
  item,
  onOpenTrailer,
}: {
  item: MovieShowtimesDto;
  onOpenTrailer: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { movie, showtimes } = item;

  return (
    <GlassCard style={styles.card} shadow>
      <View style={styles.cardTop}>
        <Pressable
          onPress={onOpenTrailer}
          accessibilityRole="button"
          accessibilityLabel={`${movie.title}. Смотреть трейлер`}
          style={({ pressed }) => [styles.posterWrapper, pressed && styles.pressed]}
        >
          {movie.posterUrl ? (
            <Image source={{ uri: movie.posterUrl }} style={styles.poster} resizeMode="cover" />
          ) : (
            <View style={[styles.poster, styles.posterFallback]}>
              <Icon name="cinema" size={28} color={colors.primary} />
            </View>
          )}

          {/* Значок «плей» поверх постера — иначе неочевидно, что по нему
              вообще можно нажать и что откроется трейлер */}
          <View style={styles.playBadge}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </Pressable>

        <View style={styles.cardTexts}>
          <Text style={styles.movieTitle} numberOfLines={2}>
            {movie.title}
          </Text>
          {movie.genres.length > 0 && (
            <Text style={styles.movieMeta} numberOfLines={2}>
              {movie.genres.join(', ')}
            </Text>
          )}
          <Text style={styles.movieMeta}>
            {[movie.ageRating, movie.durationMinutes ? `${movie.durationMinutes} мин` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.showtimes}
      >
        {showtimes.map((showtime) => (
          <ShowtimeCard
            key={showtime.id}
            showtime={showtime}
            durationMinutes={movie.durationMinutes}
          />
        ))}
      </ScrollView>
    </GlassCard>
  );
}

function ShowtimeCard({
  showtime,
  durationMinutes,
}: {
  showtime: ShowtimeDto;
  durationMinutes: number | null;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const time = formatShowtime(showtime.startTime);
  const endTime = formatEndTime(showtime.startTime, durationMinutes);
  const price = formatPrice(showtime.priceMin, showtime.priceMax);

  return (
    <Pressable
      onPress={() => void Linking.openURL(showtime.buyUrl)}
      accessibilityRole="button"
      accessibilityLabel={`${time}, ${showtime.cinemaName}, ${[showtime.hallLabel, showtime.hallFeature].filter(Boolean).join(', ')}, ${price}. Выбрать место`}
      style={({ pressed }) => [styles.showtimeCard, pressed && styles.pressed]}
    >
      <Text style={styles.showtimeTime}>{time}</Text>
      {endTime && <Text style={styles.showtimeEnd}>до {endTime}</Text>}
      <Text style={styles.showtimeCinema} numberOfLines={1}>
        {showtime.cinemaName}
      </Text>
      <Text style={styles.showtimeHall} numberOfLines={1}>
        {[showtime.hallLabel, showtime.format].filter(Boolean).join(' · ')}
      </Text>
      {showtime.hallFeature && (
        <Text style={styles.showtimeFeature} numberOfLines={1}>
          {showtime.hallFeature}
        </Text>
      )}
      <Text style={styles.showtimePrice}>{price}</Text>
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    tabs: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    conditions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
    tab: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceMuted,
    },
    tabActive: { backgroundColor: colors.primary },
    tabLabel: { ...typography.subheading, color: colors.textMuted },
    tabLabelActive: { color: colors.textOnPrimary },
    pressed: { opacity: 0.85 },

    center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
    errorTitle: { ...typography.subheading, color: colors.text },
    emptyTitle: { ...typography.subheading, color: colors.text, marginTop: spacing.xs },
    errorText: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
    retryButton: { marginTop: spacing.md, paddingHorizontal: spacing.xl },

    list: { gap: spacing.md, marginTop: spacing.lg },
    card: { paddingVertical: spacing.lg, gap: spacing.md },
    cardTop: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg },

    posterWrapper: { width: 96, height: 140 },
    poster: {
      width: 96,
      height: 140,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
    },
    posterFallback: { alignItems: 'center', justifyContent: 'center' },
    playBadge: {
      position: 'absolute',
      right: spacing.xs,
      bottom: spacing.xs,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(13,43,49,0.75)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    playIcon: { color: colors.textOnDark, fontSize: 11, marginLeft: 2 },

    cardTexts: { flex: 1, gap: spacing.xs },
    movieTitle: { ...typography.subheading, color: colors.text },
    movieMeta: { ...typography.caption, color: colors.textFaint },

    // Лента сеансов прокручивается вбок: у популярного фильма их полтора
    // десятка, и переносом по строкам карточка растянулась бы на весь экран.
    showtimes: { gap: spacing.sm, paddingHorizontal: spacing.lg },
    showtimeCard: {
      minWidth: 104,
      gap: 2,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primaryLight,
    },
    showtimeTime: { fontSize: 20, fontWeight: '700', color: colors.primaryDark },
    showtimeEnd: { ...typography.caption, color: colors.textMuted },
    showtimeCinema: { ...typography.caption, color: colors.text, fontWeight: '600' },
    showtimeHall: { ...typography.caption, color: colors.textFaint },
    showtimeFeature: { ...typography.caption, color: colors.accent, fontWeight: '600' },
    showtimePrice: { ...typography.caption, color: colors.primaryDark, fontWeight: '600' },
  });
