import type { MediaDto } from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

import { useCreateItem, useDeleteItem, useMyMenu, useUpdateItem } from '../../../src/api/queries';
import { pickAndUploadPhoto } from '../../../src/api/upload';
import { Button } from '../../../src/components/Button';
import { FormHeader } from '../../../src/components/FormHeader';
import { Screen } from '../../../src/components/Screen';
import { TextField } from '../../../src/components/TextField';
import { radius, spacing, typography, useThemeColors } from '../../../src/theme';

/**
 * Позиция меню: создание и правка (Этап 6).
 *
 * Цена вводится в рублях, а хранится и передаётся в копейках — все деньги
 * в проекте целые копейки, иначе на суммах заказов накапливается погрешность.
 */
export default function MenuItemScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; itemId?: string; categoryId: string }>();
  const placeId = String(params.id);
  const itemId = params.itemId ? String(params.itemId) : null;

  const { data: menu } = useMyMenu(placeId);
  const existing = itemId
    ? menu?.categories.flatMap((category) => category.items).find((item) => item.id === itemId)
    : undefined;

  const createItem = useCreateItem(placeId);
  const updateItem = useUpdateItem(placeId);
  const deleteItem = useDeleteItem(placeId);

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [price, setPrice] = useState(existing ? String(existing.price / 100) : '');
  const [portion, setPortion] = useState(existing?.portion ?? '');
  const [image, setImage] = useState<MediaDto | null>(existing?.image ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceKopecks = Math.round(Number(price.replace(',', '.')) * 100);
  const canSave = name.trim().length >= 2 && Number.isFinite(priceKopecks) && priceKopecks >= 0;

  const addPhoto = async () => {
    setError(null);
    setUploading(true);
    try {
      const uploaded = await pickAndUploadPhoto(name.trim() || undefined);
      if (uploaded) setImage(uploaded);
    } catch {
      setError('Не удалось загрузить фотографию. Попробуйте ещё раз.');
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    setError(null);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      price: priceKopecks,
      portion: portion.trim() || null,
      imageMediaId: image?.id ?? null,
    };

    const onSuccess = () => router.back();
    const onError = () => setError('Не удалось сохранить. Проверьте поля и попробуйте снова.');

    if (itemId) {
      updateItem.mutate({ itemId, dto: payload }, { onSuccess, onError });
    } else {
      createItem.mutate(
        {
          ...payload,
          categoryId: String(params.categoryId),
          isAvailable: true,
          isActive: true,
          sortOrder: 0,
        },
        { onSuccess, onError },
      );
    }
  };

  const confirmDelete = () => {
    if (!itemId) return;

    Alert.alert('Убрать позицию?', `«${existing?.name ?? name}» исчезнет из меню.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Убрать',
        style: 'destructive',
        onPress: () => deleteItem.mutate(itemId, { onSuccess: () => router.back() }),
      },
    ]);
  };

  return (
    <Screen scroll>
      <FormHeader title={itemId ? 'Позиция' : 'Новая позиция'} />

      <View style={styles.form}>
        {image && (
          <Image source={{ uri: image.thumbnailUrl ?? image.url }} style={styles.preview} />
        )}

        <Button
          label={image ? 'Заменить фотографию' : 'Добавить фотографию'}
          variant="secondary"
          onPress={() => void addPhoto()}
          loading={uploading}
        />

        <TextField
          label="Название"
          placeholder="Шашлык из баранины"
          value={name}
          onChangeText={setName}
        />

        <TextField
          label="Описание"
          placeholder="На углях, с луком и лавашом"
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <TextField
          label="Цена, ₽"
          placeholder="650"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
        />

        <TextField
          label="Порция"
          placeholder="250 г"
          value={portion}
          onChangeText={setPortion}
          hint="Свободная строка: «250 г», «0,5 л»"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Button
          label="Сохранить"
          onPress={save}
          disabled={!canSave}
          loading={createItem.isPending || updateItem.isPending}
        />

        {itemId && (
          <Button
            label="Убрать из меню"
            variant="ghost"
            onPress={confirmDelete}
            loading={deleteItem.isPending}
          />
        )}
      </View>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    form: { gap: spacing.md },
    preview: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceMuted,
    },
    error: { ...typography.caption, color: colors.danger },
  });
