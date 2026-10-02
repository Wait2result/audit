import type { ListingCardLayout } from './listing-categories.js';

/** Минимум полей категории, нужный, чтобы выбрать вид карточки. */
export interface CardLayoutSource {
  cardLayout: ListingCardLayout;
  children?: readonly CardLayoutSource[];
}

/**
 * Вид карточки в выдаче: сетка в две колонки или список.
 *
 * Сетка хороша там, где решает фотография (вещи, транспорт). Квартиру, вакансию
 * или услугу выбирают по тексту — площадь, этаж, график, — и в узкой плитке он
 * не помещается, поэтому у таких категорий вид «список».
 *
 * У раздела собственного вида нет, пока все его подкатегории не сошлись на
 * списке: «Недвижимость» целиком — список, «Транспорт» — сетка. Смешанная
 * лента (без категории) всегда сетка: два вида в одной колонке рвали бы ряды.
 */
export function resolveCardLayout(
  category: CardLayoutSource | null | undefined,
): ListingCardLayout {
  if (!category) return 'grid';
  if (category.cardLayout === 'list') return 'list';

  const children = category.children ?? [];
  if (children.length > 0 && children.every((child) => resolveCardLayout(child) === 'list')) {
    return 'list';
  }
  return 'grid';
}
