import { describe, expect, it, vi } from 'vitest';

import {
  ListingViewsService,
  VIEWS_PER_IP_HOUR,
  viewKey,
  viewerId,
} from '../src/modules/listings/listing-views.service.js';

/**
 * Просмотры: человек, а не обновление страницы (ТЗ «Объявления», п. 12).
 */

function setup() {
  const marks = new Set<string>();
  const counters = new Map<string, number>();
  const redis = {
    setIfAbsent: vi.fn((key: string) => {
      if (marks.has(key)) return Promise.resolve(false);
      marks.add(key);
      return Promise.resolve(true);
    }),
    incrementWithTtl: vi.fn((key: string, windowSeconds: number) => {
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return Promise.resolve({ count, ttl: windowSeconds });
    }),
  };
  const updateMany = vi.fn(() => Promise.resolve({ count: 1 }));
  const prisma = { listing: { updateMany } };
  const service = new ListingViewsService(prisma as never, redis as never);
  return { service, updateMany, redis };
}

const LISTING = '11111111-1111-4111-8111-111111111111';

describe('Просмотры объявления', () => {
  it('один вошедший за сутки — один просмотр', async () => {
    const { service, updateMany } = setup();
    expect(await service.count(LISTING, { userId: 'u1', ip: '10.0.0.1' })).toBe(true);
    expect(await service.count(LISTING, { userId: 'u1', ip: '10.0.0.2' })).toBe(false);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('гость узнаётся по адресу и браузеру; другой браузер — другой зритель', async () => {
    const { service, updateMany } = setup();
    await service.count(LISTING, { ip: '10.0.0.1', userAgent: 'Safari' });
    await service.count(LISTING, { ip: '10.0.0.1', userAgent: 'Safari' });
    await service.count(LISTING, { ip: '10.0.0.1', userAgent: 'Chrome' });
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it('без аккаунта и адреса зрителя не определить — не считаем', async () => {
    const { service, updateMany } = setup();
    expect(await service.count(LISTING, {})).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('скрипт с одного адреса не накручивает сверх часового лимита', async () => {
    const { service, updateMany } = setup();
    for (let index = 0; index < VIEWS_PER_IP_HOUR + 20; index += 1) {
      await service.count(`listing-${index}`, { ip: '10.9.9.9', userAgent: 'bot' });
    }
    expect(updateMany).toHaveBeenCalledTimes(VIEWS_PER_IP_HOUR);
  });

  it('Redis недоступен — просмотр не засчитывается, запрос не падает', async () => {
    const { service, updateMany, redis } = setup();
    redis.setIfAbsent.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await service.count(LISTING, { userId: 'u1' })).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('адрес не хранится в ключе открытым текстом', () => {
    const id = viewerId({ ip: '192.168.1.15', userAgent: 'x' });
    expect(id).not.toContain('192.168');
    expect(viewKey(LISTING, id ?? '')).toMatch(/^lv:/);
  });
});
