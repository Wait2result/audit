import type { RoleWithPermissions } from '@dagestan/shared';

import { Badge, Card, PageHeader } from '@/components/ui';
import { apiFetch } from '@/lib/api';

/** Названия групп прав для читаемой группировки. */
const CATEGORY_LABELS: Record<string, string> = {
  users: 'Пользователи',
  access: 'Доступы',
  catalog: 'Справочники',
  moderation: 'Модерация',
  partners: 'Партнёры',
  orders: 'Заказы',
  content: 'Контент',
  ads: 'Реклама',
  finance: 'Финансы',
  analytics: 'Аналитика',
  system: 'Система',
  partner: 'Кабинет партнёра',
};

export default async function RolesPage() {
  const roles = await apiFetch<RoleWithPermissions[]>('/admin/roles');

  return (
    <>
      <PageHeader
        title="Роли и права"
        description="Права выдаются не человеку, а роли. Изменив набор прав роли «Модератор», вы меняете его сразу у всех модераторов."
      />

      <div className="space-y-4">
        {roles.map((role) => {
          const grouped = groupByCategory(role.permissions);

          return (
            <Card key={role.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium text-ink-100">{role.label}</h2>
                  <p className="mt-0.5 font-mono text-xs text-ink-500">{role.name}</p>
                </div>

                <div className="flex items-center gap-2">
                  {role.isSystem && <Badge>Системная</Badge>}
                  <Badge tone={role.userCount > 0 ? 'brand' : 'neutral'}>
                    {role.userCount === 0 ? 'никому не выдана' : `сотрудников: ${role.userCount}`}
                  </Badge>
                  <Badge tone={role.permissions.length > 0 ? 'success' : 'neutral'}>
                    прав: {role.permissions.length}
                  </Badge>
                </div>
              </div>

              {role.permissions.length === 0 ? (
                <p className="mt-4 text-sm text-ink-500">
                  Прав в панели управления нет — это роль обычного пользователя приложения.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(grouped).map(([category, permissions]) => (
                    <div key={category}>
                      <p className="mb-1.5 text-xs font-medium tracking-wide text-ink-400 uppercase">
                        {CATEGORY_LABELS[category] ?? category}
                      </p>
                      <ul className="space-y-1">
                        {permissions.map((permission) => (
                          <li key={permission} className="font-mono text-xs text-ink-300">
                            {permission}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

function groupByCategory(permissions: string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};

  for (const permission of permissions) {
    const category = permission.split(':')[0] ?? 'other';
    (grouped[category] ??= []).push(permission);
  }

  return grouped;
}
