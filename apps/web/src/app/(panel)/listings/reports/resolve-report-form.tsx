'use client';

import { useActionState, useState } from 'react';

import { resolveReport } from '../actions';
import type { ListingActionState } from '../actions';

/**
 * Решение по одной жалобе: подтвердить (снимает объявление) или отклонить.
 *
 * Комментарий необязателен и виден только в журнале — не автору: если
 * причина важна для автора, для этого есть отдельная причина снятия у
 * самого объявления.
 */
export function ResolveReportForm({ reportId }: { reportId: string }) {
  const [action, setAction] = useState<'confirm' | 'reject' | null>(null);
  const [state, formAction, pending] = useActionState<ListingActionState, FormData>(
    resolveReport,
    {},
  );

  if (!action) {
    return (
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setAction('confirm')}
          className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-400 transition hover:border-danger-500/50 hover:text-danger-400"
        >
          Подтвердить
        </button>
        <button
          type="button"
          onClick={() => setAction('reject')}
          className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
        >
          Отклонить
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-56 flex-col gap-1.5">
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="action" value={action} />
      <textarea
        name="comment"
        rows={2}
        placeholder="Комментарий для журнала — необязательно"
        className="w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-xs text-ink-100 placeholder:text-ink-600 focus:border-brand-500 focus:outline-none"
      />
      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={pending}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 ${
            action === 'confirm'
              ? 'bg-danger-500/90 text-ink-950 hover:bg-danger-500'
              : 'bg-brand-500 text-ink-950 hover:bg-brand-400'
          }`}
        >
          {action === 'confirm' ? 'Снять объявление' : 'Отклонить жалобу'}
        </button>
        <button
          type="button"
          onClick={() => setAction(null)}
          className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-400 hover:text-ink-200"
        >
          Отмена
        </button>
      </div>
      {state.error && <p className="text-xs text-danger-400">{state.error}</p>}
    </form>
  );
}
