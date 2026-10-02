import type { CityDto } from '@dagestan/shared';

import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { AddCityForm, ToggleCityButton } from './city-forms';

export default async function CitiesPage() {
  const cities = await apiFetch<CityDto[]>('/cities/all');

  return (
    <>
      <PageHeader
        title="Города"
        description="Добавление города — одна запись в базе. Все рубрики начинают работать в нём автоматически, без обновления приложения в сторах."
        action={<AddCityForm />}
      />

      <Card>
        {cities.length === 0 ? (
          <EmptyState title="Городов пока нет" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Название</Th>
                <Th>Идентификатор</Th>
                <Th>Координаты</Th>
                <Th>Часовой пояс</Th>
                <Th>Порядок</Th>
                <Th>Статус</Th>
                <Th>Действия</Th>
              </tr>
            </thead>
            <tbody>
              {cities.map((city) => (
                <tr key={city.id}>
                  <Td className="font-medium text-ink-100">{city.name}</Td>
                  <Td className="font-mono text-xs text-ink-400">{city.slug}</Td>
                  <Td className="font-mono text-xs text-ink-400">
                    {city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}
                  </Td>
                  <Td className="text-ink-400">{city.timezone}</Td>
                  <Td className="tabular-nums text-ink-400">{city.sortOrder}</Td>
                  <Td>
                    <Badge tone={city.isActive ? 'success' : 'neutral'}>
                      {city.isActive ? 'виден' : 'скрыт'}
                    </Badge>
                  </Td>
                  <Td>
                    <ToggleCityButton id={city.id} isActive={city.isActive} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
