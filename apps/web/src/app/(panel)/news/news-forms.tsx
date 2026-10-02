'use client';

import { useActionState } from 'react';

import { toggleNewsHidden, type NewsActionState } from './actions';

export function ToggleNewsButton({ id, isHidden }: { id: string; isHidden: boolean }) {
  const [state, formAction, pending] = useActionState<NewsActionState, FormData>(
    toggleNewsHidden,
    {},
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isHidden" value={String(isHidden)} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-300 transition hover:border-brand-500 hover:text-brand-300 disabled:opacity-60"
      >
        {pending ? '…' : isHidden ? 'Вернуть' : 'Скрыть'}
      </button>
      {state.error && <p className="mt-1 text-xs text-danger-400">{state.error}</p>}
    </form>
  );
}
