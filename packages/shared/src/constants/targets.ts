/**
 * Типы объектов системы.
 *
 * Используются общими («полиморфными») модулями: избранное, отзывы, жалобы,
 * медиафайлы, чаты. Благодаря этому механика пишется один раз и работает
 * с любой рубрикой — включая те, которых ещё нет.
 *
 * Пример: добавляем завтра рубрику «Мероприятия» — достаточно добавить сюда
 * EVENT, и избранное с отзывами уже работают для неё.
 */

export const TargetType = {
  USER: 'user',
  PLACE: 'place',
  RESTAURANT: 'restaurant',
  SHOP: 'shop',
  CINEMA: 'cinema',
  MOVIE: 'movie',
  MENU_ITEM: 'menu_item',
  NEWS: 'news',
  RIDE: 'ride',
  PROPERTY: 'property',
  LISTING: 'listing',
  ORDER: 'order',
  BOOKING: 'booking',
  REVIEW: 'review',
  CHAT_MESSAGE: 'chat_message',
  AD_CREATIVE: 'ad_creative',
} as const;

export type TargetType = (typeof TargetType)[keyof typeof TargetType];

/** Типы объектов, которые можно добавить в избранное (пункт 23 ТЗ). */
export const FAVORITABLE_TYPES: TargetType[] = [
  TargetType.PLACE,
  TargetType.RESTAURANT,
  TargetType.SHOP,
  TargetType.CINEMA,
  TargetType.MOVIE,
  TargetType.NEWS,
  TargetType.RIDE,
  TargetType.PROPERTY,
  TargetType.LISTING,
];

/** Типы объектов, на которые можно оставить отзыв (пункт 24 ТЗ). */
export const REVIEWABLE_TYPES: TargetType[] = [
  TargetType.RESTAURANT,
  TargetType.SHOP,
  TargetType.CINEMA,
  TargetType.PROPERTY,
  TargetType.USER, // рейтинг водителя и пассажира
];

/** Типы объектов, на которые можно пожаловаться (пункт 25 ТЗ). */
export const REPORTABLE_TYPES: TargetType[] = [
  TargetType.USER,
  TargetType.PLACE,
  TargetType.RIDE,
  TargetType.PROPERTY,
  TargetType.REVIEW,
  TargetType.ORDER,
  TargetType.CHAT_MESSAGE,
  TargetType.NEWS,
  TargetType.AD_CREATIVE,
];

/** Контекст чата: чат всегда привязан к конкретному объекту (пункт 22 ТЗ). */
export const ChatContextType = {
  RIDE: 'ride',
  ORDER: 'order',
  PROPERTY: 'property',
  SUPPORT: 'support',
} as const;

export type ChatContextType = (typeof ChatContextType)[keyof typeof ChatContextType];
