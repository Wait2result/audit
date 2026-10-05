import {
  PART_NUMBER_KIND_LABELS,
  attributeValueLabel,
  type ListingAttribute,
  type ListingCompatibilityDto,
  type ListingPartDto,
} from '@dagestan/shared';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing, typography, useThemeColors } from '../theme';

/**
 * Запчасть на экране объявления: что за деталь (производитель, тип,
 * состояние, номера) и к чему подходит. Совместимость — то, ради чего
 * человек открыл объявление, поэтому блок стоит сразу после описания.
 */

/** Поля детали, которые показывает этот блок, а не «Характеристики». */
export const PART_BLOCK_KEYS: ReadonlySet<string> = new Set([
  'partGroup',
  'partItem',
  'partManufacturer',
  'partOriginality',
  'partCondition',
]);

/** Сколько строк совместимости видно сразу; остальные — по «Показать все». */
const VISIBLE_ROWS = 5;

function yearsText(row: ListingCompatibilityDto): string | null {
  if (row.yearFrom !== null && row.yearTo !== null) {
    return row.yearFrom === row.yearTo ? String(row.yearFrom) : `${row.yearFrom}–${row.yearTo}`;
  }
  if (row.yearFrom !== null) return `с ${row.yearFrom}`;
  if (row.yearTo !== null) return `до ${row.yearTo}`;
  return null;
}

/** «Toyota Succeed NCP165» — техника строкой. */
export function compatibilityTitle(row: ListingCompatibilityDto): string {
  return [row.brandLabel ?? row.brand, row.modelLabel ?? row.model, row.chassis]
    .filter(Boolean)
    .join(' ');
}

/** «2015–2020 · 1NZ-FE · 1.5 4WD» — уточнения под техникой. */
export function compatibilityDetails(row: ListingCompatibilityDto): string {
  return [yearsText(row), row.engine, row.modification].filter(Boolean).join(' · ');
}

/** Одной строкой для подписи: «Toyota Succeed NCP165 · 2015–2020 · 1NZ-FE». */
export function compatibilityLine(row: ListingCompatibilityDto): string {
  return [compatibilityTitle(row), compatibilityDetails(row)].filter(Boolean).join(' · ');
}

export function PartBlock({
  part,
  attributes,
  values,
  labels,
  showPart = true,
}: {
  /** Блок «Запчасть» — только у запчастей; у коврика или магнитолы — лишь «Подходит к» */
  showPart?: boolean;
  part: ListingPartDto | null;
  attributes: readonly ListingAttribute[];
  values: Record<string, unknown>;
  labels: Record<string, string>;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showAll, setShowAll] = useState(false);

  const label = (key: string): string | null => {
    const attribute = attributes.find((item) => item.key === key);
    const value = values[key];
    if (!attribute || value === undefined || value === null || value === '') return null;
    return attributeValueLabel(attribute, value, labels) || null;
  };

  // Название детали — деталь, а если её нет, категория детали
  const name = label('partItem') ?? label('partGroup');
  const facts = [
    { title: 'Производитель', value: label('partManufacturer') },
    { title: 'Тип', value: label('partOriginality') },
    { title: 'Состояние', value: label('partCondition') },
  ].filter((fact): fact is { title: string; value: string } => fact.value !== null);
  const numbers = part?.numbers ?? [];
  const rows = part?.compatibility ?? [];
  const visibleRows = showAll ? rows : rows.slice(0, VISIBLE_ROWS);

  if (!name && facts.length === 0 && numbers.length === 0 && rows.length === 0) return null;

  return (
    <>
      {showPart && (name || facts.length > 0 || numbers.length > 0) && (
        <>
          <Text style={styles.sectionTitle}>Запчасть</Text>
          {name && <Text style={styles.name}>{name}</Text>}
          <View>
            {facts.map((fact) => (
              <View key={fact.title} style={styles.row}>
                <Text style={styles.label}>{fact.title}</Text>
                <Text style={styles.value}>{fact.value}</Text>
              </View>
            ))}
            {numbers.map((number, index) => (
              <View key={`number-${index}`} style={styles.row}>
                <Text style={styles.label}>{PART_NUMBER_KIND_LABELS[number.kind]}</Text>
                {/* Номер выделяется и копируется: его вставляют в каталог или поиск */}
                <Text style={styles.value} selectable>
                  {number.value}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {rows.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Подходит к</Text>
          <View>
            {visibleRows.map((row, index) => {
              const details = compatibilityDetails(row);
              return (
                <View key={`compat-${index}`} style={styles.compatRow}>
                  <Text style={styles.compatTitle} selectable>
                    {compatibilityTitle(row) || details}
                  </Text>
                  {compatibilityTitle(row) && details ? (
                    <Text style={styles.compatDetails} selectable>
                      {details}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
          {rows.length > VISIBLE_ROWS && (
            <Pressable
              onPress={() => setShowAll((value) => !value)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAll }}
              hitSlop={8}
              style={({ pressed }) => [styles.more, pressed && styles.pressed]}
            >
              <Text style={styles.moreLabel}>
                {showAll ? 'Свернуть' : `Показать все (${rows.length})`}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    pressed: { opacity: 0.85 },
    sectionTitle: { ...typography.subheading, color: colors.text, marginTop: spacing.xl },
    name: { ...typography.body, color: colors.text, fontWeight: '600', marginTop: spacing.sm },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    label: { ...typography.body, color: colors.textMuted, flexShrink: 1 },
    value: { ...typography.body, color: colors.text, fontWeight: '600', flexShrink: 1 },
    compatRow: {
      gap: 2,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    compatTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
    compatDetails: { ...typography.caption, color: colors.textMuted },
    more: { paddingVertical: spacing.md },
    moreLabel: { ...typography.body, color: colors.primary, fontWeight: '600' },
  });
