'use client';

import { useActionState, useState } from 'react';
import {
  PROMO_RUBRICS,
  PROMO_SCREENS,
  type PromoActionType,
  type PromoBannerAdminDto,
  type PromoPlacement,
} from '@dagestan/shared';

import {
  createPromoBanner,
  deletePromoBanner,
  movePromoBanner,
  updatePromoBanner,
  type BannerActionState,
} from './actions';
import type { PlacementKind } from './placements';

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

const ACTION_LABELS: Record<PromoActionType, string> = {
  none: 'Ничего — карточка информационная',
  place: 'Заведение',
  rubric: 'Рубрика главной',
  screen: 'Экран приложения',
  url: 'Внешняя ссылка',
};

/**
 * Что открывает нажатие на карточку. Поле значения зависит от выбора:
 * заведение — списком (по городу: искать глазами проще), рубрика и экран —
 * из закрытых списков приложения, ссылка — только https.
 */
function ActionFields({ places, banner }: { places: PlaceOption[]; banner?: PromoBannerAdminDto }) {
  const [type, setType] = useState<PromoActionType>(banner?.actionType ?? 'none');
  const value = banner?.actionType === type ? (banner.actionValue ?? '') : '';

  return (
    <>
      <Field label="Нажатие открывает">
        <select
          name="actionType"
          value={type}
          onChange={(event) => setType(event.target.value as PromoActionType)}
          className={inputClass}
        >
          {(Object.keys(ACTION_LABELS) as PromoActionType[]).map((option) => (
            <option key={option} value={option}>
              {ACTION_LABELS[option]}
            </option>
          ))}
        </select>
      </Field>

      {type === 'place' && (
        <Field label="Заведение" hint="Откроется карточка заведения">
          <select name="actionValue" required defaultValue={value} className={inputClass}>
            <option value="">— выберите —</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.cityName} · {place.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {type === 'rubric' && (
        <Field label="Рубрика">
          <select name="actionValue" required defaultValue={value} className={inputClass}>
            {Object.entries(PROMO_RUBRICS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {type === 'screen' && (
        <Field label="Экран">
          <select name="actionValue" required defaultValue={value} className={inputClass}>
            {PROMO_SCREENS.map((screen) => (
              <option key={screen.value} value={screen.value}>
                {screen.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {type === 'url' && (
        <Field label="Ссылка" hint="Только https://. Откроется в браузере телефона">
          <input
            name="actionValue"
            type="url"
            required
            pattern="https://.*"
            defaultValue={value}
            placeholder="https://burgerhouse.ru"
            className={inputClass}
          />
        </Field>
      )}
    </>
  );
}

/**
 * Дата и время для поля формы — по Москве (Дагестан живёт по московскому
 * времени), а не по поясу сервера панели.
 */
function toMoscowInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const moscow = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
  return moscow.toISOString().slice(0, 16);
}

/** Срок показа: пустое поле — без ограничения с этой стороны. */
function ScheduleFields({ banner }: { banner?: PromoBannerAdminDto }) {
  return (
    <>
      <Field label="Показывать с" hint="По московскому времени. Пусто — сразу">
        <input
          type="datetime-local"
          name="startsAt"
          defaultValue={toMoscowInput(banner?.startsAt)}
          className={inputClass}
        />
      </Field>
      <Field label="Показывать до" hint="По московскому времени. Пусто — без срока">
        <input
          type="datetime-local"
          name="endsAt"
          defaultValue={toMoscowInput(banner?.endsAt)}
          className={inputClass}
        />
      </Field>
    </>
  );
}

/**
 * Новый баннер.
 *
 * Форма свёрнута, пока не нажали «Добавить»: раскрытая форма на пустом
 * месте карусели выглядела бы тяжелее самих баннеров.
 */
/**
 * Заголовок карточки. У карусели он виден в приложении; у плитки надпись
 * задаёт приложение, а заголовок — подпись для себя: что за фото и чьё.
 */
function TitleField({ kind, defaultValue }: { kind: PlacementKind; defaultValue?: string }) {
  return (
    <Field
      label={kind === 'tile' ? 'Подпись для панели' : 'Заголовок'}
      {...(kind === 'tile'
        ? { hint: 'Видна только здесь. Надпись на плитке задаёт приложение' }
        : {})}
    >
      <input
        name="title"
        required
        maxLength={120}
        defaultValue={defaultValue}
        placeholder={
          kind === 'tile' ? 'Суши «Токио» — реклама на октябрь' : 'Настоящий вкус Дагестана'
        }
        className={inputClass}
      />
    </Field>
  );
}

export function CreatePromoBannerForm({
  placement,
  places,
  kind,
  imageHint,
}: {
  placement: PromoPlacement;
  places: PlaceOption[];
  kind: PlacementKind;
  imageHint: string;
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
        {kind === 'tile' ? 'Добавить фото' : 'Добавить баннер'}
      </button>
    );
  }

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="placement" value={placement} />

      <div className="md:col-span-2">
        <TitleField kind={kind} />
      </div>

      {kind === 'carousel' && (
        <>
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

          <ActionFields places={places} />
        </>
      )}

      <ScheduleFields />

      <Field label="Картинка" hint={imageHint}>
        <input
          type="file"
          name="image"
          required={kind === 'tile'}
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
  kind,
  imageHint,
}: {
  banner: PromoBannerAdminDto;
  places: PlaceOption[];
  kind: PlacementKind;
  imageHint: string;
}) {
  const [state, formAction, pending] = useActionState<BannerActionState, FormData>(
    updatePromoBanner,
    {},
  );

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="id" value={banner.id} />

      <TitleField kind={kind} defaultValue={banner.title} />

      {kind === 'carousel' && (
        <>
          <Field label="Подзаголовок">
            <input
              name="subtitle"
              maxLength={200}
              defaultValue={banner.subtitle ?? ''}
              className={inputClass}
            />
          </Field>

          <ActionFields places={places} banner={banner} />
        </>
      )}

      <ScheduleFields banner={banner} />

      <Field
        label="Заменить картинку"
        hint={`Пустое поле — картинка останется прежней. ${imageHint}`}
      >
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
