import {
  PART_NUMBER_HINT,
  PART_NUMBER_LABEL,
  PART_REPLACEMENTS_HINT,
  PART_REPLACEMENTS_LABEL,
  mainPartNumberKind,
  partNumberKey,
  catalogLayer,
  type CatalogLayer,
  type ListingPartDto,
  type ListingPartInput,
  type PartNumberKind,
  type PartsEquipment,
} from '@dagestan/shared';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useDictionary } from '../api/queries';
import { radius, spacing, typography, useThemeColors } from '../theme';
import { Icon } from './Icon';
import { Field, createStyles as createFieldStyles } from './ListingFormFields';
import { SearchableSelect } from './SearchableSelect';

/**
 * Номера и совместимость запчасти — слой объявления, а не обычные
 * характеристики: у детали несколько номеров и она подходит к нескольким
 * машинам. Форма подачи и форма правки показывают этот редактор для
 * подкатегорий запчастей и больше нигде.
 *
 * Марка и модель берутся из тех же справочников, что у самой техники
 * (`car_brand`, `phone_model` …); где справочника нет — свободный текст.
 */

const MAX_NUMBERS = 10;
const MAX_ROWS = 30;

export interface PartNumberRow {
  kind: PartNumberKind;
  value: string;
}

export interface CompatibilityRow {
  brand: string;
  model: string;
  chassis: string;
  yearFrom: string;
  yearTo: string;
  engine: string;
  modification: string;
}

/** Состояние редактора: строки хранятся текстом, как их печатает человек. */
export interface PartLayerValue {
  numbers: PartNumberRow[];
  compatibility: CompatibilityRow[];
}

export const emptyPartLayer = (): PartLayerValue => ({ numbers: [], compatibility: [] });

const emptyRow = (): CompatibilityRow => ({
  brand: '',
  model: '',
  chassis: '',
  yearFrom: '',
  yearTo: '',
  engine: '',
  modification: '',
});

/** Слой с сервера (правка объявления) → состояние редактора. */
export function partLayerFromDto(part: ListingPartDto | null | undefined): PartLayerValue {
  if (!part) return emptyPartLayer();
  return {
    numbers: part.numbers.map((number) => ({ kind: number.kind, value: number.value })),
    compatibility: part.compatibility.map((row) => ({
      brand: row.brand ?? '',
      model: row.model ?? '',
      chassis: row.chassis ?? '',
      yearFrom: row.yearFrom !== null ? String(row.yearFrom) : '',
      yearTo: row.yearTo !== null ? String(row.yearTo) : '',
      engine: row.engine ?? '',
      modification: row.modification ?? '',
    })),
  };
}

const yearOf = (text: string): number | undefined => {
  const year = Number(text.trim());
  return Number.isInteger(year) && year > 0 ? year : undefined;
};

const rowIsEmpty = (row: CompatibilityRow) =>
  !row.brand &&
  !row.model &&
  !row.chassis &&
  !row.engine &&
  !row.modification &&
  !row.yearFrom &&
  !row.yearTo;

/**
 * Текст ошибки или null. Пустые строки пропускаются — их при отправке просто
 * не будет; а строка только с годами или годы наоборот — нет.
 */
export function partLayerError(value: PartLayerValue): string | null {
  for (const number of value.numbers) {
    if (number.value.trim() && partNumberKey(number.value).length < 3) {
      return `Номер «${number.value.trim()}» слишком короткий`;
    }
  }
  for (const row of value.compatibility) {
    if (rowIsEmpty(row)) continue;
    if (!row.brand && !row.model && !row.chassis && !row.engine && !row.modification) {
      return 'В строке совместимости укажите марку, модель, кузов или двигатель';
    }
    const from = yearOf(row.yearFrom);
    const to = yearOf(row.yearTo);
    if ((row.yearFrom && from === undefined) || (row.yearTo && to === undefined)) {
      return 'Год — число, например 2014';
    }
    if (from !== undefined && to !== undefined && from > to) {
      return 'Год «от» больше года «до»';
    }
  }
  return null;
}

/**
 * Состояние редактора → тело запроса `part`. Вид основного номера человек не
 * выбирает — он следует из оригинальности детали: у оригинала это номер
 * производителя машины (OEM), у аналога — номер производителя детали.
 */
