import Link from 'next/link';
import type { PlaceDetailsDto, PlaceMemberDto, PlaceMenuDto } from '@dagestan/shared';

import { Badge, Card, PageHeader } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import {
  DeletePlaceButton,
  MembersSection,
  PlaceSettingsForm,
  ScheduleForm,
} from './place-detail-forms';

const rubles = (kopecks: number): string => `${(kopecks / 100).toLocaleString('ru-RU')} ₽`;

export default async function PlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [place, members, menu] = await Promise.all([
    apiFetch<PlaceDetailsDto>(`/places/${id}`),
    apiFetch<PlaceMemberDto[]>(`/places/${id}/members`),
    apiFetch<PlaceMenuDto>(`/places/${id}/menu`),
  ]);

  const itemCount = menu.categories.reduce((sum, category) => sum + category.items.length, 0);

  return (
    <>
      <PageHeader
        title={place.name}
        description={`${place.address} · ${place.openState.label}`}
        action={
          <Link
            href="/places"
            className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
          >
            К списку
          </Link>
        }
      />

      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 font-medium text-ink-100">Кто ведёт заведение</h2>
          <MembersSection placeId={place.id} members={members} />
        </Card>

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium text-ink-100">Меню</h2>
            <Badge tone={itemCount > 0 ? 'success' : 'neutral'}>
              {itemCount > 0
                ? `${menu.categories.length} разделов, ${itemCount} позиций`
                : 'пока пусто'}
            </Badge>
          </div>

          {itemCount === 0 ? (
            <p className="text-sm text-ink-500">
              Меню заполняет само заведение из приложения — управляющий добавляет разделы, позиции,
              цены и фотографии. Выдайте доступ выше.
            </p>
          ) : (
            <ul className="space-y-3">
              {menu.categories.map((category) => (
                <li key={category.id}>
                  <p className="text-sm font-medium text-ink-200">{category.name}</p>
                  <ul className="mt-1 space-y-1">
                    {category.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-4 text-sm text-ink-400">
                        <span>
                          {item.name}
                          {!item.isAvailable && (
                            <span className="ml-2 text-xs text-accent-400">стоп-лист</span>
                          )}
                        </span>
                        <span className="whitespace-nowrap tabular-nums">{rubles(item.price)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 font-medium text-ink-100">Основное</h2>
          <PlaceSettingsForm place={place} />
        </Card>

        <Card>
          <h2 className="mb-4 font-medium text-ink-100">Часы работы</h2>
          <ScheduleForm place={place} />
        </Card>

        <Card>
          <h2 className="mb-2 font-medium text-ink-100">Опасная зона</h2>
          <p className="mb-4 text-sm text-ink-500">
            Заведение пропадёт из приложения. Данные и меню сохранятся.
          </p>
          <DeletePlaceButton placeId={place.id} />
        </Card>
      </div>
    </>
  );
}
