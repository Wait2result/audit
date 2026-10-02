import { PLACE_TYPE_LABELS, pluralize, type PlaceCategoryAdminDto } from '@dagestan/shared';

import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import {
  CreateCategoryForm,
  DeleteCategoryForm,
  EditCategoryForm,
  MoveCategoryForm,
} from './category-forms';

/**
 * Категории витрины доставки.
 *
 * Это те самые плитки, которые человек видит первым делом в разделе
 * «Доставка». Порядок здесь — порядок в приложении.
 */
export default async function CategoriesPage() {
  const categories = await apiFetch<PlaceCategoryAdminDto[]>('/places/admin/categories');
  const order = categories.map((category) => category.id);

  return (
    <>
      <PageHeader
        title="Категории витрины"
        description="Плитки в разделе «Доставка». Категория не хранит список заведений — она подбирает их по словам кухонь и виду заведения. Значит, новое заведение попадёт в неё само, как только у него появится подходящая кухня."
      />

      <div className="mb-5 flex gap-2">
        <a
          href="/places"
          className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:text-ink-100"
        >
          ← К заведениям
        </a>
      </div>

      <Card className="mb-5">
        <CreateCategoryForm />
      </Card>

      {categories.length === 0 ? (
        <Card>
          <EmptyState
            title="Категорий пока нет"
            description="Добавьте первую — она сразу появится на витрине в приложении."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {categories.map((category, index) => (
            <Card key={category.id}>
              <div className="mb-4 flex items-start gap-4">
                <Thumb category={category} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium text-ink-100">{category.name}</h2>
                    <code className="rounded bg-ink-800 px-1.5 py-0.5 text-xs text-ink-400">
                      {category.slug}
                    </code>
                    {!category.isActive && <Badge tone="neutral">Скрыта</Badge>}
                    <Badge tone={category.placeCount > 0 ? 'success' : 'warning'}>
                      {category.placeCount > 0
                        ? pluralize(category.placeCount, 'заведение', 'заведения', 'заведений')
                        : 'нет заведений'}
                    </Badge>
                  </div>

                  <p className="mt-1 text-xs text-ink-500">
                    {describeRules(category) || 'Правил нет — категория пустая'}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="flex gap-1">
                    <MoveCategoryForm
                      id={category.id}
                      order={order}
                      direction="up"
                      disabled={index === 0}
                    />
                    <MoveCategoryForm
                      id={category.id}
                      order={order}
                      direction="down"
                      disabled={index === categories.length - 1}
                    />
                  </div>
                  <DeleteCategoryForm id={category.id} name={category.name} />
                </div>
              </div>

              <details className="border-t border-ink-800 pt-4">
                <summary className="cursor-pointer text-sm text-ink-400 transition hover:text-ink-200">
                  Изменить
                </summary>
                <div className="mt-4">
                  <EditCategoryForm category={category} />
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Thumb({ category }: { category: PlaceCategoryAdminDto }) {
  const src = mediaUrl(category.image);

  if (!src) {
    return (
      <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs text-ink-500">
        нет
      </div>
    );
  }

  // Обычный img, а не next/image: адрес приходит из хранилища, и заводить
  // под него настройку разрешённых доменов ради шестнадцати картинок незачем
  return (
    <img
      src={src}
      alt={category.name}
      className="size-16 shrink-0 rounded-full bg-ink-800 object-cover"
    />
  );
}

/** «кухни: шашлык, гриль · виды: Фастфуд» — правила словами, а не списком полей. */
function describeRules(category: PlaceCategoryAdminDto): string {
  const parts: string[] = [];

  if (category.cuisines.length > 0) parts.push(`кухни: ${category.cuisines.join(', ')}`);
  if (category.types.length > 0) {
    parts.push(`виды: ${category.types.map((type) => PLACE_TYPE_LABELS[type]).join(', ')}`);
  }

  return parts.join(' · ');
}
