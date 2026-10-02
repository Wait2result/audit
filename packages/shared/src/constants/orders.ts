/**
 * Заказы (Этап 6).
 *
 * Онлайн-оплаты пока нет: юрлица, онлайн-кассы по 54-ФЗ и договора с
 * платёжным сервисом нет, поэтому заказ оплачивается при получении.
 */

export const OrderStatus = {
  /** Оформлен, заведение его ещё не видело */
  NEW: 'new',
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  ON_THE_WAY: 'on_the_way',
  READY_FOR_PICKUP: 'ready_for_pickup',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Новый',
  accepted: 'Принят',
  preparing: 'Готовится',
  on_the_way: 'В пути',
  ready_for_pickup: 'Готов к выдаче',
  completed: 'Выполнен',
  cancelled: 'Отменён',
};

/** Что видит покупатель: без внутренней кухни, понятным языком. */
export const ORDER_STATUS_HINTS: Record<OrderStatus, string> = {
  new: 'Заведение скоро подтвердит заказ',
  accepted: 'Заказ принят, скоро начнут готовить',
  preparing: 'Ваш заказ готовят',
  on_the_way: 'Курьер уже едет к вам',
  ready_for_pickup: 'Заказ готов, можно забирать',
  completed: 'Заказ выполнен',
  cancelled: 'Заказ отменён',
};

export const FulfillmentType = {
  DELIVERY: 'delivery',
  PICKUP: 'pickup',
} as const;

export type FulfillmentType = (typeof FulfillmentType)[keyof typeof FulfillmentType];

export const FULFILLMENT_LABELS: Record<FulfillmentType, string> = {
  delivery: 'Доставка',
  pickup: 'Самовывоз',
};

export const PaymentMethod = {
  CASH_ON_DELIVERY: 'cash_on_delivery',
  CARD_ON_DELIVERY: 'card_on_delivery',
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash_on_delivery: 'Наличными при получении',
  card_on_delivery: 'Картой при получении',
};

/**
 * Куда можно перевести заказ из текущего состояния.
 *
 * Таблица одна на всех: сервер по ней проверяет, приложение по ней рисует
 * кнопки. Разойтись они не могут, потому что источник один.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['on_the_way', 'ready_for_pickup', 'cancelled'],
  on_the_way: ['completed', 'cancelled'],
  ready_for_pickup: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Заказ ещё в работе — такие показываются наверху списка. */
export function isOrderActive(status: OrderStatus): boolean {
  return status !== OrderStatus.COMPLETED && status !== OrderStatus.CANCELLED;
}

/**
 * Покупатель может отменить только пока заказ не начали готовить: дальше
 * продукты уже потрачены, и отмена — разговор с заведением, а не кнопка.
 */
export function canCustomerCancel(status: OrderStatus): boolean {
  return status === OrderStatus.NEW || status === OrderStatus.ACCEPTED;
}

/** Сколько позиций и какого количества разумно для одного заказа. */
export const ORDER_LIMITS = {
  maxPositions: 40,
  maxQuantityPerPosition: 99,
} as const;
