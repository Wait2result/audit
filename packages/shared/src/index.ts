/**
 * Точка входа общего пакета.
 *
 * Всё, что экспортируется отсюда, доступно и серверу (@dagestan/api),
 * и мобильному приложению, и админке. Правило: здесь живёт только то,
 * что действительно общее — типы данных, схемы проверки, справочники,
 * коды ошибок. Никакой логики, зависящей от сервера или от React Native.
 */

export * from './errors.js';
export * from './constants/roles.js';
export * from './constants/listing-attributes.js';
export * from './constants/dictionaries/index.js';
export * from './constants/listing-categories.js';
export * from './constants/listing-title-classifier.js';
export * from './constants/transactions.js';
export * from './constants/geo.js';
export * from './constants/price-config.js';
export * from './constants/listing-ranking.js';
export * from './constants/listings.js';
export * from './constants/moderation.js';
export * from './constants/orders.js';
export * from './constants/place-categories.js';
export * from './constants/places.js';
export * from './constants/targets.js';
export * from './constants/weather-conditions.js';
export * from './schemas/common.schema.js';
export * from './schemas/auth.schema.js';
export * from './schemas/listing.schema.js';
export * from './schemas/geo.schema.js';
export * from './schemas/order.schema.js';
export * from './schemas/place.schema.js';
export * from './types/api.js';
export * from './types/admin.js';
export * from './types/listings.js';
export * from './types/geo.js';
export * from './types/orders.js';
export * from './types/places.js';
export * from './utils/plural.js';
export * from './utils/phone.js';
export * from './utils/photo-order.js';
export * from './constants/listing-card-layout.js';
export * from './constants/listing-filter-groups.js';
export * from './utils/listing-age.js';
