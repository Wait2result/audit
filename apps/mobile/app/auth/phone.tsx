import type { RequestOtpResponse } from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError, apiFetch } from '../../src/api/client';
import { Button } from '../../src/components/Button';
import { FormHeader } from '../../src/components/FormHeader';
import { PhoneInput, toE164 } from '../../src/components/PhoneInput';
import { Screen } from '../../src/components/Screen';
import { useAuthFlowStore, type AuthPurpose } from '../../src/store/auth-flow-store';
import { spacing, typography, useThemeColors } from '../../src/theme';

/**
 * Шаг 1 регистрации и восстановления пароля: ввод номера телефона.
 *
 * Один экран на два сценария — они отличаются только целью запроса кода
 * и текстами. Разводить их по двум почти одинаковым файлам значило бы
 * править потом каждую мелочь дважды.
 */
export default function PhoneScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const params = useLocalSearchParams<{ purpose?: string }>();

  const purpose: AuthPurpose =
    params.purpose === 'password_reset' ? 'password_reset' : 'registration';

  const { country, digits, setCountry, setDigits, setCodeRequested, startFlow } =
    useAuthFlowStore();

  const [error, setError] = useState<string>();
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    startFlow(purpose);
  }, [purpose, startFlow]);

  const isComplete = digits.length === country.digits;

  const handleSubmit = async () => {
    if (!isComplete || isSending) return;

    setError(undefined);
    setIsSending(true);

    try {
      const response = await apiFetch<RequestOtpResponse>('/auth/otp/request', {
        method: 'POST',
        body: { phone: toE164(country, digits), purpose },
        anonymous: true,
      });

      setCodeRequested({
        phone: toE164(country, digits),
        maskedPhone: response.maskedPhone,
        resendAfterSeconds: response.cooldownSeconds,
        devCode: response.devCode,
      });

      router.push('/auth/code');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Не удалось отправить код. Попробуйте позже.',
      );
    } finally {
      setIsSending(false);
    }
  };

  const isReset = purpose === 'password_reset';

  return (
    <Screen scroll>
      <FormHeader
        title={isReset ? 'Восстановление пароля' : 'Ваш номер телефона'}
        description={
          isReset
            ? 'Отправим код подтверждения на номер, к которому привязан аккаунт.'
            : 'На него придёт код подтверждения. Номер будет вашим логином.'
        }
      />

      <View style={styles.form}>
        <PhoneInput
          value={digits}
          onChangeValue={(next) => {
            setDigits(next);
            setError(undefined);
          }}
          country={country}
          onChangeCountry={setCountry}
          error={error}
          autoFocus
          onSubmitEditing={() => void handleSubmit()}
        />

        <Text style={styles.note}>
          Отправляя код, вы соглашаетесь с условиями использования и политикой конфиденциальности.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button
          label="Получить код"
          onPress={() => void handleSubmit()}
          disabled={!isComplete}
          loading={isSending}
        />
      </View>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    form: { gap: spacing.lg, marginTop: spacing.xxl },
    note: {
      ...typography.caption,
      color: colors.textFaint,
      lineHeight: 18,
    },
    footer: { marginTop: 'auto', paddingTop: spacing.xl },
  });
