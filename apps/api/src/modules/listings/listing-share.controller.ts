import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { LISTING_PRICE_UNIT_SUFFIX, uuidSchema, type ListingDetailsDto } from '@dagestan/shared';
import type { FastifyReply } from 'fastify';

import { Public } from '../../common/decorators/index.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ListingsService } from './listings.service.js';

/**
 * Короткая ссылка на объявление для «Поделиться»: `/l/:id` (без префикса
 * API — её видят люди и мессенджеры).
 *
 * Страница делает две вещи: отдаёт превью (Open Graph — заголовок, цена,
 * фото) и пробует открыть объявление в приложении по
 * `dagestan://listings/:id`. Нет приложения — человек видит объявление
 * коротко и кнопку «Открыть в приложении».
 */
@ApiExcludeController()
@Controller('l')
export class ListingShareController {
  constructor(private readonly listings: ListingsService) {}

  @Get(':id')
  @Public()
  async page(@Param('id') id: string, @Res() reply: FastifyReply): Promise<void> {
    const listing = await this.find(id);
    // Ответ — HTML-страница для человека, а не JSON: и найденное, и «нет
    // такого» отдаются страницей
    await reply
      .status(listing ? 200 : 404)
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Cache-Control', listing ? 'public, max-age=300' : 'no-store')
      // Своя политика вместо общей API: странице нужны встроенные стиль и
      // скрипт перехода в приложение, фото — с хранилища. Больше ничего
      .header(
        'Content-Security-Policy',
        "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      )
      .send(listing ? sharePage(listing) : missingPage());
  }

  /** Снятое, архивное, чужой черновик, неверная ссылка — «нет такого». */
  private async find(id: string): Promise<ListingDetailsDto | null> {
    const parsed = uuidSchema.safeParse(id);
    if (!parsed.success) return null;
    try {
      const listing = await this.listings.findOne(parsed.data, undefined, null);
      // Проданное и снятое видно как история в профиле продавца, но
      // делиться им незачем: по ссылке человек ждёт живое предложение
      return listing.availability === 'active' ? listing : null;
    } catch (error) {
      if (error instanceof AppException && error.getStatus() === 404) return null;
      throw error;
    }
  }
}

export function sharePage(listing: ListingDetailsDto): string {
  const appUrl = `dagestan://listings/${listing.id}`;
  const price = priceText(listing);
  const image = listing.photos[0]?.url ?? null;
  const description = [price, listing.location.label, listing.attributesSummary]
    .filter(Boolean)
    .join(' · ');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(listing.title)} — Дагестан Здесь</title>
<meta property="og:type" content="website" />
<meta property="og:title" content="${escape(listing.title)}" />
<meta property="og:description" content="${escape(description)}" />
${image ? `<meta property="og:image" content="${escape(image)}" />` : ''}
<style>
  body { margin: 0; font-family: -apple-system, system-ui, sans-serif; background: #0D181A; color: #F0F4F3; }
  main { max-width: 480px; margin: 0 auto; padding: 24px 16px; }
  img { width: 100%; border-radius: 16px; aspect-ratio: 4 / 3; object-fit: cover; background: #172629; }
  h1 { font-size: 20px; margin: 16px 0 4px; }
  .price { font-size: 24px; font-weight: 700; margin: 0; }
  .meta { color: #91A4A4; margin: 4px 0 24px; }
  a.open { display: block; text-align: center; padding: 14px; border-radius: 999px; background: #22CFC2; color: #04211F; font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<main>
  ${image ? `<img src="${escape(image)}" alt="" />` : ''}
  <h1>${escape(listing.title)}</h1>
  <p class="price">${escape(price)}</p>
  <p class="meta">${escape([listing.location.label, listing.attributesSummary].filter(Boolean).join(' · '))}</p>
  <a class="open" href="${appUrl}">Открыть в приложении «Дагестан Здесь»</a>
</main>
<script>setTimeout(function () { location.href = ${JSON.stringify(appUrl)}; }, 300);</script>
</body>
</html>`;
}

function missingPage(): string {
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Объявление снято — Дагестан Здесь</title>
<style>body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#0D181A;color:#F0F4F3}
main{max-width:480px;margin:0 auto;padding:48px 16px;text-align:center}p{color:#91A4A4}</style>
</head><body><main><h1>Объявление недоступно</h1>
<p>Его сняли с публикации или ссылка неверная. Похожие объявления — в разделе «Объявления» приложения «Дагестан Здесь».</p>
</main></body></html>`;
}

function priceText(listing: ListingDetailsDto): string {
  const { value, unit, isNegotiable } = listing.price;
  if (value === null) return isNegotiable ? 'Цена договорная' : 'Цена не указана';
  const rubles = Math.round(value / 100).toLocaleString('ru-RU');
  return `${rubles} ₽${LISTING_PRICE_UNIT_SUFFIX[unit]}`;
}

function escape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