export function partLayerToInput(value: PartLayerValue, originality?: unknown): ListingPartInput {
  const main = mainPartNumberKind(originality);
  return {
    numbers: value.numbers
      .filter((number) => number.value.trim() !== '')
      .map((number) => ({
        kind:
          number.kind === 'replacement' || number.kind === 'catalog' || originality === undefined
            ? number.kind
            : main,
        value: number.value.trim(),
      })),
    compatibility: value.compatibility
      .filter((row) => !rowIsEmpty(row))
      .map((row) => {
        const yearFrom = yearOf(row.yearFrom);
        const yearTo = yearOf(row.yearTo);
        return {
          ...(row.brand.trim() ? { brand: row.brand.trim() } : {}),
          ...(row.model.trim() ? { model: row.model.trim() } : {}),
          ...(row.chassis.trim() ? { chassis: row.chassis.trim() } : {}),
          ...(row.engine.trim() ? { engine: row.engine.trim() } : {}),
          ...(row.modification.trim() ? { modification: row.modification.trim() } : {}),
          ...(yearFrom !== undefined ? { yearFrom } : {}),
          ...(yearTo !== undefined ? { yearTo } : {}),
        };
      }),
  };
}

/**
 * Техника из заголовка («Рулевая рейка Toyota Succeed NCP165») — предложение
 * для первой строки «Подходит к». Сама не записывается: продавец нажимает
 * «Добавить» или «Изменить» и видит строку перед сохранением.
 */
export interface CompatibilitySuggestion {
  /** «Toyota Succeed · NCP165 · 2015» */
  label: string;
  row: CompatibilityRow;
}

/** Строка уже есть среди введённых — предлагать её снова незачем. */
export function hasCompatibilityRow(value: PartLayerValue, row: CompatibilityRow): boolean {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return value.compatibility.some(
    (item) =>
      same(item.brand, row.brand) && same(item.model, row.model) && same(item.chassis, row.chassis),
  );
}

/** Это подкатегория запчастей (есть редактор слоя)? */
/**
 * Есть ли у подкатегории слой: у запчастей — номера и «Подходит к», у
 * направлений с совместимостью (коврики, магнитолы, чехлы) — только «Подходит к».
 */
export const isPartsLeaf = (slug: string | null | undefined): boolean =>
  catalogLayer(slug) !== null;

