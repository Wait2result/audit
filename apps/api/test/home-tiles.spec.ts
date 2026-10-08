import { HOME_TILE_KEYS, homeTilePlacement, promoPlacementSchema } from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { PromoBannersService } from '../src/modules/places/promo-banners.service.js';

/**
 * Фото плиток главной из панели: карточка промо-баннера с местом показа
 * `tile_*`. Главная получает все плитки одним ответом.
 */

type Row = {
  id: string;
  placement: string;
  title: string;
  subtitle: string | null;
  imageMediaId: string | null;
  targetPlaceId: string | null;
  sortOrder: number;
  isActive: boolean;
};

const row = (
  id: string,
  placement: string,
  sortOrder: number,
  imageMediaId: string | null = null,
): Row => ({
  id,
  placement,
  title: id,
  subtitle: null,
  imageMediaId,
  targetPlaceId: null,
  sortOrder,
  isActive: true,
});

function service(rows: Row[]) {
  const queries: unknown[] = [];
  const prisma = {
    promoBanner: {
      findMany: (args: { where: { placement: { in: string[] } } }) => {
        queries.push(args);
        // База отдаёт уже по порядку панели — как orderBy sortOrder
        return Promise.resolve(
          rows
            .filter((item) => args.where.placement.in.includes(item.placement))
            .sort((a, b) => a.sortOrder - b.sortOrder),
        );
      },
    },
  };
  const media = {
    findByIds: (ids: string[]) =>
      Promise.resolve(
        ids.map((id) => ({ id, url: `https://cdn/${id}.webp`, thumbnailUrl: null, type: 'image' })),
      ),
  };
  return {
    queries,
    tiles: new PromoBannersService(prisma as never, {} as never, media as never),
  };
}

describe('фото плиток главной', () => {
  it('места показа плиток проходят проверку и называются tile_*', () => {
    for (const key of HOME_TILE_KEYS) {
      expect(promoPlacementSchema.parse(homeTilePlacement(key))).toBe(`tile_${key}`);
    }
    expect(() => promoPlacementSchema.parse('tile_realty')).toThrow();
  });

  it('по одной карточке на плитку — первая в порядке панели, без своей — null', async () => {
    const { tiles, queries } = service([
      row('order-second', 'tile_order', 1, 'm2'),
      row('order-first', 'tile_order', 0, 'm1'),
      row('news', 'tile_news', 0),
      row('carousel', 'home', 0, 'm3'),
    ]);
    const result = await tiles.homeTiles();

    expect(result.order?.id).toBe('order-first');
    expect(result.order?.image?.url).toBe('https://cdn/m1.webp');
    expect(result.news?.id).toBe('news');
    expect(result.news?.image).toBeNull();
    expect(result.listings).toBeNull();
    expect(result.cinema).toBeNull();
    expect(result.rides).toBeNull();
    // Карусель главной в плитки не попадает, и запрос к базе — один на все плитки
    expect(Object.values(result).some((item) => item?.id === 'carousel')).toBe(false);
    expect(queries).toHaveLength(1);
  });
});
