import Link from 'next/link';
import {
  PLACE_TYPE_LABELS,
  type CityDto,
  type PaginatedResponse,
  type PlaceDto,
} from '@dagestan/shared';

import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { AddPlaceForm } from './place-forms';

type AdminPlace = PlaceDto & { isActive: boolean; cityName: string };

/** Копейки в базе — рубли на экране. */
function rubles(kopecks: number | null): string {
  if (kopecks === null) return '—';

  return `${(kopecks / 100).toLocaleString('ru-RU')} ₽`;
}

export default async function PlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ cityId?: string; search?: string; cursor?: string }>;
}) {
  const params = await searchParams;

  const query = new URLSearchParams({ limit: '30' });
  if (params.cityId) query.set('cityId', params.cityId);
  if (params.search) query.set('search', params.search);
  if (params.cursor) query.set('cursor', params.cursor);

  const [page, cities] = await Promise.all([
    apiFetch<PaginatedResponse<AdminPlace>>(`/places/admin/list?${query.toString()}`),
    apiFetch<CityDto[]>('/cities/all'),
  ]);

  return (
    <>
      <PageHeader
        title="Заведения"
        description="Заведение заводите здесь, а дальше его ведёт само заведение из приложения: меню, цены, стоп-лист и часы. Доступ выдаётся по номеру телефона на карточке заведения."
        action={<AddPlaceForm cities={cities} />}
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <a
          href="/places/categories"
          className="inline-block rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
        >
          Категории витрины →
        </a>
        <a
          href="/places/promo-banners"
          className="inline-block rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
        >
          Реклама →
        </a>
      </div>

      <form className="mb-5 flex flex-wrap gap-3">
        <input
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Название заведения"
          className="w-72 rounded-lg border border-ink-700 bg-ink-900 px-4 py-2 text-sm text-ink-100 placeholder:text-ink-600 focus:border-brand-500 focus:outline-none"
        />

        <select
          name="cityId"
          defaultValue={params.cityId ?? ''}
          className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-200 focus:border-brand-500 focus:outline-none"
        >
          <option value="">Все города</option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-brand-400"
        >
          Найти
        </button>
      </form>

      <Card>
        {page.items.length === 0 ? (
          <EmptyState
            title="Заведений пока нет"
            description="Добавьте первое — оно появится в приложении, как только вы его включите."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Заведение</Th>
                <Th>Город</Th>
                <Th>Вид</Th>
                <Th>Средний чек</Th>
                <Th>Заказы</Th>
                <Th>Статус</Th>
                <Th>Действия</Th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((place) => (
                <tr key={place.id}>
                  <Td>
                    <Link
                      href={`/places/${place.id}`}
                      className="font-medium text-ink-100 transition hover:text-brand-300"
                    >
                      {place.name}
                    </Link>
                    <div className="mt-0.5 text-xs text-ink-500">{place.address}</div>
                  </Td>
                  <Td className="text-ink-400">{place.cityName}</Td>
                  <Td className="text-ink-400">{PLACE_TYPE_LABELS[place.type]}</Td>
                  <Td className="whitespace-nowrap text-ink-400">{rubles(place.averageCheck)}</Td>
                  <Td>
                    <Badge tone={place.ordersEnabled ? 'success' : 'neutral'}>
                      {place.ordersEnabled ? 'принимает' : 'выключены'}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={place.isActive ? 'success' : 'neutral'}>
                      {place.isActive ? 'виден' : 'скрыт'}
                    </Badge>
                  </Td>
                  <Td>
                    <Link
                      href={`/places/${place.id}`}
                      className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
                    >
                      Открыть
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {page.hasMore && page.nextCursor && (
        <div className="mt-4 text-center">
          <a
            href={`/places?cursor=${page.nextCursor}${params.cityId ? `&cityId=${params.cityId}` : ''}`}
            className="inline-block rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
          >
            Показать ещё
          </a>
        </div>
      )}
    </>
  );
}
