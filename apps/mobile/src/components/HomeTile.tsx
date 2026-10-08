import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { radius, shadow, spacing, typography, useThemeColors } from '../theme';
import { PhotoScrim } from './PhotoScrim';
import { RemoteImage } from './RemoteImage';

/**
 * Плитка рубрики на главной: фото во весь размер, белый заголовок и подпись
 * в левом верхнем углу на мягкой тени.
 *
 * Фото — своё из панели («Главная и реклама», плитки), афиша сеанса у кино
 * или фото по умолчанию из приложения. Своё не загрузилось — плитка не
 * остаётся пустой: под ним всегда лежит фото по умолчанию.
 *
 * Размер задаёт главная в пикселях: пропорции одинаковы на телефоне и на
 * планшете, фото обрезается по краям, а не сжимается.
 */
export function HomeTile({
  title,
  subtitle,
  width,
  height,
  imageUrl,
  fallback,
  titleSize = 18,
  onPress,
}: {
  title: string;
  subtitle: string;
  width: number;
  height: number;
  /** Фото из панели или афиша; нет — фото по умолчанию */
  imageUrl?: string | null;
  /** Фото по умолчанию из приложения; без него — тёмная подложка */
  fallback?: ImageSourcePropType;
  /**
   * Размер заголовка — один на все плитки главной, по ширине половинной: на
   * узком телефоне «Сейчас в кино» помещается целиком, на планшете крупнее
   */
  titleSize?: number;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const size = { width, height };
  // Абсолютное положение с явным размером: на вебе фото с absoluteFill
  // не всегда растягивается на всю плитку
  const photoStyle = [styles.photo, size];
  const local = fallback ? <Image source={fallback} style={photoStyle} resizeMode="cover" /> : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={({ pressed }) => [styles.shadow, size, pressed && styles.pressed]}
    >
      <View style={[styles.clip, size]}>
        {imageUrl ? (
          <RemoteImage uri={imageUrl} style={photoStyle} resizeMode="cover" fallback={local} />
        ) : (
          local
        )}
        <PhotoScrim width={width} height={height} />

        <View style={[styles.texts, titleSize < 18 && styles.textsCompact]}>
          <Text
            style={[
              styles.title,
              { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.25) },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.subtitle,
              titleSize < 18 && styles.subtitleCompact,
              titleSize >= 20 && styles.subtitleLarge,
            ]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    // Тень — на внешнем слое: скругление с overflow у внутреннего обрезало бы её
    shadow: { borderRadius: radius.lg, ...shadow.raised },
    // Пока фото грузится — тёмная подложка, а не белое пятно
    clip: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.ink },
    photo: { position: 'absolute', top: 0, left: 0 },
    texts: { paddingHorizontal: spacing.lg, paddingTop: spacing.md + 2, gap: 2 },
    textsCompact: { paddingHorizontal: spacing.md + 2, paddingTop: spacing.md },
    title: {
      ...typography.heading,
      color: colors.textOnDark,
      textShadowColor: 'rgba(0,0,0,0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    subtitle: {
      ...typography.body,
      fontSize: 14,
      lineHeight: 18,
      color: colors.textOnDark,
      opacity: 0.92,
      maxWidth: 260,
      textShadowColor: 'rgba(0,0,0,0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    subtitleCompact: { fontSize: 13, lineHeight: 17 },
    subtitleLarge: { fontSize: 15, lineHeight: 20 },
    pressed: { opacity: 0.9 },
  });
