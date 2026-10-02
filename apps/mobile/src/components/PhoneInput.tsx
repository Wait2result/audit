import { formatRuNational, ruMobileDigits } from '@dagestan/shared';
import { useState, useMemo } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MIN_TOUCH_SIZE, radius, spacing, typography, useThemeColors } from '../theme';

/**
 * Страны, чьи номера встречаются у пользователей приложения.
 *
 * Первым идёт +7 — как требует пункт 6 ТЗ. Остальные это соседи и страны,
 * откуда чаще всего приезжают гости республики. Список намеренно короткий:
 * двести стран в списке выбора мешают, а не помогают.
 */
const COUNTRIES = [
  { code: '7', flag: '🇷🇺', name: 'Россия', mask: '(999) 999-99-99', digits: 10 },
  { code: '994', flag: '🇦🇿', name: 'Азербайджан', mask: '(99) 999-99-99', digits: 9 },
  { code: '995', flag: '🇬🇪', name: 'Грузия', mask: '(999) 99-99-99', digits: 9 },
  { code: '374', flag: '🇦🇲', name: 'Армения', mask: '(99) 999-999', digits: 8 },
  { code: '90', flag: '🇹🇷', name: 'Турция', mask: '(999) 999-99-99', digits: 10 },
  { code: '998', flag: '🇺🇿', name: 'Узбекистан', mask: '(99) 999-99-99', digits: 9 },
  { code: '996', flag: '🇰🇬', name: 'Киргизия', mask: '(999) 999-999', digits: 9 },
  { code: '992', flag: '🇹🇯', name: 'Таджикистан', mask: '(99) 999-9999', digits: 9 },
] as const;

type Country = (typeof COUNTRIES)[number];

interface PhoneInputProps {
  /** Только цифры номера, без кода страны */
  value: string;
  onChangeValue: (digits: string) => void;
  country: Country;
  onChangeCountry: (country: Country) => void;
  error?: string | undefined;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  /**
   * Только российский мобильный: код +7 закреплён, выбора страны нет, номер
   * показывается как «950 123-45-67». Лишние «+7» и «8» в начале — при
   * наборе и при вставке из буфера — отбрасываются. Для контактного номера
   * объявления; вход по телефону остаётся со списком стран.
   */
  mobileOnly?: boolean;
  /**
   * Роль поля для автозаполнения системы. `username` — на экране входа: iOS
   * и Android связывают его с полем пароля и сохраняют пару «телефон +
   * пароль», а при автозаполнении подставляют именно телефон. `tel` —
   * обычный номер (регистрация, контакт объявления).
   */
  autofillAs?: 'username' | 'tel';
}

export const DEFAULT_COUNTRY: Country = COUNTRIES[0];

/** Собирает номер в международном формате: +79280000000 */
export function toE164(country: Country, digits: string): string {
  return `+${country.code}${digits}`;
}

/**
 * Ввод номера телефона с выбором страны (пункт 6 ТЗ).
 *
 * Пользователь вводит только цифры — код страны выбирается отдельно и не
 * стирается случайным нажатием на «стереть». Форматирование по маске делает
 * длинный номер читаемым: «(928) 000-00-00» вместо «9280000000».
 */
