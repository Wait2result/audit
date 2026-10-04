import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH_SIZE, radius, shadow, spacing, typography, useThemeColors } from '../../theme';
import { Button } from '../Button';
import { ConditionChip } from '../ConditionChip';
import { Icon, type IconName } from '../Icon';

/**
 * Карточка раздела в ответе умного поиска: куда ведём и с какими условиями.
 *
 * Главный элемент — кнопка «Открыть …»: всё остальное объясняет, что именно
 * откроется. Чипсов условий — не больше пяти, остальное — «ещё N». Выдачи
 * внутри карточки нет: её показывает экран раздела.
 */

const MAX_CHIPS = 5;

export interface QuickValue {
  label: string;
  onPress: () => void;
}

export function SectionCard({
  icon,
  eyebrow,
  path,
  conditions = [],
  onEdit,
  notes = [],
  preview,
  body,
  cta,
  ctaVariant = 'primary',
  onOpen,
  secondary,
  quickValues = [],
}: {
  icon: IconName;
  /** «Объявления», «Раздел в работе» */
  eyebrow: string;
  /** «Транспорт → Автомобили», «Махачкала · сегодня» */
  path: string;
  conditions?: string[];
  /** «Изменить» — экран фильтров раздела */
  onEdit?: () => void;
  /** Что сказано, но не учтено */
  notes?: string[];
  preview?: ReactNode;
  body?: string;
  cta?: string | null;
  ctaVariant?: 'primary' | 'secondary';
  onOpen?: () => void;
  secondary?: { label: string; onPress: () => void };
  quickValues?: QuickValue[];
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const shown = conditions.slice(0, MAX_CHIPS);
  const more = conditions.length - shown.length;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.iconTile}>
          <Icon name={icon} size={22} color={colors.primary} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.path}>{path}</Text>
        </View>
      </View>

      {shown.length > 0 && (
        <View style={styles.conditionRow}>
          <View style={styles.conditions}>
            {shown.map((label) => (
              <ConditionChip key={label} label={label} />
            ))}
            {more > 0 && <ConditionChip label={`ещё ${more}`} muted />}
          </View>
          {onEdit && (
            <Pressable
              onPress={onEdit}
              accessibilityRole="button"
              accessibilityLabel="Изменить условия"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => [styles.edit, pressed && styles.pressed]}
            >
              <Text style={styles.editLabel}>Изменить</Text>
            </Pressable>
          )}
        </View>
      )}

      {notes.map((note) => (
        <View key={note} style={styles.note}>
          <Icon name="flag" size={14} color={colors.textMuted} />
          <Text style={styles.noteText}>{note}</Text>
        </View>
      ))}

      {preview}
      {body ? <Text style={styles.body}>{body}</Text> : null}

      {cta && onOpen && (
        <Button
          label={cta}
          onPress={onOpen}
          variant={ctaVariant}
          size="lg"
          fullWidth
          trailingIcon="chevron-right"
        />
      )}
      {secondary && (
        <Button label={secondary.label} onPress={secondary.onPress} variant="ghost" fullWidth />
      )}

      {quickValues.length > 0 && (
        <View style={styles.quick}>
          {quickValues.map((value) => (
            <Pressable
              key={value.label}
              onPress={value.onPress}
              accessibilityRole="button"
              accessibilityLabel={`Уточнить: ${value.label}`}
              style={({ pressed }) => [styles.quickValue, pressed && styles.pressed]}
            >
              <Text style={styles.quickLabel}>{value.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export interface ChoiceItem {
  icon: IconName;
  title: string;
  hint?: string;
  onPress: () => void;
}

/** Варианты уточнения: крупные строки со значком раздела. Нажатие — выбор без модели. */
export function ChoiceList({ items }: { items: ChoiceItem[] }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.choices}>
      {items.map((item) => (
        <Pressable
          key={item.title}
          onPress={item.onPress}
          accessibilityRole="button"
          accessibilityLabel={item.hint ? `${item.title}. ${item.hint}` : item.title}
          style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
        >
          <View style={styles.iconTile}>
            <Icon name={item.icon} size={22} color={colors.primary} />
          </View>
          <View style={styles.headText}>
            <Text style={styles.choiceTitle}>{item.title}</Text>
            {item.hint ? <Text style={styles.choiceHint}>{item.hint}</Text> : null}
          </View>
          <Icon name="chevron-right" size={16} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    card: {
      gap: spacing.md,
      padding: spacing.md + 2,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.card,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    iconTile: {
      width: MIN_TOUCH_SIZE,
      height: MIN_TOUCH_SIZE,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    headText: { flex: 1, minWidth: 0 },
    eyebrow: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase' },
    path: { ...typography.subheading, color: colors.text },

    conditionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    conditions: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    edit: { minHeight: 30, justifyContent: 'center' },
    editLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },

    note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    noteText: { ...typography.caption, color: colors.textMuted, flex: 1 },
    body: { ...typography.caption, color: colors.textMuted, lineHeight: 19 },

    quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    quickValue: {
      minHeight: 40,
      justifyContent: 'center',
      paddingHorizontal: spacing.md + 2,
      borderRadius: radius.full,
      backgroundColor: colors.tile,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    quickLabel: { ...typography.caption, color: colors.text, fontWeight: '600' },

    choices: { gap: spacing.sm },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 72,
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.card,
    },
    choiceTitle: { ...typography.subheading, color: colors.text },
    choiceHint: { ...typography.caption, color: colors.textMuted },

    pressed: { opacity: 0.85 },
  });
