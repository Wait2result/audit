import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';
import { Icon } from './Icon';

/**
 * Пустая выдача поиска — спокойно и по делу: что произошло и что можно
 * сделать. Действия — только существующие (изменить запрос, город, радиус,
 * снять фильтр); экран передаёт те, что сейчас имеют смысл.
 */
export function EmptySearch({
  actions,
}: {
  actions: readonly { label: string; onPress: () => void }[];
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.box}>
      <View style={styles.icon}>
        <Icon name="search" size={22} color={colors.primary} />
      </View>
      <Text style={styles.title}>По вашему запросу ничего не найдено</Text>
      <Text style={styles.text}>Попробуйте изменить запрос или выбрать другую категорию.</Text>
      {actions.length > 0 && (
        <View style={styles.actions}>
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
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    box: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.lg,
    },
    icon: {
      width: 52,
      height: 52,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
      marginBottom: spacing.sm,
    },
    title: { ...typography.subheading, color: colors.text, textAlign: 'center' },
    text: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    action: {
      minHeight: 40,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    actionLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    pressed: { opacity: 0.85 },
  });
