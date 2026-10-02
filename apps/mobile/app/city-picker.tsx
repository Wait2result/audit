import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCities } from '../src/api/queries';
import { Button } from '../src/components/Button';
import { FormHeader } from '../src/components/FormHeader';
import { Icon } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { useCityStore } from '../src/store/city-store';
import { radius, spacing, typography, useThemeColors } from '../src/theme';

/**
 * Смена города из приложения (пункт 7 ТЗ).
 *
 * Тот же список, что при первом запуске, но выбор применяется сразу:
 * лишний шаг «подтвердить» здесь не нужен — человек уже знает, чего хочет.
 */
export default function CityPickerScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  const { cityId, select } = useCityStore();
  const { data: cities, isLoading, isError, refetch, isFetching } = useCities();

  const handleSelect = async (city: { id: string; name: string }) => {
    await select(city);
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <Screen scroll>
      <FormHeader
        title="Город"
        description="Погода, заведения и объявления показываются для выбранного города."
      />

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {isError && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Не удалось загрузить список</Text>
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

      <View style={styles.list}>
        {cities?.map((city) => {
          const isCurrent = city.id === cityId;

          return (
            <Pressable
              key={city.id}
              onPress={() => void handleSelect(city)}
              accessibilityRole="button"
              accessibilityState={{ selected: isCurrent }}
              accessibilityLabel={city.name}
              style={({ pressed }) => [
                styles.row,
                isCurrent && styles.rowActive,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                name="location"
                size={22}
                color={isCurrent ? colors.primary : colors.textFaint}
              />
              <Text style={[styles.name, isCurrent && styles.nameActive]}>{city.name}</Text>
              {isCurrent && <Text style={styles.check}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
    errorTitle: { ...typography.subheading, color: colors.text },
    retryButton: { marginTop: spacing.md, paddingHorizontal: spacing.xl },

    list: { gap: spacing.sm, marginTop: spacing.xl },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 60,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    rowActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    name: { ...typography.subheading, color: colors.text, flex: 1 },
    nameActive: { color: colors.primaryDark },
    check: { ...typography.subheading, color: colors.primary },
    pressed: { opacity: 0.85 },
  });
