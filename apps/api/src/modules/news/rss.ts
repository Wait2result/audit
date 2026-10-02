import { XMLParser } from 'fast-xml-parser';

/** Запись RSS-ленты в общем виде, не зависящем от источника. */
export interface RawFeedItem {
  guid: string;
  url: string;
  title: string;
  /** Краткое описание из ленты (у РИА «Дагестан» это лишь «МАХАЧКАЛА, 18 сентября») */
  description: string;
  /** Полный текст в виде абзацев обычного текста, если лента его отдаёт */
  paragraphs: string[] | null;
  imageUrl: string | null;
  category: string | null;
  publishedAt: Date;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Полный текст у РИА «Дагестан» приходит экранированным HTML внутри тега:
  // разбирать его как XML не нужно, строка нужна целиком
  processEntities: true,
  trimValues: true,
});

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&laquo;': '«',
  '&raquo;': '»',
  '&ndash;': '–',
  '&mdash;': '—',
  '&hellip;': '…',
};

/** Эмодзи и их «склейки»: в тексте новости они выглядят как мусор из соцсетей. */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]|\u{FE0F}|\u{200D}/gu;

/** Превращает HTML в обычный текст: теги убираются, сущности раскрываются. */
export function htmlToText(html: string): string {
  return (
    html
      .replace(EMOJI, '')
      // Строчные теги (жирный, ссылка) внутри слова или перед точкой пробела не дают:
      // иначе «<b>РИА «Дагестан».</b>» превращается в «РИА «Дагестан» .»
      .replace(/<\/?(?:b|i|u|em|strong|span|a|font|sup|sub)\b[^>]*>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(?:#(\d+)|#x([0-9a-f]+)|[a-z]+);/gi, (entity, dec: string, hex: string) => {
        if (dec) return String.fromCodePoint(Number(dec));
        if (hex) return String.fromCodePoint(parseInt(hex, 16));
        return ENTITIES[entity.toLowerCase()] ?? ' ';
      })
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Делит HTML полного текста на абзацы обычного текста. Сырой HTML в
 * приложение не отдаётся никогда: приложение рисует только текст.
 */
export function htmlToParagraphs(html: string): string[] {
  return (
    html
      .replace(/<\/(p|div|h[1-6]|li|blockquote)>|<br\s*\/?>/gi, '\n\n')
      .split(/\n{2,}/)
      .map(htmlToText)
      // «… РИА «Дагестан». . В Махачкале …» — источник ставит лишнюю точку после подписи
      .map((paragraph) => paragraph.replace(/\.\s+\.(?=\s+[А-ЯЁA-Z«"])/g, '.'))
      .filter((paragraph) => paragraph.length > 0)
  );
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && '#text' in value)
    return text((value as Record<string, unknown>)['#text']);
  return '';
}

const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;

/** В enclosure часто лежит видео или звук — картинкой считаем только изображение. */
function isImage(attributes: { '@_url'?: string; '@_type'?: string } | undefined): string | null {
  const url = attributes?.['@_url'];
  if (!url) return null;

  const type = attributes['@_type'];
  if (type) return type.startsWith('image/') ? url : null;
  return IMAGE_EXTENSION.test(url) ? url : null;
}

/** Убирает служебные картинки: смайлы, значки, счётчики. */
function isContentImage(url: string): boolean {
  return (
    !/emoji|smiley|favicon|pixel|counter|\/icons?\//i.test(url) && !/\.svg(?:[?#]|$)/i.test(url)
  );
}

function firstImage(item: Record<string, unknown>, html: string): string | null {
  // Вложений может быть несколько (видео и фото рядом) — берём первое изображение
  for (const key of ['enclosure', 'media:content']) {
    const attached = [item[key]].flat() as ({ '@_url'?: string; '@_type'?: string } | undefined)[];
    for (const candidate of attached) {
      const image = isImage(candidate);
      if (image) return image;
    }
  }

  for (const match of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    const src = match[1];
    if (src && isContentImage(src)) return src;
  }
  return null;
}

/**
 * Рубрика для показа: у АиФ она приходит капсом и с подрубрикой
 * («ПРОИСШЕСТВИЯ: ДТП»), в карточке нужно просто «Происшествия».
 */
function normalizeCategory(raw: string): string | null {
  const head = raw.split(':')[0]?.trim() ?? '';
  if (!head) return null;

  const letters = head.replace(/[^а-яёa-z]/gi, '');
  if (letters.length > 1 && letters === letters.toUpperCase()) {
    const lower = head.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return head;
}

export function parseFeed(xml: string): RawFeedItem[] {
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const raw = parsed.rss?.channel?.item;
  const items = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Record<string, unknown>[];

  const result: RawFeedItem[] = [];

  for (const item of items) {
    const url = text(item.link).trim();
    const title = htmlToText(text(item.title));
    const publishedAt = new Date(text(item.pubDate));

    if (!url || !title || Number.isNaN(publishedAt.getTime())) continue;

    const full = text(item['yandex:full-text']) || text(item['content:encoded']);
    const paragraphs = full ? htmlToParagraphs(full) : [];

    result.push({
      guid: text(item.guid) || url,
      url,
      title,
      description: htmlToText(text(item.description)),
      paragraphs: paragraphs.length > 0 ? paragraphs : null,
      imageUrl: firstImage(item, full),
      // У WordPress-лент рубрик несколько — первая описывает материал лучше всего
      category: normalizeCategory(
        [item.category]
          .flat()
          .map((value) => htmlToText(text(value)))
          .find(Boolean) ?? '',
      ),
      publishedAt,
    });
  }

  return result;
}
