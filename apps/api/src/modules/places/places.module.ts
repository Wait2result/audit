import { Module } from '@nestjs/common';

import { CitiesModule } from '../cities/cities.module.js';
import { MediaModule } from '../media/media.module.js';
import { CategoriesService } from './categories.service.js';
import { FavoritesController } from './favorites.controller.js';
import { FavoritesService } from './favorites.service.js';
import { MenuService } from './menu.service.js';
import { MyPlacesController } from './my-places.controller.js';
import { PlaceAccessService } from './place-access.service.js';
import { PlacesAdminController } from './places-admin.controller.js';
import { PlacesController } from './places.controller.js';
import { PlacesService } from './places.service.js';
import { PromoBannersService } from './promo-banners.service.js';
import { ReviewsService } from './reviews.service.js';

/**
 * Заведения, меню и кабинет заведения (Этап 6).
 *
 * Три контроллера намеренно разделены по тому, кто их читает: витрина без
 * аккаунта, кабинет для сотрудников заведения и управление для сотрудников
 * платформы. Смешивать их в одном файле — верный способ однажды отдать
 * админский маршрут наружу.
 */
@Module({
  imports: [CitiesModule, MediaModule],
  controllers: [PlacesController, PlacesAdminController, MyPlacesController, FavoritesController],
  providers: [
    PlacesService,
    MenuService,
    PlaceAccessService,
    ReviewsService,
    CategoriesService,
    FavoritesService,
    PromoBannersService,
  ],
  exports: [
    PlacesService,
    PlaceAccessService,
    ReviewsService,
    CategoriesService,
    PromoBannersService,
  ],
})
export class PlacesModule {}
