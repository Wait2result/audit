'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, apiFetch } from '@/lib/api';
import { readField } from '@/lib/form';

export interface OrderActionState {
  error?: string;
  success?: string;
}

/**
 * Смена статуса заказа из панели.
 *
 * Обычно заказ ведёт само заведение в приложении; этот путь — запасной,
 * на случай когда заведение не отвечает, а покупатель ждёт.
 */
export async function changeOrderStatus(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const id = readField(formData, 'id');
  const status = readField(formData, 'status');

  try {
    await apiFetch(`/orders/${id}/status`, { method: 'POST', body: { status } });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось сменить статус' };
  }

  revalidatePath('/orders');
  return { success: 'Статус изменён' };
}
