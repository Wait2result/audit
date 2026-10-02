import { useMemo } from 'react';
import type { PlaceReviewDto, PlaceReviewsDto } from '@dagestan/shared';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';
import { Icon } from './Icon';
import { Stars } from './Stars';

/**
 * Отзывы на вкладке заведения (Этап 6).
 *
 * Кнопка «Написать отзыв» появляется только у того, кто здесь уже заказывал:
 * `canReview` считает сервер. Показывать её всем и отказывать по нажатию —
 * обещать то, чего нет.
 */
export function ReviewList({
  data,
  isLoading,
  onWrite,
}: {
  placeId: string;
  data: PlaceReviewsDto | undefined;
  isLoading: boolean;
  onWrite: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (isLoading || !data) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }

  const total = data.rating.count;

  return (
    <View style={styles.root}>
      {total > 0 && (
        <View style={styles.summary}>
          <View style={styles.average}>
            <Text style={styles.averageValue}>{data.rating.average.toFixed(1)}</Text>
            <Stars value={Math.round(data.rating.average)} size={14} />
            <Text style={styles.averageCount}>{total}</Text>
          </View>

          <View style={styles.bars}>
            {data.breakdown.map((row) => (
              <View key={row.rating} style={styles.barRow}>
                <Text style={styles.barLabel}>{row.rating}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${total === 0 ? 0 : (row.count / total) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.barCount}>{row.count}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {data.canReview && (
        <Pressable
          onPress={onWrite}
          accessibilityRole="button"
          style={({ pressed }) => [styles.write, pressed && styles.pressed]}
        >
          <Icon name="star" size={16} color={colors.primary} />
          <Text style={styles.writeLabel}>
            {data.myReview ? 'Изменить свой отзыв' : 'Написать отзыв'}
          </Text>
        </Pressable>
      )}

      {!data.canReview && total === 0 && (
        <Text style={styles.empty}>
          Отзывов пока нет. Оставить его сможет тот, кто здесь уже заказывал, — так оценка остаётся
          честной.
        </Text>
      )}

      {data.myReview && <ReviewCard review={data.myReview} />}

      {data.items
        .filter((review) => !review.isMine)
        .map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
    </View>
  );
}

function ReviewCard({ review }: { review: PlaceReviewDto }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.card, review.isMine && styles.cardMine]}>
      <View style={styles.cardHead}>
        <Text style={styles.author}>{review.isMine ? 'Ваш отзыв' : review.authorName}</Text>
        <Text style={styles.date}>{formatDate(review.createdAt)}</Text>
      </View>

      <Stars value={review.rating} size={13} />

      {review.text && <Text style={styles.text}>{review.text}</Text>}

      {review.reply && (
        <View style={styles.reply}>
          <Text style={styles.replyTitle}>Ответ заведения</Text>
          <Text style={styles.replyText}>{review.reply}</Text>
        </View>
      )}
    </View>
  );
}

/** «14 сентября» — год не пишем, пока отзыв этого года. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root: { gap: spacing.md, paddingTop: spacing.sm },
    loader: { paddingVertical: spacing.xxl },

    summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
    average: { alignItems: 'center', gap: 2 },
    averageValue: { ...typography.title, fontSize: 32, color: colors.text },
    averageCount: { ...typography.caption, fontSize: 12, color: colors.textFaint },

    bars: { flex: 1, gap: 3 },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    barLabel: { ...typography.caption, fontSize: 11, color: colors.textFaint, width: 8 },
    barTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.tile,
      overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.star },
    barCount: { ...typography.caption, fontSize: 11, color: colors.textFaint, width: 20 },

    write: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    pressed: { opacity: 0.75 },
    writeLabel: { ...typography.subheading, fontSize: 14, color: colors.primary },

    empty: { ...typography.caption, color: colors.textMuted, lineHeight: 19 },

    card: {
      gap: spacing.xs,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardMine: { borderColor: colors.primary },
    cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    author: { ...typography.subheading, fontSize: 14, color: colors.text },
    date: { ...typography.caption, fontSize: 12, color: colors.textFaint },
    text: { ...typography.body, fontSize: 14, color: colors.text, lineHeight: 20, marginTop: 2 },

    reply: {
      gap: 2,
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.primarySoft,
    },
    replyTitle: { ...typography.label, fontSize: 11, color: colors.primaryDark },
    replyText: { ...typography.caption, color: colors.text, lineHeight: 18 },
  });
