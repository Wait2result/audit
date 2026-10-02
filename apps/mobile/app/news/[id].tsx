import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCities, useNewsItem } from '../../src/api/queries';
import { Button } from '../../src/components/Button';
import { Screen } from '../../src/components/Screen';
import { useCityStore } from '../../src/store/city-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';
import { formatNewsDate } from '../../src/utils/news-format';

/**
 * Новость целиком: сюда ведёт «Подробнее» с любой карточки — человек читает
 * новость в приложении, а не уходит на сайт издания.
 *
 * Внизу — неброская ссылка на оригинал: подпись источника обязательна, но
 * уводить по ней никого не нужно.
 */
export default function NewsArticleScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const cityId = useCityStore((s) => s.cityId);
  const { data: cities } = useCities();
  const timeZone = cities?.find((city) => city.id === cityId)?.timezone ?? 'Europe/Moscow';

  const { data, isLoading, isError, refetch, isFetching } = useNewsItem(String(id));
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <Screen scroll>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/news'))}
        accessibilityRole="button"
        accessibilityLabel="Назад"
        hitSlop={12}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Text style={styles.backIcon}>←</Text>
      </Pressable>

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {isError && (
        <View style={styles.center}>
          <Text style={styles.stateTitle}>Не удалось открыть новость</Text>
          <Text style={styles.stateText}>
            Возможно, её уже убрали из ленты. Вернитесь назад и обновите список.
          </Text>
          <Button
            label="Повторить"
            variant="secondary"
            loading={isFetching}
            onPress={() => void refetch()}
            fullWidth={false}
            style={styles.retry}
          />
        </View>
      )}

      {data && (
        <View style={styles.article}>
          {data.imageUrl && !imageFailed && (
            <Image
              source={{ uri: data.imageUrl }}
              style={styles.hero}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          )}

          <Text style={styles.meta}>
            {[formatNewsDate(data.publishedAt, timeZone), data.sourceCategory]
              .filter(Boolean)
              .join(' · ')}
          </Text>

          <Text style={styles.title}>{data.title}</Text>

          {/* Лид — это начало самой статьи; если он уже стоит в тексте, второй раз
              его не показываем */}
          {data.lead && !(data.paragraphs[0] ?? '').includes(data.lead.slice(0, 60)) && (
            <Text style={styles.lead}>{data.lead}</Text>
          )}

          <View style={styles.divider} />

          <View style={styles.paragraphs}>
            {data.paragraphs.map((paragraph, index) => (
              <Text key={index} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>

          {/* Страница источника иногда недоступна — тогда у нас только лид */}
          {data.paragraphs.length === 0 && (
            <Text style={styles.paragraph}>
              Полный текст этой новости доступен на сайте источника.
            </Text>
          )}

          <Pressable
            onPress={() => void Linking.openURL(data.url)}
            accessibilityRole="link"
            accessibilityLabel={`Открыть оригинал на сайте «${data.sourceName}»`}
            hitSlop={10}
            style={({ pressed }) => [styles.source, pressed && styles.pressed]}
          >
            <Text style={styles.sourceLink}>Источник: {data.sourceName} ↗</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    back: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      marginLeft: -spacing.md,
      marginTop: spacing.md,
    },
    backIcon: { fontSize: 26, color: colors.text, paddingLeft: spacing.md },
    pressed: { opacity: 0.6 },

    center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
    stateTitle: { ...typography.subheading, color: colors.text },
    stateText: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
    retry: { marginTop: spacing.md, paddingHorizontal: spacing.xl },

    article: { gap: spacing.md, paddingTop: spacing.sm },
    hero: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceMuted,
    },
    meta: { ...typography.caption, color: colors.textFaint },
    title: { ...typography.title, fontSize: 25, lineHeight: 31, color: colors.text },
    lead: { ...typography.subheading, fontWeight: '500', lineHeight: 24, color: colors.textMuted },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
    paragraphs: { gap: spacing.lg },
    paragraph: { fontSize: 16.5, lineHeight: 26, color: colors.text },

    // Ссылка на оригинал — служебная строка внизу, а не кнопка: читают у нас
    source: { alignSelf: 'flex-start', marginTop: spacing.lg, paddingVertical: spacing.xs },
    sourceLink: { ...typography.caption, color: colors.textFaint, textDecorationLine: 'underline' },
  });
