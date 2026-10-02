/**
 * Справочники рубрики «Заведения» (Этап 6).
 *
 * Названия живут здесь, а не в приложении: одни и те же слова нужны
 * в мобильном приложении, в админ-панели и в сообщениях сервера.
 */

/** Вид заведения. Совпадает с перечислением PlaceType в схеме базы. */
export const PlaceType = {
  RESTAURANT: 'restaurant',
  CAFE: 'cafe',
  FAST_FOOD: 'fast_food',
  BAKERY: 'bakery',
  SHOP: 'shop',
  SUPERMARKET: 'supermarket',
} as const;

export type PlaceType = (typeof PlaceType)[keyof typeof PlaceType];

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  restaurant: 'Ресторан',
  cafe: 'Кафе',
  fast_food: 'Фастфуд',
  bakery: 'Пекарня',
  shop: 'Магазин',
  supermarket: 'Супермаркет',
};

/**
 * Две большие группы для переключателя в приложении. Виды заведений
 * множатся, а вопрос у человека всегда один: поесть или купить.
 */
export const PLACE_GROUPS = {
  food: ['restaurant', 'cafe', 'fast_food', 'bakery'],
  shops: ['shop', 'supermarket'],
} as const satisfies Record<string, readonly PlaceType[]>;

export type PlaceGroup = keyof typeof PLACE_GROUPS;

export const PLACE_GROUP_LABELS: Record<PlaceGroup, string> = {
  food: 'Где поесть',
  shops: 'Магазины',
};

/**
 * Уровень доступа сотрудника заведения.
 *
 * manager — всё: меню, цены, настройки заведения, заказы.
 * staff   — только стоп-лист и заказы: цена это деньги, и менять её
 *           посменный работник не должен.
 */
export const PlaceMemberRole = {
  MANAGER: 'manager',
  STAFF: 'staff',
} as const;

export type PlaceMemberRole = (typeof PlaceMemberRole)[keyof typeof PlaceMemberRole];

export const PLACE_MEMBER_ROLE_LABELS: Record<PlaceMemberRole, string> = {
  manager: 'Управляющий',
  staff: 'Сотрудник',
};

/** Может ли этот уровень доступа менять меню, цены и настройки заведения. */
export function canManagePlace(role: PlaceMemberRole): boolean {
  return role === PlaceMemberRole.MANAGER;
}

/**
 * Подсказки кухонь для формы. Поле свободное: список фильтров в приложении
 * строится из того, что реально проставили заведения, поэтому новая кухня
 * не требует правки кода.
 */
export const CUISINE_SUGGESTIONS = [
  'дагестанская',
  'кавказская',
  'европейская',
  'итальянская',
  'японская',
  'китайская',
  'турецкая',
  'узбекская',
  'фастфуд',
  'пекарня',
  'кондитерская',
  'кофейня',
  'морепродукты',
  'вегетарианская',
] as const;

/** Дни недели: 1 — понедельник … 7 — воскресенье, как в ISO. */
export const WEEKDAYS = [
  { value: 1, short: 'Пн', full: 'Понедельник' },
  { value: 2, short: 'Вт', full: 'Вторник' },
  { value: 3, short: 'Ср', full: 'Среда' },
  { value: 4, short: 'Чт', full: 'Четверг' },
  { value: 5, short: 'Пт', full: 'Пятница' },
  { value: 6, short: 'Сб', full: 'Суббота' },
  { value: 7, short: 'Вс', full: 'Воскресенье' },
] as const;
