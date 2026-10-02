import { useState, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackground } from '../../src/components/AppBackground';
import { Icon } from '../../src/components/Icon';
import { useCityStore } from '../../src/store/city-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';

/**
 * Поиск по приложению (пункт 9 ТЗ).
 *
 * Каркас: поле ввода и подсказки по разделам. Настоящий поиск появится
 * вместе с содержимым — искать пока попросту нечего: заведения, объявления
 * и новости добавляются на следующих этапах.
 *
 * Экран сделан сейчас, чтобы нижняя навигация была живой с самого начала
 * и чтобы форма поиска не переделывалась потом под каждый новый раздел.
 */

const SUGGESTIONS = [
  'Рестораны рядом',
  'Что посмотреть в кино',
  'Квартира посуточно',
  'Попутчики в Дербент',
  'Доставка еды',
];

export default function SearchScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const cityName = useCityStore((s) => s.cityName);

  const [query, setQuery] = useState('');

  return (
    <View style={styles.root}>
      <AppBackground />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Поиск</Text>

        <View style={styles.searchField}>
          <Icon name="search" size={20} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={cityName ? `Искать в городе ${cityName}` : 'Что ищете?'}
            placeholderTextColor={colors.textFaint}
            returnKeyType="search"
            accessibilityLabel="Строка поиска"
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Очистить"
              hitSlop={10}
            >
              <Text style={styles.clear}>✕</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Часто ищут</Text>

          <View style={styles.chips}>
            {SUGGESTIONS.map((item) => (
              <Pressable
                key={item}
                onPress={() => setQuery(item)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
              >
                <Text style={styles.chipText}>{item}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Поиск заработает вместе с содержимым</Text>
          <Text style={styles.noticeText}>
            Сейчас в приложении есть города и аккаунты. Заведения, афиша, новости и объявления
            появятся на следующих этапах — тогда поиск начнёт находить их все сразу.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },

    title: { ...typography.title, color: colors.text },

    searchField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 52,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: { ...typography.body, flex: 1, color: colors.text, paddingVertical: spacing.md },
    clear: { fontSize: 16, color: colors.textFaint, padding: spacing.xs },

    section: { gap: spacing.md },
    sectionTitle: { ...typography.subheading, color: colors.text },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceMuted,
      minHeight: 44,
      justifyContent: 'center',
    },
    chipText: { ...typography.caption, color: colors.text },

    notice: {
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceMuted,
    },
    noticeTitle: { ...typography.subheading, color: colors.text },
    noticeText: { ...typography.caption, color: colors.textMuted, lineHeight: 19 },

    pressed: { opacity: 0.7 },
  });
