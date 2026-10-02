import {
  ROLE_LABELS,
  type AdminUserListItem,
  type PaginatedResponse,
  type RoleName,
} from '@dagestan/shared';

import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { formatDateTime, formatPhone, formatUserStatus } from '@/lib/format';
import { BlockUserButton, UnblockUserButton } from './user-actions';

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; cursor?: string }>;
}) {
  const params = await searchParams;

  const query = new URLSearchParams({ limit: '30' });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.cursor) query.set('cursor', params.cursor);

  const page = await apiFetch<PaginatedResponse<AdminUserListItem>>(`/users?${query.toString()}`);

  return (
    <>
      <PageHeader
        title="Пользователи"
        description="Поиск по имени и номеру телефона. Блокировка немедленно завершает все сессии человека."
      />

      <form className="mb-5 flex flex-wrap gap-3">
        <input
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Имя или номер телефона"
          className="w-72 rounded-lg border border-ink-700 bg-ink-900 px-4 py-2 text-sm text-ink-100 placeholder:text-ink-600 focus:border-brand-500 focus:outline-none"
        />

        <select
          name="status"
          defaultValue={params.status ?? ''}
          className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-200 focus:border-brand-500 focus:outline-none"
        >
          <option value="">Любой статус</option>
          <option value="active">Активные</option>
          <option value="blocked">Заблокированные</option>
          <option value="pending">Не подтверждённые</option>
        </select>

        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-brand-400"
        >
          Найти
        </button>
      </form>

      <Card>
        {page.items.length === 0 ? (
          <EmptyState
            title="Никого не найдено"
            description="Измените условия поиска или сбросьте фильтры."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Пользователь</Th>
                <Th>Статус</Th>
                <Th>Роли</Th>
                <Th>Город</Th>
                <Th>Регистрация</Th>
                <Th>Действия</Th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((user) => {
                const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

                return (
                  <tr key={user.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="text-ink-100">{fullName}</span>
                        {user.isVerified && <Badge tone="brand">проверен</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">{formatPhone(user.phone)}</div>
                    </Td>

                    <Td>
                      <Badge
                        tone={
                          user.status === 'active'
                            ? 'success'
                            : user.status === 'blocked'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {formatUserStatus(user.status)}
                      </Badge>
                      {user.activeBlock && (
                        <div
                          className="mt-1 max-w-48 truncate text-xs text-ink-500"
                          title={user.activeBlock.reason}
                        >
                          {user.activeBlock.reason}
                        </div>
                      )}
                    </Td>

                    <Td className="text-ink-300">
                      {user.roles.map((r) => ROLE_LABELS[r as RoleName] ?? r).join(', ')}
                    </Td>

                    <Td className="text-ink-400">{user.cityName ?? '—'}</Td>

                    <Td className="whitespace-nowrap text-ink-400">
                      {formatDateTime(user.createdAt)}
                    </Td>

                    <Td>
                      {user.status === 'blocked' ? (
                        <UnblockUserButton userId={user.id} />
                      ) : (
                        <BlockUserButton userId={user.id} userName={fullName} />
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {page.hasMore && page.nextCursor && (
        <div className="mt-4 text-center">
          <a
            href={`/users?cursor=${page.nextCursor}${params.search ? `&search=${encodeURIComponent(params.search)}` : ''}`}
            className="inline-block rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
          >
            Показать ещё
          </a>
        </div>
      )}
    </>
  );
}
