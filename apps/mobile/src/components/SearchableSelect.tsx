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
  /** Строка поиска в окне выбора. Для короткого списка (десять категорий) лишняя */
  search?: boolean;
  /** Плотный вариант для фильтров: ниже поле и стрелка «›», как у перехода к списку */
  compact?: boolean;
  /**
   * Крестик в поле: снять выбор, не открывая список. Снимается только это
   * поле — остальные фильтры остаются
   */
  onClear?: () => void;
  /**
   * Несколько значений сразу (модели одной марки): список не закрывается
   * после выбора, отмеченные снимаются повторным нажатием. Тогда `value`
   * не используется
   */
  values?: readonly string[];
  onChangeValues?: (values: string[] | undefined) => void;
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
  compact = false,
  onClear,
  values,
  onChangeValues,
}: SearchableSelectProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const multiple = onChangeValues !== undefined;
  const chosen = multiple ? (values ?? []) : value === undefined ? [] : [value];
  const selected = options.find((option) => option.value === value);
  const chosenLabels = chosen.map(
    (item) => options.find((option) => option.value === item)?.label ?? item,
  );
  // Своё значение, которого нет в справочнике — не теряем его, показываем
  // как есть, вместо того чтобы поле выглядело незаполненным
  const displayLabel = multiple
    ? chosenLabels.length > 0
      ? chosenLabels.join(', ')
      : undefined
    : (selected?.label ?? (allowCustom ? value : undefined));

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
    if (multiple) {
      // Несколько значений: отметка ставится и снимается, окно остаётся открытым
      if (next === undefined) {
        onChangeValues(undefined);
        close();
        return;
      }
      const list = chosen.includes(next)
        ? chosen.filter((item) => item !== next)
        : [...chosen, next];
      onChangeValues(list.length > 0 ? list : undefined);
      return;
    }
    onChange(next);
    close();
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View style={[styles.field, compact && styles.fieldCompact, error && styles.fieldError]}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${displayLabel ?? placeholder}`}
          style={styles.fieldOpen}
        >
          <Text
            style={[styles.fieldText, !displayLabel && styles.fieldPlaceholder]}
            numberOfLines={multiple ? 2 : 1}
          >
            {displayLabel ?? placeholder}
          </Text>
          {!(onClear && displayLabel) && (
            <Icon
              name={compact ? 'chevron-right' : 'chevron-down'}
              size={16}
              color={colors.textFaint}
            />
          )}
        </Pressable>
        {onClear && displayLabel ? (
          // Крестик — сосед поля, а не его часть: снимает выбор, не открывая список
          // (кнопка внутри кнопки — недопустимая разметка в вебе)
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel={`Очистить: ${label}`}
            hitSlop={10}
            style={styles.clear}
          >
            <Icon name="close" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

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
            {multiple ? (
              <Pressable onPress={close} accessibilityRole="button" hitSlop={12}>
                <Text style={styles.done}>Готово</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Закрыть"
                hitSlop={12}
              >
                <Icon name="close" size={22} color={colors.text} />
              </Pressable>
            )}
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
                    {chosen.length === 0 && <Icon name="check" size={18} color={colors.primary} />}
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
                {chosen.includes(item.value) && (
                  <Icon name="check" size={18} color={colors.primary} />
                )}
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
    fieldCompact: { minHeight: 44, paddingHorizontal: spacing.md, gap: spacing.sm },
    fieldError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
    fieldText: { ...typography.body, color: colors.text, flexShrink: 1 },
    fieldOpen: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
      gap: spacing.sm,
    },
    clear: { marginLeft: spacing.sm, padding: spacing.xs },
    done: { ...typography.body, color: colors.primary, fontWeight: '600' },
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
