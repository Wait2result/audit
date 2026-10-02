import type { AuthResponse, LoginResponse } from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError, apiFetch } from '../../src/api/client';
import { Button } from '../../src/components/Button';
import { FormHeader } from '../../src/components/FormHeader';
import { PhoneInput, toE164, type Country } from '../../src/components/PhoneInput';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { useAuthFlowStore } from '../../src/store/auth-flow-store';
import { useAuthStore } from '../../src/store/auth-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';

/**
 * Вход по номеру телефона и паролю.
 *
 * Вход состоит из двух шагов: если у пользователя включена двухфакторная
 * авторизация, сервер вместо сессии возвращает временный пропуск, и экран
 * переключается на ввод кода из приложения-аутентификатора. Телефон и пароль
 * при этом повторно не запрашиваются.
 */
export default function LoginScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  // back=1 — вход открыт посреди дела (сердечко, избранное): после входа
  // возвращаем туда, а не на главную
  const params = useLocalSearchParams<{ back?: string }>();
  const finish = () =>
    params.back === '1' && router.canGoBack() ? router.back() : router.replace('/(tabs)');
  const applyAuth = useAuthStore((s) => s.applyAuth);

  // Телефон и пароль — независимые значения. Телефон хранится вне экрана
  // (хранилище формы входа): его не сбрасывает ни ввод или вставка пароля,
  // ни ошибка входа, ни уход на «Забыли пароль?» и возврат
  const login = useAuthFlowStore((s) => s.login);
  const setLogin = useAuthFlowStore((s) => s.setLogin);
  const country: Country = login.country;
  const digits = login.digits;
  const setDigits = (next: string) => setLogin({ country, digits: next });
  const setCountry = (next: Country) => setLogin({ country: next, digits: '' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const [challenge, setChallenge] = useState<{ token: string; maskedPhone: string } | null>(null);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPhoneComplete = digits.length === country.digits;

  const handleLogin = async () => {
    if (isSubmitting || !isPhoneComplete || password.length === 0) return;

    setError(undefined);
    setIsSubmitting(true);

    try {
      const response = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { phone: toE164(country, digits), password },
        anonymous: true,
      });

      if (response.status === '2fa_required') {
        setChallenge({ token: response.twoFactorToken, maskedPhone: response.maskedPhone });
        return;
      }

      await applyAuth(response);
      finish();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTwoFactor = async () => {
    if (isSubmitting || !challenge || code.length !== 6) return;

    setError(undefined);
    setIsSubmitting(true);

    try {
      const response = await apiFetch<AuthResponse>('/auth/login/2fa', {
        method: 'POST',
        body: { twoFactorToken: challenge.token, code },
        anonymous: true,
      });

      await applyAuth(response);
      finish();
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      setError(apiError?.message ?? 'Не удалось подтвердить код.');

      // Пропуск истёк или израсходован — возвращаем к вводу пароля,
      // иначе человек будет вводить коды в форму, которая уже не работает
      if (apiError?.code === 'AUTH_TOKEN_EXPIRED') {
        setChallenge(null);
        setCode('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (challenge) {
    return (
      <Screen scroll>
        <FormHeader
          title="Подтверждение входа"
          description={`Введите код из приложения-аутентификатора для аккаунта ${challenge.maskedPhone}.`}
          onBack={() => {
            setChallenge(null);
            setCode('');
            setError(undefined);
          }}
        />

        <View style={styles.form}>
          <TextField
            label="Код подтверждения"
            value={code}
            onChangeText={(text) => {
              setCode(text.replace(/\D/g, '').slice(0, 6));
              setError(undefined);
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            maxLength={6}
            placeholder="000000"
            autoFocus
            style={styles.codeInput}
            error={error}
          />
        </View>

        <View style={styles.footer}>
          <Button
            label="Подтвердить"
            onPress={() => void handleTwoFactor()}
            disabled={code.length !== 6}
            loading={isSubmitting}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <FormHeader title="Вход" description="Введите номер телефона и пароль." />

      <View style={styles.form}>
        <PhoneInput
          value={digits}
          onChangeValue={(next) => {
            setDigits(next);
            setError(undefined);
          }}
          country={country}
          onChangeCountry={setCountry}
          autofillAs="username"
          autoFocus
        />

        <TextField
          label="Пароль"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setError(undefined);
          }}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={() => void handleLogin()}
        />

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {error}
            </Text>
          </View>
        )}

        <Button
          label="Забыли пароль?"
          variant="ghost"
          size="md"
          onPress={() => router.push('/auth/phone?purpose=password_reset')}
        />
      </View>

      <View style={styles.footer}>
        <Button
          label="Войти"
          onPress={() => void handleLogin()}
          disabled={!isPhoneComplete || password.length === 0}
          loading={isSubmitting}
        />
        <Button
          label="Создать аккаунт"
          variant="ghost"
          onPress={() => router.replace('/auth/phone')}
        />
      </View>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    form: { gap: spacing.lg, marginTop: spacing.xxl },
    codeInput: {
      textAlign: 'center',
      fontSize: 26,
      letterSpacing: 8,
      fontVariant: ['tabular-nums'],
    },
    errorBox: {
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    errorText: { ...typography.caption, color: colors.danger },
    footer: { gap: spacing.sm, marginTop: 'auto', paddingTop: spacing.xl },
  });
