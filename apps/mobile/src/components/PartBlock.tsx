import {
  PART_NUMBER_KIND_LABELS,
  type ListingCompatibilityDto,
  type ListingPartDto,
} from '@dagestan/shared';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, typography, useThemeColors } from '../theme';

/**
 * Слой запчасти на экране объявления: к чему подходит и номера детали.
 * Совместимость — то, ради чего человек открыл объявление, поэтому блок
 * стоит сразу после описания, а не в самом низу характеристик.
 */

/** «Toyota Succeed · NCP165 · 2014–2020 · 1NZ-FE» — одной строкой. */
export function compatibilityLine(row: ListingCompatibilityDto): string {
  const years =
    row.yearFrom !== null && row.yearTo !== null
      ? row.yearFrom === row.yearTo
        ? String(row.yearFrom)
        : `${row.yearFrom}–${row.yearTo}`
      : row.yearFrom !== null
        ? `с ${row.yearFrom}`
        : row.yearTo !== null
          ? `до ${row.yearTo}`
          : null;
  const machine = [row.brandLabel ?? row.brand, row.modelLabel ?? row.model]
    .filter(Boolean)
    .join(' ');
  return [machine, row.chassis, years, row.engine, row.modification].filter(Boolean).join(' · ');
}

export function PartBlock({ part }: { part: ListingPartDto }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (part.compatibility.length === 0 && part.numbers.length === 0) return null;

  return (
    <>
      {part.compatibility.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Подходит к</Text>
          <View>
            {part.compatibility.map((row, index) => (
              <View key={`compat-${index}`} style={styles.row}>
                <Text style={styles.value} selectable>
                  {compatibilityLine(row)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
      {part.numbers.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Номера детали</Text>
          <View>
            {part.numbers.map((number, index) => (
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
    </>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    sectionTitle: { ...typography.subheading, color: colors.text, marginTop: spacing.xl },
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
  });
