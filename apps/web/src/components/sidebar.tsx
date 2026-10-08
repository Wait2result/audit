'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { logout } from '@/app/login/actions';

interface NavItem {
  href: string;
  label: string;
  /** Право, без которого раздел не показывается */
  permission?: string;
}

const NAV: NavItem[] = [
  { href: '/', label: 'Сводка', permission: 'analytics:read' },
  { href: '/users', label: 'Пользователи', permission: 'users:read' },
  { href: '/cities', label: 'Города', permission: 'cities:read' },
  { href: '/news', label: 'Новости', permission: 'news:read' },
  { href: '/places', label: 'Заведения', permission: 'places:read' },
  // Карусели и фото плиток главной — то, что человек видит первым при запуске
  { href: '/places/promo-banners', label: 'Главная и реклама', permission: 'places:read' },
  { href: '/listings', label: 'Объявления', permission: 'moderation:read' },
  { href: '/orders', label: 'Заказы', permission: 'orders:read' },
  { href: '/reviews', label: 'Отзывы', permission: 'reviews:read' },
  { href: '/roles', label: 'Роли и права', permission: 'roles:read' },
  { href: '/audit', label: 'Журнал действий', permission: 'system:audit' },
  // Раздел доступен всем сотрудникам: свою защиту настраивает каждый сам
  { href: '/security', label: 'Безопасность' },
];

export function Sidebar({
  userName,
  roleLabel,
  permissions,
}: {
  userName: string;
  roleLabel: string;
  permissions: string[];
}) {
  const pathname = usePathname();

  /*
   * Разделы без нужного права просто не показываются.
   *
   * Это удобство, а не защита: даже если открыть адрес раздела напрямую,
   * сервер API откажет в данных. Проверка прав всегда происходит на сервере.
   */
  const visible = NAV.filter((item) => !item.permission || permissions.includes(item.permission));

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <svg
          viewBox="0 0 120 48"
          className="h-6 w-15 text-brand-400"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 44 L30 14 L44 30 L62 6 L84 34 L98 22 L116 44 Z"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-semibold tracking-tight">Дагестан</span>
      </div>

      <nav className="flex-1 px-3 py-2">
        <ul className="space-y-0.5">
          {visible.map((item) => {
            // Подсвечен самый точный раздел: «Главная и реклама» лежит внутри
            // «Заведений», и без этого горели бы оба пункта сразу
            const matches = (href: string) =>
              href === '/'
                ? pathname === '/'
                : pathname === href || pathname.startsWith(`${href}/`);
            const active =
              matches(item.href) &&
              !NAV.some(
                (other) =>
                  other.href.length > item.href.length &&
                  other.href.startsWith(item.href) &&
                  matches(other.href),
              );

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? 'bg-brand-500/15 font-medium text-brand-300'
                      : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-ink-800 p-4">
        <p className="truncate text-sm font-medium text-ink-200">{userName}</p>
        <p className="mt-0.5 text-xs text-ink-500">{roleLabel}</p>

        <form action={logout} className="mt-3">
          <button
            type="submit"
            className="w-full rounded-lg border border-ink-700 px-3 py-2 text-sm text-ink-300 transition hover:border-danger-500/50 hover:text-danger-400"
          >
            Выйти
          </button>
        </form>
      </div>
    </aside>
  );
}
