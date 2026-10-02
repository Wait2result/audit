import Link from 'next/link';
import {
  LISTING_REPORT_REASON_LABELS,
  type ListingReportDto,
  type PaginatedResponse,
} from '@dagestan/shared';

import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ResolveReportForm } from './resolve-report-form';

export default async function ListingReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ onlyNew?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  // По умолчанию — только нерассмотренные: разобранная жалоба не требует
  // повторного внимания, и держать её в общем списке — только шум
  const onlyNew = params.onlyNew !== '0';

  const query = new URLSearchParams({ limit: '30', onlyNew: onlyNew ? '1' : '0' });
  if (params.cursor) query.set('cursor', params.cursor);

  const page = await apiFetch<PaginatedResponse<ListingReportDto>>(
    `/listings/admin/reports?${query.toString()}`,
  );

  return (
    <>
      <PageHeader
        title="Жалобы на объявления"
        description="При трёх жалобах от разных людей объявление снимается само — здесь можно подтвердить решение или вернуть объявление, если жалоба не подтвердилась."
        action={
          <Link
            href="/listings"
            className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
          >
            К объявлениям
          </Link>
        }
      />

      <div className="mb-5 flex gap-2">
        <Link
          href="/listings/reports"
          className={`rounded-lg px-4 py-2 text-sm transition ${
            onlyNew
              ? 'bg-brand-500 font-medium text-ink-950'
              : 'border border-ink-700 text-ink-300 hover:text-ink-100'
          }`}
        >
          Нерассмотренные
        </Link>
        <Link
          href="/listings/reports?onlyNew=0"
          className={`rounded-lg px-4 py-2 text-sm transition ${
            onlyNew
              ? 'border border-ink-700 text-ink-300 hover:text-ink-100'
              : 'bg-brand-500 font-medium text-ink-950'
          }`}
        >
          Все
        </Link>
      </div>

      <Card>
        {page.items.length === 0 ? (
          <EmptyState
            title={onlyNew ? 'Нерассмотренных жалоб нет' : 'Жалоб пока не было'}
            description="Очередь пуста — хороший знак."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Объявление</Th>
                <Th>Причина</Th>
                <Th>От кого</Th>
                <Th>Статус</Th>
                <Th>Действия</Th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((report) => (
                <tr key={report.id}>
                  <Td className="max-w-xs">
                    <Link
                      href={`/listings?search=${encodeURIComponent(report.listingTitle)}`}
                      className="truncate font-medium text-ink-200 hover:text-brand-300"
                    >
                      {report.listingTitle}
                    </Link>
                    {report.listingReportsCount > 1 && (
                      <p className="mt-0.5 text-xs text-accent-400">
                        Всего жалоб: {report.listingReportsCount}
                      </p>
                    )}
                  </Td>
                  <Td className="max-w-sm text-sm text-ink-300">
                    {LISTING_REPORT_REASON_LABELS[report.reason]}
                    {report.comment && (
                      <p className="mt-1 text-xs text-ink-500">«{report.comment}»</p>
                    )}
                  </Td>
                  <Td className="text-sm text-ink-400">
                    {report.reporterName}
                    <div className="mt-0.5 text-xs text-ink-500">
                      {formatDateTime(report.createdAt)}
                    </div>
                  </Td>
                  <Td>
                    {report.status === 'new' && <Badge tone="warning">Новая</Badge>}
                    {report.status === 'resolved' && <Badge tone="danger">Подтверждена</Badge>}
                    {report.status === 'rejected' && <Badge tone="neutral">Отклонена</Badge>}
                    {report.resolution && (
                      <p className="mt-1 text-xs text-ink-500">{report.resolution}</p>
                    )}
                  </Td>
                  <Td>
                    {report.status === 'new' ? (
                      <ResolveReportForm reportId={report.id} />
                    ) : (
                      <span className="text-xs text-ink-600">—</span>
                    )}
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
            href={`/listings/reports?onlyNew=${onlyNew ? '1' : '0'}&cursor=${page.nextCursor}`}
            className="inline-block rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
          >
            Показать ещё
          </Link>
        </div>
      )}
    </>
  );
}
