import type { PlaceMemberRole, PlaceType } from '../constants/places.js';
import type { MediaDto } from './api.js';

/**
 * Заведения и меню (Этап 6).
 *
 * Все суммы — целые копейки. Форматированием занимается тот, кто показывает:
 * приложение и панель, а не сервер.
 */

/** Часы работы одного дня недели. */
export interface PlaceScheduleDto {
  /** 1 — понедельник … 7 — воскресенье */
  weekday: number;
  isClosed: boolean;
  /** «09:00» — время в поясе города */
  opensAt: string;
  /** «23:00»; у заведений, работающих за полночь, это «02:00» следующего дня */
  closesAt: string;
}

/** Работает ли заведение прямо сейчас — считает сервер, в поясе города. */
export interface PlaceOpenStateDto {
  isOpenNow: boolean;
  /** «Открыто до 23:00» либо «Откроется в 09:00» — готовая строка */
  label: string;
}

/** Условия заказа. Пусто, если заведение заказы не принимает. */
export interface PlaceDeliveryDto {
  hasDelivery: boolean;
  hasPickup: boolean;
  /** Стоимость доставки в копейках */
  deliveryFee: number;
  /** Сумма, начиная с которой доставка бесплатна */
  freeDeliveryFrom: number | null;
  /** Минимальная сумма заказа на доставку */
  minOrderAmount: number;
  /** Обычный срок доставки в минутах */
  deliveryMinutes: number | null;
}

/**
 * Оценка заведения. `count` равен нулю — отзывов ещё нет, и показывать
 * «0.0» нельзя: в карточке вместо звезды выводится «Нет оценок».
 */
export interface PlaceRatingDto {
  average: number;
  count: number;
}

/** Карточка заведения в списке. */
export interface PlaceDto {
  id: string;
  cityId: string;
  type: PlaceType;
  name: string;
  address: string;
  /** Кухни и теги: «кавказская», «пекарня» */
  cuisines: string[];
  /** Средний чек в копейках */
  averageCheck: number | null;
  cover: MediaDto | null;
  openState: PlaceOpenStateDto;
  /** Принимает ли заказы через приложение */
  ordersEnabled: boolean;
  delivery: PlaceDeliveryDto;
  rating: PlaceRatingDto;
  /** В избранном у того, кто спрашивает. У гостя всегда false */
  isFavorite: boolean;
}

/** Заведение целиком. */
export interface PlaceDetailsDto extends PlaceDto {
  description: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  districtName: string | null;
  schedule: PlaceScheduleDto[];
  photos: MediaDto[];
}

/** Вариант выбора: «30 см», «без лука». */
export interface MenuOptionDto {
  id: string;
  name: string;
  /** Надбавка к цене в копейках, может быть нулевой */
  priceDelta: number;
  isAvailable: boolean;
}

/** Группа выбора у позиции: «Размер», «Добавки». */
export interface MenuOptionGroupDto {
  id: string;
  name: string;
  /** 1 и больше — выбрать обязательно */
  minChoices: number;
  /** Больше 1 — можно отметить несколько */
  maxChoices: number;
  options: MenuOptionDto[];
}

/** Позиция меню. */
export interface MenuItemDto {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  /** Цена в копейках */
  price: number;
  /** «450 г», «0,5 л» */
  portion: string | null;
  image: MediaDto | null;
  /** Стоп-лист: позиция есть в меню, но сейчас её нет */
  isAvailable: boolean;
  /** Блюдо в избранном у того, кто спрашивает. У гостя всегда false */
  isFavorite: boolean;
  groups: MenuOptionGroupDto[];
}

/** Раздел меню со своими позициями. */
export interface MenuCategoryDto {
  id: string;
  name: string;
  items: MenuItemDto[];
}

/** Меню заведения целиком. */
export interface PlaceMenuDto {
  placeId: string;
  categories: MenuCategoryDto[];
}

// ── Кабинет заведения ────────────────────────────────────────────────────────

/** Заведение, к которому у аккаунта есть доступ. */
export interface MyPlaceDto {
  id: string;
  name: string;
  type: PlaceType;
  cityName: string;
  /** Что этому аккаунту здесь разрешено */
  role: PlaceMemberRole;
  isActive: boolean;
  ordersEnabled: boolean;
  cover: MediaDto | null;
}

// ── Отзывы ───────────────────────────────────────────────────────────────────

/** Отзыв о заведении. */
export interface PlaceReviewDto {
  id: string;
  /** Имя автора. Фамилию не показываем — отзыв не документ */
  authorName: string;
  /** 1..5 */
  rating: number;
  text: string | null;
  /** Ответ заведения, если оно ответило */
  reply: string | null;
  createdAt: string;
  /** Этот отзыв оставил тот, кто спрашивает — значит, его можно править */
  isMine: boolean;
}

