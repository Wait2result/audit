'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, apiFetch } from '@/lib/api';
import { readField } from '@/lib/form';

export interface NewsActionState {
  error?: string;
  success?: string;
}

/**
 * Аварийный выключатель: новости собираются автоматически, поэтому сотрудник
 * не пишет их, а лишь убирает из ленты то, что правила пропустили зря.
 * Скрытая новость не возвращается при следующем сборе.
 */
export async function toggleNewsHidden(
  _prev: NewsActionState,
  formData: FormData,
): Promise<NewsActionState> {
  const id = readField(formData, 'id');
  const isHidden = readField(formData, 'isHidden') === 'true';

  try {
    await apiFetch(`/news/${id}/${isHidden ? 'unhide' : 'hide'}`, { method: 'POST' });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось изменить новость' };
  }

  revalidatePath('/news');
  return { success: isHidden ? 'Новость снова в ленте' : 'Новость скрыта из ленты' };
}
