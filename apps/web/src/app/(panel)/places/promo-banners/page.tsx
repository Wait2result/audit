import type {
  PaginatedResponse,
  PlaceDto,
  PromoBannerAdminDto,
  PromoPlacement,
} from '@dagestan/shared';

import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import {
  CreatePromoBannerForm,
  DeletePromoBannerForm,
  EditPromoBannerForm,
  MovePromoBannerForm,
  type PlaceOption,
} from './banner-forms';

const TABS: { value: PromoPlacement; label: string }[] = [
  { value: 'home', label: 'Главная' },
  { value: 'delivery', label: 'Доставка' },
];

/**
 * Промо-баннеры карусели — на главной странице и на витрине доставки.
 *
 * Раньше карточки были зашиты в код приложения: однотонная подложка вместо
 * фото и кнопка «Смотреть» без картинки. Теперь и картинку, и переход на
 * конкретное заведение задаёт владелец здесь.
 */
export default async function PromoBannersPage({
  searchParams,
}: {
  searchParams: Promise<{ placement?: string }>;
}) {
  const params = await searchParams;
  const placement: PromoPlacement = params.placement === 'delivery' ? 'delivery' : 'home';

  const [banners, placesPage] = await Promise.all([
    apiFetch<PromoBannerAdminDto[]>(`/places/admin/promo-banners?placement=${placement}`),
    apiFetch<PaginatedResponse<PlaceDto & { cityName: string }>>('/places/admin/list?limit=100'),
  ]);

  const places: PlaceOption[] = placesPage.items
    .map((place) => ({ id: place.id, name: place.name, cityName: place.cityName }))
    .sort((a, b) => a.cityName.localeCompare(b.cityName) || a.name.localeCompare(b.name));

  const order = banners.map((banner) => banner.id);

  return (
    <>
      <PageHeader
        title="Реклама"
        description="Карточки карусели на главной странице и на витрине доставки. Фотография и заведение, куда ведёт нажатие, — на ваше усмотрение; без картинки карточка выходит однотонной, без заведения — просто информационной."
      />

      <div className="mb-5">
        <a
          href="/places"
          className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:text-ink-100"
        >
          ← К заведениям
        </a>
      </div>

      <div className="mb-5 flex gap-2">
        {TABS.map((tab) => (
          <a
            key={tab.value}
            href={`/places/promo-banners?placement=${tab.value}`}
            className={
              tab.value === placement
                ? 'rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-ink-950'
                : 'rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:border-brand-500 hover:text-brand-300'
            }
          >
            {tab.label}
          </a>
        ))}
      </div>

      <Card className="mb-5">
        <CreatePromoBannerForm placement={placement} places={places} />
      </Card>

      {banners.length === 0 ? (
        <Card>
          <EmptyState
            title="Баннеров пока нет"
            description="Добавьте первый — он сразу появится в карусели."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {banners.map((banner, index) => (
            <Card key={banner.id}>
              <div className="mb-4 flex items-start gap-4">
                <Thumb banner={banner} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium text-ink-100">{banner.title}</h2>
                    {!banner.isActive && <Badge tone="neutral">Скрыт</Badge>}
                    <Badge tone={banner.targetPlaceName ? 'success' : 'warning'}>
                      {banner.targetPlaceName ? `→ ${banner.targetPlaceName}` : 'без заведения'}
                    </Badge>
                  </div>

                  {banner.subtitle && (
                    <p className="mt-1 text-xs text-ink-500">{banner.subtitle}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="flex gap-1">
                    <MovePromoBannerForm
                      id={banner.id}
                      placement={placement}
                      order={order}
                      direction="up"
                      disabled={index === 0}
                    />
                    <MovePromoBannerForm
                      id={banner.id}
                      placement={placement}
                      order={order}
                      direction="down"
                      disabled={index === banners.length - 1}
                    />
                  </div>
                  <DeletePromoBannerForm id={banner.id} title={banner.title} />
                </div>
              </div>

              <details className="border-t border-ink-800 pt-4">
                <summary className="cursor-pointer text-sm text-ink-400 transition hover:text-ink-200">
                  Изменить
                </summary>
                <div className="mt-4">
                  <EditPromoBannerForm banner={banner} places={places} />
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Thumb({ banner }: { banner: PromoBannerAdminDto }) {
  const src = mediaUrl(banner.image);

  if (!src) {
    return (
      <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-xs text-ink-500">
        нет фото
      </div>
    );
  }

  // Обычный img, а не next/image: адрес приходит из хранилища, и заводить
  // под него настройку разрешённых доменов ради нескольких баннеров незачем
  return (
    <img
      src={src}
      alt={banner.title}
      className="h-16 w-24 shrink-0 rounded-lg bg-ink-800 object-cover"
    />
  );
}
