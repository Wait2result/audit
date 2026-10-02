import type { ListingCategoryDto } from '@dagestan/shared';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';
import { sectionIcon, subcategoryIcon } from '../utils/listing-icons';
import { Icon } from './Icon';

/**
 * Выбор категории вручную — когда подсказка по заголовку не угадала или её
 * нет. Два уровня в одном окне: раздел, затем подраздел. Ярлыки («Посуточная
 * аренда») для подачи не показываются — квартира подаётся в «Квартиры» со
 * сделкой «Сдам».
 */
export function CategoryPickerModal({
  visible,
  roots,
  onClose,
  onSelect,
}: {
  visible: boolean;
  roots: readonly ListingCategoryDto[];
  onClose: () => void;
  onSelect: (category: ListingCategoryDto) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [section, setSection] = useState<ListingCategoryDto | null>(null);

  const close = () => {
    setSection(null);
    onClose();
  };

  const children = (section?.children ?? []).filter(
    (child) => !child.shortcut && !child.deprecatedToSlug,
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={styles.modal}>
        <View style={styles.header}>
          {section ? (
            <Pressable
              onPress={() => setSection(null)}
              accessibilityRole="button"
              accessibilityLabel="К разделам"
              hitSlop={12}
            >
              <Icon name="chevron-left" size={22} color={colors.text} />
            </Pressable>
          ) : null}
          <Text style={styles.title}>{section ? section.name : 'Выберите раздел'}</Text>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            hitSlop={12}
          >
            <Icon name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {section === null
            ? roots.map((root) => (
                <Row
                  key={root.id}
                  icon={sectionIcon(root.slug)}
                  label={root.name}
                  onPress={() => setSection(root)}
                />
              ))
            : children.map((child) => (
                <Row
                  key={child.id}
                  icon={subcategoryIcon(child.slug)}
                  label={child.name}
                  onPress={() => {
                    onSelect(child);
                    setSection(null);
                  }}
                />
              ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: ReturnType<typeof sectionIcon>;
  label: string;
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
      <Icon name={icon} size={20} color={colors.textMuted} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Icon name="chevron-right" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    modal: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.lg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    title: { ...typography.heading, color: colors.text, flex: 1 },
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 54,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowLabel: { ...typography.body, color: colors.text, flex: 1 },
    pressed: { opacity: 0.85 },
  });
