'use client';

import { useActionState, useState } from 'react';
import type { PromoBannerAdminDto, PromoPlacement } from '@dagestan/shared';

import {
  createPromoBanner,
  deletePromoBanner,
  movePromoBanner,
  updatePromoBanner,
  type BannerActionState,
} from './actions';

const inputClass =
  'w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none transition focus:border-brand-500';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

export interface PlaceOption {
  id: string;
  name: string;
  cityName: string;
}

/** Список заведений отсортирован по городу — искать глазами проще, чем по алфавиту вперемешку. */
function PlaceSelect({
  places,
  defaultValue,
}: {
  places: PlaceOption[];
  defaultValue?: string | null;
}) {
  return (
    <Field
      label="Заведение"
      hint="Нажатие на баннер откроет его карточку. Не выбрано — баннер просто информационный"
    >
      <select name="targetPlaceId" defaultValue={defaultValue ?? ''} className={inputClass}>
        <option value="">— без заведения —</option>
        {places.map((place) => (
          <option key={place.id} value={place.id}>
            {place.cityName} · {place.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * Новый баннер.
 *
 * Форма свёрнута, пока не нажали «Добавить»: раскрытая форма на пустом
 * месте карусели выглядела бы тяжелее самих баннеров.
 */
export function CreatePromoBannerForm({
  placement,
  places,
}: {
  placement: PromoPlacement;
  places: PlaceOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<BannerActionState, FormData>(
    createPromoBanner,
    {},
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-brand-400"
      >
        Добавить баннер
      </button>
    );
  }

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="placement" value={placement} />

      <div className="md:col-span-2">
        <Field label="Заголовок">
          <input
            name="title"
            required
            maxLength={120}
            placeholder="Настоящий вкус Дагестана"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="md:col-span-2">
        <Field label="Подзаголовок" hint="Необязательно">
          <input
            name="subtitle"
            maxLength={200}
            placeholder="Хинкал, чуду и курзе — с доставкой домой"
            className={inputClass}
          />
        </Field>
      </div>

      <PlaceSelect places={places} />

      <Field label="Картинка" hint="Во весь баннер, горизонтальная. PNG, JPEG или WebP">
        <input
          type="file"
          name="image"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full text-sm text-ink-400 file:mr-3 file:rounded-md file:border-0 file:bg-ink-800 file:px-3 file:py-1.5 file:text-sm file:text-ink-200"
        />
      </Field>

      <div className="flex items-center gap-3 md:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-brand-400 disabled:opacity-60"
        >
          {pending ? 'Создаём…' : 'Создать'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-ink-400 transition hover:text-ink-200"
        >
          Отмена
        </button>
        {state.error && <p className="text-sm text-danger-400">{state.error}</p>}
        {state.success && <p className="text-sm text-brand-300">{state.success}</p>}
      </div>
    </form>
  );
}

export function EditPromoBannerForm({
  banner,
  places,
}: {
  banner: PromoBannerAdminDto;
  places: PlaceOption[];
}) {
  const [state, formAction, pending] = useActionState<BannerActionState, FormData>(
    updatePromoBanner,
    {},
  );

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="id" value={banner.id} />

      <Field label="Заголовок">
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={banner.title}
          className={inputClass}
        />
      </Field>

      <Field label="Подзаголовок">
        <input
          name="subtitle"
          maxLength={200}
          defaultValue={banner.subtitle ?? ''}
          className={inputClass}
        />
      </Field>

      <PlaceSelect places={places} defaultValue={banner.targetPlaceId} />

      <Field label="Заменить картинку" hint="Пустое поле — картинка останется прежней">
        <input
          type="file"
          name="image"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full text-sm text-ink-400 file:mr-3 file:rounded-md file:border-0 file:bg-ink-800 file:px-3 file:py-1.5 file:text-sm file:text-ink-200"
        />
      </Field>

      <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-300">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={banner.isActive}
          className="accent-brand-500"
        />
        Показывать в приложении
      </label>

      <div className="flex items-center gap-3 md:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-brand-400 disabled:opacity-60"
        >
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {state.error && <p className="text-sm text-danger-400">{state.error}</p>}
        {state.success && <p className="text-sm text-brand-300">{state.success}</p>}
      </div>
    </form>
  );
}

/** Стрелки порядка: порядок баннеров в приложении — это этот порядок. */
export function MovePromoBannerForm({
  id,
  placement,
  order,
  direction,
  disabled,
}: {
  id: string;
  placement: PromoPlacement;
  order: string[];
  direction: 'up' | 'down';
  disabled: boolean;
}) {
  const [, formAction, pending] = useActionState<BannerActionState, FormData>(movePromoBanner, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="placement" value={placement} />
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="order" value={order.join(',')} />
      <button
        type="submit"
        disabled={disabled || pending}
        aria-label={direction === 'up' ? 'Выше' : 'Ниже'}
        className="rounded-md border border-ink-700 px-2 py-0.5 text-xs text-ink-300 transition hover:border-brand-500 hover:text-brand-300 disabled:opacity-30"
      >
        {direction === 'up' ? '↑' : '↓'}
      </button>
    </form>
  );
}

export function DeletePromoBannerForm({ id, title }: { id: string; title: string }) {
  const [state, formAction, pending] = useActionState<BannerActionState, FormData>(
    deletePromoBanner,
    {},
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!confirm(`Удалить баннер «${title}»? Он исчезнет из карусели.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-ink-500 transition hover:text-danger-400 disabled:opacity-60"
      >
        Удалить
      </button>
      {state.error && <p className="mt-1 text-xs text-danger-400">{state.error}</p>}
    </form>
  );
}