/** Сколько отзывов на каждую оценку — для полосок в карточке заведения. */
export interface ReviewBreakdownDto {
  rating: number;
  count: number;
}

export interface PlaceReviewsDto {
  rating: PlaceRatingDto;
  breakdown: ReviewBreakdownDto[];
  /** Может ли спрашивающий оставить отзыв (был выполненный заказ) */
  canReview: boolean;
  /** Его собственный отзыв, если уже оставлен */
  myReview: PlaceReviewDto | null;
  items: PlaceReviewDto[];
}

/** Сотрудник заведения — для списка доступов. */
export interface PlaceMemberDto {
  id: string;
  userId: string;
  name: string;
  phone: string;
  role: PlaceMemberRole;
  createdAt: string;
}

// ── Категории витрины ────────────────────────────────────────────────────────

/** Плитка категории на витрине доставки. */
export interface PlaceCategoryDto {
  id: string;
  /** Код для ссылок: traditional, grill, pizza */
  slug: string;
  name: string;
  image: MediaDto | null;
}

/** То же плюс поля, которые видит и правит только панель. */
export interface PlaceCategoryAdminDto extends PlaceCategoryDto {
  cuisines: string[];
  types: PlaceType[];
  sortOrder: number;
  isActive: boolean;
  /** Сколько заведений сейчас попадает в категорию — видно сразу, не вслепую */
  placeCount: number;
}

// ── Промо-баннеры ────────────────────────────────────────────────────────────

/**
 * Где показывается баннер: карусель главной, карусель витрины доставки или
 * фото одной из плиток главной («Объявления», «Заказать», …). Фото плитки —
 * та же карточка из панели: картинка, порядок, включение. Надпись на плитке
 * задаёт приложение, заголовок карточки — подпись для панели.
 */
export type PromoPlacement =
  'home' | 'delivery' | 'tile_listings' | 'tile_order' | 'tile_cinema' | 'tile_news' | 'tile_rides';

/** Плитка главной, у которой фото задаётся из панели. */
export type HomeTileKey = 'listings' | 'order' | 'cinema' | 'news' | 'rides';

/** Фото плиток главной одним ответом: первая включённая карточка каждой плитки. */
export type HomeTilesDto = Record<HomeTileKey, PromoBannerDto | null>;

/**
 * Что делает нажатие на рекламную карточку: ничего, заведение (значение —
 * id), рубрика главной (ключ плитки), внутренний экран (путь из списка) или
 * внешняя ссылка https.
 */
export type PromoActionType = 'none' | 'place' | 'rubric' | 'screen' | 'url';

/**
 * Промо-карточка карусели. Описание — `subtitle`, картинка — `image`.
 * Приложению приходят только включённые карточки, у которых сейчас идёт срок
 * показа (`startsAt`…`endsAt`, пустая граница — без ограничения).
 */
export interface PromoBannerDto {
  id: string;
  placement: PromoPlacement;
  title: string;
  subtitle: string | null;
  image: MediaDto | null;
  /** Заведение действия place (оставлено для старых клиентов) */
  targetPlaceId: string | null;
  actionType: PromoActionType;
  /** id заведения, ключ рубрики, путь экрана или адрес; у none — null */
  actionValue: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

/** То же плюс поля, которые видит и правит только панель. */
export interface PromoBannerAdminDto extends PromoBannerDto {
  sortOrder: number;
  isActive: boolean;
  /** Название выбранного заведения — чтобы не искать его по id в списке панели */
  targetPlaceName: string | null;
}

// ── Избранное ────────────────────────────────────────────────────────────────

/** Избранное блюдо вместе с заведением, откуда оно, — чтобы его можно было заказать. */
export interface FavoriteDishDto {
  item: MenuItemDto;
  place: {
    id: string;
    name: string;
    /** Можно ли сейчас оформить заказ в этом заведении */
    canOrder: boolean;
    /** «Открыто до 23:00» либо «Откроется в 09:00» */
    openLabel: string;
  };
}

/**
 * Тип сохранённого объекта. Избранное хранится по типам (своя таблица у
 * каждого) и показывается там, где этот тип живёт: объявления — в разделе
 * «Объявления», заведения и блюда — в «Доставке». В профиле — сводка по
 * всем типам со ссылками в разделы, без повторения самих объектов.
 */
export type FavoriteKind = 'listing' | 'place' | 'dish';

/** Сколько всего в избранном — по типам: для значков, вкладок и профиля. */
export interface FavoritesSummaryDto {
  /** Заведения этого города */
  places: number;
  /** Блюда заведений этого города */
  dishes: number;
  /** Объявления — без привязки к городу: вещь из соседнего села тоже нужна */
  listings: number;
}
