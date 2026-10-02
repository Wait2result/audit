import {
  LISTING_MAX_PHOTOS,
  makeCoverPhoto,
  movePhoto as moved,
  type MediaDto,
} from '@dagestan/shared';
import { useState } from 'react';

import { pickPhotos, uploadPhotos } from '../api/upload';
import { useToastStore } from '../store/toast-store';

/**
 * Состояние и действия сетки фотографий: выбрать, загрузить, переставить,
 * убрать. Общее для подачи и правки — см. `ListingFormFields.tsx` про то,
 * почему это не копия в двух местах.
 */
export function usePhotoEditor(initialPhotos: MediaDto[] = []) {
  const toast = useToastStore((s) => s.show);
  const [photos, setPhotos] = useState<MediaDto[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);

  const addPhotos = async () => {
    const left = LISTING_MAX_PHOTOS - photos.length;
    if (left <= 0) {
      toast(`Больше ${LISTING_MAX_PHOTOS} фотографий не поместится`);
      return;
    }

    const picked = await pickPhotos(left);
    if (picked.length === 0) return;

    setUploading(true);
    // Каждая дошедшая фотография появляется сразу, не дожидаясь остальных:
    // на мобильном интернете десять кадров идут не одну секунду
    const { failed } = await uploadPhotos(picked, (media) =>
      setPhotos((current) => [...current, media]),
    );
    setUploading(false);

    if (failed > 0) toast(`Не удалось отправить фотографий: ${failed}`);
  };

  const removePhoto = (photoId: string) => {
    setPhotos((current) => current.filter((item) => item.id !== photoId));
  };

  const movePhoto = (from: number, direction: -1 | 1) => {
    setPhotos((current) => moved(current, from, direction));
  };

  /** Сделать фото обложкой — перенести в начало, остальные сохраняют порядок. */
  const makeCover = (index: number) => {
    setPhotos((current) => makeCoverPhoto(current, index));
  };

  return { photos, setPhotos, uploading, addPhotos, removePhoto, movePhoto, makeCover };
}
