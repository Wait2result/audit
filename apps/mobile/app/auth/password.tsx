import type { AuthResponse } from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError, apiFetch } from '../../src/api/client';
import { Button } from '../../src/components/Button';
import { FormHeader } from '../../src/components/FormHeader';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { useAuthFlowStore } from '../../src/store/auth-flow-store';
import { useAuthStore } from '../../src/store/auth-store';
import { useCityStore } from '../../src/store/city-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';

/**
 * Шаг 3: пароль.
 *
 * При регистрации здесь же спрашивается имя — это единственное, что нужно
 * от человека помимо номера. Всё остальное он заполнит потом и по желанию.
 *
 * При восстановлении пароля имя не нужно: аккаунт уже существует.
 */
export default function PasswordScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  const { purpose, verificationToken, reset } = useAuthFlowStore();
  const applyAuth = useAuthStore((s) => s.applyAuth);
  const cityId = useCityStore((s) => s.cityId);

  const [firstName, setFirstName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; password?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isReset = purpose === 'password_reset';

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};

    if (!isReset && firstName.trim().length < 1) {
      errors.firstName = 'Как к вам обращаться?';
    }
    // Требования намеренно мягкие: слишком строгие правила заставляют людей
    // записывать пароли на бумажке, что хуже короткого пароля
    if (password.length < 8) {
      errors.password = 'Не менее 8 символов';
    } else if (!/[a-zA-Zа-яА-Я]/.test(password) || !/\d/.test(password)) {
      errors.password = 'Нужны хотя бы одна буква и одна цифра';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (isSubmitting || !verificationToken) return;
    if (!validate()) return;

    setError(undefined);
    setIsSubmitting(true);

    try {
      if (isReset) {
        await apiFetch('/auth/password/reset', {
          method: 'POST',
          body: { verificationToken, newPassword: password },
          anonymous: true,
        });

        reset();
        // После смены пароля все сессии завершены — нужно войти заново
        router.replace('/auth/login');
        return;
      }

      const response = await apiFetch<AuthResponse>('/auth/register', {
        method: 'POST',
        body: {
          verificationToken,
          password,
          firstName: firstName.trim(),
          ...(cityId ? { cityId } : {}),
          acceptedTerms: true,
        },
        anonymous: true,
      });

      await applyAuth(response);
      reset();
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось завершить регистрацию.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Прямой заход на экран без пройденных шагов — отправляем в начало
  if (!verificationToken) {
    return (
      <Screen>
        <FormHeader title="Начните заново" description="Подтверждение номера не найдено." />
        <View style={styles.footer}>
          <Button label="К вводу номера" onPress={() => router.replace('/auth/phone')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <FormHeader
        title={isReset ? 'Новый пароль' : 'Почти готово'}
        description={
          isReset
            ? 'Придумайте новый пароль. Все открытые сессии будут завершены.'
            : 'Осталось придумать пароль и указать, как к вам обращаться.'
        }
      />

      <View style={styles.form}>
        {!isReset && (
          <TextField
            label="Имя"
            value={firstName}
            onChangeText={(text) => {
              setFirstName(text);
              setFieldErrors((e) => ({ ...e, firstName: undefined }));
            }}
            placeholder="Ислам"
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            error={fieldErrors.firstName}
            autoFocus
            returnKeyType="next"
          />
        )}

        <TextField
          label="Пароль"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setFieldErrors((e) => ({ ...e, password: undefined }));
          }}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          error={fieldErrors.password}
          hint="Не менее 8 символов, хотя бы одна буква и одна цифра"
          autoFocus={isReset}
          returnKeyType="done"
          onSubmitEditing={() => void handleSubmit()}
        />

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {error}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Button
          label={isReset ? 'Сохранить пароль' : 'Создать аккаунт'}
          onPress={() => void handleSubmit()}
          loading={isSubmitting}
        />
      </View>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    form: { gap: spacing.lg, marginTop: spacing.xxl },
    errorBox: {
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    errorText: { ...typography.caption, color: colors.danger },
    footer: { marginTop: 'auto', paddingTop: spacing.xl },
  });
