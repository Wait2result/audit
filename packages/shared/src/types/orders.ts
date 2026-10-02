import type { FulfillmentType, OrderStatus, PaymentMethod } from '../constants/orders.js';

/** Выбранная опция в снимке заказа. */
export interface OrderItemOptionDto {
  group: string;
  option: string;
  /** Надбавка в копейках */
  priceDelta: number;
}

/** Позиция заказа — снимок на момент оформления. */
export interface OrderItemDto {
  id: string;
  name: string;
  /** Цена за единицу с учётом опций, в копейках */
  unitPrice: number;
  quantity: number;
  options: OrderItemOptionDto[];
  lineTotal: number;
}

/** Заказ для покупателя и для заведения. */
export interface OrderDto {
  id: string;
  /** Короткий номер для разговора по телефону */
  number: number;
  placeId: string;
  placeName: string;
  placePhone: string | null;
  fulfillment: FulfillmentType;
  status: OrderStatus;
  paymentMethod: PaymentMethod;

  customerName: string;
  customerPhone: string;
  address: string | null;
  addressComment: string | null;
  comment: string | null;

  itemsTotal: number;
  deliveryFee: number;
  total: number;

  items: OrderItemDto[];
  /** ISO-строка в поясе города: время читается из строки, без пересчёта */
  createdAt: string;
  cancelReason: string | null;
}

/** Что просит клиент: только состав, без единой цены. */
export interface OrderDraftItem {
  menuItemId: string;
  quantity: number;
  optionIds: string[];
}

/**
 * Предварительный расчёт заказа.
 *
 * Сервер считает всё сам и заодно говорит, можно ли оформить заказ прямо
 * сейчас. Экран оформления показывает именно эти цифры.
 */
export interface OrderQuoteDto {
  itemsTotal: number;
  deliveryFee: number;
  total: number;
  /** Сколько не хватает до минимальной суммы заказа; 0 — хватает */
  amountToMinimum: number;
  canOrder: boolean;
  /** Почему заказать нельзя — готовая строка для экрана */
  problem: string | null;
  items: OrderItemDto[];
}
