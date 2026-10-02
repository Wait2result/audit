import { Module } from '@nestjs/common';

import { CitiesModule } from '../cities/cities.module.js';
import { GeoModule } from '../geo/geo.module.js';
import { MediaModule } from '../media/media.module.js';
import { ListingCategoriesService } from './listing-categories.service.js';
import { ListingsAdminController } from './listings-admin.controller.js';
import { ListingsModerationService } from './listings-moderation.service.js';
import { ListingsController } from './listings.controller.js';
import { ListingsArchiveTask } from './listings-archive.task.js';
import { ListingViewsService } from './listing-views.service.js';
import { ListingShareController } from './listing-share.controller.js';
import { SellersController } from './sellers.controller.js';
import { ListingsLifecycleService } from './listings-lifecycle.service.js';
import { ListingsService } from './listings.service.js';
import { MyListingsController } from './my-listings.controller.js';

/**
 * Объявления (Этап 7): доска со всеми категориями.
 *
 * Контроллеры разделены по тому, кто их читает: витрина без аккаунта и
 * управление для сотрудников платформы, кабинет автора (/my/listings) —
 * где человек подаёт и ведёт свои объявления.
 *
 * Решения раздела — docs/ADR/0008-объявления.md.
 */
@Module({
  imports: [CitiesModule, MediaModule, GeoModule],
  controllers: [
    ListingsController,
    MyListingsController,
    ListingsAdminController,
    ListingShareController,
    SellersController,
  ],
  providers: [
    ListingsService,
    ListingCategoriesService,
    ListingsModerationService,
    ListingsLifecycleService,
    ListingsArchiveTask,
    ListingViewsService,
  ],
  exports: [ListingsService, ListingCategoriesService],
})
export class ListingsModule {}
