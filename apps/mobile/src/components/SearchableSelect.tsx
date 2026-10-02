import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  /** Другие написания: «тойота» находит Toyota */
  aliases?: readonly string[];
}

interface SearchableSelectProps {
  label: string;
  value: string | undefined;
  options: readonly SelectOption[];
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  error?: string;
  /**
   * Разрешить значение, которого нет в списке. Для марки — нет: марка вне
   * справочника выбирается отдельным пунктом «Другая марка», а не вольным
   * текстом, иначе одна и та же марка снова начнёт писаться по-разному.
   * Для модели — да: марка есть, а нужной комплектации в списке нет.
   */
  allowCustom?: boolean;
  /**
   * Верхний пункт «снять выбор» («Все разделы»): значение становится пустым.
   * Без него выбранное можно только заменить другим.
   */
  clearLabel?: string;
  /** Строка поиска в окне выбора. Для короткого списка (десять разделов) лишняя */
  search?: boolean;
}

/**
 * Поле выбора из длинного списка — маркой не походишь по десяти чипсам в
 * ряд. Список открывается модальным окном со строкой поиска: и полсотни
 * марок автомобилей, и три сотни моделей телефонов пролистываются одним
 * пальцем, а не жестом «влево-влево-влево» вдоль экрана.
 */
export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Не выбрано',
  error,
  allowCustom = false,
  clearLabel,
  search = true,
}: SearchableSelectProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((option) => option.value === value);
  // Своё значение, которого нет в справочнике — не теряем его, показываем
  // как есть, вместо того чтобы поле выглядело незаполненным
  const displayLabel = selected?.label ?? (allowCustom ? value : undefined);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.aliases?.some((alias) => alias.includes(needle)),
    );
  }, [options, query]);

  const trimmedQuery = query.trim();
  const exactMatch = filtered.some(
    (option) => option.label.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  const showCustomOption = allowCustom && trimmedQuery.length > 0 && !exactMatch;

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const select = (next: string | undefined) => {
    onChange(next);
    close();
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.field, error && styles.fieldError]}
      >
        <Text
          style={[styles.fieldText, !displayLabel && styles.fieldPlaceholder]}
          numberOfLines={1}
        >
          {displayLabel ?? placeholder}
        </Text>
        <Icon name="chevron-down" size={16} color={colors.textFaint} />
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={close}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label}</Text>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              hitSlop={12}
            >
              <Icon name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          {search && (
            <View style={styles.searchBox}>
              <Icon name="search" size={18} color={colors.textFaint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Поиск"
                placeholderTextColor={colors.textFaint}
                style={styles.searchInput}
                autoFocus
              />
            </View>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <>
                {clearLabel && trimmedQuery.length === 0 && (
                  <Pressable
                    onPress={() => select(undefined)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                  >
                    <Text style={styles.optionText}>{clearLabel}</Text>
                    {value === undefined && <Icon name="check" size={18} color={colors.primary} />}
                  </Pressable>
                )}
                {showCustomOption && (
                  <Pressable
                    onPress={() => select(trimmedQuery)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                  >
                    <Text style={styles.optionText}>Использовать «{trimmedQuery}»</Text>
                  </Pressable>
                )}
              </>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => select(item.value)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              >
                <Text style={styles.optionText}>{item.label}</Text>
                {item.value === value && <Icon name="check" size={18} color={colors.primary} />}
              </Pressable>
            )}
            ListEmptyComponent={
              !showCustomOption ? <Text style={styles.empty}>Ничего не нашлось</Text> : null
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    wrapper: { gap: spacing.xs },
    pressed: { opacity: 0.85 },
    label: { ...typography.caption, color: colors.textMuted },

    field: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 48,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fieldError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
    fieldText: { ...typography.body, color: colors.text, flexShrink: 1 },
    fieldPlaceholder: { color: colors.textFaint },
    error: { ...typography.caption, color: colors.danger },

    modal: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.lg },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    modalTitle: { ...typography.heading, color: colors.text },

    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      paddingHorizontal: spacing.lg,
      minHeight: 46,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    searchInput: { flex: 1, ...typography.body, color: colors.text },

    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionText: { ...typography.body, color: colors.text, flexShrink: 1 },
    empty: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.xxl,
    },
  });
