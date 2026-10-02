import type { PromoBannerDto } from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePromoBanners } from '../../src/api/queries';
import { AdCarousel, type AdSlide } from '../../src/components/AdCarousel';
import { AppBackground } from '../../src/components/AppBackground';
import { GlassCard } from '../../src/components/GlassCard';
import { Icon, type IconName } from '../../src/components/Icon';
import { WeatherWidget } from '../../src/components/WeatherWidget';
import { useAuthStore } from '../../src/store/auth-store';
import { useCityStore } from '../../src/store/city-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';

/**
 * Главная страница (пункт 9 ТЗ).
 *
 * Точка входа во всё приложение: текущий город, рубрики, рекламный блок.
 *
 * Рубрики намеренно показаны все сразу, включая ещё не сделанные. Так видно
 * будущую форму приложения целиком, а не наполовину собранное меню — и
 * появление каждого раздела не требует переделки главной.
 */

interface Rubric {
  key: string;
  title: string;
  subtitle: string;
  icon: IconName;
  /** Раздел ещё не реализован — открывается заглушка с пояснением */
  ready: boolean;
}

const RUBRICS: Rubric[] = [
  {
    key: 'cinema',
    title: 'Сейчас в кино',
    subtitle: 'Сеансы и билеты',
    icon: 'cinema',
    ready: true,
  },
  { key: 'order', title: 'Заказать', subtitle: 'Доставка и заведения', icon: 'food', ready: true },
  { key: 'news', title: 'Новости', subtitle: 'Что происходит', icon: 'news', ready: true },
  {
    key: 'listings',
    title: 'Объявления',
    subtitle: 'Купить и продать',
    icon: 'tag',
    ready: true,
  },
  {
    key: 'rides',
    title: 'Попутчики',
    subtitle: 'Поездки между городами',
    icon: 'rides',
    ready: false,
  },
  {
    key: 'realty',
    title: 'Недвижимость',
    subtitle: 'Аренда и продажа',
    icon: 'realty',
    ready: true,
  },
];

/**
 * Рекламные карточки.
 *
 * Картинку и заведение, куда ведёт нажатие, задаёт владелец в панели
 * («Заведения → Реклама», место показа «Главная»). Пока фотографии нет,
 * вместо неё однотонная подложка одного из фирменных цветов, по кругу.
 */
const FALLBACK_TINTS = (colors: ReturnType<typeof useThemeColors>) => [
  colors.ink,
  colors.primaryDark,
  colors.accent,
];

function toSlides(
  banners: PromoBannerDto[] | undefined,
  colors: ReturnType<typeof useThemeColors>,
): AdSlide[] {
  const tints = FALLBACK_TINTS(colors);

  return (banners ?? []).map((banner, index) => ({
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle ?? '',
    imageUrl: banner.image?.url ?? banner.image?.thumbnailUrl ?? null,
    tint: tints[index % tints.length]!,
    targetPlaceId: banner.targetPlaceId,
    isOwn: true,
  }));
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const promoBanners = usePromoBanners('home');
  const homeSlides = useMemo(
    () => toSlides(promoBanners.data, colors),
    [promoBanners.data, colors],
  );

  const cityName = useCityStore((s) => s.cityName);
  const user = useAuthStore((s) => s.user);

  return (
    <View style={styles.root}>
      <AppBackground />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
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

        {homeSlides.length > 0 && (
          <View style={styles.section}>
            <AdCarousel
              slides={homeSlides}
              onPressSlide={(slide) => {
                if (slide.targetPlaceId) {
                  router.push({ pathname: '/places/[id]', params: { id: slide.targetPlaceId } });
                }
              }}
            />
          </View>
        )}

        <View style={styles.section}>
          <WeatherWidget />
        </View>

        <View style={[styles.section, styles.padded]}>
          <View style={styles.grid}>
            {RUBRICS.map((rubric) => (
              <Pressable
                key={rubric.key}
                onPress={() => {
                  if (rubric.key === 'cinema') router.push('/cinema');
                  else if (rubric.key === 'news') router.push('/news');
                  else if (rubric.key === 'order') router.push('/places');
                  else if (rubric.key === 'listings') router.push('/listings');
                  // «Недвижимость» — это раздел доски объявлений, а не
                  // отдельная рубрика: открываем доску с выбранным разделом
                  else if (rubric.key === 'realty')
                    router.push({ pathname: '/listings/category', params: { slug: 'realty' } });
                  else router.push(`/coming-soon?title=${encodeURIComponent(rubric.title)}`);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${rubric.title}. ${rubric.subtitle}`}
                style={({ pressed }) => [styles.tileWrapper, pressed && styles.pressed]}
              >
                <GlassCard style={styles.tile} shadow>
                  <View style={styles.tileIcon}>
                    <Icon name={rubric.icon} size={26} color={colors.primary} />
                  </View>

                  <View style={styles.tileTexts}>
                    <Text style={styles.tileTitle}>{rubric.title}</Text>
                    <Text style={styles.tileSubtitle} numberOfLines={2}>
                      {rubric.subtitle}
                    </Text>
                  </View>
                </GlassCard>
              </Pressable>
            ))}
          </View>
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
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xxxl },
    padded: { paddingHorizontal: spacing.lg },

    header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
    cityButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      alignSelf: 'flex-start',
      minHeight: 44,
    },
    cityName: { ...typography.title, color: colors.text },
    cityChevron: { fontSize: 18, color: colors.textMuted, marginTop: -6 },

    section: { gap: spacing.md, marginBottom: spacing.xl },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    // Две колонки: половина ширины минус половина промежутка
    tileWrapper: { width: '48%', flexGrow: 1 },
    // Тень рисует сам GlassCard (shadow) — на внешнем слое, чтобы её не
    // обрезало скругление размытия.
    tile: {
      gap: spacing.md,
      padding: spacing.lg,
    },
    tileIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileTexts: { gap: 2 },
    tileTitle: { ...typography.subheading, color: colors.text },
    tileSubtitle: { ...typography.caption, color: colors.textFaint, lineHeight: 17 },

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
