import type { ListingAttribute, ListingCategoryDto } from '@dagestan/shared';

/**
 * Категория по коду — в дереве из двух уровней (раздел и подкатегория).
 * Общая функция для карточки объявления, формы правки и всех остальных
 * мест, где категория объявления известна только по slug.
 */
export function findCategoryBySlug(
  roots: ListingCategoryDto[],
  slug: string | undefined,
): ListingCategoryDto | null {
  if (!slug) return null;

  for (const root of roots) {
    if (root.slug === slug) return root;
    const child = root.children.find((item) => item.slug === slug);
    if (child) return child;
  }

  return null;
}

/** Поля характеристик категории по slug — пусто, если категория не найдена. */
export function attributesOfCategory(
  roots: ListingCategoryDto[],
  slug: string | undefined,
): readonly ListingAttribute[] {
  return findCategoryBySlug(roots, slug)?.attributes ?? [];
}
