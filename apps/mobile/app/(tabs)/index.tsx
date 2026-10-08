import type { HomeTileKey, PromoBannerDto } from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import tileFood from '../../assets/images/home/food.jpg';
import tileListings from '../../assets/images/home/listings.jpg';
import tileNews from '../../assets/images/home/news.jpg';
import tileRides from '../../assets/images/home/rides.jpg';

import { useCinemaSchedule, useCities, useHomeTiles, usePromoBanners } from '../../src/api/queries';
import { AdCarousel } from '../../src/components/AdCarousel';
import { AppBackground } from '../../src/components/AppBackground';
import { HomeTile } from '../../src/components/HomeTile';
import { Icon } from '../../src/components/Icon';
import { WeatherWidget } from '../../src/components/WeatherWidget';
import { HOME_GAP, useHomeLayout } from '../../src/hooks/use-home-layout';
import { useAuthStore } from '../../src/store/auth-store';
import { useCityStore } from '../../src/store/city-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';
import { DEFAULT_CITY_TIMEZONE, toIsoDate } from '../../src/utils/city-date';
import { openPromoAction, promoSlides, rubricHref } from '../../src/utils/promo';

/**
 * Главная страница (пункт 9 ТЗ).
 *
 * Точка входа во всё приложение: город, погода, рекламная карусель и пять
 * рубрик плитками с фото — как в референсе главной: «Объявления» и
 * «Заказать», «Сейчас в кино» и «Новости», широкие «Попутчики».
 *
 * Фото плиток задаёт владелец в панели («Главная и реклама», плитки); пока
 * своего фото нет — фото по умолчанию из приложения, у кино — афиша фильма
 * из сегодняшних сеансов. «Недвижимость» плиткой не показывается: это раздел
 * «Объявлений».
 *
 * На планшете — та же колонка по центру (не шире 720): пропорции плиток и
 * фото те же, ничего не сжимается и не растягивается.
 */

interface Rubric {
  key: HomeTileKey;
  title: string;
  subtitle: string;
  /** Фото по умолчанию; у кино своего нет — там афиша сеанса */
  fallback?: ImageSourcePropType;
}

const RUBRICS: Record<HomeTileKey, Rubric> = {
  listings: {
    key: 'listings',
    title: 'Объявления',
    subtitle: 'Купить, продать, найти',
    fallback: tileListings,
  },
  order: {
    key: 'order',
    title: 'Заказать',
    subtitle: 'Еда и доставка',
    fallback: tileFood,
  },
  cinema: { key: 'cinema', title: 'Сейчас в кино', subtitle: 'Сеансы и билеты' },
  news: {
    key: 'news',
    title: 'Новости',
    subtitle: 'Что происходит',
    fallback: tileNews,
  },
  rides: {
    key: 'rides',
    title: 'Попутчики',
    subtitle: 'Поездки между городами',
    fallback: tileRides,
  },
};

