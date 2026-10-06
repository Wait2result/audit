import type { ListingCategoryDto } from '@dagestan/shared';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';
import { sectionIcon, subcategoryIcon } from '../utils/listing-icons';
import { Icon } from './Icon';

/**
 * Выбор категории вручную — когда подсказка по заголовку не угадала или её
 * нет. Уровни в одном окне: раздел, затем подкатегория — или основной тип и
 * его направление («Транспорт → Автомобили → Автоаксессуары»). Ярлыки
 * («Посуточная аренда») для подачи не показываются — квартира подаётся в
 * «Квартиры» со сделкой «Сдам».
 */
export function CategoryPickerModal({
  visible,
  roots,
  onClose,
  onSelect,
  initialPath = [],
  title,
}: {
  visible: boolean;
  roots: readonly ListingCategoryDto[];
  /** С какого уровня открыть: [Животные] — сразу соседи найденной категории */
  initialPath?: readonly ListingCategoryDto[];
  /** Заголовок верхнего уровня: «Выберите раздел» по умолчанию */
  title?: string;
  onClose: () => void;
  onSelect: (category: ListingCategoryDto) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Пройденный путь: [раздел] или [раздел, основной тип]
  const [path, setPath] = useState<ListingCategoryDto[]>([...initialPath]);
  // Окно открыли снова с другим началом — начинаем с него
  useEffect(() => {
    if (visible) setPath([...initialPath]);
  }, [visible]);
  const section = path.at(-1) ?? null;

  const close = () => {
    setPath([]);
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
              onPress={() => setPath((current) => current.slice(0, -1))}
              accessibilityRole="button"
              accessibilityLabel="Назад"
              hitSlop={12}
            >
              <Icon name="chevron-left" size={22} color={colors.text} />
            </Pressable>
          ) : null}
          <Text style={styles.title}>{section ? section.name : (title ?? 'Выберите раздел')}</Text>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            hitSlop={12}
          >
            <Icon name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        {/* Где человек сейчас: «Транспорт → Автомобили». Повтор имени не пишется */}
        {path.length > 1 && (
          <Text
            style={styles.crumbs}
            numberOfLines={2}
            accessibilityLabel={`Путь: ${crumbs(path)}`}
          >
            {crumbs(path)}
          </Text>
        )}

        <ScrollView contentContainerStyle={styles.list}>
          {section === null
            ? roots.map((root) => (
                <Row
                  key={root.id}
                  icon={sectionIcon(root.slug)}
                  label={root.name}
                  onPress={() => setPath([root])}
                />
              ))
            : children.map((child) => (
                <Row
                  key={child.id}
                  icon={subcategoryIcon(child.slug)}
                  label={child.name}
                  onPress={() => {
                    // Основной тип — дальше, к его направлениям; подкатегория — выбор
                    if (child.children.length > 0) {
                      setPath((current) => [...current, child]);
                      return;
                    }
                    onSelect(child);
                    setPath([]);
                  }}
                />
              ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function crumbs(path: readonly ListingCategoryDto[]): string {
  const names: string[] = [];
  for (const node of path) if (names.at(-1) !== node.name) names.push(node.name);
  return names.join(' → ');
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
    crumbs: {
      ...typography.caption,
      color: colors.textMuted,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.xs,
    },
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
