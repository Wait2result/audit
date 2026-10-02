import type { DashboardSummary } from '@dagestan/shared';

import { Card, PageHeader, StatCard, Table, Td, Th } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { formatAction, formatBytes, formatNumber, formatRelative } from '@/lib/format';

export default async function DashboardPage() {
  const data = await apiFetch<DashboardSummary>('/admin/dashboard');

  return (
    <>
      <PageHeader
        title="Сводка"
        description="Ключевые показатели платформы и последние действия сотрудников."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Пользователей"
          value={formatNumber(data.users.total)}
          hint={`активных: ${formatNumber(data.users.active)}`}
        />
        <StatCard
          label="Новых за неделю"
          value={formatNumber(data.users.newLastWeek)}
          hint="регистрации за 7 дней"
        />
        <StatCard
          label="Заблокировано"
          value={formatNumber(data.users.blocked)}
          tone={data.users.blocked > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Городов"
          value={formatNumber(data.cities.active)}
          hint={`всего в базе: ${formatNumber(data.cities.total)}`}
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Файлов"
          value={formatNumber(data.media.total)}
          hint={`занято: ${formatBytes(data.media.totalBytes)}`}
        />
        <StatCard
          label="Не привязано к объектам"
          value={formatNumber(data.media.orphans)}
          hint="удаляются автоматически через сутки"
          tone={data.media.orphans > 50 ? 'warning' : 'default'}
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium text-ink-200">Последние действия</h2>

        <Card>
          {data.recentActions.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-500">Действий пока не было</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Действие</Th>
                  <Th>Кто</Th>
                  <Th>Когда</Th>
                  <Th>IP-адрес</Th>
                </tr>
              </thead>
              <tbody>
                {data.recentActions.map((entry) => (
                  <tr key={entry.id}>
                    <Td>{formatAction(entry.action)}</Td>
                    <Td className="text-ink-300">
                      {entry.actor
                        ? [entry.actor.firstName, entry.actor.lastName].filter(Boolean).join(' ')
                        : 'Система'}
                    </Td>
                    <Td className="text-ink-400">{formatRelative(entry.createdAt)}</Td>
                    <Td className="font-mono text-xs text-ink-500">{entry.ipAddress ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </section>
    </>
  );
}
