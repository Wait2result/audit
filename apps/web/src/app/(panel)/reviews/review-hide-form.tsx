'use client';

import { useActionState } from 'react';

import { setReviewHidden, type ReviewActionState } from './actions';

/** Одна кнопка на оба действия: скрытый отзыв возвращается тем же способом. */
export function ReviewHideForm({ reviewId, isHidden }: { reviewId: string; isHidden: boolean }) {
  const [state, formAction, pending] = useActionState<ReviewActionState, FormData>(
    setReviewHidden,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={reviewId} />
      <input type="hidden" name="hide" value={isHidden ? '0' : '1'} />

      <button
        type="submit"
        disabled={pending}
        className={`rounded-md border px-2.5 py-1 text-xs transition disabled:opacity-60 ${
          isHidden
            ? 'border-ink-700 text-ink-300 hover:border-brand-500 hover:text-brand-300'
            : 'border-ink-700 text-ink-400 hover:border-danger-500/50 hover:text-danger-400'
        }`}
      >
        {isHidden ? 'Вернуть' : 'Скрыть'}
      </button>

      {state.error && <p className="text-xs text-danger-400">{state.error}</p>}
    </form>
  );
}
