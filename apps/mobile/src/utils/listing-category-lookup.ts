import type { ListingAttribute, ListingCategoryDto } from '@dagestan/shared';

/**
 * Категория по коду в дереве любой глубины: раздел → подкатегория
 * («Недвижимость → Квартиры») или раздел → основной тип → направление
 * («Транспорт → Автомобили → Автоаксессуары»). Общая функция для карточки
 * объявления, формы правки и всех мест, где категория известна только по slug.
 */
export function findCategoryBySlug(
  roots: readonly ListingCategoryDto[],
  slug: string | undefined | null,
): ListingCategoryDto | null {
  return slug ? (categoryPath(roots, slug).at(-1) ?? null) : null;
}

/** Путь от раздела до категории: [Транспорт, Автомобили, Автоаксессуары]; пусто — не найдена. */
export function categoryPath(
  roots: readonly ListingCategoryDto[],
  slug: string | undefined | null,
): ListingCategoryDto[] {
  if (!slug) return [];
  for (const node of roots) {
    if (node.slug === slug) return [node];
    const below = categoryPath(node.children, slug);
    if (below.length > 0) return [node, ...below];
  }
  return [];
}

/**
 * Путь для подписи: «Транспорт → Автомобили → Автоаксессуары». Повтор имени
 * не пишется: у самой техники имя как у основного типа («Автомобили»).
 */
export function categoryPathLabel(roots: readonly ListingCategoryDto[], slug: string): string {
  const names: string[] = [];
  for (const node of categoryPath(roots, slug)) {
    if (names.at(-1) !== node.name) names.push(node.name);
  }
  return names.join(' → ');
}

/** Все подкатегории, в которых живут объявления (листья), со своим путём. */
export function leafCategories(
  roots: readonly ListingCategoryDto[],
): { leaf: ListingCategoryDto; path: ListingCategoryDto[] }[] {
  const result: { leaf: ListingCategoryDto; path: ListingCategoryDto[] }[] = [];
  const visit = (node: ListingCategoryDto, path: ListingCategoryDto[]): void => {
    if (node.children.length === 0) {
      result.push({ leaf: node, path: [...path, node] });
      return;
    }
    for (const child of node.children) visit(child, [...path, node]);
  };
  for (const root of roots) visit(root, []);
  return result;
}

/** Поля характеристик категории по slug — пусто, если категория не найдена. */
export function attributesOfCategory(
  roots: readonly ListingCategoryDto[],
  slug: string | undefined,
): readonly ListingAttribute[] {
  return findCategoryBySlug(roots, slug)?.attributes ?? [];
}
