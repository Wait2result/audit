import { canCustomerCancel, canTransition, OrderStatus } from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import {
  priceOrder,
  type PricingMenuItem,
  type PricingPlace,
} from '../src/modules/orders/order-pricing.js';

/**
 * Расчёт заказа.
 *
 * Здесь считаются деньги, поэтому проверяется не только «сумма сошлась»,
 * но и попытки её занизить: чужие опции, позиции другого заведения,
 * стоп-лист.
 */

const place: PricingPlace = {
  minOrderAmount: 50000, // 500 ₽
  deliveryFee: 15000, // 150 ₽
  freeDeliveryFrom: 150000, // 1500 ₽
};

const shashlik: PricingMenuItem = {
  id: 'item-1',
  placeId: 'place-1',
  name: 'Шашлык',
  price: 60000,
  isAvailable: true,
  groups: [
    {
      id: 'group-1',
      name: 'Соус',
      minChoices: 0,
      maxChoices: 2,
      options: [
        { id: 'opt-1', name: 'Наршараб', priceDelta: 5000, isAvailable: true },
        { id: 'opt-2', name: 'Томатный', priceDelta: 0, isAvailable: true },
      ],
    },
  ],
};

const lavash: PricingMenuItem = {
  id: 'item-2',
  placeId: 'place-1',
  name: 'Лаваш',
  price: 5000,
  isAvailable: true,
  groups: [],
};

const menu = new Map([shashlik, lavash].map((item) => [item.id, item]));

const draft = (
  items: { menuItemId: string; quantity: number; optionIds?: string[] }[],
  fulfillment: 'delivery' | 'pickup' = 'delivery',
) => ({
  placeId: 'place-1',
  fulfillment,
  items: items.map((item) => ({ ...item, optionIds: item.optionIds ?? [] })),
});

describe('Расчёт заказа', () => {
  it('складывает позиции и добавляет доставку', () => {
    const result = priceOrder(draft([{ menuItemId: 'item-1', quantity: 2 }]), place, menu);

    expect(result.itemsTotal).toBe(120000);
    expect(result.deliveryFee).toBe(15000);
    expect(result.total).toBe(135000);
    expect(result.problem).toBeNull();
  });

  it('учитывает надбавку за опции в цене каждой единицы', () => {
    const result = priceOrder(
      draft([{ menuItemId: 'item-1', quantity: 2, optionIds: ['opt-1'] }]),
      place,
      menu,
    );

    // (600 + 50) × 2
    expect(result.items[0]?.unitPrice).toBe(65000);
    expect(result.itemsTotal).toBe(130000);
    expect(result.items[0]?.options).toEqual([
      { group: 'Соус', option: 'Наршараб', priceDelta: 5000 },
    ]);
  });

  it('при самовывозе доставка не считается и минимум не требуется', () => {
    const result = priceOrder(
      draft([{ menuItemId: 'item-2', quantity: 1 }], 'pickup'),
      place,
      menu,
    );

    expect(result.deliveryFee).toBe(0);
    expect(result.total).toBe(5000);
    expect(result.problem).toBeNull();
  });

  it('доставка бесплатна от заданной суммы', () => {
    const result = priceOrder(draft([{ menuItemId: 'item-1', quantity: 3 }]), place, menu);

    expect(result.itemsTotal).toBe(180000);
    expect(result.deliveryFee).toBe(0);
    expect(result.total).toBe(180000);
  });

  it('заказ ниже минимальной суммы не проходит, и видно, сколько не хватает', () => {
    const result = priceOrder(draft([{ menuItemId: 'item-2', quantity: 1 }]), place, menu);

    expect(result.amountToMinimum).toBe(45000);
    expect(result.problem).toContain('450');
  });
});

