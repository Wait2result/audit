import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../../src/components/Button';
import { Logo } from '../../src/components/Logo';
import { Screen } from '../../src/components/Screen';
import { useCityStore } from '../../src/store/city-store';
import { spacing, typography, useThemeColors } from '../../src/theme';

/**
 * Экран после выбора города: вход, регистрация или пропустить (пункт 7 ТЗ).
 *
 * «Пропустить» — не второстепенная ссылка внизу мелким шрифтом, а полноценный
 * вариант наравне с остальными. Так задумано: по пункту 6 ТЗ без аккаунта
 * доступны погода, кино, новости, каталоги заведений и поиск. Требовать
 * регистрацию до того, как человек вообще увидел приложение, — самый
 * надёжный способ потерять его на первом же экране.
 */
export default function WelcomeScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const cityName = useCityStore((s) => s.cityName);

  return (
    <Screen scroll>
      <View style={styles.hero}>
        <Logo size={132} />

        <View style={styles.headings}>
          <Text style={styles.title}>Добро пожаловать</Text>
          {cityName && <Text style={styles.city}>{cityName}</Text>}
        </View>

        <Text style={styles.description}>
          Погода, афиша кино, новости, рестораны с доставкой, попутчики и объявления — всё для
          вашего города.
        </Text>
      </View>

      <View style={styles.benefits}>
        <Benefit text="Смотреть и искать можно без аккаунта" />
        <Benefit text="Аккаунт нужен для заказов, поездок и объявлений" />
        <Benefit text="Регистрация занимает минуту — по номеру телефона" />
      </View>

      <View style={styles.actions}>
        <Button label="Создать аккаунт" onPress={() => router.push('/auth/phone')} />
        <Button
          label="У меня уже есть аккаунт"
          variant="secondary"
          onPress={() => router.push('/auth/login')}
        />
        <Button
          label="Пока просто посмотреть"
          variant="ghost"
          onPress={() => router.replace('/(tabs)')}
        />
      </View>
    </Screen>
  );
}

function Benefit({ text }: { text: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.benefitRow}>
      <View style={styles.bullet} />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    hero: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xxxl },
    headings: { alignItems: 'center', gap: spacing.xs },
    title: { ...typography.title, color: colors.text },
    city: { ...typography.subheading, color: colors.primary },
    description: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
      paddingHorizontal: spacing.sm,
    },

    benefits: { gap: spacing.md, marginTop: spacing.xxl },
    benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    bullet: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.primaryLight,
    },
    benefitText: { ...typography.caption, color: colors.textMuted, flex: 1 },

    actions: { gap: spacing.sm, marginTop: 'auto', paddingTop: spacing.xxl },
  });
