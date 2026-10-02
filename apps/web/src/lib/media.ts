import type { MediaDto, UploadTicket } from '@dagestan/shared';

import { API_URL, ApiError, apiFetch } from './api';
import { getAccessToken } from './session';

/**
 * Загрузка картинки из панели управления.
 *
 * Файл идёт не напрямую из браузера в хранилище, а через сервер панели:
 * так токен доступа и адрес хранилища не попадают в код страницы. Сама
 * цепочка — обычная, та же, что в приложении: заявка на загрузку, файл
 * по временной ссылке, подтверждение с обработкой.
 *
 * Вызывается только из серверных действий ('use server').
 */
export async function uploadImage(file: File, alt?: string): Promise<MediaDto> {
  if (file.size === 0) {
    throw new ApiError(400, 'FILE_UPLOAD_FAILED', 'Файл пустой');
  }

  const ticket = await apiFetch<UploadTicket>('/media/upload-url', {
    method: 'POST',
    body: {
      kind: 'image',
      contentType: file.type,
      sizeBytes: file.size,
      isPrivate: false,
      ...(alt ? { alt } : {}),
    },
  });

  // Ссылка подписана вместе с типом файла: с другим типом хранилище откажет
  const put = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: ticket.requiredHeaders,
    body: new Uint8Array(await file.arrayBuffer()),
  });

  if (!put.ok) {
    throw new ApiError(
      put.status,
      'FILE_UPLOAD_FAILED',
      'Не удалось передать файл в хранилище. Проверьте, что оно запущено.',
    );
  }

  // До подтверждения файл считается ничьим: сервер проверяет его здесь
  // по-настоящему — тип, размеры, снятие координат съёмки, превью
  return apiFetch<MediaDto>(`/media/${ticket.mediaId}/confirm`, {
    method: 'POST',
    body: alt ? { alt } : {},
  });
}

/** Прямая ссылка на файл — панель показывает картинки без прокси. */
export function mediaUrl(media: MediaDto | null): string | null {
  if (!media) return null;

  return media.thumbnailUrl ?? media.url;
}

export { API_URL, getAccessToken };
