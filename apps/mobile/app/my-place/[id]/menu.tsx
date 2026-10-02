import { canManagePlace, type MenuItemDto } from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  useCreateCategory,
  useDeleteCategory,
  useMyMenu,
  useMyPlaces,
  useSetAvailability,
} from '../../../src/api/queries';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { FormHeader } from '../../../src/components/FormHeader';
import { Screen } from '../../../src/components/Screen';
import { TextField } from '../../../src/components/TextField';
import { useAuthStore } from '../../../src/store/auth-store';
import { spacing, typography, useThemeColors } from '../../../src/theme';
import { formatMoney } from '../../../src/utils/money';

/**
 * Редактор меню (Этап 6).
 *
 * Стоп-лист — переключателем прямо в списке: за смену это делают чаще
 * всего, и ради него не должно приходиться открывать карточку позиции.
 * Он же — единственное, что доступно сотруднику без прав управляющего.
 */
export default function MenuEditorScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const placeId = String(id);

  const user = useAuthStore((s) => s.user);
  const { data: places } = useMyPlaces(Boolean(user));
  const { data: menu, isLoading } = useMyMenu(placeId);

  const createCategory = useCreateCategory(placeId);
  const deleteCategory = useDeleteCategory(placeId);
  const setAvailability = useSetAvailability(placeId);

  const [newCategory, setNewCategory] = useState('');
  const isManager = canManagePlace(places?.find((place) => place.id === placeId)?.role ?? 'staff');

  const addCategory = () => {
    const name = newCategory.trim();
    if (name.length < 2) return;

    createCategory.mutate(
      { name, sortOrder: (menu?.categories.length ?? 0) + 1, isActive: true },
      { onSuccess: () => setNewCategory('') },
    );
  };

  const confirmDeleteCategory = (categoryId: string, name: string) => {
    Alert.alert('Убрать раздел?', `«${name}» и все его позиции исчезнут из меню.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Убрать', style: 'destructive', onPress: () => deleteCategory.mutate(categoryId) },
    ]);
  };

  return (
    <Screen scroll>
      <FormHeader title="Меню" description={isManager ? undefined : 'Доступен только стоп-лист'} />

      {isLoading && <ActivityIndicator color={colors.primary} style={styles.loader} />}

      {menu?.categories.length === 0 && (
        <Text style={styles.empty}>
          Меню пустое. Добавьте раздел — например, «Горячее» или «Напитки».
        </Text>
      )}

      <View style={styles.list}>
        {menu?.categories.map((category) => (
          <View key={category.id} style={styles.category}>
            <View style={styles.categoryHeader}>
              <Text style={styles.categoryName}>{category.name}</Text>
              {isManager && (
                <Pressable
                  onPress={() => confirmDeleteCategory(category.id, category.name)}
                  accessibilityRole="button"
                  accessibilityLabel={`Убрать раздел ${category.name}`}
                  hitSlop={10}
                >
                  <Text style={styles.remove}>Убрать</Text>
                </Pressable>
              )}
            </View>

            {category.items.map((item) => (
              <MenuRow
                key={item.id}
                item={item}
                canEdit={isManager}
                busy={setAvailability.isPending}
                onToggle={(isAvailable) => setAvailability.mutate({ itemId: item.id, isAvailable })}
                onEdit={() =>
                  router.push({
                    pathname: '/my-place/[id]/item',
                    params: { id: placeId, itemId: item.id, categoryId: category.id },
                  })
                }
              />
            ))}

            {isManager && (
              <Button
                label="Добавить позицию"
                variant="secondary"
                size="md"
                onPress={() =>
                  router.push({
                    pathname: '/my-place/[id]/item',
                    params: { id: placeId, categoryId: category.id },
                  })
                }
                fullWidth={false}
                style={styles.addItem}
              />
            )}
          </View>
        ))}
      </View>

      {isManager && (
        <View style={styles.addCategory}>
          <TextField
            label="Новый раздел"
            placeholder="Горячее"
            value={newCategory}
            onChangeText={setNewCategory}
          />
          <Button
            label="Добавить раздел"
            onPress={addCategory}
            loading={createCategory.isPending}
            disabled={newCategory.trim().length < 2}
          />
        </View>
      )}
    </Screen>
  );
}

function MenuRow({
  item,
  canEdit,
  busy,
  onToggle,
  onEdit,
}: {
  item: MenuItemDto;
  canEdit: boolean;
  busy: boolean;
  onToggle: (isAvailable: boolean) => void;
  onEdit: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Card padded style={styles.item}>
      <Pressable
        onPress={canEdit ? onEdit : undefined}
        accessibilityRole={canEdit ? 'button' : undefined}
        style={styles.itemText}
      >
        <Text style={[styles.itemName, !item.isAvailable && styles.stopped]}>{item.name}</Text>
        <Text style={styles.itemMeta}>
          {formatMoney(item.price)}
          {item.portion ? ` · ${item.portion}` : ''}
          {item.groups.length > 0 ? ` · ${item.groups.length} гр. выбора` : ''}
        </Text>
      </Pressable>

      <View style={styles.itemRight}>
        <Text style={styles.toggleLabel}>{item.isAvailable ? 'есть' : 'нет'}</Text>
        <Switch
          value={item.isAvailable}
          disabled={busy}
          onValueChange={onToggle}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
    </Card>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    loader: { paddingVertical: spacing.xxl },
    empty: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 19,
      marginBottom: spacing.lg,
    },
    list: { gap: spacing.xl },

    category: { gap: spacing.sm },
    categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    categoryName: { ...typography.heading, fontSize: 17, color: colors.text },
    remove: { ...typography.caption, color: colors.textFaint },

    item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    itemText: { flex: 1, gap: 2 },
    itemName: { ...typography.body, color: colors.text },
    stopped: { color: colors.textFaint, textDecorationLine: 'line-through' },
    itemMeta: { ...typography.caption, color: colors.textMuted },
    itemRight: { alignItems: 'center', gap: 2 },
    toggleLabel: { ...typography.caption, fontSize: 11, color: colors.textFaint },

    addItem: { alignSelf: 'flex-start', paddingHorizontal: spacing.lg },
    addCategory: { gap: spacing.md, marginTop: spacing.xxl },
  });
