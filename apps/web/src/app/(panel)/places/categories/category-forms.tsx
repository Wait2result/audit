'use client';

import { useActionState, useState } from 'react';
import { PLACE_TYPE_LABELS, PlaceType, type PlaceCategoryAdminDto } from '@dagestan/shared';

import {
  createCategory,
  deleteCategory,
  moveCategory,
  updateCategory,
  type CategoryActionState,
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

/** Галочки видов заведений: категория может отбирать и по виду, а не только по кухне. */
function TypeChecks({ selected }: { selected?: readonly PlaceType[] }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs text-ink-400">Виды заведений</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {Object.values(PlaceType).map((type) => (
          <label key={type} className="flex items-center gap-1.5 text-sm text-ink-300">
            <input
              type="checkbox"
              name="types"
              value={type}
              defaultChecked={selected?.includes(type)}
              className="accent-brand-500"
            />
            {PLACE_TYPE_LABELS[type]}
          </label>
        ))}
      </div>
      <span className="mt-1 block text-xs text-ink-500">
        Заведение попадёт в категорию, если совпало слово кухни <em>или</em> вид заведения.
      </span>
    </fieldset>
  );
}

/**
 * Новая категория.
 *
 * Форма свёрнута, пока не нажали «Добавить»: восемь категорий уже есть,
 * и постоянно раскрытая форма на пустом месте занимала бы пол-экрана.
 */
export function CreateCategoryForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CategoryActionState, FormData>(
    createCategory,
    {},
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-brand-400"
      >
        Добавить категорию
      </button>
    );
  }

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <Field label="Название" hint="Видно в приложении под картинкой">
        <input
          name="name"
          required
          maxLength={60}
          placeholder="Пельменные"
          className={inputClass}
        />
      </Field>

      <Field label="Код" hint="Латиницей, в ссылках. Потом не меняется: dumplings, fast-food">
        <input
          name="slug"
          required
          maxLength={40}
          pattern="[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]"
          placeholder="dumplings"
          className={inputClass}
        />
      </Field>

      <div className="md:col-span-2">
        <Field
          label="Слова кухонь через запятую"
          hint="Ищется по вхождению: «дагестанск» поймает и «Дагестанская кухня», и «дагестанская»"
        >
          <input name="cuisines" placeholder="пельмени, манты, хинкали" className={inputClass} />
        </Field>
      </div>

      <div className="md:col-span-2">
        <TypeChecks />
      </div>

      <div className="md:col-span-2">
        <Field label="Картинка" hint="Квадратная, от 240×240. PNG, JPEG или WebP">
          <input
            type="file"
            name="image"
            accept="image/png,image/jpeg,image/webp"
            className="block w-full text-sm text-ink-400 file:mr-3 file:rounded-md file:border-0 file:bg-ink-800 file:px-3 file:py-1.5 file:text-sm file:text-ink-200"
          />
        </Field>
      </div>

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

/** Правка существующей категории. Код не меняется — на него ведут ссылки. */
export function EditCategoryForm({ category }: { category: PlaceCategoryAdminDto }) {
  const [state, formAction, pending] = useActionState<CategoryActionState, FormData>(
    updateCategory,
    {},
  );

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="id" value={category.id} />

      <Field label="Название">
        <input
          name="name"
          required
          maxLength={60}
          defaultValue={category.name}
          className={inputClass}
        />
      </Field>

      <Field label="Слова кухонь через запятую">
        <input name="cuisines" defaultValue={category.cuisines.join(', ')} className={inputClass} />
      </Field>

      <div className="md:col-span-2">
        <TypeChecks selected={category.types} />
      </div>

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
          defaultChecked={category.isActive}
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

/** Стрелки порядка: порядок плиток в приложении — это этот порядок. */
export function MoveCategoryForm({
  id,
  order,
  direction,
  disabled,
}: {
  id: string;
  order: string[];
  direction: 'up' | 'down';
  disabled: boolean;
}) {
  const [, formAction, pending] = useActionState<CategoryActionState, FormData>(moveCategory, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
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

export function DeleteCategoryForm({ id, name }: { id: string; name: string }) {
  const [state, formAction, pending] = useActionState<CategoryActionState, FormData>(
    deleteCategory,
    {},
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!confirm(`Удалить категорию «${name}»? Плитка исчезнет из приложения.`)) {
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
