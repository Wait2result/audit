'use client';

import { useActionState, useState } from 'react';
import { CUISINE_SUGGESTIONS, PLACE_TYPE_LABELS, type CityDto } from '@dagestan/shared';

import { createPlace, type PlaceActionState } from './actions';

const inputClass =
  'w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600 focus:border-brand-500 focus:outline-none';
const labelClass = 'mb-1.5 block text-xs text-ink-400';

export function Field({
  label,
  name,
  hint,
  ...rest
}: {
  label: string;
  name: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <input id={name} name={name} className={inputClass} {...rest} />
      {hint && <p className="mt-1 text-xs text-ink-600">{hint}</p>}
    </div>
  );
}

export function Toggle({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-300">
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="size-4 rounded border-ink-600 bg-ink-950"
      />
      {label}
    </label>
  );
}

export function Notice({ state }: { state: PlaceActionState }) {
  if (!state.error && !state.success) return null;

  return state.error ? (
    <p role="alert" className="mb-4 rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-400">
      {state.error}
    </p>
  ) : (
    <p className="mb-4 rounded-lg bg-brand-600/15 px-3 py-2 text-sm text-brand-300">
      {state.success}
    </p>
  );
}

export function AddPlaceForm({ cities }: { cities: CityDto[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<PlaceActionState, FormData>(createPlace, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-brand-400"
      >
        Добавить заведение
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="w-full rounded-xl border border-ink-800 bg-ink-900 p-5 lg:w-auto lg:min-w-[620px]"
    >
      <h2 className="mb-4 font-medium text-ink-100">Новое заведение</h2>
      <Notice state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название" name="name" required placeholder="Шашлычная «Каспий»" />

        <div>
          <label htmlFor="type" className={labelClass}>
            Вид
          </label>
          <select id="type" name="type" className={inputClass} defaultValue="restaurant">
            {Object.entries(PLACE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cityId" className={labelClass}>
            Город
          </label>
          <select id="cityId" name="cityId" className={inputClass} required>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </div>

        <Field label="Телефон" name="phone" type="tel" placeholder="+7 928 000-00-00" />

        <div className="sm:col-span-2">
          <Field label="Адрес" name="address" required placeholder="проспект Имама Шамиля, 1" />
        </div>

        <div className="sm:col-span-2">
          <Field
            label="Кухни через запятую"
            name="cuisines"
            list="cuisine-suggestions"
            placeholder="дагестанская, кавказская"
            hint="Из этих слов строятся фильтры в приложении"
          />
          <datalist id="cuisine-suggestions">
            {CUISINE_SUGGESTIONS.map((cuisine) => (
              <option key={cuisine} value={cuisine} />
            ))}
          </datalist>
        </div>

        <Field label="Средний чек, ₽" name="averageCheck" type="number" min="0" placeholder="800" />
        <Field
          label="Срок доставки, минут"
          name="deliveryMinutes"
          type="number"
          min="1"
          placeholder="45"
        />
        <Field
          label="Стоимость доставки, ₽"
          name="deliveryFee"
          type="number"
          min="0"
          placeholder="150"
        />
        <Field
          label="Бесплатно от суммы, ₽"
          name="freeDeliveryFrom"
          type="number"
          min="0"
          placeholder="1500"
        />
        <Field
          label="Минимальная сумма заказа, ₽"
          name="minOrderAmount"
          type="number"
          min="0"
          placeholder="500"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <Toggle label="Доставка" name="hasDelivery" />
        <Toggle label="Самовывоз" name="hasPickup" defaultChecked />
        <Toggle label="Показывать в приложении" name="isActive" defaultChecked />
        <Toggle label="Принимает заказы" name="ordersEnabled" />
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-brand-400 disabled:opacity-60"
        >
          {pending ? 'Сохраняем…' : 'Создать'}
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
