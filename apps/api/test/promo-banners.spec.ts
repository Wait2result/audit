import { createPromoBannerSchema, updatePromoBannerSchema } from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { PromoBannersService } from '../src/modules/places/promo-banners.service.js';

/**
 * Рекламная карусель главной: срок показа, действие при нажатии и
 * совместимость со старыми клиентами, которые знают только заведение.
 */

const PLACE = '0b0b0b0b-0000-4000-8000-000000000001';

type Row = Record<string, unknown> & { id: string; startsAt: Date | null; endsAt: Date | null };

function fake(rows: Row[] = []) {
  const calls: { findMany: unknown[]; create: unknown[]; update: unknown[] } = {
    findMany: [],
    create: [],
    update: [],
  };
  const base = {
    placement: 'home',
    title: 'BURGER HOUSE',
    subtitle: 'Сочные бургеры',
    imageMediaId: null,
    targetPlaceId: null,
    actionType: 'none',
    actionValue: null,
    sortOrder: 0,
    isActive: true,
    deletedAt: null,
  };
  const prisma = {
    promoBanner: {
      findMany: (args: unknown) => {
        calls.findMany.push(args);
        return Promise.resolve(rows.map((row) => ({ ...base, ...row, targetPlace: null })));
      },
      findFirst: () => Promise.resolve({ ...base, id: 'b1', startsAt: null, endsAt: null }),
      create: (args: { data: Record<string, unknown> }) => {
        calls.create.push(args.data);
        rows.push({ startsAt: null, endsAt: null, ...base, ...args.data, id: 'b1' });
        return Promise.resolve({ ...base, ...args.data, id: 'b1' });
      },
      update: (args: { data: Record<string, unknown> }) => {
        calls.update.push(args.data);
        return Promise.resolve({ ...base, ...args.data, id: 'b1' });
      },
    },
    place: { findFirst: () => Promise.resolve({ id: PLACE }) },
  };
  const audit = { record: () => Promise.resolve() };
  const media = { findByIds: () => Promise.resolve([]), attach: () => Promise.resolve() };
  return {
    calls,
    service: new PromoBannersService(prisma as never, audit as never, media as never),
  };
}

describe('срок показа', () => {
  it('карусель просит у базы только карточки, у которых срок идёт сейчас', async () => {
    const { service, calls } = fake([]);
    await service.list('home');
    const where = JSON.stringify((calls.findMany[0] as { where: unknown }).where);
    expect(where).toContain('"isActive":true');
    expect(where).toContain('{"startsAt":null}');
    expect(where).toContain('"startsAt":{"lte"');
    expect(where).toContain('{"endsAt":null}');
    expect(where).toContain('"endsAt":{"gt"');
  });

  it('фото плиток — с тем же сроком показа', async () => {
    const { service, calls } = fake([]);
    await service.homeTiles();
    expect(JSON.stringify(calls.findMany[0])).toContain('"endsAt":{"gt"');
  });

  it('окончание раньше начала — ошибка формы', () => {
    const result = createPromoBannerSchema.safeParse({
      placement: 'home',
      title: 'BURGER HOUSE',
      startsAt: '2026-10-20T09:00:00Z',
      endsAt: '2026-10-19T09:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('действие при нажатии', () => {
  const card = (actionType: string, actionValue: string | null) =>
    createPromoBannerSchema.safeParse({
      placement: 'home',
      title: 'Реклама',
      actionType,
      actionValue,
    }).success;

  it('значение соответствует типу: рубрика, экран из списка, только https', () => {
    expect(card('rubric', 'listings')).toBe(true);
    expect(card('rubric', 'realty')).toBe(false);
    expect(card('screen', '/listings/new')).toBe(true);
    expect(card('screen', '/admin')).toBe(false);
    expect(card('url', 'https://burgerhouse.ru')).toBe(true);
    expect(card('url', 'http://burgerhouse.ru')).toBe(false);
    expect(card('url', 'javascript:alert(1)')).toBe(false);
    expect(card('place', PLACE)).toBe(true);
    expect(card('place', 'не-id')).toBe(false);
    expect(card('none', null)).toBe(true);
  });

  it('заведение хранится связью, а приложению приходит значением действия', async () => {
    const { service, calls } = fake();
    const created = await service.create(
      { placement: 'home', title: 'Бургеры', actionType: 'place', actionValue: PLACE } as never,
      'admin',
      {},
    );
    expect(calls.create[0]).toMatchObject({
      actionType: 'place',
      actionValue: null,
      targetPlaceId: PLACE,
    });
    expect(created.actionType).toBe('place');
    expect(created.actionValue).toBe(PLACE);
  });

  it('старый клиент присылает только заведение — это «открыть заведение»', async () => {
    const { service, calls } = fake();
    await service.create(
      { placement: 'home', title: 'Бургеры', targetPlaceId: PLACE } as never,
      'admin',
      {},
    );
    expect(calls.create[0]).toMatchObject({ actionType: 'place', targetPlaceId: PLACE });
  });

  it('рубрика и ссылка — без заведения; правка без действия его не трогает', async () => {
    const { service, calls } = fake();
    await service.create(
      {
        placement: 'home',
        title: 'Объявления',
        actionType: 'rubric',
        actionValue: 'listings',
      } as never,
      'admin',
      {},
    );
    expect(calls.create[0]).toMatchObject({
      actionType: 'rubric',
      actionValue: 'listings',
      targetPlaceId: null,
    });

    await service.update('b1', { title: 'Новое название' }, 'admin', {});
    expect(calls.update[0]).not.toHaveProperty('actionType');
    expect(updatePromoBannerSchema.safeParse({ title: 'Только название' }).success).toBe(true);
  });
});
