'use client';

import { useActionState } from 'react';
import {
  PLACE_MEMBER_ROLE_LABELS,
  PLACE_TYPE_LABELS,
  WEEKDAYS,
  type PlaceDetailsDto,
  type PlaceMemberDto,
} from '@dagestan/shared';

import {
  addMember,
  deletePlace,
  removeMember,
  updatePlace,
  updateSchedule,
  type PlaceActionState,
} from '../actions';
import { Field, Notice, Toggle } from '../place-forms';

const inputClass =
  'w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600 focus:border-brand-500 focus:outline-none';
const primaryButton =
  'rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-brand-400 disabled:opacity-60';

/** Копейки в базе — рубли в форме. */
const toRubles = (kopecks: number | null): string =>
  kopecks === null ? '' : String(kopecks / 100);

export function PlaceSettingsForm({ place }: { place: PlaceDetailsDto }) {
  const [state, formAction, pending] = useActionState<PlaceActionState, FormData>(updatePlace, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={place.id} />
      <Notice state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название" name="name" defaultValue={place.name} required />

        <div>
          <label htmlFor="type" className="mb-1.5 block text-xs text-ink-400">
            Вид
          </label>
          <select id="type" name="type" className={inputClass} defaultValue={place.type}>
            {Object.entries(PLACE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <Field label="Адрес" name="address" defaultValue={place.address} required />
        </div>

        <Field label="Телефон" name="phone" type="tel" defaultValue={place.phone ?? ''} />
        <Field
          label="Кухни через запятую"
          name="cuisines"
          defaultValue={place.cuisines.join(', ')}
        />

        <div className="sm:col-span-2">
          <label htmlFor="description" className="mb-1.5 block text-xs text-ink-400">
            Описание
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={place.description ?? ''}
            className={inputClass}
          />
        </div>

        <Field
          label="Средний чек, ₽"
          name="averageCheck"
          type="number"
          min="0"
          defaultValue={toRubles(place.averageCheck)}
        />
        <Field
          label="Срок доставки, минут"
          name="deliveryMinutes"
          type="number"
          min="1"
          defaultValue={place.delivery.deliveryMinutes ?? ''}
        />
        <Field
          label="Стоимость доставки, ₽"
          name="deliveryFee"
          type="number"
          min="0"
          defaultValue={toRubles(place.delivery.deliveryFee)}
        />
        <Field
          label="Бесплатно от суммы, ₽"
          name="freeDeliveryFrom"
          type="number"
          min="0"
          defaultValue={toRubles(place.delivery.freeDeliveryFrom)}
        />
        <Field
          label="Минимальная сумма заказа, ₽"
          name="minOrderAmount"
          type="number"
          min="0"
          defaultValue={toRubles(place.delivery.minOrderAmount)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <Toggle label="Доставка" name="hasDelivery" defaultChecked={place.delivery.hasDelivery} />
        <Toggle label="Самовывоз" name="hasPickup" defaultChecked={place.delivery.hasPickup} />
        <Toggle label="Показывать в приложении" name="isActive" defaultChecked />
        <Toggle
          label="Принимает заказы"
          name="ordersEnabled"
          defaultChecked={place.ordersEnabled}
        />
      </div>

      <button type="submit" disabled={pending} className={`${primaryButton} mt-5`}>
        {pending ? 'Сохраняем…' : 'Сохранить'}
      </button>
    </form>
  );
}

/**
 * Часы работы. Закрытие раньше открытия означает работу за полночь:
 * «10:00 → 02:00» — это до двух часов ночи следующего дня.
 */
export function ScheduleForm({ place }: { place: PlaceDetailsDto }) {
  const [state, formAction, pending] = useActionState<PlaceActionState, FormData>(
    updateSchedule,
    {},
  );

  const dayOf = (weekday: number) => place.schedule.find((day) => day.weekday === weekday);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={place.id} />
      <Notice state={state} />

      <div className="space-y-2">
        {WEEKDAYS.map((weekday) => {
          const day = dayOf(weekday.value);

          return (
            <div key={weekday.value} className="flex flex-wrap items-center gap-3">
              <span className="w-28 text-sm text-ink-300">{weekday.full}</span>
              <input
                name={`opens-${weekday.value}`}
                type="time"
                defaultValue={day?.opensAt ?? '09:00'}
                className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-1.5 text-sm text-ink-100"
              />
              <span className="text-ink-600">—</span>
              <input
                name={`closes-${weekday.value}`}
                type="time"
                defaultValue={day?.closesAt ?? '22:00'}
                className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-1.5 text-sm text-ink-100"
              />
              <label className="flex items-center gap-2 text-sm text-ink-400">
                <input
                  name={`closed-${weekday.value}`}
                  type="checkbox"
                  defaultChecked={day?.isClosed}
                  className="size-4 rounded border-ink-600 bg-ink-950"
                />
                выходной
              </label>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-ink-600">
        Закрытие раньше открытия означает работу за полночь: 10:00 — 02:00.
      </p>

      <button type="submit" disabled={pending} className={`${primaryButton} mt-4`}>
        {pending ? 'Сохраняем…' : 'Сохранить часы'}
      </button>
    </form>
  );
}

export function MembersSection({
  placeId,
  members,
}: {
  placeId: string;
  members: PlaceMemberDto[];
}) {
  const [state, formAction, pending] = useActionState<PlaceActionState, FormData>(addMember, {});

  return (
    <div>
      <Notice state={state} />

      {members.length === 0 ? (
        <p className="mb-4 text-sm text-ink-500">
          Доступ пока ни у кого нет. Заведение не сможет само вести меню.
        </p>
      ) : (
        <ul className="mb-4 space-y-2">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-800 px-3 py-2"
            >
              <span className="text-sm text-ink-200">
                {member.name}
                <span className="ml-2 text-xs text-ink-500">{member.phone}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-brand-300">
                  {PLACE_MEMBER_ROLE_LABELS[member.role]}
                </span>
                <RemoveMemberButton placeId={placeId} userId={member.userId} />
              </span>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={placeId} />

        <div>
          <label htmlFor="phone" className="mb-1.5 block text-xs text-ink-400">
            Номер телефона
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="+7 928 000-00-00"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="role" className="mb-1.5 block text-xs text-ink-400">
            Уровень доступа
          </label>
          <select id="role" name="role" className={inputClass} defaultValue="manager">
            <option value="manager">Управляющий — всё, включая цены</option>
            <option value="staff">Сотрудник — стоп-лист и заказы</option>
          </select>
        </div>

        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? 'Выдаём…' : 'Выдать доступ'}
        </button>
      </form>

      <p className="mt-3 text-xs text-ink-600">
        Номер должен принадлежать аккаунту, который уже зарегистрирован в приложении.
      </p>
    </div>
  );
}

function RemoveMemberButton({ placeId, userId }: { placeId: string; userId: string }) {
  const [state, formAction, pending] = useActionState<PlaceActionState, FormData>(removeMember, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={placeId} />
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-400 transition hover:border-danger-500/50 hover:text-danger-400 disabled:opacity-60"
      >
        {pending ? '…' : 'Отозвать'}
      </button>
      {state.error && <p className="mt-1 text-xs text-danger-400">{state.error}</p>}
    </form>
  );
}

export function DeletePlaceButton({ placeId }: { placeId: string }) {
  const [state, formAction, pending] = useActionState<PlaceActionState, FormData>(deletePlace, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={placeId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-400 transition hover:border-danger-500/50 hover:text-danger-400 disabled:opacity-60"
      >
        {pending ? 'Убираем…' : 'Убрать заведение из каталога'}
      </button>
      {state.error && <p className="mt-2 text-xs text-danger-400">{state.error}</p>}
    </form>
  );
}
