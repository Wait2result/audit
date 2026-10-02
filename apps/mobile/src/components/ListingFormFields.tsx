import {
  RENT_PERIOD_LABELS,
  TRANSACTION_CREATE_LABELS,
  pluralize,
  type ListingAttribute,
  type ListingCategoryDto,
  type ListingRentPeriod,
  type ListingTransactionType,
} from '@dagestan/shared';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useDictionary } from '../api/queries';
import { radius, spacing, typography, useThemeColors } from '../theme';
import { SearchableSelect } from './SearchableSelect';

/**
 * Поля формы объявления — общие для подачи (`listings/new.tsx`) и правки
 * (`listings/edit/[id].tsx`).
 *
 * Вынесены в отдельный файл, а не продублированы: у характеристик уже была
 * одна пойманная ловушка (запятая как десятичный разделитель, которую
 * `Number()` не понимает) — если бы форма подачи и форма правки хранили
 * каждая свою копию, исправление одной не спасло бы от той же ошибки в
 * другой. Одно место правки — и обе формы не могут разойтись.
 */

/** Подпись и поле под ней — общая обёртка, чтобы отступы не расходились. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

/**
 * Значение поля строкой. Отдельной функцией, потому что тип значения —
 * unknown: массив или объект превратился бы в «[object Object]» прямо в
 * поле ввода.
 */
export function plainValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  return '';
}

/** Значение заполнено: ноль и «нет» — это тоже ответы. */
export function hasValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '';
}

/**
 * Сообщение о нехватке символов — «Ещё 3 символа» — или пусто, если длины
 * уже достаточно. Одно место формулировки на все поля с минимальной длиной:
 * заголовок, описание, телефон.
 */
export function minLengthError(value: string, min: number): string | undefined {
  const left = min - value.trim().length;
  if (left <= 0) return undefined;

  return `Ещё ${pluralize(left, 'символ', 'символа', 'символов')}`;
}

