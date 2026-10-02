import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  isOrderActive,
  type OrderDto,
  type PaginatedResponse,
} from '@dagestan/shared';

import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { OrderStatusForm } from './order-status-form';

const rubles = (kopecks: number): string => `${(kopecks / 100).toLocaleString('ru-RU')} ₽`;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ activeOnly?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const activeOnly = params.activeOnly === '1';

  const query = new URLSearchParams({ limit: '30' });
  if (activeOnly) query.set('activeOnly', 'true');
  if (params.cursor) query.set('cursor', params.cursor);

  const page = await apiFetch<PaginatedResponse<OrderDto>>(
    `/orders/admin/list?${query.toString()}`,
  );

  return (
    <>
      <PageHeader
        title="Заказы"
        description="Заказы ведёт само заведение в приложении. Здесь — общий список и запасной способ сменить статус, если заведение не отвечает."
      />

      <div className="mb-5 flex gap-2">
        <a
          href="/orders"
          className={`rounded-lg px-4 py-2 text-sm transition ${
            activeOnly
              ? 'border border-ink-700 text-ink-300 hover:text-ink-100'
              : 'bg-brand-500 font-medium text-ink-950'
          }`}
        >
          Все
        </a>
        <a
          href="/orders?activeOnly=1"
          className={`rounded-lg px-4 py-2 text-sm transition ${
            activeOnly
              ? 'bg-brand-500 font-medium text-ink-950'
              : 'border border-ink-700 text-ink-300 hover:text-ink-100'
          }`}
        >
          В работе
        </a>
      </div>

      <Card>
        {page.items.length === 0 ? (
          <EmptyState
            title="Заказов пока нет"
            description="Они появятся, когда заведения начнут принимать заказы через приложение."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Заказ</Th>
                <Th>Заведение</Th>
                <Th>Состав</Th>
                <Th>Сумма</Th>
                <Th>Статус</Th>
                <Th>Действия</Th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((order) => (
                <tr key={order.id}>
                  <Td>
                    <div className="font-medium text-ink-100">№{order.number}</div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      {formatDateTime(order.createdAt)}
                    </div>
                    <div className="text-xs text-ink-500">
                      {order.customerName}, {order.customerPhone}
                    </div>
                  </Td>
                  <Td className="text-ink-300">
                    {order.placeName}
                    <div className="mt-0.5 text-xs text-ink-500">
                      {FULFILLMENT_LABELS[order.fulfillment]}
                      {order.address ? ` · ${order.address}` : ''}
                    </div>
                  </Td>
                  <Td className="max-w-xs text-xs text-ink-400">
                    {order.items.map((item) => (
                      <div key={item.id}>
                        {item.name} × {item.quantity}
                      </div>
                    ))}
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums text-ink-300">
                    {rubles(order.total)}
                  </Td>
                  <Td>
                    <Badge tone={isOrderActive(order.status) ? 'warning' : 'neutral'}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                  </Td>
                  <Td>
                    <OrderStatusForm orderId={order.id} status={order.status} />
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
            href={`/orders?cursor=${page.nextCursor}${activeOnly ? '&activeOnly=1' : ''}`}
            className="inline-block rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300"
          >
            Показать ещё
          </a>
        </div>
      )}
    </>
  );
}
