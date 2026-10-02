'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, apiFetch } from '@/lib/api';
import { readField } from '@/lib/form';

export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Блокировка пользователя.
 *
 * Обратите внимание: панель не решает, можно ли это сделать. Она просто
 * отправляет запрос, а право проверяет сервер API. Даже если кто-то подделает
 * страницу панели, без права users:block ничего не произойдёт.
 */
export async function blockUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = readField(formData, 'userId');
  const reason = readField(formData, 'reason');

  if (reason.length < 3) {
    return { error: 'Укажите причину блокировки — она попадёт в журнал действий' };
  }

  try {
    await apiFetch(`/users/${userId}/block`, {
      method: 'POST',
      body: { reason },
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось заблокировать' };
  }

  revalidatePath('/users');
  return { success: 'Пользователь заблокирован, все его сессии завершены' };
}

export async function unblockUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = readField(formData, 'userId');

  try {
    await apiFetch(`/users/${userId}/unblock`, { method: 'POST' });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось снять блокировку' };
  }

  revalidatePath('/users');
  return { success: 'Блокировка снята' };
}
