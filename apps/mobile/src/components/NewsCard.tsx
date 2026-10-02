import type { NewsScope, NewsSummaryDto } from '@dagestan/shared';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { radius, spacing, typography, useThemeColors } from '../theme';
import { formatNewsDate } from '../utils/news-format';
import { GlassCard } from './GlassCard';
import { Icon } from './Icon';

/** Цвета заглушки: у каждой ленты свой, чтобы карточки без картинки не были одинаково серыми. */
const PLACEHOLDER: Record<NewsScope, [string, string]> = {
  city: ['#d09a52', '#a8692b'],
  dagestan: ['#1f8f86', '#0b5a54'],
  russia: ['#56789a', '#26405a'],
  world: ['#6b78b0', '#2c3260'],
};

interface NewsCardProps {
  item: NewsSummaryDto;
  timeZone: string;
  onOpen: () => void;
}

/**
 * Карточка новости: картинка, дата, заключающая мысль и «Подробнее».
 *
 * Название источника на карточке не пишем: в ленте важна сама новость, а
 * издание видно на экране статьи, куда ведёт «Подробнее».
 */
export function NewsCard({ item, timeZone, onOpen }: NewsCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.imageUrl) && !imageFailed;
  const [from, to] = PLACEHOLDER[item.scope];

  const meta = [formatNewsDate(item.publishedAt, timeZone), item.sourceCategory]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. Подробнее`}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <GlassCard style={styles.card} shadow>
        <View style={[styles.imageBox, !showImage && styles.imageBoxCompact]}>
          {showImage ? (
            <Image
              source={{ uri: item.imageUrl ?? undefined }}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={styles.image}>
              <Svg width="100%" height="100%" preserveAspectRatio="none">
                <Defs>
                  <LinearGradient id={`ph-${item.scope}`} x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={from} />
                    <Stop offset="1" stopColor={to} />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill={`url(#ph-${item.scope})`} />
              </Svg>
              <View style={styles.placeholderIcon}>
                <Icon name="news" size={34} color="rgba(255,255,255,0.5)" />
              </View>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>

          <Text style={styles.title} numberOfLines={3}>
            {item.title}
          </Text>

          {item.lead && (
            <Text style={styles.lead} numberOfLines={3}>
              {item.lead}
            </Text>
          )}

          <View style={styles.moreButton}>
            <Text style={styles.moreLabel}>Подробнее</Text>
            <Icon name="chevron-right" size={16} color={colors.primaryDark} />
          </View>
        </View>
      </GlassCard>
    </Pressable>
  );
}

/** Заготовка карточки на время загрузки: без прыжков вёрстки, когда приходят данные. */
export function NewsCardSkeleton() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <GlassCard style={styles.card}>
      <Animated.View style={{ opacity: pulse }}>
        <View style={[styles.imageBox, styles.skeletonImage]} />
        <View style={styles.body}>
          <View style={[styles.skeletonLine, { width: '38%' }]} />
          <View style={[styles.skeletonLine, { width: '92%', height: 18 }]} />
          <View style={[styles.skeletonLine, { width: '76%', height: 18 }]} />
          <View style={[styles.skeletonLine, { width: '100%' }]} />
          <View style={[styles.skeletonLine, { width: '64%' }]} />
        </View>
      </Animated.View>
    </GlassCard>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    pressed: { opacity: 0.9 },
    card: { overflow: 'visible' },

    imageBox: {
      aspectRatio: 16 / 9,
      width: '100%',
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    // Без фото — узкий баннер: ряд одинаковых заглушек не должен занимать пол-экрана
    imageBoxCompact: { aspectRatio: 16 / 5 },
    image: { width: '100%', height: '100%' },
    placeholderIcon: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },

    body: { padding: spacing.lg, gap: spacing.sm },
    meta: { ...typography.caption, color: colors.textFaint },
    title: { ...typography.heading, fontSize: 18, lineHeight: 24, color: colors.text },
    lead: { ...typography.body, lineHeight: 22, color: colors.textMuted },

    moreButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginTop: spacing.xs,
      paddingLeft: spacing.lg,
      paddingRight: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
    },
    moreLabel: { ...typography.subheading, fontSize: 14, color: colors.primaryDark },

    skeletonImage: { borderRadius: 0 },
    skeletonLine: { height: 12, borderRadius: 6, backgroundColor: 'rgba(120,130,135,0.22)' },
  });