export function PartLayerEditor({
  slug,
  value,
  onChange,
  error,
  suggestion,
  onDismissSuggestion,
}: {
  slug: string;
  value: PartLayerValue;
  onChange: (value: PartLayerValue) => void;
  error?: string | null;
  suggestion?: CompatibilitySuggestion | null;
  onDismissSuggestion?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Строка, добавленная кнопкой «Изменить», подсвечена: её сейчас и правят
  const [focused, setFocused] = useState<number | null>(null);
  const layer = catalogLayer(slug);
  if (!layer) return null;
  const equipment = layer.equipment;

  const acceptSuggestion = (edit: boolean) => {
    if (!suggestion) return;
    onChange({ ...value, compatibility: [suggestion.row, ...value.compatibility] });
    setFocused(edit ? 0 : null);
    onDismissSuggestion?.();
  };

  const setRow = (index: number, patch: Partial<CompatibilityRow>) =>
    onChange({
      ...value,
      compatibility: value.compatibility.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    });

  return (
    <View style={styles.wrap}>
      {layer.numbers && (
        <>
          {/* ── Номер запчасти / артикул ─────────────────────────────── */}
          <Text style={styles.title}>{PART_NUMBER_LABEL}</Text>
          <Text style={styles.hint}>{PART_NUMBER_HINT}. Например, 45510-52010 или 333388.</Text>
          <NumberList
            rows={value.numbers}
            replacement={false}
            onChange={(numbers) => onChange({ ...value, numbers })}
            addLabel="Добавить ещё номер"
            placeholder="Например, 45510-52010"
          />

          {/* ── Номера замен ─────────────────────────────────────────── */}
          <Text style={[styles.title, styles.titleGap]}>{PART_REPLACEMENTS_LABEL}</Text>
          <Text style={styles.hint}>
            {PART_REPLACEMENTS_HINT}. Укажите, только если знаете их точно.
          </Text>
          <NumberList
            rows={value.numbers}
            replacement
            onChange={(numbers) => onChange({ ...value, numbers })}
            addLabel="Добавить номер замены"
            placeholder="Например, 45510-52011"
          />
        </>
      )}

      {/* ── Совместимость ──────────────────────────────────────────── */}
      <Text style={[styles.title, styles.titleGap]}>Подходит к</Text>
      {suggestion && (
        <View style={styles.suggestion}>
          <Text style={styles.suggestionText}>Добавить {suggestion.label} в совместимость?</Text>
          <View style={styles.suggestionActions}>
            <Pressable
              onPress={() => acceptSuggestion(false)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.suggestionPrimary, pressed && styles.pressed]}
            >
              <Text style={styles.suggestionPrimaryLabel}>Добавить</Text>
            </Pressable>
            <Pressable
              onPress={() => acceptSuggestion(true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.suggestionSecondary, pressed && styles.pressed]}
            >
              <Text style={styles.suggestionSecondaryLabel}>Изменить</Text>
            </Pressable>
            <Pressable
              onPress={onDismissSuggestion}
              accessibilityRole="button"
              accessibilityLabel="Не добавлять"
              hitSlop={12}
              style={styles.suggestionClose}
            >
              <Icon name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      )}
      <Text style={styles.hint}>
        {equipment.brandKind
          ? 'Марка и модель — из справочника техники. Строк может быть несколько.'
          : 'Впишите, к чему подходит деталь. Строк может быть несколько.'}
      </Text>
      {value.compatibility.map((row, index) => (
        <View
          key={`compat-${index}`}
          style={[styles.card, focused === index && styles.cardFocused]}
        >
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Вариант {index + 1}</Text>
            <RemoveButton
              label={`Убрать вариант ${index + 1}`}
              onPress={() => {
                onChange({
                  ...value,
                  compatibility: value.compatibility.filter((_, i) => i !== index),
                });
                setFocused(null);
              }}
            />
          </View>
          <CompatibilityRowFields
            equipment={equipment}
            flags={layer.compat}
            row={row}
            onChange={(patch) => setRow(index, patch)}
          />
        </View>
      ))}
      {value.compatibility.length < MAX_ROWS && (
        <AddButton
          label="Добавить, к чему подходит"
          onPress={() =>
            onChange({ ...value, compatibility: [...value.compatibility, emptyRow()] })
          }
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function CompatibilityRowFields({
  equipment,
  flags,
  row,
  onChange,
}: {
  equipment: PartsEquipment;
  flags: CatalogLayer['compat'];
  row: CompatibilityRow;
  onChange: (patch: Partial<CompatibilityRow>) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const brands = useDictionary(equipment.brandKind, null);
  const models = useDictionary(equipment.modelKind, row.brand || null);
  const brandOptions = brands.data ?? [];
  const modelOptions = row.brand ? (models.data ?? []) : [];

  return (
    <View style={styles.rowFields}>
      {brandOptions.length > 0 ? (
        <SearchableSelect
          label={equipment.brandLabel}
          value={row.brand || undefined}
          options={brandOptions}
          // Марка сменилась — модель прежней марки не остаётся
          onChange={(next) => onChange({ brand: next ?? '', model: '' })}
          clearLabel="Не указывать"
        />
      ) : (
        <Field label={equipment.brandLabel}>
          <TextInput
            value={row.brand}
            onChangeText={(text) => onChange({ brand: text })}
            placeholder="Впишите марку"
            placeholderTextColor={colors.textFaint}
            maxLength={80}
            style={styles.input}
            accessibilityLabel={equipment.brandLabel}
          />
        </Field>
      )}

      {modelOptions.length > 0 ? (
        <SearchableSelect
          label="Модель"
          value={row.model || undefined}
          options={modelOptions}
          onChange={(next) => onChange({ model: next ?? '' })}
          allowCustom
          placeholder="Выберите или впишите модель"
        />
      ) : (
        <Field label="Модель">
          <TextInput
            value={row.model}
            onChangeText={(text) => onChange({ model: text })}
            placeholder={
              equipment.brandKind && !row.brand ? 'Сначала выберите марку' : 'Впишите модель'
            }
            placeholderTextColor={colors.textFaint}
            maxLength={80}
            style={styles.input}
            accessibilityLabel="Модель"
          />
        </Field>
      )}

      {flags.chassis && (
        <Field label="Номер кузова">
          <TextInput
            value={row.chassis}
            onChangeText={(text) => onChange({ chassis: text })}
            placeholder="Например, NCP165"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={40}
            style={styles.input}
            accessibilityLabel="Номер кузова"
          />
        </Field>
      )}
      {flags.engine && (
        <Field label="Номер двигателя">
          <TextInput
            value={row.engine}
            onChangeText={(text) => onChange({ engine: text })}
            placeholder="Например, 1NZ-FE"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={60}
            style={styles.input}
            accessibilityLabel="Номер двигателя"
          />
        </Field>
      )}
      {flags.modification && (
        <Field label="Модификация">
          <TextInput
            value={row.modification}
            onChangeText={(text) => onChange({ modification: text })}
            placeholder="Например, 1.5 4WD или Pro Max"
            placeholderTextColor={colors.textFaint}
            maxLength={120}
            style={styles.input}
            accessibilityLabel="Модификация"
          />
        </Field>
      )}
      {flags.year && (
        <View style={styles.years}>
          <View style={styles.year}>
            <Field label="Год от">
              <TextInput
                value={row.yearFrom}
                onChangeText={(text) => onChange({ yearFrom: text.replace(/\D/g, '').slice(0, 4) })}
                placeholder="2014"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                style={styles.input}
                accessibilityLabel="Год от"
              />
            </Field>
          </View>
          <View style={styles.year}>
            <Field label="Год до">
              <TextInput
                value={row.yearTo}
                onChangeText={(text) => onChange({ yearTo: text.replace(/\D/g, '').slice(0, 4) })}
                placeholder="2020"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                style={styles.input}
                accessibilityLabel="Год до"
              />
            </Field>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * Список номеров одного рода: основные («Номер запчасти / артикул») или
 * номера замен. Оба рода живут в одном массиве слоя; здесь показаны и
 * правятся только свои строки, порядок остальных не меняется.
 */
function NumberList({
  rows,
  replacement,
  onChange,
  addLabel,
  placeholder,
}: {
  rows: PartNumberRow[];
  replacement: boolean;
  onChange: (rows: PartNumberRow[]) => void;
  addLabel: string;
  placeholder: string;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const own = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => (row.kind === 'replacement') === replacement);
  const title = replacement ? 'Номер замены' : 'Номер';
  return (
    <>
      {own.map(({ row, index }, position) => (
        <View key={`${replacement ? 'replacement' : 'number'}-${index}`} style={styles.numberRow}>
          <TextInput
            value={row.value}
            onChangeText={(text) =>
              onChange(rows.map((item, i) => (i === index ? { ...item, value: text } : item)))
            }
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={60}
            accessibilityLabel={`${title} ${position + 1}`}
            style={[styles.input, styles.numberInput]}
          />
          <RemoveButton
            label={`Убрать: ${title.toLowerCase()} ${position + 1}`}
            onPress={() => onChange(rows.filter((_, i) => i !== index))}
          />
        </View>
      ))}
      {rows.length < MAX_NUMBERS && (
        <AddButton
          label={own.length === 0 ? (replacement ? addLabel : 'Указать номер') : addLabel}
          onPress={() =>
            onChange([...rows, { kind: replacement ? 'replacement' : 'article', value: '' }])
          }
        />
      )}
    </>
  );
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.add, pressed && styles.pressed]}
    >
      <Icon name="plus" size={16} color={colors.primary} />
      <Text style={styles.addLabel}>{label}</Text>
    </Pressable>
  );
}

function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={12}>
      <Icon name="trash" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) => {
  const fieldStyles = createFieldStyles(colors);
  return StyleSheet.create({
    wrap: { gap: spacing.md },
    pressed: { opacity: 0.85 },
    title: { ...typography.subheading, color: colors.text },
    titleGap: { marginTop: spacing.md },
    hint: { ...typography.caption, color: colors.textMuted },
    card: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceMuted,
    },
    cardFocused: { borderWidth: 1, borderColor: colors.primary },
    suggestion: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.primarySoft,
    },
    suggestionText: { ...typography.body, color: colors.text },
    suggestionActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    suggestionPrimary: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
    },
    suggestionPrimaryLabel: {
      ...typography.caption,
      color: colors.textOnPrimary,
      fontWeight: '600',
    },
    suggestionSecondary: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    suggestionSecondaryLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    suggestionClose: { marginLeft: 'auto' },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
    rowFields: { gap: spacing.md },
    years: { flexDirection: 'row', gap: spacing.md },
    year: { flex: 1 },
    input: fieldStyles.input,
    numberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    numberInput: { flex: 1 },
    add: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.primary,
      borderStyle: 'dashed',
    },
    addLabel: { ...typography.body, color: colors.primary, fontWeight: '600' },
    error: { ...typography.caption, color: colors.danger },
  });
};