describe('Защита расчёта от подделки', () => {
  it('позиция из стоп-листа не даёт оформить заказ', () => {
    const stopped = new Map(menu);
    stopped.set('item-1', { ...shashlik, isAvailable: false });

    const result = priceOrder(draft([{ menuItemId: 'item-1', quantity: 1 }]), place, stopped);

    expect(result.problem).toBe('«Шашлык» закончилось');
    expect(result.itemsTotal).toBe(0);
  });

  it('позиция чужого заведения отбрасывается', () => {
    const foreign = new Map(menu);
    foreign.set('item-3', { ...lavash, id: 'item-3', placeId: 'place-2' });

    const result = priceOrder(
      draft([
        { menuItemId: 'item-1', quantity: 1 },
        { menuItemId: 'item-3', quantity: 1 },
      ]),
      place,
      foreign,
    );

    expect(result.problem).toBe('Позиции из разных заведений нельзя заказать вместе');
    expect(result.items).toHaveLength(1);
  });

  it('опция от другого блюда не применяется', () => {
    const result = priceOrder(
      draft([{ menuItemId: 'item-2', quantity: 1, optionIds: ['opt-1'] }]),
      place,
      menu,
    );

    expect(result.problem).toBe('Часть выбранных вариантов не относится к этому блюду');
    // Надбавка не попала в цену лаваша
    expect(result.items[0]?.unitPrice).toBe(5000);
  });

  it('несуществующая позиция не обнуляет заказ молча', () => {
    const result = priceOrder(draft([{ menuItemId: 'нет-такой', quantity: 1 }]), place, menu);

    expect(result.problem).toBe('Одна из позиций больше не продаётся');
  });

  it('обязательный выбор нельзя пропустить', () => {
    const required = new Map(menu);
    required.set('item-1', {
      ...shashlik,
      groups: [{ ...shashlik.groups[0]!, minChoices: 1 }],
    });

    const result = priceOrder(draft([{ menuItemId: 'item-1', quantity: 1 }]), place, required);

    expect(result.problem).toBe('Для «Шашлык» нужно выбрать: Соус');
  });

  it('больше вариантов, чем разрешено группой, — отказ', () => {
    const limited = new Map(menu);
    limited.set('item-1', { ...shashlik, groups: [{ ...shashlik.groups[0]!, maxChoices: 1 }] });

    const result = priceOrder(
      draft([{ menuItemId: 'item-1', quantity: 1, optionIds: ['opt-1', 'opt-2'] }]),
      place,
      limited,
    );

    expect(result.problem).toContain('слишком много вариантов');
  });
});

describe('Статусы заказа', () => {
  it('идут по порядку: новый → принят → готовится → в пути → выполнен', () => {
    expect(canTransition(OrderStatus.NEW, OrderStatus.ACCEPTED)).toBe(true);
    expect(canTransition(OrderStatus.ACCEPTED, OrderStatus.PREPARING)).toBe(true);
    expect(canTransition(OrderStatus.PREPARING, OrderStatus.ON_THE_WAY)).toBe(true);
    expect(canTransition(OrderStatus.ON_THE_WAY, OrderStatus.COMPLETED)).toBe(true);
  });

  it('нельзя перескочить через этап и вернуть выполненный заказ', () => {
    expect(canTransition(OrderStatus.NEW, OrderStatus.COMPLETED)).toBe(false);
    expect(canTransition(OrderStatus.COMPLETED, OrderStatus.PREPARING)).toBe(false);
    expect(canTransition(OrderStatus.CANCELLED, OrderStatus.ACCEPTED)).toBe(false);
  });

  it('самовывоз идёт через «готов к выдаче»', () => {
    expect(canTransition(OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP)).toBe(true);
    expect(canTransition(OrderStatus.READY_FOR_PICKUP, OrderStatus.COMPLETED)).toBe(true);
  });

  it('покупатель отменяет только пока не начали готовить', () => {
    expect(canCustomerCancel(OrderStatus.NEW)).toBe(true);
    expect(canCustomerCancel(OrderStatus.ACCEPTED)).toBe(true);
    expect(canCustomerCancel(OrderStatus.PREPARING)).toBe(false);
    expect(canCustomerCancel(OrderStatus.ON_THE_WAY)).toBe(false);
  });
});
