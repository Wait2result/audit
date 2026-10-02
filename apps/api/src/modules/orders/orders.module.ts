import { Module } from '@nestjs/common';

import { PlacesModule } from '../places/places.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

/**
 * Заказы (Этап 6). Доступ сотрудников заведения к своим заказам
 * проверяется тем же PlaceAccessService, что и остальной кабинет.
 */
@Module({
  imports: [PlacesModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
