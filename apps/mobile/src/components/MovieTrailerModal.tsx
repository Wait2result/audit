import { useMemo } from 'react';
import type { MovieDto } from '@dagestan/shared';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useMovieDetails } from '../api/queries';
import { spacing, typography, useThemeColors } from '../theme';
import { Icon } from './Icon';

interface MovieTrailerModalProps {
  visible: boolean;
  onClose: () => void;
  cityId: string | null;
  /** Данные из расписания — показываются сразу, пока грузится остальное */
  movie: MovieDto;
}

/**
 * Трейлер и описание фильма.
 *
 * Видео играется прямо здесь: Kinoplan отдаёт трейлер обычным mp4-файлом
 * (см. docs/ADR/0004-кино-kinoplan.md), поэтому уводить человека на YouTube
 * или чужой сайт не нужно — и реклама чужого сервиса ему тоже не нужна.
 */
export function MovieTrailerModal({ visible, onClose, cityId, movie }: MovieTrailerModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, isLoading, isError } = useMovieDetails(cityId, movie.id, visible);

  // Трейлер запускается сам: человек нажал на постер именно ради него,
  // заставлять нажимать ещё раз незачем.
  const player = useVideoPlayer(data?.trailerUrl ?? null, (instance) => {
    instance.loop = false;
    instance.play();
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>
            {movie.title}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Icon name="close" size={18} color={colors.textOnDark} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.videoBox}>
            {isLoading && <ActivityIndicator color={colors.textOnDark} />}

            {!isLoading && data?.trailerUrl && (
              <VideoView player={player} style={styles.video} contentFit="contain" nativeControls />
            )}

            {!isLoading && !data?.trailerUrl && (
              <Text style={styles.videoNote}>
                {isError ? 'Не удалось загрузить трейлер' : 'Трейлера к этому фильму нет'}
              </Text>
            )}
          </View>

          <Text style={styles.meta}>
            {[
              movie.ageRating,
              data?.year ? String(data.year) : null,
              data?.countries.length ? data.countries.join(', ') : null,
              movie.genres.length ? movie.genres.join(', ') : null,
              movie.durationMinutes ? `${movie.durationMinutes} мин` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>

          {data?.description && <Text style={styles.description}>{data.description}</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.ink },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    title: { ...typography.heading, color: colors.textOnDark, flex: 1 },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    pressed: { opacity: 0.7 },

    content: { paddingBottom: spacing.xxl },
    videoBox: {
      aspectRatio: 16 / 9,
      width: '100%',
      maxWidth: '100%',
      backgroundColor: '#000000',
      alignItems: 'center',
      justifyContent: 'center',
      // Кадр трейлера приходит в своём разрешении (1280×720) и без обрезки
      // вылезает за рамку, наезжая на описание под ней
      overflow: 'hidden',
    },
    video: { width: '100%', height: '100%' },
    videoNote: { ...typography.body, color: 'rgba(242,247,246,0.7)', textAlign: 'center' },

    meta: {
      ...typography.caption,
      color: 'rgba(242,247,246,0.6)',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    description: {
      ...typography.body,
      color: colors.textOnDark,
      lineHeight: 22,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
  });
