import {
  FulfillmentType,
  type OrderDraftDto,
  type OrderItemDto,
  type OrderItemOptionDto,
} from '@dagestan/shared';

/**
 * Расчёт заказа — единственное место, где складываются деньги.
 *
 * Общее для предварительного расчёта и для оформления: если считать в двух
 * местах, они однажды разойдутся, и человек увидит одну сумму, а заплатит
 * другую. Цены берутся только из базы; всё, что прислал клиент, — это
 * идентификаторы и количество.
 */

export interface PricingMenuItem {
  id: string;
  placeId: string;
  name: string;
  price: number;
  isAvailable: boolean;
  groups: {
    id: string;
    name: string;
    minChoices: number;
    maxChoices: number;
    options: { id: string; name: string; priceDelta: number; isAvailable: boolean }[];
  }[];
}

export interface PricingPlace {
  minOrderAmount: number;
  deliveryFee: number;
  freeDeliveryFrom: number | null;
}

export interface PricedOrder {
  items: OrderItemDto[];
  itemsTotal: number;
  deliveryFee: number;
  total: number;
  amountToMinimum: number;
  /** Первая причина, по которой заказ сейчас невозможен */
  problem: string | null;
}

/**
 * Считает заказ и заодно проверяет его состав.
 *
 * Проблемы не выбрасываются исключением, а возвращаются строкой: экран
 * оформления должен показать сумму и рядом объяснить, чего не хватает,
 * а не остаться пустым.
 */
export function priceOrder(
  draft: OrderDraftDto,
  place: PricingPlace,
  menu: Map<string, PricingMenuItem>,
): PricedOrder {
  const items: OrderItemDto[] = [];
  let problem: string | null = null;

  const fail = (message: string) => {
    problem ??= message;
  };

  for (const line of draft.items) {
    const menuItem = menu.get(line.menuItemId);

    if (!menuItem) {
      fail('Одна из позиций больше не продаётся');
      continue;
    }
    if (menuItem.placeId !== draft.placeId) {
      fail('Позиции из разных заведений нельзя заказать вместе');
      continue;
    }
    if (!menuItem.isAvailable) {
      fail(`«${menuItem.name}» закончилось`);
      continue;
    }

    const chosen = resolveOptions(menuItem, line.optionIds, fail);
    const unitPrice = menuItem.price + chosen.reduce((sum, option) => sum + option.priceDelta, 0);

    items.push({
      id: menuItem.id,
      name: menuItem.name,
      unitPrice,
      quantity: line.quantity,
      options: chosen,
      lineTotal: unitPrice * line.quantity,
    });
  }

  const itemsTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const isDelivery = draft.fulfillment === FulfillmentType.DELIVERY;

  const deliveryFee =
    isDelivery && !(place.freeDeliveryFrom !== null && itemsTotal >= place.freeDeliveryFrom)
      ? place.deliveryFee
      : 0;

  const amountToMinimum =
    isDelivery && itemsTotal < place.minOrderAmount ? place.minOrderAmount - itemsTotal : 0;

  if (amountToMinimum > 0) {
    fail(`До минимального заказа не хватает ${formatRubles(amountToMinimum)}`);
  }

  return {
    items,
    itemsTotal,
    deliveryFee,
    total: itemsTotal + deliveryFee,
    amountToMinimum,
    problem,
  };
}

/**
 * Разбирает выбранные опции: чужие отсекаются, обязательность и предел
 * количества проверяются по группам самой позиции.
 */
function resolveOptions(
  menuItem: PricingMenuItem,
  optionIds: string[],
  fail: (message: string) => void,
): OrderItemOptionDto[] {
  const selected = new Set(optionIds);
  const chosen: OrderItemOptionDto[] = [];
  let matched = 0;

  for (const group of menuItem.groups) {
    const inGroup = group.options.filter((option) => selected.has(option.id));
    matched += inGroup.length;

    if (inGroup.length < group.minChoices) {
      fail(`Для «${menuItem.name}» нужно выбрать: ${group.name}`);
    }
    if (inGroup.length > group.maxChoices) {
      fail(`В группе «${group.name}» выбрано слишком много вариантов`);
    }

    for (const option of inGroup) {
      if (!option.isAvailable) {
        fail(`«${option.name}» закончилось`);
        continue;
      }
      chosen.push({ group: group.name, option: option.name, priceDelta: option.priceDelta });
    }
  }

  // Опция от другой позиции — попытка удешевить заказ подставным набором
  if (matched !== selected.size) {
    fail('Часть выбранных вариантов не относится к этому блюду');
  }

  return chosen;
}

/** «250 ₽» — только для сообщений об ошибке, в остальном форматирует клиент. */
function formatRubles(kopecks: number): string {
  return `${(kopecks / 100).toLocaleString('ru-RU')} ₽`;
}
