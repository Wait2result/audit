'use server';

import { revalidatePath } from 'next/cache';
import QRCode from 'qrcode';

import { ApiError, apiFetch } from '@/lib/api';
import { readField } from '@/lib/form';

export interface SetupState {
  error?: string;
  /** Секрет в текстовом виде — на случай, если камера не читает QR-код */
  secret?: string;
  /** QR-код картинкой, готовой к показу */
  qrDataUrl?: string;
}

export interface EnableState {
  error?: string;
  success?: string;
}

/**
 * Шаг 1: получить секрет и превратить его в QR-код.
 *
 * QR-код рисуется здесь, на сервере панели: секрет не должен уезжать
 * в стороннюю службу генерации картинок — это ровно тот случай, когда
 * «удобный сервис» означал бы отдачу ключа от всех учётных записей.
 */
export async function startSetup(_prev: SetupState): Promise<SetupState> {
  try {
    const data = await apiFetch<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', {
      method: 'POST',
      body: {},
    });

    const qrDataUrl = await QRCode.toDataURL(data.otpauthUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#e6eef0', light: '#0f1c21' },
    });

    return { secret: data.secret, qrDataUrl };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось начать настройку' };
  }
}

/** Шаг 2: подтвердить код из приложения и включить защиту. */
export async function enableTwoFactor(
  _prev: EnableState,
  formData: FormData,
): Promise<EnableState> {
  const code = readField(formData, 'code');

  if (!/^\d{6}$/.test(code)) {
    return { error: 'Введите шесть цифр из приложения' };
  }

  try {
    await apiFetch('/auth/2fa/enable', { method: 'POST', body: { code } });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось включить' };
  }

  revalidatePath('/security');
  return { success: 'Двухфакторная авторизация включена' };
}

export async function disableTwoFactor(
  _prev: EnableState,
  formData: FormData,
): Promise<EnableState> {
  const code = readField(formData, 'code');

  if (!/^\d{6}$/.test(code)) {
    return { error: 'Введите шесть цифр из приложения' };
  }

  try {
    await apiFetch('/auth/2fa/disable', { method: 'POST', body: { code } });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Не удалось отключить' };
  }

  revalidatePath('/security');
  return { success: 'Двухфакторная авторизация отключена' };
}
