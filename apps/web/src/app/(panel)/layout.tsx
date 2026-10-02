import { ROLE_LABELS, type AuthenticatedUser, type RoleName } from '@dagestan/shared';

import { Sidebar } from '@/components/sidebar';
import { apiFetch } from '@/lib/api';

/**
 * Оболочка панели управления.
 *
 * Данные сотрудника берутся у API при каждой загрузке страницы, а не из
 * токена: если у человека отобрали роль, меню перестроится сразу, не дожидаясь
 * истечения токена.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await apiFetch<AuthenticatedUser>('/users/me');

  const primaryRole = user.roles.find((r) => r !== 'user') ?? 'user';
  const roleLabel = ROLE_LABELS[primaryRole as RoleName] ?? primaryRole;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

  return (
    <div className="flex min-h-screen">
      <Sidebar userName={fullName} roleLabel={roleLabel} permissions={user.permissions} />
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
