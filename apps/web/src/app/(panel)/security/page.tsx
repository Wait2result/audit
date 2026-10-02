import { Badge, Card, PageHeader } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { DisableTwoFactor, EnableTwoFactor } from './two-factor';

export default async function SecurityPage() {
  const status = await apiFetch<{ enabled: boolean; required: boolean }>('/auth/2fa/status');

  return (
    <>
      <PageHeader
        title="Безопасность"
        description="Двухфакторная авторизация — второй ключ к вашей учётной записи помимо пароля."
      />

      <Card className="max-w-3xl p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-ink-100">Двухфакторная авторизация</h2>
          <div className="flex gap-2">
            {status.required && <Badge tone="warning">обязательна для вашей роли</Badge>}
            <Badge tone={status.enabled ? 'success' : 'danger'}>
              {status.enabled ? 'включена' : 'выключена'}
            </Badge>
          </div>
        </div>

        {!status.enabled && status.required && (
          <p className="mb-5 rounded-lg border border-accent-500/40 bg-accent-500/10 px-4 py-3 text-sm text-accent-400">
            Пароль можно подсмотреть, подобрать или выманить обманом. У вашей учётной записи есть
            доступ к данным всех пользователей платформы, поэтому одного пароля недостаточно.
            Включите второй фактор до запуска приложения для реальных пользователей.
          </p>
        )}

        {status.enabled ? <DisableTwoFactor /> : <EnableTwoFactor />}
      </Card>

      <Card className="mt-4 max-w-3xl p-6">
        <h2 className="mb-3 text-lg font-medium text-ink-100">Как это работает</h2>
        <p className="text-sm leading-relaxed text-ink-400">
          Приложение на телефоне и сервер знают один общий секрет. Каждые 30 секунд оба независимо
          вычисляют из него и текущего времени шестизначный код. По сети код не передаётся и нигде
          не хранится, поэтому перехватить его невозможно — а использованный код второй раз не
          принимается.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-400">
          Секрет хранится в базе в зашифрованном виде. Даже получив копию базы данных, злоумышленник
          не сможет вычислять ваши коды.
        </p>
      </Card>
    </>
  );
}
