'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, apiFetch } from '@/lib/api';
import { readField, readOptionalField } from '@/lib/form';

export interface ListingActionState {
  error?: string;
  success?: string;
}

/**
 * Снять объявление с публикации.
 *
 * Причина обязательна и её видит автор в своём кабинете — «снято без
 * объяснений» это повод для спора, который панель нечем закрыть.
 */
export async function suspendListing(
  _prev: ListingActionState,
  formData: FormData,
): Promise<ListingActionState> {
  const id = readField(formData, 'id');
  const reason = readField(formData, 'reason');

  if (reason.length < 3) {
    return { error: 'Укажите причину' };
  }

  try {
    await apiFetch(`/listings/admin/${id}/suspend`, { method: 'POST', body: { reason } });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось снять объявление' };
  }

  revalidatePath('/listings');
  return { success: 'Объявление снято' };
}

/** Вернуть снятое объявление в ленту. Накопленные жалобы закрываются сами. */
export async function restoreListing(
  _prev: ListingActionState,
  formData: FormData,
): Promise<ListingActionState> {
  const id = readField(formData, 'id');

  try {
    await apiFetch(`/listings/admin/${id}/restore`, { method: 'POST' });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось вернуть объявление' };
  }

  revalidatePath('/listings');
  return { success: 'Объявление возвращено в ленту' };
}

/**
 * Поднять объявление наверх ленты вручную.
 *
 * В отличие от кнопки автора, для сотрудника платформы суточное
 * ограничение не действует — обычно это ответ на обращение продавца.
 */
export async function bumpListing(
  _prev: ListingActionState,
  formData: FormData,
): Promise<ListingActionState> {
  const id = readField(formData, 'id');

  try {
    await apiFetch(`/listings/admin/${id}/bump`, { method: 'POST' });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось поднять объявление' };
  }

  revalidatePath('/listings');
  return { success: 'Объявление поднято' };
}

/**
 * Решение по жалобе. Подтверждение снимает объявление и закрывает разом все
 * жалобы на него — разбирать двадцать одинаковых по очереди незачем.
 */
export async function resolveReport(
  _prev: ListingActionState,
  formData: FormData,
): Promise<ListingActionState> {
  const reportId = readField(formData, 'reportId');
  const action = readField(formData, 'action') === 'confirm' ? 'confirm' : 'reject';
  const comment = readOptionalField(formData, 'comment');

  try {
    await apiFetch(`/listings/admin/reports/${reportId}/resolve`, {
      method: 'POST',
      body: { action, ...(comment ? { comment } : {}) },
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось сохранить решение' };
  }

  revalidatePath('/listings/reports');
  revalidatePath('/listings');
  return { success: action === 'confirm' ? 'Жалоба подтверждена' : 'Жалоба отклонена' };
}
