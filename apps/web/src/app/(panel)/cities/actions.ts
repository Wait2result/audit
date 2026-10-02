'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, apiFetch } from '@/lib/api';
import { readBooleanField, readField, readNumberField } from '@/lib/form';

export interface CityActionState {
  error?: string;
  success?: string;
}

/**
 * Добавление города.
 *
 * Это то самое действие, ради которого проектировалась вся архитектура
 * (пункт 2 ТЗ): новый город — одна запись в базе. Погода, кино, новости,
 * рестораны и объявления начинают работать в нём автоматически, без
 * изменения кода и без выпуска новой версии приложения.
 */
export async function createCity(
  _prev: CityActionState,
  formData: FormData,
): Promise<CityActionState> {
  const payload = {
    name: readField(formData, 'name'),
    slug: readField(formData, 'slug').toLowerCase(),
    latitude: readNumberField(formData, 'latitude'),
    longitude: readNumberField(formData, 'longitude'),
    isActive: readBooleanField(formData, 'isActive'),
    sortOrder: readNumberField(formData, 'sortOrder') || 0,
  };

  if (!payload.name || !payload.slug) {
    return { error: 'Заполните название и латинский идентификатор' };
  }
  if (Number.isNaN(payload.latitude) || Number.isNaN(payload.longitude)) {
    return { error: 'Координаты должны быть числами' };
  }

  try {
    await apiFetch('/cities', { method: 'POST', body: payload });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось добавить город' };
  }

  revalidatePath('/cities');
  return { success: `Город «${payload.name}» добавлен` };
}

/** Включение и выключение города без удаления данных. */
export async function toggleCity(
  _prev: CityActionState,
  formData: FormData,
): Promise<CityActionState> {
  const id = readField(formData, 'id');
  const isActive = readField(formData, 'isActive') === 'true';

  try {
    await apiFetch(`/cities/${id}`, { method: 'PATCH', body: { isActive: !isActive } });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось изменить город' };
  }

  revalidatePath('/cities');
  return { success: isActive ? 'Город скрыт из приложения' : 'Город снова виден в приложении' };
}
