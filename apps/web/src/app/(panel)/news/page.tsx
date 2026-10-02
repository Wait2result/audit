import type { AdminNewsListItem, NewsScope, PaginatedResponse } from '@dagestan/shared';

import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ToggleNewsButton } from './news-forms';

const SCOPE_LABELS: Record<NewsScope, string> = {
  city: 'Город',
  dagestan: 'Дагестан',
  russia: 'Россия',
  world: 'Мир',
};

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const scope = params.scope && params.scope in SCOPE_LABELS ? params.scope : '';

  const query = new URLSearchParams({ limit: '30' });
  if (scope) query.set('scope', scope);
  if (params.cursor) query.set('cursor', params.cursor);

  const page = await apiFetch<PaginatedResponse<AdminNewsListItem>>(
    `/news/admin/list?${query.toString()}`,
  );

  return (
    <>
      <PageHeader
        title="Новости"
        description="Новости собираются автоматически из проверенных источников. Здесь их можно только скрыть из ленты, если правила отбора пропустили лишнее."
      />

      <form className="mb-5 flex flex-wrap gap-3">
        <select
          name="scope"
          defaultValue={scope}
          className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-200 focus:border-brand-500 focus:outline-none"
        >
          <option value="">Все ленты</option>
          {Object.entries(SCOPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-brand-400"
        >
          Показать
        </button>
      </form>

      <Card>
        {page.items.length === 0 ? (
          <EmptyState
            title="Новостей пока нет"
            description="Сервер обновляет ленту каждые 15 минут."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Новость</Th>
                <Th>Лента</Th>
                <Th>Источник</Th>
                <Th>Опубликована</Th>
                <Th>Статус</Th>
                <Th>Действия</Th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((item) => (
                <tr key={item.id}>
                  <Td className="max-w-md">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-ink-100 transition hover:text-brand-300"
                    >
                      {item.title}
                    </a>
                    <div className="mt-0.5 text-xs text-ink-500">
                      баллы {item.score}
                      {item.corroboration > 0 && ` · подтверждений: ${item.corroboration}`}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-300">
                    {item.scope === 'city' && item.cityName
                      ? item.cityName
                      : SCOPE_LABELS[item.scope]}
                  </Td>
                  <Td className="text-ink-400">{item.sourceName}</Td>
                  <Td className="whitespace-nowrap text-ink-400">
                    {formatDateTime(item.publishedAt)}
                  </Td>
                  <Td>
                    <Badge tone={item.isHidden ? 'neutral' : 'success'}>
                      {item.isHidden ? 'скрыта' : 'в ленте'}
                    </Badge>
                  </Td>
                  <Td>
                    <ToggleNewsButton id={item.id} isHidden={item.isHidden} />
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
            href={`/news?cursor=${page.nextCursor}${scope ? `&scope=${scope}` : ''}`}
            className="inline-block rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
          >
            Показать ещё
          </a>
        </div>
      )}
    </>
  );
}
