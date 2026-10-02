'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, apiFetch } from '@/lib/api';
import { readField } from '@/lib/form';

export interface ReviewActionState {
  error?: string;
  success?: string;
}

/**
 * Скрыть или вернуть отзыв.
 *
 * Удаления нет намеренно: отзыв остаётся в базе, просто перестаёт
 * показываться и влиять на рейтинг. Спор «вы стёрли мой отзыв» решается
 * записями, а не словами, поэтому стирать нечего.
 */
export async function setReviewHidden(
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const id = readField(formData, 'id');
  const hide = readField(formData, 'hide') === '1';

  try {
    await apiFetch(`/places/admin/reviews/${id}/${hide ? 'hide' : 'unhide'}`, { method: 'POST' });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось изменить отзыв' };
  }

  revalidatePath('/reviews');
  return { success: hide ? 'Отзыв скрыт' : 'Отзыв возвращён' };
}
