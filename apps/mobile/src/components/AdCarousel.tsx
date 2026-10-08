import type { PromoActionType } from '@dagestan/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { PhotoScrim } from './PhotoScrim';
import { RemoteImage } from './RemoteImage';

export interface AdSlide {
  id: string;
  title: string;
  subtitle: string;
  /** Фоновый цвет — пока нет своей картинки или пока она грузится */
  tint: string;
  /** Своя фотография карточки — задаётся в панели. Есть картинка — есть и тень под текст */
  imageUrl?: string | null;
  /**
   * Что делает нажатие: заведение, рубрика, экран приложения, ссылка — задаёт
   * панель. Выполняет экран (`openPromoAction`), карусель только сообщает о нажатии
   */
  actionType?: PromoActionType;
  actionValue?: string | null;
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

/** Высота карточки витрины доставки (у главной своя — по пропорции полосы). */
const CARD_HEIGHT = 132;

/** Интервал автоматической смены карточек — пункт 29 ТЗ. */
const ROTATION_INTERVAL_MS = 5000;

/** Промежуток между карточками, когда соседние видны по краям. */
const PEEK_GAP = spacing.sm + 2;

/**
 * Рекламный блок на главной (пункт 29 ТЗ) и на витрине доставки.
 *
 * Три требования, которые легко упустить и которые заметны сразу:
 *
 *   1. Автопрокрутка не спорит с пальцем. Палец на карточке — она стоит;
 *      после свайпа отсчёт пяти секунд начинается заново с той карточки, где
 *      человек остановился, а не перескакивает туда, куда шёл таймер.
 *
 *   2. Реклама помечена. По российскому закону вся интернет-реклама
 *      маркируется, и метка должна быть видна, а не спрятана.
 *
 *   3. Блок не растёт бесконечно: главная страница не должна превращаться
 *      в рекламную ленту.
 *
 * `peek` — сколько видно соседних карточек по краям: так сразу понятно, что
 * полосу можно листать. Одна карточка — без автопрокрутки и без точек.
 */
export function AdCarousel({
  slides,
  onPressSlide,
  width: givenWidth,
  height = CARD_HEIGHT,
  textAlign = 'bottom',
  peek = 0,
}: {
  slides: AdSlide[];
  onPressSlide?: (slide: AdSlide) => void;
  /** Ширина полосы вместе с полями; без неё — ширина экрана (на планшете главная передаёт колонку) */
  width?: number;
  /** Высота карточки: у главной — по пропорции полосы, у витрины — прежние 132 */
  height?: number;
  /** Где текст: у низкой полосы главной — по центру высоты, у витрины — внизу */
  textAlign?: 'center' | 'bottom';
  /** Сколько пикселей соседних карточек видно по краям */
  peek?: number;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();
  const listRef = useRef<FlatList<AdSlide>>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setPaused] = useState(false);

  const several = slides.length > 1;
  // Соседей показываем, только когда их есть что показать
  const gap = several && peek > 0 ? PEEK_GAP : spacing.md;
  const inset = spacing.lg + (several ? peek : 0);
  const cardWidth = (givenWidth ?? windowWidth) - inset * 2;
  const snapInterval = cardWidth + gap;

  // Список стал короче (карточку выключили в панели) — не стоять за его концом
  useEffect(() => {
    if (activeIndex >= slides.length) setActiveIndex(0);
  }, [activeIndex, slides.length]);

  // Автоматическая смена: отсчёт заново после каждой смены карточки, в том
  // числе ручной. Таймер снимается при уходе с экрана и при паузе
  useEffect(() => {
    if (isPaused || !several) return;
    const timer = setTimeout(() => {
      const next = (activeIndex + 1) % slides.length;
      listRef.current?.scrollToOffset({ offset: next * snapInterval, animated: true });
      setActiveIndex(next);
    }, ROTATION_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [activeIndex, isPaused, several, slides.length, snapInterval]);

  const indexAt = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      Math.max(
        0,
        Math.min(Math.round(event.nativeEvent.contentOffset.x / snapInterval), slides.length - 1),
      ),
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
        scrollEnabled={several}
        snapToInterval={snapInterval}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: inset, gap }}
        // Точки идут за пальцем, а не ждут конца прокрутки
        scrollEventThrottle={32}
        onScroll={(event) => {
          const index = indexAt(event);
          if (index !== activeIndex) setActiveIndex(index);
        }}
        // Палец на экране — автопрокрутка ждёт; отпустил — отсчёт с начала
        onTouchStart={() => setPaused(true)}
        onScrollEndDrag={(event) => {
          setActiveIndex(indexAt(event));
          setPaused(false);
        }}
        onMomentumScrollEnd={(event) => {
          setActiveIndex(indexAt(event));
          setPaused(false);
        }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onPressSlide?.(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.isOwn ? '' : 'Реклама: '}${item.title}. ${item.subtitle}`}
            style={({ pressed }) => [
              styles.cardShadow,
              { width: cardWidth, height },
              pressed && styles.cardPressed,
            ]}
          >
            <View
              style={[
                styles.card,
                { backgroundColor: item.tint },
                textAlign === 'center' && styles.cardCentered,
              ]}
            >
              {item.imageUrl && (
                <>
                  {/* Явный размер: на вебе фото с absoluteFill не всегда растягивается.
                      Пока фото грузится — видна подложка цвета карточки, высота не скачет */}
                  <RemoteImage
                    uri={item.imageUrl}
                    style={[styles.photo, { width: cardWidth, height }]}
                    fallback={null}
                  />
                  {/* Своя фотография может быть светлой — тень слева, под текстом */}
                  <PhotoScrim width={cardWidth} height={height} from="left" />
                </>
              )}

              {!item.isOwn && (
                <View style={styles.adBadge}>
                  <Text style={styles.adBadgeText}>Реклама</Text>
                </View>
              )}

              <View style={[styles.cardBody, textAlign === 'center' && styles.cardBodyNarrow]}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text style={styles.cardSubtitle} numberOfLines={2}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
      />

      {several && (
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
    wrapper: { gap: spacing.sm + 2 },

    // Тень — на внешнем слое: скругление с overflow: 'hidden' у внутреннего
    // слоя (там, где фото) обрезало бы её вместе с углами картинки
    cardShadow: {
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
    cardCentered: { justifyContent: 'center' },
    photo: { position: 'absolute', top: 0, left: 0 },

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
    // Полоса главной: текст на левой, затемнённой части фото, правая — для картинки
    cardBodyNarrow: { maxWidth: '64%', paddingVertical: spacing.md },
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
