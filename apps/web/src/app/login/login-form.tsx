'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { login, type LoginState } from './actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand-500 px-4 py-3 font-medium text-ink-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Проверяем…' : label}
    </button>
  );
}

/**
 * Кнопка «отмена» — заметно уже основной и с приглушённой надписью:
 * это второстепенное действие, а не следующий шаг, и выглядеть должно
 * соответственно, а не наравне с «Подтвердить».
 *
 * Это ОБЫЧНАЯ кнопка (type="button"), а не отправка формы. Кнопки одной формы
 * не всегда надёжно передают серверу своё имя и значение — это давняя
 * особенность браузеров, а не что-то специфичное для React: обычный
 * `new FormData(form)` без явного указания на то, какую кнопку нажали,
 * никогда не включает данные кнопок отправки. Раньше это приводило к тому,
 * что нажатие точно ничего не делало на глаз. Возврат к первому шагу поэтому
 * сделан на стороне браузера, без обращения к серверу.
 */
function SecondaryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="flex justify-center pt-1">
      <button
        type="button"
        onClick={onClick}
        className="rounded-md border border-ink-700 px-3 py-1.5 text-xs text-ink-500 transition hover:border-ink-600 hover:text-ink-300"
      >
        {label}
      </button>
    </div>
  );
}

/**
 * Вход в панель — два шага в одной форме.
 *
 * Сначала телефон и пароль. Если у сотрудника включена двухфакторная
 * авторизация, форма сменяется на ввод кода — и телефон с паролем повторно
 * НЕ запрашиваются: их место занимает временный пропуск, выданный сервером.
 * Так удобнее, и пароль не остаётся лежать в памяти страницы в ожидании
 * второй отправки.
 *
 * Какой шаг показывать после отправки формы, решает ответ сервера. Единственное
 * исключение — кнопка «Войти под другой учётной записью»: она не отправляет
 * форму, а просто пересоздаёт её заново на стороне браузера (через смену
 * `key`), возвращаясь к первому шагу мгновенно и без сетевого запроса.
 */
export function LoginForm({ next, expired }: { next: string; expired: boolean }) {
  const [formKey, setFormKey] = useState(0);

  return (
    <LoginFormStep
      key={formKey}
      next={next}
      expired={expired}
      onStartOver={() => setFormKey((k) => k + 1)}
    />
  );
}

function LoginFormStep({
  next,
  expired,
  onStartOver,
}: {
  next: string;
  expired: boolean;
  onStartOver: () => void;
}) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});
  const challenge = state.challenge;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />

      {expired && !state.error && !challenge && (
        <p className="rounded-lg border border-ink-700 bg-ink-800 px-4 py-3 text-sm text-ink-300">
          Сессия завершена. Войдите заново.
        </p>
      )}

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-4 py-3 text-sm text-danger-400"
        >
          {state.error}
        </p>
      )}

      {challenge ? (
        <>
          <input type="hidden" name="twoFactorToken" value={challenge.token} />
          <input type="hidden" name="maskedPhone" value={challenge.maskedPhone} />

          <div className="space-y-1.5 text-center">
            <p className="text-sm text-ink-200">Введите код из приложения</p>
            <p className="text-xs text-ink-500">Вход в аккаунт {challenge.maskedPhone}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="code" className="sr-only">
              Код из приложения-аутентификатора
            </label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              autoFocus
              placeholder="000000"
              aria-invalid={state.field === 'code'}
              className="w-full rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-ink-100 placeholder:text-ink-600 focus:border-brand-500 focus:outline-none aria-[invalid=true]:border-danger-500"
            />
          </div>

          <SubmitButton label="Подтвердить" />
          <SecondaryButton label="Войти под другой учётной записью" onClick={onStartOver} />
        </>
      ) : (
        <>
          <div className="space-y-2">
            <label htmlFor="phone" className="block text-sm text-ink-300">
              Номер телефона
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="username"
              required
              autoFocus
              placeholder="+7 928 000-00-00"
              aria-invalid={state.field === 'phone'}
              className="w-full rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-ink-100 placeholder:text-ink-500 focus:border-brand-500 focus:outline-none aria-[invalid=true]:border-danger-500"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm text-ink-300">
              Пароль
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={state.field === 'password'}
              className="w-full rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-ink-100 focus:border-brand-500 focus:outline-none aria-[invalid=true]:border-danger-500"
            />
          </div>

          <SubmitButton label="Войти" />
        </>
      )}
    </form>
  );
}
