import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  cancelOrderSchema,
  changeOrderStatusSchema,
  createOrderSchema,
  ErrorCode,
  orderDraftSchema,
  orderListQuerySchema,
  Permission,
  uuidSchema,
  type CancelOrderDto,
  type ChangeOrderStatusDto,
  type CreateOrderDto,
  type OrderDraftDto,
  type OrderDto,
  type OrderQuoteDto,
  type PaginatedResponse,
} from '@dagestan/shared';
import type { FastifyRequest } from 'fastify';

import { CurrentUser, RateLimit, RequirePermissions } from '../../common/decorators/index.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ApiZodBody } from '../../common/zod/zod-openapi.js';
import { zodBody } from '../../common/zod/zod-validation.pipe.js';
import { auditContext } from '../places/audit-context.js';
import { PlaceAccessService } from '../places/place-access.service.js';
import { OrdersService } from './orders.service.js';

/**
 * Заказы (Этап 6).
 *
 * Онлайн-оплаты нет: заказ оплачивается при получении. Принимает заказ
 * сотрудник заведения в своём кабинете; у сотрудников платформы есть
 * доступ ко всем заказам на случай, если заведение не отвечает.
 */
@ApiTags('Заказы')
@ApiBearerAuth()
@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly access: PlaceAccessService,
  ) {}

  @Post('orders/quote')
  @ApiOperation({
    summary: 'Сколько выйдет заказ',
    description:
      'Сервер считает сумму по своим ценам и говорит, можно ли заказать сейчас. ' +
      'Экран оформления показывает именно эти цифры.',
  })
  @ApiZodBody(orderDraftSchema)
  quote(@Body(zodBody(orderDraftSchema)) dto: OrderDraftDto): Promise<OrderQuoteDto> {
    return this.orders.quote(dto);
  }

  @Post('orders')
  @RateLimit({ limit: 20, windowSeconds: 3600, scope: 'user' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Ключ повтора: та же форма, отправленная дважды, не создаст второй заказ',
  })
  @ApiOperation({
    summary: 'Оформить заказ',
    description:
      'Цены от клиента не принимаются: приходят только позиции и количество. ' +
      'Если цена изменилась с момента расчёта, сервер откажет и покажет новую сумму.',
  })
  @ApiZodBody(createOrderSchema)
  create(
    @Body(zodBody(createOrderSchema)) dto: CreateOrderDto,
    @CurrentUser() user: RequestUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<OrderDto> {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 100) {
      throw AppException.badRequest(
        'Отсутствует заголовок Idempotency-Key',
        ErrorCode.VALIDATION_FAILED,
      );
    }

    return this.orders.create(dto, user.id, idempotencyKey);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Мои заказы' })
  listMine(
    @CurrentUser() user: RequestUser,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<OrderDto>> {
    const { cursor, limit, activeOnly } = orderListQuerySchema.parse(rawQuery);

    return this.orders.listMine(user.id, { cursor, limit }, activeOnly ?? false);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Мой заказ' })
  findMine(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<OrderDto> {
    return this.orders.findMine(uuidSchema.parse(id), user.id);
  }

  @Post('orders/:id/cancel')
  @ApiOperation({
    summary: 'Отменить свой заказ',
    description: 'Доступно, пока заказ не начали готовить.',
  })
  @ApiZodBody(cancelOrderSchema)
  cancelMine(
    @Param('id') id: string,
    @Body(zodBody(cancelOrderSchema)) dto: CancelOrderDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<OrderDto> {
    return this.orders.cancelMine(uuidSchema.parse(id), user.id, dto.reason, auditContext(request));
  }

  // ── Кабинет заведения ─────────────────────────────────────────────────────

  @Get('my/places/:id/orders')
  @ApiOperation({ summary: 'Заказы моего заведения' })
  async listForPlace(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<OrderDto>> {
    const placeId = uuidSchema.parse(id);
    await this.access.assertAccess(user.id, placeId, false);

    const { cursor, limit, activeOnly } = orderListQuerySchema.parse(rawQuery);

    return this.orders.listForPlace(placeId, { cursor, limit }, activeOnly ?? false);
  }

  @Post('my/orders/:id/status')
  @ApiOperation({
    summary: 'Сменить статус заказа',
    description: 'Доступно обоим уровням доступа: заказы принимает тот, кто на смене.',
  })
  @ApiZodBody(changeOrderStatusSchema)
  async changeStatusInCabinet(
    @Param('id') id: string,
    @Body(zodBody(changeOrderStatusSchema)) dto: ChangeOrderStatusDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<OrderDto> {
    const orderId = uuidSchema.parse(id);
    await this.access.assertAccess(user.id, await this.orders.placeIdOf(orderId), false);

    return this.orders.changeStatus(
      orderId,
      dto.status,
      user.id,
      dto.comment,
      auditContext(request),
    );
  }

  // ── Панель управления ─────────────────────────────────────────────────────

  @RequirePermissions(Permission.ORDERS_READ)
  @Get('orders/admin/list')
  @ApiOperation({ summary: 'Все заказы платформы' })
  listAll(@Query() rawQuery: unknown): Promise<PaginatedResponse<OrderDto>> {
    const { cursor, limit, activeOnly } = orderListQuerySchema.parse(rawQuery);

    return this.orders.listAll({ cursor, limit }, activeOnly ?? false);
  }

  @RequirePermissions(Permission.ORDERS_MANAGE)
  @Post('orders/:id/status')
  @ApiOperation({
    summary: 'Сменить статус заказа из панели',
    description: 'Запасной путь, если заведение не отвечает.',
  })
  @ApiZodBody(changeOrderStatusSchema)
  changeStatus(
    @Param('id') id: string,
    @Body(zodBody(changeOrderStatusSchema)) dto: ChangeOrderStatusDto,
    @CurrentUser() user: RequestUser,
    @Req() request: FastifyRequest,
  ): Promise<OrderDto> {
    return this.orders.changeStatus(
      uuidSchema.parse(id),
      dto.status,
      user.id,
      dto.comment,
      auditContext(request),
    );
  }
}
