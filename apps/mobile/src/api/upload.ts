import type { MediaDto, UploadTicket } from '@dagestan/shared';
import * as ImagePicker from 'expo-image-picker';

import { TUNNEL_HEADERS, apiFetch } from './client';
import { API_BASE_URL } from './config';

/** Адрес нашего API без пути: «https://…ngrok-free.dev». */
function apiOrigin(): string {
  return /^https?:\/\/[^/]+/.exec(API_BASE_URL)?.[0] ?? API_BASE_URL;
}

/**
 * Загрузка фотографии с телефона.
 *
 * Три шага: приложение получает временную ссылку, отправляет файл по ней
 * и сообщает об этом серверу. В production ссылка ведёт прямо в хранилище,
 * при разработке через туннель — в наш API (у телефона нет доступа к
 * хранилищу на компьютере). Так фотография на несколько мегабайт не занимает наш канал,
 * а сервер всё равно проверяет содержимое, снимает EXIF с координатами
 * съёмки и готовит уменьшенные копии.
 */

export interface PickedPhoto {
  uri: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Просит фотографию у человека. Возвращает null, если он передумал или
 * не дал доступ к галерее — это не ошибка.
 */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    // Витрина показывает широкие карточки — обрезаем сразу под них
    aspect: [16, 9],
    quality: 0.85,
  });

  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  return {
    uri: asset.uri,
    contentType: asset.mimeType ?? 'image/jpeg',
    sizeBytes: asset.fileSize ?? 0,
  };
}

/**
 * Просит СКОЛЬКО-ТО фотографий сразу — для объявления.
 *
 * Два отличия от `pickPhoto`, и оба существенные. Выбор сразу нескольких:
 * снимать диван по одной фотографии, каждый раз заново открывая галерею, —
 * верный способ бросить публикацию на третьем кадре. И никакой обрезки под
 * 16:9: объявления снимают вертикально не реже, чем горизонтально, и
 * принудительная рамка отрезала бы у платья подол, а у шкафа — верх.
 */
export async function pickPhotos(limit: number): Promise<PickedPhoto[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 0.85,
  });

  if (result.canceled) return [];

  return result.assets.map((asset) => ({
    uri: asset.uri,
    contentType: asset.mimeType ?? 'image/jpeg',
    sizeBytes: asset.fileSize ?? 0,
  }));
}

/**
 * Загружает выбранные фотографии по очереди, сообщая о каждой готовой.
 *
 * По очереди, а не все разом: десять параллельных отправок на мобильном
 * интернете мешают друг другу и чаще срываются целиком. Упавшая фотография
 * не отменяет остальные — человек увидит, сколько дошло, и добавит
 * недостающее, а не начнёт всё заново.
 */
export async function uploadPhotos(
  photos: PickedPhoto[],
  onUploaded?: (media: MediaDto) => void,
): Promise<{ uploaded: MediaDto[]; failed: number }> {
  const uploaded: MediaDto[] = [];
  let failed = 0;

  for (const photo of photos) {
    try {
      const media = await uploadPhoto(photo);
      uploaded.push(media);
      onUploaded?.(media);
    } catch {
      failed += 1;
    }
  }

  return { uploaded, failed };
}

/** Отправляет выбранную фотографию и возвращает готовый файл с превью. */
export async function uploadPhoto(photo: PickedPhoto, alt?: string): Promise<MediaDto> {
  const blob = await (await fetch(photo.uri)).blob();

  const ticket = await apiFetch<UploadTicket>('/media/upload-url', {
    method: 'POST',
    body: {
      kind: 'image',
      contentType: photo.contentType,
      // Размер из галереи бывает неизвестен — берём фактический
      sizeBytes: blob.size || photo.sizeBytes,
      isPrivate: false,
      ...(alt ? { alt } : {}),
    },
  });

  // В разработке файл идёт через наш API (туннель) — туннелю нужны свои
  // заголовки. Прямая ссылка хранилища получает только подписанные
  const viaApi = ticket.uploadUrl.startsWith(apiOrigin());
  const uploaded = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: viaApi ? { ...TUNNEL_HEADERS, ...ticket.requiredHeaders } : ticket.requiredHeaders,
    body: blob,
  });

  if (!uploaded.ok) {
    throw new Error('Не удалось отправить фотографию в хранилище');
  }

  return apiFetch<MediaDto>(`/media/${ticket.mediaId}/confirm`, {
    method: 'POST',
    body: alt ? { alt } : {},
  });
}

/** Выбрать и сразу загрузить. null — человек отказался. */
export async function pickAndUploadPhoto(alt?: string): Promise<MediaDto | null> {
  const photo = await pickPhoto();
  if (!photo) return null;

  return uploadPhoto(photo, alt);
}
