import type { ListingAttribute } from '@dagestan/shared';

import { ApiError } from '../api/client';

/** Подписи общих полей объявления — для ошибки проверки на сервере. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'Заголовок',
  description: 'Описание',
  price: 'Цена',
  priceUnit: 'Цена за',
  categoryId: 'Категория',
  cityId: 'Город',
  location: 'Место',
  contactPhone: 'Телефон',
  photoIds: 'Фотографии',
  transactionType: 'Сделка',
  rentPeriod: 'Срок аренды',
  part: 'Запчасть',
};

/**
 * Почему объявление не опубликовалось — словами человека, а не «Проверьте
 * правильность переданных данных». Ошибка проверки называет поле («Пробег:
 * не больше 2 000 000»), нет входа — «Войдите», нет сети — «Нет соединения».
 */
export function publishErrorText(
  error: unknown,
  attributes: readonly ListingAttribute[] = [],
): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error && error.message
      ? error.message
      : 'Не удалось опубликовать объявление. Попробуйте ещё раз.';
  }
  if (error.status === 401) return 'Войдите в аккаунт, чтобы опубликовать объявление.';
  if (error.status === 403) return 'Недостаточно прав, чтобы опубликовать объявление.';
  if (error.code === 'VALIDATION_FAILED' && Array.isArray(error.details)) {
    const issue = error.details.find(
      (item): item is { field: string; message: string } =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { field?: unknown }).field === 'string' &&
        typeof (item as { message?: unknown }).message === 'string',
    );
    if (issue) {
      const [head, key] = issue.field.split('.');
      const label =
        head === 'attributes' && key
          ? (attributes.find((attribute) => attribute.key === key)?.label ?? key)
          : (FIELD_LABELS[head ?? ''] ?? null);
      return label ? `${label}: ${issue.message}` : issue.message;
    }
  }
  if (error.status >= 500) {
    return 'Сервер не смог сохранить объявление. Попробуйте ещё раз через минуту.';
  }
  return error.message;
}
