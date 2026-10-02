import Link from 'next/link';
import {
  LISTING_PRICE_UNIT_SUFFIX,
  MODERATION_STATUS_LABELS,
  type ListingAdminDto,
  type PaginatedResponse,
} from '@dagestan/shared';

import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { formatDateTime, formatPhone } from '@/lib/format';
import { ListingActions } from './listing-actions';

const rubles = (kopecks: number): string => `${(kopecks / 100).toLocaleString('ru-RU')} ₽`;

/** Цвет статуса: снятое и жалобы — тревожные, остальное — нейтральное. */
function statusTone(status: ListingAdminDto['status']): 'success' | 'danger' | 'neutral' {
  if (status === 'approved') return 'success';
  if (status === 'suspended') return 'danger';
  return 'neutral';
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    reportedOnly?: string;
    cursor?: string;
  }>;
}) {
  const params = await searchParams;
  const reportedOnly = params.reportedOnly === '1';

  const query = new URLSearchParams({ limit: '30' });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (reportedOnly) query.set('reportedOnly', '1');
  if (params.cursor) query.set('cursor', params.cursor);

  const page = await apiFetch<PaginatedResponse<ListingAdminDto>>(
    `/listings/admin/list?${query.toString()}`,
  );

  /**
   * Ссылка на этот же список с изменёнными параметрами.
   *
   * Поиск и статус сохраняются всегда — переключение «только с жалобами»
   * или переход на следующую страницу не должны сбрасывать то, что уже
   * набрал сотрудник. Значение `null` убирает параметр совсем (например,
   * при выключении фильтра), а не оставляет его пустой строкой в адресе.
   */
  const listingsHref = (overrides: Record<string, string | null> = {}): string => {
    const next = new URLSearchParams();
    if (params.search) next.set('search', params.search);
    if (params.status) next.set('status', params.status);
    if (reportedOnly) next.set('reportedOnly', '1');

    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }

    const search = next.toString();
    return search ? `/listings?${search}` : '/listings';
  };

  return (
    <>
      <PageHeader
        title="Объявления"
        description="Объявления публикуются сразу, без проверки. Здесь — очередь разбора: сначала те, на кого жалуются."
        action={
          <Link
            href="/listings/reports"
            className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
          >
            Жалобы
          </Link>
        }
      />

      <form className="mb-5 flex flex-wrap items-center gap-3">
        <input
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Заголовок или текст объявления"
          className="w-72 rounded-lg border border-ink-700 bg-ink-900 px-4 py-2 text-sm text-ink-100 placeholder:text-ink-600 focus:border-brand-500 focus:outline-none"
        />

        <select
          name="status"
          defaultValue={params.status ?? ''}
          className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-200 focus:border-brand-500 focus:outline-none"
        >
          <option value="">Любой статус</option>
          {Object.entries(MODERATION_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {/* Скрытое поле переносит текущее значение переключателя жалоб при
            отправке формы поиска, чтобы два фильтра не сбрасывали друг друга */}
        <input type="hidden" name="reportedOnly" value={reportedOnly ? '1' : ''} />

        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-brand-400"
        >
          Найти
        </button>

        <Link
          href={listingsHref({ reportedOnly: reportedOnly ? null : '1' })}
          className={`rounded-lg px-4 py-2 text-sm transition ${
            reportedOnly
              ? 'bg-accent-500/15 font-medium text-accent-400'
              : 'border border-ink-700 text-ink-300 hover:text-ink-100'
          }`}
        >
          Только с жалобами
        </Link>
      </form>

      <Card>
        {page.items.length === 0 ? (
          <EmptyState
            title="Ничего не найдено"
            description="Измените условия поиска или сбросьте фильтры."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Объявление</Th>
                <Th>Продавец</Th>
                <Th>Цена</Th>
                <Th>Статус</Th>
                <Th>Размещено</Th>
                <Th>Действия</Th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((listing) => (
                <tr key={listing.id}>
                  <Td className="max-w-xs">
                    <p className="truncate font-medium text-ink-200">{listing.title}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{listing.categoryName}</p>
                  </Td>
                  <Td className="text-sm text-ink-300">
                    {listing.seller.name}
                    <div className="mt-0.5 text-xs text-ink-500">
                      {formatPhone(listing.sellerPhone)}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums text-ink-300">
                    {listing.price.value !== null
                      ? `${rubles(listing.price.value)}${LISTING_PRICE_UNIT_SUFFIX[listing.price.unit]}`
                      : '—'}
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1.5">
                      <Badge tone={statusTone(listing.status)}>
                        {MODERATION_STATUS_LABELS[listing.status]}
                      </Badge>
                      {listing.reportsCount > 0 && (
                        <Badge tone="warning">
                          {listing.reportsCount === 1
                            ? '1 жалоба'
                            : `${listing.reportsCount} жалоб`}
                        </Badge>
                      )}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-sm text-ink-400">
                    {formatDateTime(listing.publishedAt ?? listing.bumpedAt)}
                  </Td>
                  <Td>
                    <ListingActions listingId={listing.id} status={listing.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {page.hasMore && page.nextCursor && (
        <div className="mt-4 text-center">
          <Link
            href={listingsHref({ cursor: page.nextCursor })}
            className="inline-block rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
          >
            Показать ещё
          </Link>
        </div>
      )}
    </>
  );
}
