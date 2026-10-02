'use server';

import { revalidatePath } from 'next/cache';
import type { PlaceType } from '@dagestan/shared';

import { ApiError, apiFetch } from '@/lib/api';
import { readField, readOptionalField } from '@/lib/form';
import { uploadImage } from '@/lib/media';

export interface CategoryActionState {
  error?: string;
  success?: string;
}

/** «шашлык, гриль, мангал» → массив слов без пустот и повторов. */
function parseWords(raw: string | undefined): string[] {
  if (!raw) return [];

  const words = raw
    .split(',')
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 1);

  return [...new Set(words)];
}

/** Галочки видов заведений приходят как несколько значений одного поля. */
function parseTypes(formData: FormData): PlaceType[] {
  // getAll отдаёт и файлы тоже: берём только строки, иначе в запрос
  // уехало бы «[object File]»
  return formData
    .getAll('types')
    .filter((value): value is string => typeof value === 'string') as PlaceType[];
}

/**
 * Картинка необязательна: категорию можно завести сразу, а картинку
 * добавить позже. Пустое поле файла не должно выглядеть как ошибка.
 */
async function readImage(formData: FormData, name: string): Promise<string | undefined> {
  const file = formData.get(name);

  if (!(file instanceof File) || file.size === 0) return undefined;

  const media = await uploadImage(file, readField(formData, 'name'));

  return media.id;
}

export async function createCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  try {
    const imageMediaId = await readImage(formData, 'image');

    await apiFetch('/places/admin/categories', {
      method: 'POST',
      body: {
        slug: readField(formData, 'slug'),
        name: readField(formData, 'name'),
        cuisines: parseWords(readOptionalField(formData, 'cuisines')),
        types: parseTypes(formData),
        ...(imageMediaId ? { imageMediaId } : {}),
      },
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось создать категорию' };
  }

  revalidatePath('/places/categories');
  return { success: 'Категория создана' };
}

export async function updateCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const id = readField(formData, 'id');

  try {
    const imageMediaId = await readImage(formData, 'image');

    await apiFetch(`/places/admin/categories/${id}`, {
      method: 'PATCH',
      body: {
        name: readField(formData, 'name'),
        cuisines: parseWords(readOptionalField(formData, 'cuisines')),
        types: parseTypes(formData),
        isActive: formData.get('isActive') === 'on',
        // Картинку меняем только когда выбрали новый файл: иначе правка
        // названия стирала бы существующую
        ...(imageMediaId ? { imageMediaId } : {}),
      },
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось сохранить категорию' };
  }

  revalidatePath('/places/categories');
  return { success: 'Сохранено' };
}

/** Перестановка на один шаг: весь новый порядок уходит на сервер списком. */
export async function moveCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const id = readField(formData, 'id');
  const direction = readField(formData, 'direction');
  const order = readField(formData, 'order').split(',').filter(Boolean);

  const index = order.indexOf(id);
  const target = direction === 'up' ? index - 1 : index + 1;

  if (index < 0 || target < 0 || target >= order.length) {
    return {};
  }

  const next = [...order];
  next[index] = order[target] as string;
  next[target] = id;

  try {
    await apiFetch('/places/admin/categories/reorder', { method: 'POST', body: { ids: next } });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось изменить порядок' };
  }

  revalidatePath('/places/categories');
  return { success: 'Порядок изменён' };
}

export async function deleteCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const id = readField(formData, 'id');

  try {
    await apiFetch(`/places/admin/categories/${id}`, { method: 'DELETE' });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось удалить категорию' };
  }

  revalidatePath('/places/categories');
  return { success: 'Категория удалена' };
}
