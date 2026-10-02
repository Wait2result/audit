import type { PaginatedResponse, PlaceReviewDto } from '@dagestan/shared';

import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ReviewHideForm } from './review-hide-form';

type AdminReview = PlaceReviewDto & { placeName: string; isHidden: boolean };

/** «★★★★☆» — пять знаков читаются быстрее числа и не требуют подписи. */
function stars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ includeHidden?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const includeHidden = params.includeHidden === '1';

  const query = new URLSearchParams({ limit: '30' });
  if (includeHidden) query.set('includeHidden', '1');
  if (params.cursor) query.set('cursor', params.cursor);

  const page = await apiFetch<PaginatedResponse<AdminReview>>(
    `/places/admin/reviews?${query.toString()}`,
  );

  return (
    <>
      <PageHeader
        title="Отзывы"
        description="Оставить отзыв может только тот, кто уже заказывал в этом заведении. Скрытый отзыв остаётся в базе, но не показывается и перестаёт влиять на рейтинг."
      />

      <div className="mb-5 flex gap-2">
        <a
          href="/reviews"
          className={`rounded-lg px-4 py-2 text-sm transition ${
            includeHidden
              ? 'border border-ink-700 text-ink-300 hover:text-ink-100'
              : 'bg-brand-500 font-medium text-ink-950'
          }`}
        >
          Видимые
        </a>
        <a
          href="/reviews?includeHidden=1"
          className={`rounded-lg px-4 py-2 text-sm transition ${
            includeHidden
              ? 'bg-brand-500 font-medium text-ink-950'
              : 'border border-ink-700 text-ink-300 hover:text-ink-100'
          }`}
        >
          Все, включая скрытые
        </a>
      </div>

      <Card>
        {page.items.length === 0 ? (
          <EmptyState
            title="Отзывов пока нет"
            description="Они появятся, когда заведения начнут выполнять заказы."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Заведение</Th>
                <Th>Оценка</Th>
                <Th>Отзыв</Th>
                <Th>Автор</Th>
                <Th>Действия</Th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((review) => (
                <tr key={review.id}>
                  <Td className="text-ink-300">
                    {review.placeName}
                    <div className="mt-0.5 text-xs text-ink-500">
                      {formatDateTime(review.createdAt)}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-amber-400">{stars(review.rating)}</Td>
                  <Td className="max-w-md text-sm text-ink-300">
                    {review.text ?? <span className="text-ink-500">без текста</span>}
                    {review.reply && (
                      <div className="mt-1 border-l-2 border-brand-500/40 pl-2 text-xs text-ink-400">
                        Ответ заведения: {review.reply}
                      </div>
                    )}
                  </Td>
                  <Td className="text-sm text-ink-400">{review.authorName}</Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1.5">
                      {review.isHidden && <Badge tone="neutral">Скрыт</Badge>}
                      <ReviewHideForm reviewId={review.id} isHidden={review.isHidden} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {page.hasMore && page.nextCursor && (
        <div className="mt-4 text-center">
          <a
            href={`/reviews?cursor=${page.nextCursor}${includeHidden ? '&includeHidden=1' : ''}`}
            className="inline-block rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
          >
            Показать ещё
          </a>
        </div>
      )}
    </>
  );
}
