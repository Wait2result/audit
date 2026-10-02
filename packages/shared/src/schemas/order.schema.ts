import { z } from 'zod';

import { FulfillmentType, ORDER_LIMITS, OrderStatus, PaymentMethod } from '../constants/orders.js';
import { paginationSchema, phoneSchema, uuidSchema } from './common.schema.js';

/**
 * Оформление заказа (Этап 6).
 *
 * Обратите внимание, чего здесь нет: цен. Клиент присылает только состав,
 * а суммы считает сервер по своим данным. Цена, пришедшая от клиента, —
 * это предложение заплатить сколько захочется.
 */

const orderItemSchema = z.object({
  menuItemId: uuidSchema,
  quantity: z
    .number()
    .int()
    .min(1, 'Количество не может быть меньше одного')
    .max(ORDER_LIMITS.maxQuantityPerPosition, 'Слишком много одной позиции'),
  optionIds: z.array(uuidSchema).max(20).default([]),
});

export const orderDraftSchema = z.object({
  placeId: uuidSchema,
  fulfillment: z.enum([FulfillmentType.DELIVERY, FulfillmentType.PICKUP]),
  items: z
    .array(orderItemSchema)
    .min(1, 'Добавьте хотя бы одну позицию')
    .max(ORDER_LIMITS.maxPositions, 'Слишком много позиций в заказе'),
});

export type OrderDraftDto = z.infer<typeof orderDraftSchema>;

export const createOrderSchema = orderDraftSchema.extend({
  customerName: z.string().trim().min(2, 'Укажите имя').max(120),
  customerPhone: phoneSchema,
  address: z.string().trim().max(300).nullish(),
  addressComment: z.string().trim().max(300).nullish(),
  comment: z.string().trim().max(500).nullish(),
  paymentMethod: z.enum([PaymentMethod.CASH_ON_DELIVERY, PaymentMethod.CARD_ON_DELIVERY]),
  /**
   * Итог из предварительного расчёта. Если за это время цена изменилась,
   * сервер откажет и покажет новую сумму, а не оформит заказ молча.
   */
  expectedTotal: z.number().int().min(0),
});

export type CreateOrderDto = z.infer<typeof createOrderSchema>;

export const changeOrderStatusSchema = z.object({
  status: z.enum([
    OrderStatus.NEW,
    OrderStatus.ACCEPTED,
    OrderStatus.PREPARING,
    OrderStatus.ON_THE_WAY,
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
  ]),
  comment: z.string().trim().max(300).optional(),
});

export type ChangeOrderStatusDto = z.infer<typeof changeOrderStatusSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export type CancelOrderDto = z.infer<typeof cancelOrderSchema>;

export const orderListQuerySchema = paginationSchema.extend({
  /** Только заказы в работе — их показывают наверху */
  activeOnly: z.coerce.boolean().optional(),
});

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
