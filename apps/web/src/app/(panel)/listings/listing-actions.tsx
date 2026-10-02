'use client';

import { useActionState, useState } from 'react';
import type { ModerationStatus } from '@dagestan/shared';

import { bumpListing, restoreListing, suspendListing } from './actions';
import type { ListingActionState } from './actions';

/**
 * Действия над объявлением в очереди модерации.
 *
 * Набор кнопок зависит от текущего статуса: снимать можно только
 * опубликованное, возвращать — только снятое. Показывать кнопку, которая
 * всё равно ответит ошибкой, хуже, чем не показывать её вовсе.
 */
export function ListingActions({
  listingId,
  status,
}: {
  listingId: string;
  status: ModerationStatus;
}) {
  if (status === 'approved') {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <BumpButton listingId={listingId} />
        <SuspendForm listingId={listingId} />
      </div>
    );
  }

  if (status === 'suspended') {
    return <RestoreForm listingId={listingId} />;
  }

  // Черновик, архив, отклонённое — решение уже принято автором или системой,
  // сотруднику здесь действовать незачем
  return <span className="text-xs text-ink-600">—</span>;
}

function BumpButton({ listingId }: { listingId: string }) {
  const [state, formAction, pending] = useActionState<ListingActionState, FormData>(
    bumpListing,
    {},
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={listingId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-300 transition hover:border-brand-500 hover:text-brand-300 disabled:opacity-60"
      >
        Поднять
      </button>
      {state.error && <p className="mt-1 text-xs text-danger-400">{state.error}</p>}
    </form>
  );
}

/** Снятие с причиной: сама форма раскрывается по нажатию, чтобы не занимать место в спокойном состоянии. */
function SuspendForm({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ListingActionState, FormData>(
    suspendListing,
    {},
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-400 transition hover:border-danger-500/50 hover:text-danger-400"
      >
        Снять
      </button>
    );
  }

  return (
    <form action={formAction} className="flex w-56 flex-col gap-1.5">
      <input type="hidden" name="id" value={listingId} />
      <textarea
        name="reason"
        required
        minLength={3}
        rows={2}
        placeholder="Причина — её увидит автор"
        className="w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-xs text-ink-100 placeholder:text-ink-600 focus:border-danger-500 focus:outline-none"
      />
      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-danger-500/90 px-2.5 py-1 text-xs font-medium text-ink-950 transition hover:bg-danger-500 disabled:opacity-60"
        >
          Снять
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-400 hover:text-ink-200"
        >
          Отмена
        </button>
      </div>
      {state.error && <p className="text-xs text-danger-400">{state.error}</p>}
    </form>
  );
}

function RestoreForm({ listingId }: { listingId: string }) {
  const [state, formAction, pending] = useActionState<ListingActionState, FormData>(
    restoreListing,
    {},
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={listingId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-300 transition hover:border-brand-500 hover:text-brand-300 disabled:opacity-60"
      >
        Вернуть
      </button>
      {state.error && <p className="mt-1 text-xs text-danger-400">{state.error}</p>}
    </form>
  );
}
