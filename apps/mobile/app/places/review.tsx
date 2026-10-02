import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { useDeleteReview, usePlaceReviews, useUpsertReview } from '../../src/api/queries';
import { Button } from '../../src/components/Button';
import { FormHeader } from '../../src/components/FormHeader';
import { Screen } from '../../src/components/Screen';
import { Stars } from '../../src/components/Stars';
import { TextField } from '../../src/components/TextField';
import { spacing, typography, useThemeColors } from '../../src/theme';

/** Подписи к оценкам: цифра без слова читается по-разному у разных людей. */
const RATING_HINTS: Record<number, string> = {
  1: 'Плохо',
  2: 'Так себе',
  3: 'Нормально',
  4: 'Хорошо',
  5: 'Отлично',
};

/**
 * Свой отзыв о заведении (Этап 6).
 *
 * Обязательна только оценка: большинство людей готовы поставить звёзды,
 * но не готовы писать. Требовать текст — значит не получить и оценок.
 */
export default function ReviewScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const id = String(placeId);

  const { data } = usePlaceReviews(id);
  const upsert = useUpsertReview(id);
  const remove = useDeleteReview(id);

  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Подставляем прошлый отзыв один раз: если тянуть за каждым ответом
  // сервера, правка будет затираться на середине фразы
  useEffect(() => {
    if (loaded || !data) return;

    if (data.myReview) {
      setRating(data.myReview.rating);
      setText(data.myReview.text ?? '');
    }
    setLoaded(true);
  }, [data, loaded]);

  const save = () => {
    if (rating === 0) {
      Alert.alert('Поставьте оценку', 'Без звёзд отзыв не сохранить.');
      return;
    }

    upsert.mutate(
      { rating, text: text.trim() || null },
      {
        onSuccess: () => router.back(),
        onError: (error) =>
          Alert.alert('Не удалось сохранить', error instanceof Error ? error.message : ''),
      },
    );
  };

  const confirmDelete = () => {
    Alert.alert('Убрать отзыв?', 'Оценка перестанет учитываться в рейтинге заведения.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Убрать',
        style: 'destructive',
        onPress: () => remove.mutate(undefined, { onSuccess: () => router.back() }),
      },
    ]);
  };

  return (
    <Screen scroll>
      <FormHeader
        title="Ваш отзыв"
        description="Видят все, кто смотрит заведение"
        onBack={() => router.back()}
      />

      <View style={styles.starsBox}>
        <Stars value={rating} size={34} onChange={setRating} />
        <Text style={styles.hint}>{rating > 0 ? RATING_HINTS[rating] : 'Нажмите на звезду'}</Text>
      </View>

      <TextField
        label="Что понравилось или не понравилось"
        value={text}
        onChangeText={setText}
        placeholder="Необязательно"
        multiline
        maxLength={1000}
      />

      <Button
        label={data?.myReview ? 'Сохранить' : 'Отправить отзыв'}
        onPress={save}
        loading={upsert.isPending}
      />

      {data?.myReview && (
        <Button
          label="Убрать отзыв"
          variant="ghost"
          onPress={confirmDelete}
          loading={remove.isPending}
        />
      )}
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    starsBox: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
    hint: { ...typography.body, fontSize: 14, color: colors.textMuted },
  });