/** Фото плитки из панели: крупный вариант — плитка на планшете шире 300 px. */
const tileImage = (banner: PromoBannerDto | null | undefined) =>
  banner?.image?.url ?? banner?.image?.thumbnailUrl ?? null;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const layout = useHomeLayout();

  const cityId = useCityStore((s) => s.cityId);
  const cityName = useCityStore((s) => s.cityName);
  const user = useAuthStore((s) => s.user);

  // Рекламная карусель: карточки панели («Главная и реклама» → «Главная») —
  // только включённые и в своём сроке показа, это отбирает сервер
  const promoBanners = usePromoBanners('home');
  const homeSlides = useMemo(
    () => promoSlides(promoBanners.data, colors),
    [promoBanners.data, colors],
  );
  const tiles = useHomeTiles();

  // Афиша для «Сейчас в кино» — первый фильм сегодняшних сеансов города.
  // «Сегодня» — по поясу города, как на экране кино: тот же запрос, тот же кеш
  const { data: cities } = useCities();
  const timezone = cities?.find((city) => city.id === cityId)?.timezone ?? DEFAULT_CITY_TIMEZONE;
  const today = useMemo(() => toIsoDate(new Date(), timezone), [timezone]);
  const schedule = useCinemaSchedule(cityId, today);
  const poster = schedule.data?.find((item) => item.movie.posterUrl)?.movie.posterUrl ?? null;

  // Фото «Заказать» может быть рекламой кафе, но плитка — вход во всю доставку
  const open = (key: HomeTileKey) => router.push(rubricHref(key));

  const tile = (key: HomeTileKey, width: number, height: number) => {
    const rubric = RUBRICS[key];
    const own = tileImage(tiles.data?.[key]);
    return (
      <HomeTile
        key={key}
        title={rubric.title}
        subtitle={rubric.subtitle}
        width={width}
        height={height}
        titleSize={layout.titleSize}
        imageUrl={own ?? (key === 'cinema' ? poster : null)}
        {...(rubric.fallback ? { fallback: rubric.fallback } : {})}
        onPress={() => open(key)}
      />
    );
  };

  return (
    <View style={styles.root}>
      <AppBackground />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Колонка: на телефоне — весь экран, на планшете — по центру */}
        <View style={{ width: layout.outer, alignSelf: 'center' }}>
          {/* Шапка: город можно сменить нажатием на его название (пункт 7 ТЗ) */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.push('/city-picker')}
              accessibilityRole="button"
              accessibilityLabel={`Текущий город: ${cityName ?? 'не выбран'}. Нажмите, чтобы сменить`}
              style={({ pressed }) => [styles.cityButton, pressed && styles.pressed]}
            >
              <Icon name="location" size={20} color={colors.primary} />
              <Text style={styles.cityName}>{cityName ?? 'Выбрать город'}</Text>
              <Text style={styles.cityChevron}>⌄</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <WeatherWidget width={layout.inner} />
          </View>

          {homeSlides.length > 0 && (
            <View style={styles.section}>
              <AdCarousel
                slides={homeSlides}
                width={layout.outer}
                height={layout.banner}
                textAlign="center"
                // Края соседних карточек видны — сразу понятно, что полосу листают
                peek={12}
                onPressSlide={(slide) => openPromoAction(router, slide)}
              />
            </View>
          )}

          <View style={[styles.section, styles.padded, styles.grid]}>
            <View style={styles.row}>
              {tile('listings', layout.half, layout.rowOne)}
              {tile('order', layout.half, layout.rowOne)}
            </View>
            <View style={styles.row}>
              {tile('cinema', layout.half, layout.rowTwo)}
              {tile('news', layout.half, layout.rowTwo)}
            </View>
            {tile('rides', layout.inner, layout.wide)}
          </View>

          {!user && (
            <View style={[styles.section, styles.padded]}>
              <Pressable
                onPress={() => router.push('/auth/phone')}
                accessibilityRole="button"
                style={({ pressed }) => [styles.signInCard, pressed && styles.pressed]}
              >
                <View style={styles.signInTexts}>
                  <Text style={styles.signInTitle}>Создайте аккаунт</Text>
                  <Text style={styles.signInSubtitle}>
                    Чтобы заказывать, публиковать объявления и сохранять избранное
                  </Text>
                </View>
                <Icon name="chevron-right" size={22} color={colors.primary} />
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xxxl },
    padded: { paddingHorizontal: spacing.lg },

    header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    cityButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      alignSelf: 'flex-start',
      minHeight: 44,
    },
    cityName: { ...typography.title, color: colors.text },
    cityChevron: { fontSize: 18, color: colors.textMuted, marginTop: -6 },

    section: { marginBottom: spacing.lg },

    grid: { gap: HOME_GAP },
    row: { flexDirection: 'row', gap: HOME_GAP },

    signInCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primaryLight,
    },
    signInTexts: { flex: 1, gap: 2 },
    signInTitle: { ...typography.subheading, color: colors.primaryDark },
    signInSubtitle: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },

    pressed: { opacity: 0.85 },
  });
