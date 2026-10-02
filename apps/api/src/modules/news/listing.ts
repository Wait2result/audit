import { htmlToText, type RawFeedItem } from './rss.js';

/**
 * Страница списка новостей города у издания («РИА Дагестан → г. Дербент»).
 *
 * Здесь редакция сама отмечает, какие заметки относятся к городу, — надёжнее,
 * чем угадывать по заголовку. Берём из карточки только заголовок, ссылку,
 * фото и время; текст статьи читается отдельно, со страницы самой заметки.
 */

const CARD = /<article class="news-card">([\s\S]*?)<\/article>/g;
/** «14.09.2026 14:19» — время по Москве, как и во всём Дагестане */
const CARD_DATE = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/;

/** Ссылка без домена: по ней заметку из списка находим в основной ленте. */
export function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Ключ статьи: последний отрезок адреса. РИА «Дагестан» показывает одну и ту же
 * статью под разными рубриками (`/news/g_makhachkala/x`, `/news/society/x`), и
 * сопоставлять по полному пути значило бы принять одну статью за две.
 */
export function articleKey(url: string): string {
  return pathOf(url).split('/').filter(Boolean).pop() ?? url;
}

export function parseListing(html: string, origin: string): RawFeedItem[] {
  const items: RawFeedItem[] = [];

  for (const match of html.matchAll(CARD)) {
    const card = match[1] ?? '';

    const link = card.match(
      /<a[^>]+href="([^"]+)"[^>]*class="news-card-title-link"[^>]*>([\s\S]*?)<\/a>/,
    );
    const date = card.match(CARD_DATE);
    if (!link?.[1] || !date) continue;

    const [, day, month, year, hour, minute] = date;
    const publishedAt = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+03:00`);
    const title = htmlToText(link[2] ?? '');
    if (!title || Number.isNaN(publishedAt.getTime())) continue;

    const url = new URL(link[1], origin).toString();

    items.push({
      guid: url,
      url,
      title,
      description: '',
      paragraphs: null,
      imageUrl: cardImage(card, origin),
      category: null,
      publishedAt,
    });
  }

  return items;
}

/** В карточке лежит уменьшенная копия («_medium.webp»); в статье — полный размер. */
function cardImage(card: string, origin: string): string | null {
  const src = card.match(/<img[^>]+src="([^"]+)"/)?.[1];
  if (!src) return null;

  try {
    return new URL(src.replace(/_medium(\.\w+)$/, '$1'), origin).toString().slice(0, 1000);
  } catch {
    return null;
  }
}
