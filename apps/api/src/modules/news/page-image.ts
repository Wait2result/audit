/**
 * Поиск фото новости на странице статьи.
 *
 * Сначала — картинка, которую издание само указывает для превью ссылки
 * (og:image): так делают мессенджеры, файл не копируется, приложение
 * подгружает его по адресу издания. Если её нет, ищем фото в вёрстке,
 * которую знаем по конкретным сайтам.
 */

function absolute(found: string, pageUrl: string): string | null {
  try {
    const url = new URL(found.replace(/&amp;/g, '&'), pageUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString().slice(0, 1000);
  } catch {
    return null;
  }
}

export function extractOgImage(html: string, pageUrl: string): string | null {
  const patterns = [
    /<meta[^>]+(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i,
  ];

  for (const pattern of patterns) {
    const found = html.match(pattern)?.[1];
    const url = found ? absolute(found, pageUrl) : null;
    if (url) return url;
  }

  return null;
}

/**
 * Слайдер фотографий поста в вёрстке «Каспий-Медиа»: снимки лежат не в тегах
 * `<img>`, а ссылками и CSS-фоном внутри блока `content_slider_single`. Искать
 * по всей странице нельзя — в боковой ленте лежат превью чужих новостей.
 */
export function extractSliderImage(html: string, pageUrl: string): string | null {
  const start = html.indexOf('content_slider_single');
  if (start < 0) return null;

  const block = html.slice(start, start + 4000);
  const found = block.match(/href=["']([^"']+\.(?:jpe?g|png|webp))["']/i)?.[1];
  return found ? absolute(found, pageUrl) : null;
}

export function extractPageImage(html: string, pageUrl: string): string | null {
  return extractOgImage(html, pageUrl) ?? extractSliderImage(html, pageUrl);
}
