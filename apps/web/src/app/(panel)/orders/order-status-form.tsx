'use client';

import { useActionState } from 'react';
import { ORDER_STATUS_LABELS, ORDER_TRANSITIONS, type OrderStatus } from '@dagestan/shared';

import { changeOrderStatus, type OrderActionState } from './actions';

/** Кнопки допустимых переходов. Список общий с сервером и приложением. */
export function OrderStatusForm({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [state, formAction, pending] = useActionState<OrderActionState, FormData>(
    changeOrderStatus,
    {},
  );

  const next = ORDER_TRANSITIONS[status];
  if (next.length === 0) return null;

  return (
    <form action={formAction} className="flex flex-wrap gap-1.5">
      <input type="hidden" name="id" value={orderId} />

      {next.map((target) => (
        <button
          key={target}
          type="submit"
          name="status"
          value={target}
          disabled={pending}
          className={`rounded-md border px-2.5 py-1 text-xs transition disabled:opacity-60 ${
            target === 'cancelled'
              ? 'border-ink-700 text-ink-400 hover:border-danger-500/50 hover:text-danger-400'
              : 'border-ink-700 text-ink-300 hover:border-brand-500 hover:text-brand-300'
          }`}
        >
          {ORDER_STATUS_LABELS[target]}
        </button>
      ))}

      {state.error && <p className="w-full text-xs text-danger-400">{state.error}</p>}
    </form>
  );
}
