import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../src/components/Button';
import { FormHeader } from '../src/components/FormHeader';
import { Logo } from '../src/components/Logo';
import { Screen } from '../src/components/Screen';
import { spacing, typography, useThemeColors } from '../src/theme';

/**
 * Заглушка для разделов, которые ещё не сделаны.
 *
 * Честно говорит, что раздела пока нет, вместо пустого экрана или,
 * что хуже, вида работающего раздела с выдуманными данными. Пункт 46 ТЗ
 * прямо запрещает подменять реальные интеграции придуманным содержимым.
 */
export default function ComingSoonScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { title } = useLocalSearchParams<{ title?: string }>();

  return (
    <Screen>
      <FormHeader title={title ?? 'Раздел в работе'} />

      <View style={styles.body}>
        <Logo size={140} variant="mono" />

        <View style={styles.texts}>
          <Text style={styles.title}>Скоро здесь появится содержимое</Text>
          <Text style={styles.description}>
            Раздел разрабатывается. Пока готовы основа приложения, аккаунты и выбор города —
            остальное добавляется по очереди, чтобы каждая часть выходила проверенной, а не
            наполовину рабочей.
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          label="Вернуться"
          variant="secondary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        />
      </View>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
    texts: { gap: spacing.sm, alignItems: 'center' },
    title: { ...typography.heading, color: colors.text, textAlign: 'center' },
    description: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
    },
    footer: { paddingTop: spacing.xl },
  });
