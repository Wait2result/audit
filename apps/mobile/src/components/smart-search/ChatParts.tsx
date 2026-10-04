import { forwardRef, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, shadow, spacing, typography, useThemeColors } from '../../theme';
import { Icon, type IconName } from '../Icon';

/**
 * Части лёгкого чата умного поиска: реплика человека справа, ответ слева
 * (значок «Поиск» в круге, короткая строка, карточка), поле ввода внизу.
 * Это не разговорный бот: ответ — одна строка и действие.
 */

export function UserMessage({ text }: { text: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.userRow}>
      <View style={styles.bubble}>
        <Text style={styles.bubbleText}>{text}</Text>
      </View>
    </View>
  );
}

function Avatar() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.avatar} accessible={false}>
      <Icon name="search" size={16} color={colors.primary} />
    </View>
  );
}

/** Ответ: короткая строка, карточка и «Искал не то?». */
export function AssistantMessage({
  lead,
  children,
  onWrong,
}: {
  lead: string;
  children?: ReactNode;
  onWrong?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.aiRow}>
      <Avatar />
      <View style={styles.aiColumn}>
        <Text style={styles.lead} accessibilityRole="header">
          {lead}
        </Text>
        {children}
        {onWrong && (
          <Pressable
            onPress={onWrong}
            accessibilityRole="button"
            style={({ pressed }) => [styles.wrong, pressed && styles.pressed]}
          >
            <Text style={styles.wrongText}>Искал не то?</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Пока сервер разбирает фразу. Через 2,5 с подпись меняется — видно, что работа идёт. */
export function ThinkingMessage() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [later, setLater] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLater(true), 2500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.aiRow} accessibilityLiveRegion="polite">
      <Avatar />
      <View style={[styles.aiColumn, styles.thinking]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.thinkingText}>{later ? 'Подбираю раздел…' : 'Понимаю запрос…'}</Text>
      </View>
    </View>
  );
}

/** Прошлый ответ одной строкой: последний виден целиком, старые не занимают экран. */
export function CollapsedAnswer({
  icon,
  text,
  onPress,
}: {
  icon: IconName;
  text: string;
  onPress?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const content = (
    <>
      <Icon name={icon} size={16} color={colors.primary} />
      <Text style={styles.collapsedText} numberOfLines={1}>
        {text}
      </Text>
      {onPress && <Icon name="chevron-right" size={14} color={colors.textMuted} />}
    </>
  );
  return (
    <View style={styles.aiRow}>
      <Avatar />
      <View style={styles.aiColumn}>
        {onPress ? (
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`Открыть: ${text}`}
            style={({ pressed }) => [styles.collapsed, pressed && styles.pressed]}
          >
            {content}
          </Pressable>
        ) : (
          <View style={styles.collapsed}>{content}</View>
        )}
      </View>
    </View>
  );
}

/** Поле ввода внизу: «Найти» — круглая кнопка и клавиша клавиатуры. */
export const SearchComposer = forwardRef<
  TextInput,
  { value: string; onChange: (text: string) => void; onSubmit: () => void; busy: boolean }
>(function SearchComposer({ value, onChange, onSubmit, busy }, ref) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const canSend = value.trim().length > 0 && !busy;
  return (
    <View style={styles.composer}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={() => canSend && onSubmit()}
        placeholder="Напишите, что ищете…"
        placeholderTextColor={colors.textFaint}
        returnKeyType="search"
        enterKeyHint="search"
        autoCorrect={false}
        maxLength={300}
        accessibilityLabel="Что ищете"
        style={styles.input}
      />
      <Pressable
        onPress={onSubmit}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Найти"
        accessibilityState={{ disabled: !canSend }}
        hitSlop={4}
        style={({ pressed }) => [
          styles.send,
          !canSend && styles.sendOff,
          pressed && canSend && styles.pressed,
        ]}
      >
        <Icon name="arrow-up" size={20} color={colors.textOnPrimary} />
      </Pressable>
    </View>
  );
});

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    userRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    bubble: {
      maxWidth: '80%',
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.lg,
      borderBottomRightRadius: 4,
      backgroundColor: colors.primary,
    },
    bubbleText: { ...typography.body, color: colors.textOnPrimary, lineHeight: 20 },

    aiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    avatar: {
      width: 32,
      height: 32,
      marginTop: 2,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    aiColumn: { flex: 1, minWidth: 0, maxWidth: 360, gap: spacing.sm },
    lead: { ...typography.body, fontWeight: '600', color: colors.text, paddingTop: 6 },

    thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: 6 },
    thinkingText: { ...typography.body, color: colors.textMuted },

    wrong: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    wrongText: { ...typography.caption, color: colors.primary },

    collapsed: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    collapsedText: { ...typography.caption, color: colors.textMuted, flex: 1 },

    composer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 52,
      paddingLeft: spacing.lg + 2,
      paddingRight: 6,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.raised,
    },
    input: { ...typography.body, flex: 1, color: colors.text, paddingVertical: spacing.md },
    send: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    sendOff: { opacity: 0.45 },

    pressed: { opacity: 0.85 },
  });
