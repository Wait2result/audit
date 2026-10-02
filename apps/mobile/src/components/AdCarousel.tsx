import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { radius, shadow, spacing, typography, useThemeColors } from '../theme';
import { RemoteImage } from './RemoteImage';

export interface AdSlide {
  id: string;
  title: string;
  subtitle: string;
  /** Фоновый цвет — пока нет своей картинки или пока она грузится */
  tint: string;
  /** Своя фотография карточки — задаётся в панели. Есть картинка — есть и лёгкое затемнение под текст */
  imageUrl?: string | null;
  /** Заведение, куда ведёт нажатие. Нет заведения — карточка просто информационная */
  targetPlaceId?: string | null;
  /**
   * Идентификатор маркировки рекламы (erid). С 2022 года обязателен
   * для всей интернет-рекламы в России — см. пункт 29 ТЗ.
   */
  erid?: string;
  /**
   * Своя подборка приложения, а не чужая реклама: метка «Реклама» ей не
   * нужна. По умолчанию карточка считается рекламой — ошибиться в сторону
   * лишней метки безопаснее, чем в сторону недостающей.
   */
  isOwn?: boolean;
}

/** Интервал автоматической смены карточек — пункт 29 ТЗ. */
const ROTATION_INTERVAL_MS = 5000;

/**
 * Рекламный блок на главной (пункт 29 ТЗ).
 *
 * Три требования, которые легко упустить и которые заметны сразу:
 *
 *   1. Автопрокрутка останавливается, как только человек трогает блок пальцем.
 *      Иначе карточка уезжает прямо из-под пальца в момент чтения — это
 *      раздражает сильнее, чем отсутствие автопрокрутки вообще.
 *
 *   2. Реклама помечена. По российскому закону вся интернет-реклама
 *      маркируется, и метка должна быть видна, а не спрятана.
 *
 *   3. Блок не растёт бесконечно: главная страница не должна превращаться
 *      в рекламную ленту.
 */
export function AdCarousel({
  slides,
  onPressSlide,
}: {
  slides: AdSlide[];
  onPressSlide?: (slide: AdSlide) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<AdSlide>>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setPaused] = useState(false);

  const cardWidth = width - spacing.lg * 2;
  const snapInterval = cardWidth + spacing.md;

  // Автоматическая смена карточек
  useEffect(() => {
    if (isPaused || slides.length < 2) return;

    const timer = setInterval(() => {
      setActiveIndex((current) => {
        const next = (current + 1) % slides.length;
        listRef.current?.scrollToOffset({ offset: next * snapInterval, animated: true });
        return next;
      });
    }, ROTATION_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isPaused, slides.length, snapInterval]);

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / snapInterval);
      setActiveIndex(Math.max(0, Math.min(index, slides.length - 1)));
    },
    [snapInterval, slides.length],
  );

  if (slides.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        decelerationRate="fast"
        contentContainerStyle={styles.list}
        // Палец на экране — автопрокрутка ждёт
        onTouchStart={() => setPaused(true)}
        onMomentumScrollEnd={(event) => {
          handleScrollEnd(event);
          setPaused(false);
        }}
        onScrollEndDrag={handleScrollEnd}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onPressSlide?.(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.isOwn ? '' : 'Реклама: '}${item.title}. ${item.subtitle}`}
            style={({ pressed }) => [
              styles.cardShadow,
              { width: cardWidth },
              pressed && styles.cardPressed,
            ]}
          >
            <View style={[styles.card, { backgroundColor: item.tint }]}>
              {item.imageUrl && (
                <>
                  <RemoteImage
                    uri={item.imageUrl}
                    style={StyleSheet.absoluteFill}
                    fallback={null}
                  />
                  {/* Своя фотография может быть светлой — без этого текст на ней не прочитать */}
                  <View style={styles.scrim} />
                </>
              )}

              {!item.isOwn && (
                <View style={styles.adBadge}>
                  <Text style={styles.adBadgeText}>Реклама</Text>
                </View>
              )}

              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
              </View>
            </View>
          </Pressable>
        )}
      />

      {slides.length > 1 && (
        <View
          style={styles.dots}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {slides.map((slide, index) => (
            <View key={slide.id} style={[styles.dot, index === activeIndex && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    wrapper: { gap: spacing.md },
    list: { paddingHorizontal: spacing.lg, gap: spacing.md },

    // Тень — на внешнем слое: скругление с overflow: 'hidden' у внутреннего
    // слоя (там, где фото) обрезало бы её вместе с углами картинки.
    // Ниже, чем было: во весь разворот карточка смотрелась плакатом, а не
    // частью ленты рядом со списком заведений
    cardShadow: {
      height: 132,
      borderRadius: radius.lg,
      ...shadow.card,
    },
    cardPressed: { opacity: 0.92 },
    card: {
      flex: 1,
      borderRadius: radius.lg,
      overflow: 'hidden',
      justifyContent: 'flex-end',
    },
    // Своя фотография может быть светлой — без затемнения текст на ней не прочитать.
    // Карточка без фото (пока владелец её не добавил) обходится без затемнения:
    // однотонная подложка и так достаточно контрастна
    scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(9,15,17,0.4)' },

    adBadge: {
      position: 'absolute',
      top: spacing.lg,
      left: spacing.lg,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    adBadgeText: { ...typography.label, color: colors.textOnDark, fontSize: 10 },

    cardBody: { padding: spacing.lg, gap: spacing.xs },
    cardTitle: { ...typography.heading, color: colors.textOnDark },
    cardSubtitle: { ...typography.caption, color: colors.textOnDark, opacity: 0.85 },

    dots: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.borderStrong,
    },
    dotActive: { backgroundColor: colors.primary, width: 18 },
  });
