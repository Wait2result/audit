import type { MovieDto, MovieShowtimesDto, ShowtimeDto } from '@dagestan/shared';
import { useMemo, useState } from 'react';
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
import { FormHeader } from '../src/components/FormHeader';
import { GlassCard } from '../src/components/GlassCard';
import { Icon } from '../src/components/Icon';
import { MovieTrailerModal } from '../src/components/MovieTrailerModal';
import { Screen } from '../src/components/Screen';
import { useCityStore } from '../src/store/city-store';
import { radius, spacing, typography, useThemeColors } from '../src/theme';

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
 * Дата в часовом поясе города, а не телефона: расписание показывается по
 * времени кинотеатра. Иначе у человека в другом часовом поясе «Сегодня»
 * съезжает на соседний день — а ночью это происходит даже дома.
 */
function toIsoDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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
  const cityName = useCityStore((s) => s.cityName);
  const cityId = useCityStore((s) => s.cityId);

  // Пояс города нужен, чтобы «Сегодня» означало сегодня в этом городе.
  // До загрузки списка городов берём общий для всех наших городов пояс —
  // он же стоит значением по умолчанию в базе.
  const { data: cities } = useCities();
  const timezone = cities?.find((city) => city.id === cityId)?.timezone ?? 'Europe/Moscow';

  const dateTabs = useDateTabs(timezone);
  // Храним именно выбранный день, а не дату строкой: даты пересчитываются,
  // когда становится известен часовой пояс города, и строка бы устарела.
  const [dayIndex, setDayIndex] = useState<0 | 1>(0);
  const date = dateTabs[dayIndex].value;

  const [trailerMovie, setTrailerMovie] = useState<MovieDto | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useCinemaSchedule(cityId, date);

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
            На эту дату в вашем городе сеансов не найдено — попробуйте другой день.
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
