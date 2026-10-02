import type { ListingSuggestionDto } from '@dagestan/shared';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useListingSuggestions } from '../api/queries';
import { StorageKey, plainStorage } from '../api/storage';
import { radius, spacing, typography, useThemeColors } from '../theme';
import { Icon, type IconName } from './Icon';

/**
 * Строка поиска объявлений с подсказками и историей.
 *
 * Подсказки приходят с сервера по мере набора: категория, марка, популярный
 * запрос. Категория открывается сразу, а не ищется словом — «айфон» должен
 * привести в «Телефоны», а не в выдачу по совпадению букв. История — до
 * десяти последних запросов на устройстве: она показывается в пустом поле,
 * чтобы вчерашний поиск повторялся одним нажатием.
 */

const HISTORY_LIMIT = 10;

interface Props {
  value: string;
  onChange: (text: string) => void;
  /** Человек нажал «Найти» или выбрал подсказку — запрос попадает в историю */
  onSubmit: (text: string) => void;
  onOpenCategory: (slug: string) => void;
  cityId: string | null;
  placeholder?: string;
}

export function ListingSearchBox({
  value,
  onChange,
  onSubmit,
  onOpenCategory,
  cityId,
  placeholder = 'Поиск объявлений',
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  // Подсказки не мигают на каждую букву: запрос уходит с задержкой
  const [needle, setNeedle] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setNeedle(value.trim()), 250);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    void plainStorage.get(StorageKey.LISTING_SEARCH_HISTORY).then((raw) => {
      if (!raw) return;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed.filter((item) => typeof item === 'string'));
      } catch {
        // Испорченная запись — просто пустая история
      }
    });
  }, []);

  const suggestions = useListingSuggestions(cityId, focused ? needle : '');

  const remember = (text: string) => {
    const clean = text.trim();
    if (clean.length < 2) return;
    const next = [clean, ...history.filter((item) => item !== clean)].slice(0, HISTORY_LIMIT);
    setHistory(next);
    void plainStorage.set(StorageKey.LISTING_SEARCH_HISTORY, JSON.stringify(next));
  };

  const clearHistory = () => {
    setHistory([]);
    void plainStorage.remove(StorageKey.LISTING_SEARCH_HISTORY);
  };

  const submit = (text: string) => {
    remember(text);
    onChange(text);
    onSubmit(text);
    setFocused(false);
  };

  const pick = (item: ListingSuggestionDto) => {
    if (item.type === 'category' && item.categorySlug) {
      remember(value);
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
      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.textFaint} />
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          // Задержка — чтобы нажатие по подсказке успело сработать до того,
          // как список исчезнет
          onBlur={() => setTimeout(() => setFocused(false), 150)}
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
            onPress={() => {
              onChange('');
              onSubmit('');
            }}
            hitSlop={10}
            accessibilityLabel="Очистить"
          >
            <Icon name="close" size={16} color={colors.textFaint} />
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
        <View style={styles.dropdown}>
          {history.map((item) => (
            <SuggestionRow key={item} icon="clock" label={item} onPress={() => submit(item)} />
          ))}
          <Pressable
            onPress={clearHistory}
            accessibilityRole="button"
            style={({ pressed }) => [styles.clearRow, pressed && styles.pressed]}
          >
            <Text style={styles.clearLabel}>Очистить историю</Text>
          </Pressable>
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
      paddingHorizontal: spacing.lg,
      minHeight: 46,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: { flex: 1, ...typography.body, color: colors.text },
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
    clearRow: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    clearLabel: { ...typography.caption, color: colors.textMuted },
    pressed: { opacity: 0.85 },
  });
