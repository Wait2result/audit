import { Platform, Share } from 'react-native';

import { API_BASE_URL } from '../api/config';

/**
 * «Поделиться» объявлением.
 *
 * Ссылка ведёт на короткую страницу сервера `/l/:id`: у получателя с
 * установленным приложением она открывает объявление в нём
 * (`dagestan://listings/:id`), у остальных показывает заголовок, цену и
 * фото — мессенджеры строят по ней превью.
 */
export function listingShareUrl(listingId: string): string {
  const origin = /^https?:\/\/[^/]+/.exec(API_BASE_URL)?.[0] ?? API_BASE_URL;
  return `${origin}/l/${listingId}`;
}

export async function shareListing(listing: {
  id: string;
  title: string;
  priceText?: string;
}): Promise<void> {
  const url = listingShareUrl(listing.id);
  const text = [listing.title, listing.priceText].filter(Boolean).join(' — ');
  try {
    // На iOS ссылка идёт отдельным полем — так её подхватывают «Скопировать»
    // и превью мессенджеров; Android понимает только текст
    await Share.share(
      Platform.OS === 'ios'
        ? { message: text, url, title: listing.title }
        : { message: `${text}\n${url}`, title: listing.title },
    );
  } catch {
    // Человек закрыл окно или системе нечем делиться — это не ошибка
  }
}
