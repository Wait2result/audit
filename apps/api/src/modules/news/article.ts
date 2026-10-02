import { htmlToText } from './rss.js';

/**
 * Чтение страницы статьи у источников, чья лента полный текст не отдаёт.
 *
 * Берём только размеченное самим изданием тело статьи: в него не попадают ни
 * боковые ленты «Читайте также», ни реклама, ни чужие фото. Сырой HTML наружу
 * не уходит — приложение получает готовые абзацы текста.
 */

export interface ArticleContent {
  paragraphs: string[];
  /** Собственное фото статьи, если оно есть внутри тела статьи */
  imageUrl: string | null;
}

/** Служебные строки, которые издания вставляют внутрь тела статьи. */
const NOISE =
  /^(читайте также|подписывайтесь|подписаться|поделиться|фото:|источник:|\d+\s*фото|оставайтесь на связи)/i;

/** Абзацы текста в вёрстке Ленты.ру: у каждого свой класс, боковые блоки его не имеют. */
const LENTA_PARAGRAPH = /<p[^>]+class="[^"]*topic-body__content-text[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;

export function extractArticle(html: string, pageUrl: string): ArticleContent | null {
  const lenta = [...html.matchAll(LENTA_PARAGRAPH)].map((match) => match[1] ?? '');
  const body = lenta.length > 0 ? lenta : paragraphsOfArticleTag(html);
  if (body.length === 0) return null;

  const paragraphs = body.map(htmlToText).filter((text) => text.length > 0 && !NOISE.test(text));
  if (paragraphs.length === 0) return null;

  return { paragraphs, imageUrl: lenta.length > 0 ? null : firstImage(articleTag(html), pageUrl) };
}

function articleTag(html: string): string {
  return html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? '';
}

function paragraphsOfArticleTag(html: string): string[] {
  const clean = articleTag(html)
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    // Заголовок статьи у нас уже есть из ленты — второй раз в тексте он не нужен
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, ' ');

  return [...clean.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => match[1] ?? '');
}

function firstImage(articleHtml: string, pageUrl: string): string | null {
  const src = articleHtml.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  if (!src) return null;

  try {
    const absolute = new URL(src.replace(/&amp;/g, '&'), pageUrl);
    if (absolute.protocol !== 'https:' && absolute.protocol !== 'http:') return null;
    return absolute.toString().slice(0, 1000);
  } catch {
    return null;
  }
}
