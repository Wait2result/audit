import { useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCities } from '../../src/api/queries';
import { Button } from '../../src/components/Button';
import { Logo } from '../../src/components/Logo';
import { Screen } from '../../src/components/Screen';
import { useCityStore } from '../../src/store/city-store';
import {
  MIN_TOUCH_SIZE,
  radius,
  shadow,
  spacing,
  typography,
  useThemeColors,
} from '../../src/theme';

/**
 * Выбор города при первом запуске (пункт 7 ТЗ).
 *
 * Города берутся с сервера, а не зашиты в приложение. Благодаря этому
 * добавление Избербаша или Хасавюрта — запись в базе, а не выпуск новой
 * версии приложения с ожиданием проверки в магазинах.
 *
 * Геолокация здесь НЕ запрашивается сознательно (пункт 8 ТЗ): выбрать город
 * в списке из трёх пунктов быстрее, чем разбираться с системным окном
 * о доступе к местоположению на первом же экране незнакомого приложения.
 */
export default function CitySelectScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const selectCity = useCityStore((s) => s.select);
  const { data: cities, isLoading, isError, refetch, isFetching } = useCities();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleContinue = async () => {
    const city = cities?.find((c) => c.id === selectedId);
    if (!city) return;

    setIsSaving(true);
    await selectCity(city);
    router.replace('/onboarding/welcome');
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Logo size={112} />
        <Text style={styles.title}>Ваш город</Text>
        <Text style={styles.subtitle}>
          Погода, афиша, заведения и объявления будут показываться для него. Город можно сменить в
          любой момент.
        </Text>
      </View>

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {isError && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Не удалось загрузить список городов</Text>
          <Text style={styles.errorText}>
            Проверьте подключение к интернету и попробуйте снова.
          </Text>
          <Button
            label="Повторить"
            variant="secondary"
            loading={isFetching}
            onPress={() => void refetch()}
            fullWidth={false}
            style={styles.retryButton}
          />
        </View>
      )}

      {cities && (
        <View style={styles.list}>
          {cities.map((city) => {
            const isSelected = city.id === selectedId;

            return (
              <Pressable
                key={city.id}
                onPress={() => setSelectedId(city.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={city.name}
                style={({ pressed }) => [
                  styles.cityRow,
                  isSelected && styles.cityRowSelected,
                  pressed && styles.cityRowPressed,
                ]}
              >
                <Text style={[styles.cityName, isSelected && styles.cityNameSelected]}>
                  {city.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.footer}>
        <Button
          label="Продолжить"
          onPress={() => void handleContinue()}
          disabled={!selectedId}
          loading={isSaving}
        />
      </View>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    header: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl },
    title: { ...typography.title, color: colors.text, marginTop: spacing.sm },
    subtitle: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
      paddingHorizontal: spacing.md,
    },

    center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
    errorTitle: { ...typography.subheading, color: colors.text },
    errorText: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
    retryButton: { marginTop: spacing.md, paddingHorizontal: spacing.xl },

    list: { gap: spacing.sm, marginTop: spacing.xxl },
    cityRow: {
      minHeight: 64,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1.5,
      borderColor: colors.border,
      ...shadow.card,
    },
    cityRowSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOpacity: 0.28,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    cityRowPressed: { opacity: 0.85 },
    cityName: { ...typography.subheading, color: colors.text, textAlign: 'center' },
    cityNameSelected: { color: colors.textOnPrimary },

    footer: { marginTop: 'auto', paddingTop: spacing.xl, minHeight: MIN_TOUCH_SIZE },
  });
