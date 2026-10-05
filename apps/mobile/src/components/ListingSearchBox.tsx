import type { ListingSuggestionDto } from '@dagestan/shared';
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useListingSuggestions } from '../api/queries';
import { useSearchHistoryStore } from '../store/search-history-store';
import { radius, spacing, typography, useThemeColors } from '../theme';
import { Icon, type IconName } from './Icon';

/**
 * Строка поиска объявлений с подсказками и историей.
 *
 * Подсказки приходят с сервера по мере набора: категория, марка, популярный
 * запрос. Категория открывается сразу, а не ищется словом — «айфон» должен
 * привести в «Телефоны», а не в выдачу по совпадению букв.
 *
 * История — четыре последних выполненных запроса (одна на все экраны, см.
 * search-history-store). Видна в пустом поле. Три разных крестика:
 *   «×» в поле     — стереть набранный текст (и снова увидеть историю);
 *   «×» у запроса  — убрать из истории только его;
 *   «Очистить»     — убрать всю историю.
 */

interface Props {
  value: string;
  onChange: (text: string) => void;
  /** Человек нажал «Найти», выбрал подсказку или запрос из истории — поиск выполняется */
  onSubmit: (text: string) => void;
  onOpenCategory: (slug: string) => void;
  cityId: string | null;
  placeholder?: string;
  /** Чтобы экран мог вернуть фокус в поле: «Изменить запрос» */
  inputRef?: Ref<TextInput | null>;
  /** Запрос разбирается — вместо лупы крутится индикатор */
  busy?: boolean;
}

export function ListingSearchBox({
  value,
  onChange,
  onSubmit,
  onOpenCategory,
  cityId,
  placeholder = 'Поиск объявлений',
  inputRef,
  busy = false,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);
  const field = useRef<TextInput>(null);
  // Отложенное «потерял фокус»: отменяется, если фокус сразу вернулся (нажатие «×»)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useImperativeHandle(inputRef, () => field.current as TextInput);

  const history = useSearchHistoryStore((s) => s.items);
  const loadHistory = useSearchHistoryStore((s) => s.load);
  const remember = useSearchHistoryStore((s) => s.add);
  const forget = useSearchHistoryStore((s) => s.remove);
  const clearHistory = useSearchHistoryStore((s) => s.clear);

  // Подсказки не мигают на каждую букву: запрос уходит с задержкой
  const [needle, setNeedle] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setNeedle(value.trim()), 250);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const suggestions = useListingSuggestions(cityId, focused ? needle : '');

  const submit = (text: string) => {
    const clean = text.trim();
    // В историю — только выполненный поиск, а не каждая набранная буква
    if (clean) void remember(clean);
    onChange(clean);
    onSubmit(clean);
    setFocused(false);
    field.current?.blur();
  };

  const pick = (item: ListingSuggestionDto) => {
    if (item.type === 'category' && item.categorySlug) {
      if (value.trim()) void remember(value);
      setFocused(false);
      onOpenCategory(item.categorySlug);
      return;
    }
    submit(item.label);
  };

  const showHistory = focused && value.trim().length === 0 && history.length > 0;
  const shown = focused && needle.length >= 2 ? (suggestions.data ?? []) : [];

  return (
    <View>
      <View style={[styles.searchBox, focused && styles.searchBoxFocused]}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Icon name="search" size={18} color={colors.textFaint} />
        )}
        <TextInput
          ref={field}
          value={value}
          onChangeText={onChange}
          onFocus={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setFocused(true);
          }}
          // Задержка — чтобы нажатие по подсказке или «×» успело сработать до
          // того, как список исчезнет
          onBlur={() => {
            blurTimer.current = setTimeout(() => setFocused(false), 150);
          }}
          onSubmitEditing={() => submit(value)}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Поиск объявлений"
        />
        {value.length > 0 && (
          <Pressable
            // Только текст в поле: выдача и история остаются, поле снова пустое
            onPress={() => {
              onChange('');
              field.current?.focus();
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Стереть текст"
            style={styles.clearText}
          >
            <Icon name="close" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {shown.length > 0 && (
        <View style={styles.dropdown}>
          {shown.map((item) => (
            <SuggestionRow
              key={`${item.type}-${item.label}`}
              icon={item.type === 'category' ? 'grid' : item.type === 'brand' ? 'tag' : 'search'}
              label={item.label}
              hint={item.type === 'category' ? 'категория' : undefined}
              onPress={() => pick(item)}
            />
          ))}
        </View>
      )}

      {showHistory && (
        <View style={styles.history}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Недавние запросы</Text>
            <Pressable
              onPress={() => void clearHistory()}
              accessibilityRole="button"
              accessibilityLabel="Очистить историю"
              hitSlop={10}
              style={({ pressed }) => [styles.historyClear, pressed && styles.pressed]}
            >
              <Text style={styles.historyClearLabel}>Очистить</Text>
            </Pressable>
          </View>
          {history.map((item) => (
            <View key={item} style={styles.historyRow}>
              <Pressable
                onPress={() => submit(item)}
                accessibilityRole="button"
                accessibilityLabel={`Искать: ${item}`}
                style={({ pressed }) => [styles.historyMain, pressed && styles.pressed]}
              >
                <Icon name="clock" size={16} color={colors.textFaint} />
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {item}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void forget(item)}
                accessibilityRole="button"
                accessibilityLabel={`Убрать из истории: ${item}`}
                hitSlop={8}
                style={({ pressed }) => [styles.historyRemove, pressed && styles.pressed]}
              >
                <Icon name="close" size={14} color={colors.textFaint} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function SuggestionRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Icon name={icon} size={14} color={colors.textFaint} />
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      {hint && <Text style={styles.rowHint}>{hint}</Text>}
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingLeft: spacing.lg,
      paddingRight: spacing.xs,
      minHeight: 48,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchBoxFocused: { borderColor: colors.primary },
    searchInput: { flex: 1, ...typography.body, color: colors.text, minHeight: 46 },
    clearText: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    dropdown: {
      marginTop: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
    },
    rowLabel: { ...typography.body, color: colors.text, flexShrink: 1, flex: 1 },
    rowHint: { ...typography.caption, color: colors.textFaint },

    // История — без общей рамки: заголовок и строки, разделённые воздухом
    history: { marginTop: spacing.md, gap: spacing.xs },
    historyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xs,
    },
    historyTitle: { ...typography.caption, color: colors.textMuted },
    historyClear: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.xs },
    historyClearLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    historyMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 46,
      paddingLeft: spacing.lg,
    },
    historyRemove: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
    pressed: { opacity: 0.85 },
  });
