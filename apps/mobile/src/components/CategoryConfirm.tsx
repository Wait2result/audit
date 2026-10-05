import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';
import { subcategoryIcon } from '../utils/listing-icons';
import { Icon } from './Icon';

/**
 * Найденная по фразе категория — одно предположение и простой вопрос.
 *
 *   ★ Найдена категория
 *   [иконка] Сельхозживотные
 *            Конь
 *   [ ✓ Подходит ]
 *   Выбрать другую категорию ›
 *
 * Список альтернатив сразу не показывается: человек видит его, только если
 * нажал «Выбрать другую категорию» (тот же выбор категории, что при подаче).
 * Выдача под блоком уже видна — подтверждение не загораживает результаты.
 */
export function CategoryConfirm({
  slug,
  name,
  path,
  query,
  onConfirm,
  onChooseOther,
}: {
  slug: string;
  name: string;
  /** Где категория лежит: «Животные» */
  path: string | null;
  /** Фраза человека: «Конь» */
  query: string;
  onConfirm: () => void;
  onChooseOther: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card} accessibilityLabel={`Найдена категория: ${name}`}>
      <View style={styles.caption}>
        <Icon name="star" size={14} color={colors.primary} />
        <Text style={styles.captionText}>Найдена категория</Text>
      </View>

      <View style={styles.found}>
        <View style={styles.icon}>
          <Icon name={subcategoryIcon(slug)} size={20} color={colors.primary} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.query} numberOfLines={1}>
            {[path, query].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onConfirm}
        accessibilityRole="button"
        accessibilityLabel="Подходит"
        style={({ pressed }) => [styles.confirm, pressed && styles.pressed]}
      >
        <Icon name="check" size={18} color={colors.textOnPrimary} />
        <Text style={styles.confirmLabel}>Подходит</Text>
      </Pressable>

      <Pressable
        onPress={onChooseOther}
        accessibilityRole="button"
        accessibilityLabel="Выбрать другую категорию"
        style={({ pressed }) => [styles.other, pressed && styles.pressed]}
      >
        <Text style={styles.otherLabel}>Выбрать другую категорию</Text>
        <Icon name="chevron-right" size={16} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    card: {
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    caption: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    captionText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    found: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    icon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    texts: { flex: 1, gap: 2 },
    name: { ...typography.subheading, color: colors.text },
    query: { ...typography.caption, color: colors.textMuted },
    confirm: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: 46,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
    },
    confirmLabel: { ...typography.body, color: colors.textOnPrimary, fontWeight: '600' },
    other: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: 40,
    },
    otherLabel: { ...typography.body, color: colors.primary },
    pressed: { opacity: 0.85 },
  });