export function PhoneInput({
  value,
  onChangeValue,
  country,
  onChangeCountry,
  error,
  autoFocus,
  onSubmitEditing,
  mobileOnly = false,
  autofillAs = 'tel',
}: PhoneInputProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isPickerOpen, setPickerOpen] = useState(false);

  const handleChange = (text: string) => {
    // В поле телефона может прийти не номер: автозаполнение системы
    // вставляет сохранённый логин (почту, имя) целиком. Раньше из такого
    // текста выбрасывалось всё, кроме цифр, — и уже набранный номер
    // исчезал. Текст с буквами номер не меняет
    if (/[^\d\s()+\-.]/.test(text) && value.length > 0) return;

    if (mobileOnly) {
      // «89501234567», «+7 950 123-45-67», «79501234567» — всё сводится к
      // десяти цифрам после +7, второй «+7» или «8» в поле не попадает
      onChangeValue(ruMobileDigits(text));
      return;
    }

    // Оставляем только цифры: пользователь может вставить номер со скобками,
    // пробелами и дефисами — всё это нужно молча принять, а не ругаться
    let digits = text.replace(/\D/g, '');

    // Вставка целиком (например, из подсказки iOS над клавиатурой или из
    // буфера обмена) приходит вместе с кодом страны: «79502937729» вместо
    // «9502937729». Если цифр больше, чем в самом номере, — это он и есть,
    // и код страны (либо российское «8» вместо «+7») нужно отбросить,
    // а не просто обрезать номер по длине — иначе тёряется последняя цифра.
    if (digits.length > country.digits) {
      if (digits.startsWith(country.code)) {
        digits = digits.slice(country.code.length);
      } else if (country.code === '7' && digits.startsWith('8')) {
        digits = digits.slice(1);
      }
    }

    onChangeValue(digits.slice(0, country.digits));
  };

  return (
    <View style={styles.wrapper}>
      <View style={[styles.row, Boolean(error) && styles.rowError]}>
        <Pressable
          onPress={() => setPickerOpen(true)}
          disabled={mobileOnly}
          accessibilityRole={mobileOnly ? 'text' : 'button'}
          accessibilityLabel={`Код страны: ${country.name}, плюс ${country.code}`}
          style={({ pressed }) => [styles.countryButton, pressed && styles.pressed]}
        >
          <Text style={styles.flag}>{country.flag}</Text>
          <Text style={styles.countryCode}>+{country.code}</Text>
          {!mobileOnly && <Text style={styles.chevron}>⌄</Text>}
        </Pressable>

        <View style={styles.divider} />

        <TextInput
          value={mobileOnly ? formatRuNational(value) : formatByMask(value, country.mask)}
          onChangeText={handleChange}
          keyboardType="number-pad"
          textContentType={autofillAs === 'username' ? 'username' : 'telephoneNumber'}
          autoComplete={autofillAs === 'username' ? 'username' : 'tel'}
          placeholder={mobileOnly ? '900 000-00-00' : country.mask.replace(/9/g, '0')}
          placeholderTextColor={colors.textFaint}
          autoFocus={autoFocus}
          onSubmitEditing={onSubmitEditing}
          returnKeyType="done"
          accessibilityLabel="Номер телефона"
          style={styles.input}
        />
      </View>

      {error && (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}

      <Modal
        visible={isPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Код страны</Text>
            <Pressable
              onPress={() => setPickerOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>Готово</Text>
            </Pressable>
          </View>

          <FlatList
            data={COUNTRIES}
            keyExtractor={(item) => item.code + item.name}
            renderItem={({ item }) => {
              const isActive = item.code === country.code && item.name === country.name;

              return (
                <Pressable
                  onPress={() => {
                    onChangeCountry(item);
                    onChangeValue('');
                    setPickerOpen(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                  style={({ pressed }) => [
                    styles.countryRow,
                    isActive && styles.countryRowActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.flag}>{item.flag}</Text>
                  <Text style={styles.countryName}>{item.name}</Text>
                  <Text style={styles.countryCodeMuted}>+{item.code}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

/** Расставляет цифры по маске вида «(999) 999-99-99». */
function formatByMask(digits: string, mask: string): string {
  let result = '';
  let index = 0;

  for (const char of mask) {
    if (index >= digits.length) break;

    if (char === '9') {
      result += digits[index];
      index++;
    } else {
      result += char;
    }
  }

  return result;
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    wrapper: { gap: spacing.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    rowError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },

    countryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      minHeight: MIN_TOUCH_SIZE,
    },
    flag: { fontSize: 20 },
    countryCode: { ...typography.body, color: colors.text, fontWeight: '600' },
    chevron: { color: colors.textFaint, fontSize: 14, marginTop: -4 },

    divider: { width: 1, height: 24, backgroundColor: colors.border },

    input: {
      ...typography.body,
      flex: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      color: colors.text,
      letterSpacing: 0.4,
    },
    error: { ...typography.caption, color: colors.danger },
    pressed: { opacity: 0.7 },

    modal: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { ...typography.heading, color: colors.text },
    closeButton: {
      minHeight: MIN_TOUCH_SIZE,
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    closeText: { ...typography.subheading, color: colors.primary },

    countryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    countryRowActive: { backgroundColor: colors.primarySoft },
    countryName: { ...typography.body, color: colors.text, flex: 1 },
    countryCodeMuted: { ...typography.body, color: colors.textMuted },
  });

export type { Country };
