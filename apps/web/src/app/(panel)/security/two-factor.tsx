'use client';

import Image from 'next/image';
import { useActionState } from 'react';

import {
  disableTwoFactor,
  enableTwoFactor,
  startSetup,
  type EnableState,
  type SetupState,
} from './actions';

const codeInputClass =
  'w-44 rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] text-ink-100 focus:border-brand-500 focus:outline-none';

/** Включение защиты: получить QR-код, отсканировать, подтвердить кодом. */
export function EnableTwoFactor() {
  const [setup, runSetup, settingUp] = useActionState<SetupState, FormData>(
    (prev) => startSetup(prev),
    {},
  );
  const [enable, runEnable, enabling] = useActionState<EnableState, FormData>(enableTwoFactor, {});

  if (enable.success) {
    return (
      <p className="rounded-lg border border-brand-600/40 bg-brand-600/10 px-4 py-3 text-sm text-brand-300">
        {enable.success}. Обновите страницу, чтобы увидеть текущее состояние.
      </p>
    );
  }

  if (!setup.qrDataUrl) {
    return (
      <form action={runSetup}>
        {setup.error && (
          <p role="alert" className="mb-4 text-sm text-danger-400">
            {setup.error}
          </p>
        )}
        <button
          type="submit"
          disabled={settingUp}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-brand-400 disabled:opacity-60"
        >
          {settingUp ? 'Готовим…' : 'Включить двухфакторную авторизацию'}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <ol className="space-y-4 text-sm text-ink-300">
        <li>
          <span className="font-medium text-ink-100">1.</span> Установите на телефон приложение-
          аутентификатор: Google Authenticator, Яндекс.Ключ или любое подобное.
        </li>
        <li>
          <span className="font-medium text-ink-100">2.</span> Отсканируйте этот код камерой
          приложения:
          <div className="mt-3 inline-block rounded-xl border border-ink-700 bg-ink-950 p-3">
            <Image
              src={setup.qrDataUrl}
              alt="QR-код для приложения-аутентификатора"
              width={240}
              height={240}
              unoptimized
            />
          </div>
          <div className="mt-3 max-w-md text-xs text-ink-500">
            Если камера не читает код, введите секрет вручную:
            <code className="mt-1 block rounded-md border border-ink-800 bg-ink-950 px-3 py-2 font-mono text-sm break-all text-ink-300">
              {setup.secret}
            </code>
          </div>
        </li>
        <li>
          <span className="font-medium text-ink-100">3.</span> Введите шестизначный код, который
          показывает приложение:
        </li>
      </ol>

      <form action={runEnable} className="space-y-3">
        {enable.error && (
          <p role="alert" className="text-sm text-danger-400">
            {enable.error}
          </p>
        )}

        <label htmlFor="code" className="sr-only">
          Код из приложения
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          placeholder="000000"
          className={codeInputClass}
        />

        <div>
          <button
            type="submit"
            disabled={enabling}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-brand-400 disabled:opacity-60"
          >
            {enabling ? 'Проверяем…' : 'Подтвердить и включить'}
          </button>
        </div>
      </form>

      <p className="max-w-xl text-xs leading-relaxed text-ink-500">
        Пока код не подтверждён, защита не включается — так вы не потеряете доступ к учётной записи,
        если приложение на телефоне настроить не удалось.
      </p>
    </div>
  );
}

/** Отключение защиты — требует действующий код. */
export function DisableTwoFactor() {
  const [state, formAction, pending] = useActionState<EnableState, FormData>(disableTwoFactor, {});

  if (state.success) {
    return <p className="text-sm text-ink-300">{state.success}. Обновите страницу.</p>;
  }

  return (
    <form action={formAction} className="space-y-3">
      {state.error && (
        <p role="alert" className="text-sm text-danger-400">
          {state.error}
        </p>
      )}

      <label htmlFor="disable-code" className="block text-sm text-ink-400">
        Чтобы отключить, введите текущий код из приложения
      </label>
      <input
        id="disable-code"
        name="code"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        placeholder="000000"
        className={codeInputClass}
      />

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-danger-500/60 hover:text-danger-400 disabled:opacity-60"
        >
          {pending ? 'Отключаем…' : 'Отключить'}
        </button>
      </div>
    </form>
  );
}
