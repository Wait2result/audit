import { LISTING_REPORT_REASONS, type ListingReportReason } from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useReportListing } from '../../src/api/queries';
import { Button } from '../../src/components/Button';
import { FormHeader } from '../../src/components/FormHeader';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { useToastStore } from '../../src/store/toast-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';

/**
 * Жалоба на объявление (Этап 7).
 *
 * Объявления публикуются без предварительной проверки, поэтому жалоба —
 * единственный способ узнать о мошеннике. Причины перечислены списком, а не
 * одним полем «опишите проблему»: по коду причины сотрудник в панели сразу
 * видит, что проверять, а несколько жалоб снимают объявление автоматически.
 */
export default function ReportListingScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const showToast = useToastStore((s) => s.show);

  const [reason, setReason] = useState<ListingReportReason | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const report = useReportListing();

  const needsComment = reason === 'other';
  const canSend = Boolean(reason) && (!needsComment || comment.trim().length >= 3);

  const send = () => {
    if (!reason) return;
    setError(null);

    report.mutate(
      { listingId: id, reason, comment: comment.trim() || undefined },
      {
        onSuccess: () => {
          showToast('Жалоба отправлена. Мы её разберём');
          router.back();
        },
        onError: () =>
          setError('Не получилось отправить. Возможно, вы уже жаловались на это объявление.'),
      },
    );
  };

  return (
    <Screen scroll>
      <FormHeader title="Пожаловаться" description="Расскажите, что не так — объявление проверят" />

      <View style={styles.list}>
        {LISTING_REPORT_REASONS.map((item) => {
          const active = reason === item.value;

          return (
            <Pressable
              key={item.value}
              onPress={() => setReason(item.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.option,
                active && styles.optionActive,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.optionTexts}>
                <Text style={styles.optionLabel}>{item.label}</Text>
                <Text style={styles.optionHint}>{item.hint}</Text>
              </View>
              {active && <Icon name="check" size={18} color={colors.primary} />}
            </Pressable>
          );
        })}
      </View>

      <TextField
        label={needsComment ? 'Что произошло' : 'Комментарий (необязательно)'}
        value={comment}
        onChangeText={setComment}
        placeholder="Опишите, что не так"
        multiline
        style={styles.comment}
        error={error ?? undefined}
      />

      <Button
        label="Отправить жалобу"
        onPress={send}
        disabled={!canSend}
        loading={report.isPending}
        style={styles.send}
      />
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    list: { gap: spacing.sm, marginTop: spacing.lg },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    pressed: { opacity: 0.85 },
    optionTexts: { flexShrink: 1, gap: 2 },
    optionLabel: { ...typography.body, color: colors.text, fontWeight: '600' },
    optionHint: { ...typography.caption, color: colors.textMuted },

    comment: { marginTop: spacing.lg, minHeight: 96, textAlignVertical: 'top' },
    send: { marginTop: spacing.xl },
  });