/** Ряд кнопок-вариантов: один выбор или несколько. */
export function OptionChips({
  options,
  selected,
  onToggle,
}: {
  options: readonly { value: string; label: string }[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.options}>
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <Pressable
              key={option.value}
              onPress={() => onToggle(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.option,
                active && styles.optionActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

/**
 * Поле характеристики. Вид зависит от типа: перечисление — ряд кнопок,
 * число — цифровая клавиатура, флажок — переключатель, марка — список с
 * поиском, модель — список по выбранной марке.
 *
 * Те же описания полей, по которым строятся фильтры и проверка на сервере:
 * одно место правки, и форма не может разойтись с тем, что сервер примет.
 * `values` — все значения формы: поле-модель смотрит на поле-марку.
 */
export function AttributeField({
  field,
  value,
  values,
  onChange,
}: {
  field: ListingAttribute;
  value: unknown;
  values: Record<string, unknown>;
  onChange: (value: unknown) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const label = field.required ? `${field.label} *` : field.label;

  if (field.type === 'boolean') {
    return (
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{label}</Text>
        <Switch value={value === true} onValueChange={onChange} />
      </View>
    );
  }

  if (field.type === 'model' && field.dictionary) {
    return (
      <DictionaryField
        field={field}
        label={label}
        value={value}
        parent={field.parentKey ? values[field.parentKey] : undefined}
        onChange={onChange}
      />
    );
  }

  if ((field.type === 'enum' || field.type === 'brand') && field.options) {
    // Длинный список (марка — полсотни с лишним значений) чипсами в ряд не
    // пролистать по-человечески — переключаемся на модальный поиск. Короткие
    // списки (коробка передач) остаются чипсами: для них лишний тап на
    // открытие модалки — не польза, а помеха
    if (field.options.length > 8) {
      return (
        <SearchableSelect
          label={label}
          value={typeof value === 'string' ? value : undefined}
          options={field.options}
          onChange={onChange}
        />
      );
    }

    return (
      <Field label={label}>
        <OptionChips
          options={field.options}
          selected={typeof value === 'string' ? [value] : []}
          onToggle={(next) => onChange(value === next ? undefined : next)}
        />
      </Field>
    );
  }

  if (field.type === 'multiEnum' && field.options) {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <Field label={label}>
        <OptionChips
          options={field.options}
          selected={selected}
          onToggle={(next) => {
            const list = selected.includes(next)
              ? selected.filter((item) => item !== next)
              : [...selected, next];
            onChange(list.length > 0 ? list : undefined);
          }}
        />
      </Field>
    );
  }

  const numeric = field.type === 'number' || field.type === 'date';

  return (
    <Field label={field.unit ? `${label}, ${field.unit}` : label}>
      <TextInput
        value={plainValue(value)}
        onChangeText={(text) =>
          onChange(
            numeric
              ? // Запятая — привычный десятичный разделитель («54,5» м²), но
                // сервер разбирает число через Number(), для которого запятая
                // не разделитель, а мусор: "54,5" превратится в NaN
                text.replace(/[^\d.,]/g, '').replace(',', '.')
              : text,
          )
        }
        placeholder={numeric ? '0' : 'Введите значение'}
        placeholderTextColor={colors.textFaint}
        keyboardType={numeric ? 'numeric' : 'default'}
        accessibilityLabel={field.label}
        style={styles.input}
      />
    </Field>
  );
}

/**
 * Поле по справочнику с родителем: модель по выбранной марке. Пока марка не
 * выбрана или у неё нет моделей в справочнике («Другая марка»), это обычное
 * текстовое поле, а не тупик. Свою модель вписать можно и при известной
 * марке: справочник подсказывает, а не запрещает.
 */
function DictionaryField({
  field,
  label,
  value,
  parent,
  onChange,
}: {
  field: ListingAttribute;
  label: string;
  value: unknown;
  parent: unknown;
  onChange: (value: unknown) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const parentValue = typeof parent === 'string' ? parent : null;
  const entries = useDictionary(parentValue ? field.dictionary : undefined, parentValue);
  const options = entries.data ?? [];

  if (options.length > 0) {
    return (
      <SearchableSelect
        label={label}
        value={typeof value === 'string' ? value : undefined}
        options={options}
        onChange={onChange}
        allowCustom
        placeholder={`Выберите или впишите: ${field.label.toLowerCase()}`}
      />
    );
  }

  return (
    <Field label={label}>
      <TextInput
        value={plainValue(value)}
        onChangeText={onChange}
        placeholder={parentValue ? 'Впишите вручную' : `Сначала выберите: марка`}
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        accessibilityLabel={field.label}
      />
    </Field>
  );
}

export interface DealValue {
  transactionType: ListingTransactionType | null;
  rentPeriod: ListingRentPeriod | null;
}

/**
 * Нужен ли категории отдельный выбор сделки: несколько вариантов («продам /
 * сдам») или аренда, у которой надо уточнить срок.
 */
export function needsDealChoice(
  category: Pick<ListingCategoryDto, 'transactions' | 'priceUnits' | 'defaultRentPeriod'>,
): boolean {
  if (category.transactions.length > 1) return true;
  return category.transactions.includes('rent') && needsRentPeriod(category);
}

export function needsRentPeriod(
  category: Pick<ListingCategoryDto, 'priceUnits' | 'defaultRentPeriod'>,
): boolean {
  if (category.defaultRentPeriod) return false;
  return category.priceUnits.includes('per_day') && category.priceUnits.includes('per_month');
}

/** Сделка по умолчанию для категории: одна возможная или умолчание категории. */
export function defaultDeal(
  category: Pick<
    ListingCategoryDto,
    'transactions' | 'defaultTransaction' | 'defaultRentPeriod' | 'priceUnits'
  >,
): DealValue {
  const transactionType =
    category.transactions.length === 1
      ? (category.transactions[0] ?? null)
      : (category.defaultTransaction ?? null);
  const rentPeriod = transactionType === 'rent' ? (category.defaultRentPeriod ?? null) : null;
  return { transactionType, rentPeriod };
}

/**
 * Выбор сделки при подаче: «Продам / Сдам», для аренды — «Надолго / Посуточно».
 * Подписи — глазами продавца; покупатель на экране поиска видит «Купить /
 * Снять», но значение под ними одно.
 */
export function DealPicker({
  category,
  value,
  onChange,
}: {
  category: Pick<ListingCategoryDto, 'transactions' | 'priceUnits' | 'defaultRentPeriod'>;
  value: DealValue;
  onChange: (value: DealValue) => void;
}) {
  const options = category.transactions.map((type) => ({
    value: type,
    label: TRANSACTION_CREATE_LABELS[type],
  }));
  const periodOptions = (['monthly', 'daily'] as ListingRentPeriod[]).map((period) => ({
    value: period,
    label: RENT_PERIOD_LABELS[period],
  }));

  return (
    <>
      {options.length > 1 && (
        <Field label="Что вы делаете *">
          <OptionChips
            options={options}
            selected={value.transactionType ? [value.transactionType] : []}
            onToggle={(next) =>
              onChange({
                transactionType: next as ListingTransactionType,
                rentPeriod: next === 'rent' ? value.rentPeriod : null,
              })
            }
          />
        </Field>
      )}

      {value.transactionType === 'rent' && needsRentPeriod(category) && (
        <Field label="На какой срок *">
          <OptionChips
            options={periodOptions}
            selected={value.rentPeriod ? [value.rentPeriod] : []}
            onToggle={(next) => onChange({ ...value, rentPeriod: next as ListingRentPeriod })}
          />
        </Field>
      )}
    </>
  );
}

/** Выбор сделки сделан полностью: сама сделка и срок аренды, если он нужен. */
export function dealComplete(
  category: Pick<ListingCategoryDto, 'transactions' | 'priceUnits' | 'defaultRentPeriod'>,
  value: DealValue,
): boolean {
  if (category.transactions.length === 0) return true;
  if (!value.transactionType) return false;
  if (value.transactionType === 'rent' && needsRentPeriod(category) && !value.rentPeriod) {
    return false;
  }
  return true;
}

export const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    pressed: { opacity: 0.85 },

    field: { gap: 6 },
    fieldLabel: { ...typography.caption, color: colors.textMuted },
    input: {
      ...typography.body,
      color: colors.text,
      paddingHorizontal: spacing.lg,
      minHeight: 48,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    textarea: { minHeight: 120, paddingTop: spacing.md, textAlignVertical: 'top' },
    readonly: {
      ...typography.body,
      color: colors.text,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
    },
    hint: { ...typography.caption, color: colors.textMuted },

    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
    },
    switchLabel: { ...typography.body, color: colors.text, flex: 1 },

    options: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
    option: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    optionLabel: { ...typography.caption, color: colors.textMuted },
    optionLabelActive: { color: colors.textOnPrimary, fontWeight: '600' },
  });
