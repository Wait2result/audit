import {
  SMART_SEARCH_FAILURE_TYPES,
  type SmartSearchClarification,
  type SmartSearchClarificationOption,
  type SmartSearchFailureType,
  type SmartSearchFeedbackRequest,
} from '@dagestan/shared';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ApiError } from '../api/client';
import { sendSmartSearchFeedback } from '../api/smart-search';
import { useToastStore } from '../store/toast-store';
import { radius, spacing, typography, useThemeColors } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { TextField } from './TextField';

/**
 * Состояния умного поиска — общие для экрана «Поиск» и объявлений.
 *
 * Слова только человеческие: никакой «модели», «запроса к API» и «намерения».
 * Блоки компактные и на тех же поверхностях, что поле поиска и фильтры, —
 * без отдельных цветов и больших карточек.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  «Понимаю запрос…»
// ─────────────────────────────────────────────────────────────────────────────

/** Пока сервер разбирает фразу. Через пару секунд подпись меняется — видно, что работа идёт. */
export function SmartThinking() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearching(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.thinking} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.thinkingText}>
        {searching ? 'Ищу по вашему запросу…' : 'Понимаю запрос…'}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  «Понял запрос»
// ─────────────────────────────────────────────────────────────────────────────

export function SmartUnderstood({
  summary,
  notes = [],
  onWrong,
  onClose,
}: {
  /** «Toyota Succeed · до 1,2 млн ₽ · автомат» */
  summary: string;
  /** Что сказано, но не учтено: «Цен билетов в поиске сеансов нет» */
  notes?: readonly string[];
  /** «Искал не то?» */
  onWrong: () => void;
  /** Закрыть строку (фильтры остаются) */
  onClose?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!summary) return null;

  return (
    <View style={styles.block}>
      <View style={styles.understoodRow}>
        <Icon name="check" size={16} color={colors.primary} />
        <View style={styles.understoodText}>
          <Text style={styles.caption}>Понял запрос</Text>
          <Text style={styles.summary}>{summary}</Text>
          {notes.map((note) => (
            <Text key={note} style={styles.hint}>
              {note}
            </Text>
          ))}
        </View>
        {onClose && (
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Скрыть"
          >
            <Icon name="close" size={14} color={colors.textFaint} />
          </Pressable>
        )}
      </View>
      <WrongLink onPress={onWrong} />
    </View>
  );
}

