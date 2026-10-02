import { Injectable, Logger } from '@nestjs/common';
import {
  canCustomerCancel,
  canTransition,
  ErrorCode,
  FulfillmentType,
  ORDER_STATUS_LABELS,
  OrderStatus,
  isOrderActive,
  type CreateOrderDto,
  type OrderDraftDto,
  type OrderDto,
  type OrderQuoteDto,
  type PaginatedResponse,
  type PaginationParams,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import {
  isoInTimezone,
  minutesInTimezone,
  weekdayInTimezone,
} from '../../common/utils/timezone.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { AuditService } from '../audit/audit.service.js';
import { openStateAt } from '../places/open-hours.js';
import { priceOrder, type PricingMenuItem } from './order-pricing.js';

interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Заказы (Этап 6).
 *
 * Правило одно: сервер не верит клиенту ни в чём, что касается денег.
 * Приходят только идентификаторы позиций и количество — цены, стоимость
 * доставки и итог считаются здесь, по данным базы.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  /** Предварительный расчёт: сколько выйдет и можно ли заказать сейчас. */
  async quote(draft: OrderDraftDto): Promise<OrderQuoteDto> {
    const { place, menu } = await this.loadForPricing(draft);
    const priced = priceOrder(draft, place, menu);
    const closed = this.closedProblem(place, draft.fulfillment);

    const problem = closed ?? priced.problem;

    return {
      itemsTotal: priced.itemsTotal,
      deliveryFee: priced.deliveryFee,
      total: priced.total,
      amountToMinimum: priced.amountToMinimum,
      canOrder: problem === null && priced.items.length > 0,
      problem,
      items: priced.items,
    };
  }

  /**
   * Оформление заказа.
   *
   * Ключ идемпотентности обязателен: повторная отправка той же формы
   * (человек нажал дважды, связь оборвалась) не должна создавать второй
   * заказ. От одновременных нажатий защищает короткая блокировка в Redis,
   * от повтора позже — уникальный индекс в базе.
   */
  async create(dto: CreateOrderDto, userId: string, idempotencyKey: string): Promise<OrderDto> {
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      include: ORDER_INCLUDE,
    });
    if (existing) return this.toDto(existing);

    const lockKey = `orders:lock:${idempotencyKey}`;
    const locked = await this.redis.client.set(lockKey, '1', 'EX', 30, 'NX');
    if (!locked) {
      throw AppException.conflict('Заказ уже оформляется', ErrorCode.CONFLICT);
    }

    try {
      const { place, menu } = await this.loadForPricing(dto);

      const closed = this.closedProblem(place, dto.fulfillment);
      if (closed) {
        throw AppException.badRequest(closed, ErrorCode.PLACE_CLOSED);
      }

      const priced = priceOrder(dto, place, menu);
      if (priced.problem) {
        throw AppException.badRequest(priced.problem, ErrorCode.MENU_ITEM_UNAVAILABLE);
      }
      if (dto.fulfillment === FulfillmentType.DELIVERY && !dto.address?.trim()) {
        throw AppException.badRequest('Укажите адрес доставки', ErrorCode.VALIDATION_FAILED);
      }

      // Цена могла измениться, пока человек заполнял форму: оформлять заказ
      // на другую сумму молча нельзя
      if (priced.total !== dto.expectedTotal) {
        throw AppException.conflict(
          `Цены изменились: теперь ${(priced.total / 100).toLocaleString('ru-RU')} ₽`,
          ErrorCode.ORDER_PRICE_CHANGED,
        );
      }

      const order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            userId,
            placeId: place.id,
            cityId: place.cityId,
            fulfillment: dto.fulfillment,
            paymentMethod: dto.paymentMethod,
            customerName: dto.customerName,
            customerPhone: dto.customerPhone,
            address: dto.address ?? null,
            addressComment: dto.addressComment ?? null,
            comment: dto.comment ?? null,
            itemsTotal: priced.itemsTotal,
            deliveryFee: priced.deliveryFee,
            total: priced.total,
            idempotencyKey,
            items: {
              create: priced.items.map((item) => ({
                menuItemId: item.id,
                name: item.name,
                unitPrice: item.unitPrice,
                quantity: item.quantity,
                // Снимок опций хранится как JSON — Prisma ждёт простую структуру
                options:
                  item.options.length > 0 ? JSON.parse(JSON.stringify(item.options)) : undefined,
                lineTotal: item.lineTotal,
              })),
            },
            history: { create: { status: OrderStatus.NEW, actorId: userId } },
          },
          include: ORDER_INCLUDE,
        });

        return created;
      });

      this.logger.log(
        { orderId: order.id, number: order.number, total: order.total },
        'Оформлен заказ',
      );

      return this.toDto(order);
    } finally {
      await this.redis.del(lockKey);
    }
  }

  // ── Для покупателя ────────────────────────────────────────────────────────

  async listMine(
    userId: string,
    pagination: PaginationParams,
    activeOnly: boolean,
  ): Promise<PaginatedResponse<OrderDto>> {
    const rows = await this.prisma.order.findMany({
      where: {
        userId,
        ...(activeOnly
          ? { status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] } }
          : {}),
      },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: ORDER_INCLUDE,
    });

    return this.paginate(rows, pagination.limit);
  }

  async findMine(id: string, userId: string): Promise<OrderDto> {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: ORDER_INCLUDE,
    });

    if (!order) {
      throw AppException.notFound('Заказ не найден', ErrorCode.ORDER_NOT_FOUND);
    }

    return this.toDto(order);
  }

  /** Отмена покупателем — только пока заказ не начали готовить. */
  async cancelMine(
    id: string,
    userId: string,
    reason: string | undefined,
    context: AuditContext,
  ): Promise<OrderDto> {
    const order = await this.prisma.order.findFirst({ where: { id, userId } });
    if (!order) {
      throw AppException.notFound('Заказ не найден', ErrorCode.ORDER_NOT_FOUND);
    }

    if (!canCustomerCancel(order.status)) {
      throw AppException.badRequest(
        'Заказ уже готовят — отмену нужно согласовать с заведением по телефону',
        ErrorCode.ORDER_INVALID_TRANSITION,
      );
    }

    return this.applyStatus(id, OrderStatus.CANCELLED, userId, reason, context);
  }

  // ── Для заведения и панели ────────────────────────────────────────────────

  async listForPlace(
    placeId: string,
    pagination: PaginationParams,
    activeOnly: boolean,
  ): Promise<PaginatedResponse<OrderDto>> {
    const rows = await this.prisma.order.findMany({
      where: {
        placeId,
        ...(activeOnly
          ? { status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] } }
          : {}),
      },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: ORDER_INCLUDE,
    });

    return this.paginate(rows, pagination.limit);
  }

  async listAll(
    pagination: PaginationParams,
    activeOnly: boolean,
  ): Promise<PaginatedResponse<OrderDto>> {
    const rows = await this.prisma.order.findMany({
      where: activeOnly
        ? { status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] } }
        : {},
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: ORDER_INCLUDE,
    });

    return this.paginate(rows, pagination.limit);
  }

  /** Заведение заказа — для проверки доступа сотрудника кабинета. */
  async placeIdOf(orderId: string): Promise<string> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { placeId: true },
    });

    if (!order) {
      throw AppException.notFound('Заказ не найден', ErrorCode.ORDER_NOT_FOUND);
    }

    return order.placeId;
  }

  async changeStatus(
    id: string,
    status: OrderStatus,
    actorId: string,
    comment: string | undefined,
    context: AuditContext,
  ): Promise<OrderDto> {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw AppException.notFound('Заказ не найден', ErrorCode.ORDER_NOT_FOUND);
    }

    if (!canTransition(order.status, status)) {
      throw AppException.badRequest(
        `Из состояния «${ORDER_STATUS_LABELS[order.status]}» нельзя перейти в «${ORDER_STATUS_LABELS[status]}»`,
        ErrorCode.ORDER_INVALID_TRANSITION,
      );
    }

    return this.applyStatus(id, status, actorId, comment, context);
  }

  // ── Внутреннее ────────────────────────────────────────────────────────────

  private async applyStatus(
    id: string,
    status: OrderStatus,
    actorId: string,
    comment: string | undefined,
    context: AuditContext,
  ): Promise<OrderDto> {
    const order = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          status,
          ...(status === OrderStatus.CANCELLED ? { cancelReason: comment ?? null } : {}),
        },
        include: ORDER_INCLUDE,
      });

      await tx.orderStatusHistory.create({
        data: { orderId: id, status, actorId, comment: comment ?? null },
      });

      return updated;
    });

    await this.audit.record({
      actorId,
      action: 'order.status',
      targetType: 'order',
      targetId: id,
      after: { status, comment },
      ...context,
    });

    return this.toDto(order);
  }

  /** Заведение и меню одним заходом — расчёту нужны оба. */
  private async loadForPricing(draft: OrderDraftDto) {
    const place = await this.prisma.place.findFirst({
      where: { id: draft.placeId, deletedAt: null, isActive: true },
      include: { schedules: true, city: { select: { timezone: true } } },
    });

    if (!place) {
      throw AppException.notFound('Заведение не найдено', ErrorCode.PLACE_NOT_FOUND);
    }

    const rows = await this.prisma.menuItem.findMany({
      where: {
        id: { in: draft.items.map((item) => item.menuItemId) },
        deletedAt: null,
        isActive: true,
      },
      include: {
        groups: {
          where: { deletedAt: null },
          include: { options: { where: { deletedAt: null } } },
        },
      },
    });

    const menu = new Map<string, PricingMenuItem>(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          placeId: row.placeId,
          name: row.name,
          price: row.price,
          isAvailable: row.isAvailable,
          groups: row.groups.map((group) => ({
            id: group.id,
            name: group.name,
            minChoices: group.minChoices,
            maxChoices: group.maxChoices,
            options: group.options.map((option) => ({
              id: option.id,
              name: option.name,
              priceDelta: option.priceDelta,
              isAvailable: option.isAvailable,
            })),
          })),
        },
      ]),
    );

    return { place, menu };
  }

  /** Причина, по которой заведение не может принять заказ прямо сейчас. */
  private closedProblem(
    place: {
      ordersEnabled: boolean;
      hasDelivery: boolean;
      hasPickup: boolean;
      schedules: {
        weekday: number;
        isClosed: boolean;
        opensMinute: number;
        closesMinute: number;
      }[];
      city: { timezone: string };
    },
    fulfillment: FulfillmentType,
  ): string | null {
    if (!place.ordersEnabled) return 'Заведение пока не принимает заказы через приложение';

    if (fulfillment === FulfillmentType.DELIVERY && !place.hasDelivery) {
      return 'Это заведение не доставляет';
    }
    if (fulfillment === FulfillmentType.PICKUP && !place.hasPickup) {
      return 'Это заведение не выдаёт заказы на самовывоз';
    }

    const now = new Date();
    const open = openStateAt(
      place.schedules,
      weekdayInTimezone(now, place.city.timezone),
      minutesInTimezone(now, place.city.timezone),
    );

    return open.isOpenNow ? null : `Заведение сейчас закрыто. ${open.label}`;
  }

  private paginate(rows: OrderRow[], limit: number): PaginatedResponse<OrderDto> {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((row) => this.toDto(row)),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  private toDto(order: OrderRow): OrderDto {
    return {
      id: order.id,
      number: order.number,
      placeId: order.placeId,
      placeName: order.place.name,
      placePhone: order.place.phone,
      fulfillment: order.fulfillment,
      status: order.status,
      paymentMethod: order.paymentMethod,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      address: order.address,
      addressComment: order.addressComment,
      comment: order.comment,
      itemsTotal: order.itemsTotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        options: Array.isArray(item.options)
          ? (item.options as { group: string; option: string; priceDelta: number }[])
          : [],
        lineTotal: item.lineTotal,
      })),
      createdAt: isoInTimezone(order.createdAt, order.place.city.timezone),
      cancelReason: order.cancelReason,
    };
  }
}

/** Что нужно для карточки заказа. Один набор на все выборки. */
const ORDER_INCLUDE = {
  items: true,
  place: { select: { name: true, phone: true, city: { select: { timezone: true } } } },
} as const;

interface OrderRow {
  id: string;
  number: number;
  placeId: string;
  fulfillment: FulfillmentType;
  status: OrderStatus;
  paymentMethod: 'cash_on_delivery' | 'card_on_delivery';
  customerName: string;
  customerPhone: string;
  address: string | null;
  addressComment: string | null;
  comment: string | null;
  itemsTotal: number;
  deliveryFee: number;
  total: number;
  cancelReason: string | null;
  createdAt: Date;
  items: {
    id: string;
    name: string;
    unitPrice: number;
    quantity: number;
    options: unknown;
    lineTotal: number;
  }[];
  place: { name: string; phone: string | null; city: { timezone: string } };
}

export { isOrderActive };
