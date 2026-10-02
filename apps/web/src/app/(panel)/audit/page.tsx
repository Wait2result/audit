import type { AuditLogEntry, PaginatedResponse } from '@dagestan/shared';

import { Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { formatAction, formatDateTime, formatPhone } from '@/lib/format';

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ limit: '50' });
  if (params.cursor) query.set('cursor', params.cursor);

  const page = await apiFetch<PaginatedResponse<AuditLogEntry>>(`/admin/audit?${query.toString()}`);

  return (
    <>
      <PageHeader
        title="Журнал действий"
        description="Каждое административное действие записывается навсегда. Изменить или удалить запись нельзя — такой возможности нет ни в панели, ни в API."
      />

      <Card>
        {page.items.length === 0 ? (
          <EmptyState title="Записей пока нет" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Действие</Th>
                <Th>Кто</Th>
                <Th>Над чем</Th>
                <Th>Когда</Th>
                <Th>IP-адрес</Th>
                <Th>Номер запроса</Th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((entry) => (
                <tr key={entry.id}>
                  <Td>{formatAction(entry.action)}</Td>
                  <Td>
                    {entry.actor ? (
                      <div>
                        <div className="text-ink-200">
                          {[entry.actor.firstName, entry.actor.lastName].filter(Boolean).join(' ')}
                        </div>
                        <div className="text-xs text-ink-500">{formatPhone(entry.actor.phone)}</div>
                      </div>
                    ) : (
                      <span className="text-ink-500">Система</span>
                    )}
                  </Td>
                  <Td className="text-ink-400">{entry.targetType ?? '—'}</Td>
                  <Td className="whitespace-nowrap text-ink-400">
                    {formatDateTime(entry.createdAt)}
                  </Td>
                  <Td className="font-mono text-xs text-ink-500">{entry.ipAddress ?? '—'}</Td>
                  <Td className="font-mono text-xs text-ink-600">
                    {entry.requestId ? entry.requestId.slice(0, 8) : '—'}
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
            href={`/audit?cursor=${page.nextCursor}`}
            className="inline-block rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
          >
            Показать ещё
          </a>
        </div>
      )}
    </>
  );
}
