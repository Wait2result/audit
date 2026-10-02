import type { RequestOtpResponse, VerifyOtpResponse } from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, apiFetch } from '../../src/api/client';
import { Button } from '../../src/components/Button';
import { FormHeader } from '../../src/components/FormHeader';
import { Screen } from '../../src/components/Screen';
import { useAuthFlowStore } from '../../src/store/auth-flow-store';
import { MIN_TOUCH_SIZE, radius, spacing, typography, useThemeColors } from '../../src/theme';

const CODE_LENGTH = 6;

/**
 * Шаг 2: код из SMS.
 *
 * Код проверяется автоматически, как только введены все шесть цифр —
 * отдельное нажатие «Подтвердить» здесь лишнее действие.
 *
 * Кнопка повторной отправки заблокирована до истечения паузы, которую задал
 * сервер. Это не только удобство: каждая SMS стоит денег, и сервер всё равно
 * откажет — лучше показать это сразу, чем ошибкой после нажатия.
 */
export default function CodeScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  const {
    purpose,
    phone,
    maskedPhone,
    devCode,
    resendAfterSeconds,
    setVerified,
    setCodeRequested,
  } = useAuthFlowStore();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(resendAfterSeconds);

  // Обратный отсчёт до повторной отправки
  useEffect(() => {
    if (secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft]);

  const verify = async (value: string) => {
    setIsVerifying(true);
    setError(undefined);

    try {
      const response = await apiFetch<VerifyOtpResponse>('/auth/otp/verify', {
        method: 'POST',
        body: { phone, code: value, purpose },
        anonymous: true,
      });

      setVerified(response.verificationToken);
      router.push('/auth/password');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось проверить код.');
      setCode('');
      inputRef.current?.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    setError(undefined);

    if (digits.length === CODE_LENGTH) {
      void verify(digits);
    }
  };

  const handleResend = async () => {
    if (secondsLeft > 0 || isResending) return;

    setIsResending(true);
    setError(undefined);

    try {
      const response = await apiFetch<RequestOtpResponse>('/auth/otp/request', {
        method: 'POST',
        body: { phone, purpose },
        anonymous: true,
      });

      setCodeRequested({
        phone,
        maskedPhone: response.maskedPhone,
        resendAfterSeconds: response.cooldownSeconds,
        devCode: response.devCode,
      });
      setSecondsLeft(response.cooldownSeconds);
      setCode('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить код повторно.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Screen scroll>
      <FormHeader
        title="Код из SMS"
        description={`Отправили шестизначный код на ${maskedPhone || 'ваш номер'}.`}
      />

      <View style={styles.form}>
        {/* Настоящее поле ввода скрыто: видимые ячейки рисуются отдельно,
            а печатает человек в это поле. Так проще, чем шесть отдельных полей
            с ручным переносом курсора между ними. */}
        <Pressable onPress={() => inputRef.current?.focus()} accessibilityLabel="Ввести код">
          <View style={styles.cells}>
            {Array.from({ length: CODE_LENGTH }).map((_, index) => {
              const char = code[index];
              const isActive = index === code.length;

              return (
                <View
                  key={index}
                  style={[
                    styles.cell,
                    Boolean(char) && styles.cellFilled,
                    isActive && styles.cellActive,
                    Boolean(error) && styles.cellError,
                  ]}
                >
                  <Text style={styles.cellText}>{char ?? ''}</Text>
                </View>
              );
            })}
          </View>
        </Pressable>

        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={handleChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={CODE_LENGTH}
          autoFocus
          editable={!isVerifying}
          accessibilityLabel="Код из SMS"
          style={styles.hiddenInput}
        />

        {error && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}

        {devCode && (
          <View style={styles.devHint}>
            <Text style={styles.devHintLabel}>Режим разработки</Text>
            <Text style={styles.devHintText}>
              SMS не отправляются. Код: <Text style={styles.devHintCode}>{devCode}</Text>
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Button
          label={
            secondsLeft > 0 ? `Отправить повторно через ${secondsLeft} с` : 'Отправить код повторно'
          }
          variant="ghost"
          onPress={() => void handleResend()}
          disabled={secondsLeft > 0}
          loading={isResending}
        />
      </View>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    form: { gap: spacing.lg, marginTop: spacing.xxl },
    cells: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
    cell: {
      flex: 1,
      height: 60,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    cellFilled: { borderColor: colors.borderStrong },
    cellActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    cellError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
    cellText: { ...typography.title, fontSize: 24, color: colors.text },

    // Поле нужно для ввода, но показывать его не нужно
    hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },

    error: { ...typography.caption, color: colors.danger, textAlign: 'center' },

    devHint: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    devHintLabel: { ...typography.label, color: colors.accent, textTransform: 'uppercase' },
    devHintText: { ...typography.caption, color: colors.text },
    devHintCode: { fontWeight: '700', letterSpacing: 2 },

    footer: { marginTop: 'auto', paddingTop: spacing.xl, minHeight: MIN_TOUCH_SIZE },
  });
