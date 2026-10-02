'use client';

import { useActionState, useState } from 'react';

import { createCity, toggleCity, type CityActionState } from './actions';

const inputClass =
  'w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600 focus:border-brand-500 focus:outline-none';

export function AddCityForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CityActionState, FormData>(createCity, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-brand-400"
      >
        Добавить город
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="w-full rounded-xl border border-ink-800 bg-ink-900 p-5 lg:w-auto lg:min-w-[520px]"
    >
      <h2 className="mb-4 font-medium text-ink-100">Новый город</h2>

      {state.error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-400"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mb-4 rounded-lg bg-brand-600/15 px-3 py-2 text-sm text-brand-300">
          {state.success}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-xs text-ink-400">
            Название
          </label>
          <input id="name" name="name" required placeholder="Избербаш" className={inputClass} />
        </div>

        <div>
          <label htmlFor="slug" className="mb-1.5 block text-xs text-ink-400">
            Латиницей, для ссылок
          </label>
          <input
            id="slug"
            name="slug"
            required
            pattern="[a-z0-9\-]+"
            placeholder="izberbash"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="latitude" className="mb-1.5 block text-xs text-ink-400">
            Широта
          </label>
          <input
            id="latitude"
            name="latitude"
            type="number"
            step="any"
            required
            placeholder="42.5678"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="longitude" className="mb-1.5 block text-xs text-ink-400">
            Долгота
          </label>
          <input
            id="longitude"
            name="longitude"
            type="number"
            step="any"
            required
            placeholder="47.8654"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="sortOrder" className="mb-1.5 block text-xs text-ink-400">
            Порядок в списке
          </label>
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            defaultValue={10}
            className={inputClass}
          />
        </div>

        <label className="flex items-end gap-2 pb-2 text-sm text-ink-300">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked
            className="size-4 rounded border-ink-600 bg-ink-950"
          />
          Показывать в приложении
        </label>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-brand-400 disabled:opacity-60"
        >
          {pending ? 'Сохраняем…' : 'Добавить'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-400 transition hover:text-ink-200"
        >
          Закрыть
        </button>
      </div>
    </form>
  );
}

export function ToggleCityButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [state, formAction, pending] = useActionState<CityActionState, FormData>(toggleCity, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isActive" value={String(isActive)} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-300 transition hover:border-brand-500 hover:text-brand-300 disabled:opacity-60"
      >
        {pending ? '…' : isActive ? 'Скрыть' : 'Показать'}
      </button>
      {state.error && <p className="mt-1 text-xs text-danger-400">{state.error}</p>}
    </form>
  );
}