function WrongLink({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => [styles.wrongLink, pressed && styles.pressed]}
    >
      <Text style={styles.wrongLinkText}>Искал не то?</Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Уточнение
// ─────────────────────────────────────────────────────────────────────────────

export function SmartClarificationBlock({
  clarification,
  onPick,
  onWrong,
}: {
  clarification: SmartSearchClarification;
  onPick: (option: SmartSearchClarificationOption) => void;
  onWrong?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.block}>
      <View style={styles.understoodRow}>
        <Icon name="search" size={16} color={colors.primary} />
        <Text style={[styles.summary, styles.flex]}>{clarification.question}</Text>
      </View>
      {clarification.options.length > 0 ? (
        <View style={styles.options}>
          {clarification.options.map((option) => (
            <Pressable
              key={`${option.kind}-${option.value}`}
              onPress={() => onPick(option)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            >
              <Text style={styles.optionLabel}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.hint}>Допишите запрос в поле поиска.</Text>
      )}
      {onWrong && <WrongLink onPress={onWrong} />}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Сообщение с действиями: «ничего не найдено», «не умею», «обычный поиск»
// ─────────────────────────────────────────────────────────────────────────────

export interface SmartAction {
  label: string;
  onPress: () => void;
}

export function SmartNotice({
  title,
  text,
  actions = [],
  onWrong,
}: {
  title: string;
  text?: string;
  actions?: SmartAction[];
  onWrong?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.block}>
      <Text style={styles.summary}>{title}</Text>
      {text ? <Text style={styles.hint}>{text}</Text> : null}
      {actions.length > 0 && (
        <View style={styles.options}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              accessibilityRole="button"
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {onWrong && <WrongLink onPress={onWrong} />}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  «Искал не то?»
// ─────────────────────────────────────────────────────────────────────────────

const FAILURE_LABELS: Record<SmartSearchFailureType, string> = {
  wrong_domain: 'Искал не там',
  wrong_conditions: 'Не те условия',
  missing_conditions: 'Что-то потерялось',
  not_understood: 'Не понял вопрос',
  wrong_results: 'Нашлось не то',
  other: 'Другое',
};

export interface SmartFeedbackTarget {
  requestId?: string;
  originalQuery: string;
  /** Что предложить отметкой по умолчанию */
  failureType: SmartSearchFailureType;
  screen: NonNullable<SmartSearchFeedbackRequest['screen']>;
}

/**
 * Исправление человека уходит на сервер для разбора. Ничего не меняется сразу:
 * так и говорим — «учтём при улучшении поиска», без обещаний мгновенного эффекта.
 */
export function SmartFeedbackSheet({
  target,
  onClose,
}: {
  target: SmartFeedbackTarget | null;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toast = useToastStore((s) => s.show);
  const [failureType, setFailureType] = useState<SmartSearchFailureType>('wrong_conditions');
  const [correction, setCorrection] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!target) return;
    setFailureType(target.failureType);
    setCorrection('');
    setError(undefined);
  }, [target]);

  const submit = async () => {
    if (!target) return;
    const text = correction.trim();
    if (text.length < 3) {
      setError('Напишите, что вы имели в виду');
      return;
    }
    setSending(true);
    try {
      await sendSmartSearchFeedback({
        ...(target.requestId ? { requestId: target.requestId } : {}),
        originalQuery: target.originalQuery,
        failureType,
        userCorrection: text,
        screen: target.screen,
      });
      onClose();
      toast('Спасибо! Учтём при улучшении поиска.');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Слишком много сообщений подряд. Попробуйте через минуту.'
          : 'Не удалось отправить. Попробуйте ещё раз.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={target !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Искал не то?</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
          >
            <Icon name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          {target && <Text style={styles.hint}>Ваш запрос: «{target.originalQuery}»</Text>}

          <View style={styles.options}>
            {SMART_SEARCH_FAILURE_TYPES.map((type) => {
              const active = type === failureType;
              return (
                <Pressable
                  key={type}
                  onPress={() => setFailureType(type)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.option,
                    active && styles.optionActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.optionLabel}>{FAILURE_LABELS[type]}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextField
            label="Что вы имели в виду?"
            value={correction}
            onChangeText={(value) => {
              setCorrection(value);
              if (error) setError(undefined);
            }}
            placeholder="Например: «Toyota Succeed, а не просто Toyota»"
            multiline
            maxLength={500}
            error={error}
            hint="Сообщение поможет улучшить поиск. Сразу ничего не изменится."
          />

          <Button
            label="Отправить"
            onPress={() => void submit()}
            loading={sending}
            fullWidth
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    flex: { flex: 1 },
    pressed: { opacity: 0.85 },

    thinking: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    thinkingText: { ...typography.body, color: colors.textMuted },

    block: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    understoodRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    understoodText: { flex: 1, gap: 2 },
    caption: { ...typography.caption, color: colors.textMuted },
    summary: { ...typography.body, color: colors.text, fontWeight: '600' },
    hint: { ...typography.caption, color: colors.textMuted },

    wrongLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    wrongLinkText: { ...typography.caption, color: colors.primary },

    options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    option: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 40,
      justifyContent: 'center',
      borderRadius: radius.full,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
    optionLabel: { ...typography.caption, color: colors.text },
    action: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 36,
      justifyContent: 'center',
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
    },
    actionLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },

    sheet: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.lg },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    sheetTitle: { ...typography.heading, color: colors.text },
    sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  });
