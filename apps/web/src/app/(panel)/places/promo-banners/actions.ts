'use server';

import { revalidatePath } from 'next/cache';
import type { PromoPlacement } from '@dagestan/shared';

import { ApiError, apiFetch } from '@/lib/api';
import { readField, readOptionalField } from '@/lib/form';
import { uploadImage } from '@/lib/media';

export interface BannerActionState {
  error?: string;
  success?: string;
}

/**
 * Картинка необязательна: баннер можно завести сразу, а фото добавить позже.
 * Пустое поле файла не должно выглядеть как ошибка.
 */
async function readImage(formData: FormData, name: string): Promise<string | undefined> {
  const file = formData.get(name);

  if (!(file instanceof File) || file.size === 0) return undefined;

  const media = await uploadImage(file, readField(formData, 'title'));

  return media.id;
}

/**
 * Дата из поля формы («2026-10-20T09:00») — московское время: Дагестан живёт
 * по Москве, а сервер панели может стоять в другом поясе. Пусто — null.
 */
function readMoscowDate(formData: FormData, name: string): string | null {
  const raw = readOptionalField(formData, name);
  if (!raw) return null;
  return new Date(`${raw}:00+03:00`).toISOString();
}

/**
 * Действие и срок показа. Поля действия есть только у карусели: у плитки
 * нажатие открывает её рубрику, и форма их не присылает — тогда действие не
 * трогаем. Срок показа есть у обеих.
 */
function readActionAndSchedule(formData: FormData) {
  const actionType = readOptionalField(formData, 'actionType');
  return {
    ...(actionType
      ? { actionType, actionValue: readOptionalField(formData, 'actionValue') ?? null }
      : {}),
    startsAt: readMoscowDate(formData, 'startsAt'),
    endsAt: readMoscowDate(formData, 'endsAt'),
  };
}

export async function createPromoBanner(
  _prev: BannerActionState,
  formData: FormData,
): Promise<BannerActionState> {
  const placement = readField(formData, 'placement') as PromoPlacement;

  try {
    const imageMediaId = await readImage(formData, 'image');

    await apiFetch('/places/admin/promo-banners', {
      method: 'POST',
      body: {
        placement,
        title: readField(formData, 'title'),
        subtitle: readOptionalField(formData, 'subtitle'),
        ...(imageMediaId ? { imageMediaId } : {}),
        ...readActionAndSchedule(formData),
      },
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось создать баннер' };
  }

  revalidatePath('/places/promo-banners');
  return { success: placement.startsWith('tile_') ? 'Фото плитки добавлено' : 'Баннер создан' };
}

export async function updatePromoBanner(
  _prev: BannerActionState,
  formData: FormData,
): Promise<BannerActionState> {
  const id = readField(formData, 'id');

  try {
    const imageMediaId = await readImage(formData, 'image');

    await apiFetch(`/places/admin/promo-banners/${id}`, {
      method: 'PATCH',
      body: {
        title: readField(formData, 'title'),
        subtitle: readOptionalField(formData, 'subtitle') ?? null,
        // Действие — как выбрано в форме («Ничего» тоже выбор: так карточку
        // отвязывают от заведения); пустые даты — срок снят
        ...readActionAndSchedule(formData),
        isActive: formData.get('isActive') === 'on',
        // Картинку меняем только когда выбрали новый файл: иначе правка
        // заголовка стирала бы существующее фото
        ...(imageMediaId ? { imageMediaId } : {}),
      },
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось сохранить баннер' };
  }

  revalidatePath('/places/promo-banners');
  return { success: 'Сохранено' };
}

/** Перестановка на один шаг: весь новый порядок места показа уходит списком. */
export async function movePromoBanner(
  _prev: BannerActionState,
  formData: FormData,
): Promise<BannerActionState> {
  const id = readField(formData, 'id');
  const placement = readField(formData, 'placement') as PromoPlacement;
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
    await apiFetch(`/places/admin/promo-banners/reorder?placement=${placement}`, {
      method: 'POST',
      body: { ids: next },
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось изменить порядок' };
  }

  revalidatePath('/places/promo-banners');
  return { success: 'Порядок изменён' };
}

export async function deletePromoBanner(
  _prev: BannerActionState,
  formData: FormData,
): Promise<BannerActionState> {
  const id = readField(formData, 'id');

  try {
    await apiFetch(`/places/admin/promo-banners/${id}`, { method: 'DELETE' });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось удалить баннер' };
  }

  revalidatePath('/places/promo-banners');
  return { success: 'Баннер удалён' };
}
