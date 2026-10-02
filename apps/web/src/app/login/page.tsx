import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith('/') && !params.next.startsWith('//') ? params.next : '/';

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          {/* Силуэт гор — сдержанная отсылка к Дагестану без национальных орнаментов */}
          <svg
            viewBox="0 0 120 48"
            className="mx-auto mb-5 h-12 w-30 text-brand-400"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 44 L30 14 L44 30 L62 6 L84 34 L98 22 L116 44 Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="62" cy="6" r="2.5" fill="currentColor" />
          </svg>

          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Дагестан</h1>
          <p className="mt-2 text-sm text-ink-400">Панель управления</p>
        </div>

        <div className="rounded-2xl border border-ink-800 bg-ink-900 p-7 shadow-2xl shadow-black/40">
          <LoginForm next={next} expired={params.reason === 'expired'} />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-ink-500">
          Доступ только для сотрудников. Все действия записываются в журнал.
        </p>
      </div>
    </main>
  );
}
