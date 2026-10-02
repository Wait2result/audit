'use client';

import { useActionState, useState } from 'react';

import { blockUser, unblockUser, type ActionState } from './actions';

/** Кнопка блокировки с обязательным вводом причины. */
export function BlockUserButton({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(blockUser, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-300 transition hover:border-danger-500/60 hover:text-danger-400"
      >
        Заблокировать
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={userId} />

      <label className="sr-only" htmlFor={`reason-${userId}`}>
        Причина блокировки {userName}
      </label>
      <input
        id={`reason-${userId}`}
        name="reason"
        required
        minLength={3}
        autoFocus
        placeholder="Причина (попадёт в журнал)"
        className="w-56 rounded-md border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-xs text-ink-100 placeholder:text-ink-600 focus:border-danger-500 focus:outline-none"
      />

      {state.error && <p className="text-xs text-danger-400">{state.error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-danger-500 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-danger-400 disabled:opacity-60"
        >
          {pending ? 'Блокируем…' : 'Подтвердить'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-400 transition hover:text-ink-200"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

export function UnblockUserButton({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(unblockUser, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-300 transition hover:border-brand-500 hover:text-brand-300 disabled:opacity-60"
      >
        {pending ? 'Снимаем…' : 'Разблокировать'}
      </button>
      {state.error && <p className="mt-1 text-xs text-danger-400">{state.error}</p>}
    </form>
  );
}
