'use server';

import { revalidatePath } from 'next/cache';
import { PLACE_TYPE_LABELS, type PlaceType } from '@dagestan/shared';

import { ApiError, apiFetch } from '@/lib/api';
import { readBooleanField, readField, readNumberField, readOptionalField } from '@/lib/form';

export interface PlaceActionState {
  error?: string;
  success?: string;
}

/** Рубли из формы — копейки в базе. Все деньги в проекте целые копейки. */
function readMoneyField(formData: FormData, name: string): number | undefined {
  const raw = readOptionalField(formData, name);
  if (!raw) return undefined;

  const rubles = Number(raw.replace(',', '.'));

  return Number.isFinite(rubles) ? Math.round(rubles * 100) : undefined;
}

function readPlaceFields(formData: FormData) {
  return {
    name: readField(formData, 'name'),
    type: readField(formData, 'type') as PlaceType,
    address: readField(formData, 'address'),
    phone: readOptionalField(formData, 'phone') || null,
    description: readOptionalField(formData, 'description') || null,
    cuisines: (readOptionalField(formData, 'cuisines') ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    averageCheck: readMoneyField(formData, 'averageCheck') ?? null,
    hasDelivery: readBooleanField(formData, 'hasDelivery'),
    hasPickup: readBooleanField(formData, 'hasPickup'),
    deliveryFee: readMoneyField(formData, 'deliveryFee') ?? 0,
    freeDeliveryFrom: readMoneyField(formData, 'freeDeliveryFrom') ?? null,
    minOrderAmount: readMoneyField(formData, 'minOrderAmount') ?? 0,
    deliveryMinutes: readNumberField(formData, 'deliveryMinutes') || null,
    ordersEnabled: readBooleanField(formData, 'ordersEnabled'),
    isActive: readBooleanField(formData, 'isActive'),
  };
}

/**
 * Заведение заводит сотрудник платформы, а дальше его ведёт само заведение
 * из приложения (см. доступы на карточке).
 */
export async function createPlace(
  _prev: PlaceActionState,
  formData: FormData,
): Promise<PlaceActionState> {
  const fields = readPlaceFields(formData);
  const cityId = readField(formData, 'cityId');

  if (!fields.name || !fields.address || !cityId) {
    return { error: 'Заполните название, адрес и город' };
  }
  if (!(fields.type in PLACE_TYPE_LABELS)) {
    return { error: 'Выберите вид заведения' };
  }

  try {
    await apiFetch('/places', { method: 'POST', body: { ...fields, cityId } });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось создать заведение' };
  }

  revalidatePath('/places');
  return { success: `Заведение «${fields.name}» создано` };
}

export async function updatePlace(
  _prev: PlaceActionState,
  formData: FormData,
): Promise<PlaceActionState> {
  const id = readField(formData, 'id');

  try {
    await apiFetch(`/places/${id}`, { method: 'PATCH', body: readPlaceFields(formData) });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось сохранить' };
  }

  revalidatePath(`/places/${id}`);
  revalidatePath('/places');
  return { success: 'Сохранено' };
}

/** Часы работы отправляются неделей целиком — без полуобновлённого состояния. */
export async function updateSchedule(
  _prev: PlaceActionState,
  formData: FormData,
): Promise<PlaceActionState> {
  const id = readField(formData, 'id');

  const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    isClosed: readBooleanField(formData, `closed-${weekday}`),
    opensAt: readField(formData, `opens-${weekday}`),
    closesAt: readField(formData, `closes-${weekday}`),
  }));

  try {
    await apiFetch(`/places/${id}/schedule`, { method: 'PATCH', body: { days } });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось сохранить часы работы' };
  }

  revalidatePath(`/places/${id}`);
  return { success: 'Часы работы сохранены' };
}

/**
 * Доступ выдаётся по номеру уже зарегистрированного аккаунта: код-приглашение
 * можно передать чужому человеку, а номер привязан к конкретному аккаунту.
 */
export async function addMember(
  _prev: PlaceActionState,
  formData: FormData,
): Promise<PlaceActionState> {
  const id = readField(formData, 'id');
  const phone = readField(formData, 'phone');
  const role = readField(formData, 'role');

  if (!phone) return { error: 'Укажите номер телефона' };

  try {
    const member = await apiFetch<{ name: string }>(`/places/${id}/members`, {
      method: 'POST',
      body: { phone, role },
    });

    revalidatePath(`/places/${id}`);
    return { success: `Доступ выдан: ${member.name}` };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось выдать доступ' };
  }
}

export async function removeMember(
  _prev: PlaceActionState,
  formData: FormData,
): Promise<PlaceActionState> {
  const id = readField(formData, 'id');
  const userId = readField(formData, 'userId');

  try {
    await apiFetch(`/places/${id}/members/${userId}`, { method: 'DELETE' });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось отозвать доступ' };
  }

  revalidatePath(`/places/${id}`);
  return { success: 'Доступ отозван' };
}

export async function deletePlace(
  _prev: PlaceActionState,
  formData: FormData,
): Promise<PlaceActionState> {
  const id = readField(formData, 'id');

  try {
    await apiFetch(`/places/${id}`, { method: 'DELETE' });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось убрать заведение' };
  }

  revalidatePath('/places');
  return { success: 'Заведение убрано из каталога' };
}
