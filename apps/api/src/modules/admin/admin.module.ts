import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

/**
 * Модуль панели управления.
 *
 * Зависит только от базы данных. Сознательно не зависит от бизнес-модулей:
 * панель читает сводные данные, а не участвует в бизнес-логике, — иначе
 * любое изменение в ресторанах или поездках тянуло бы за собой правку панели.
 */
@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
