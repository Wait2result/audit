import type {
  PaginatedResponse,
  PlaceDto,
  PromoBannerAdminDto,
  PromoPlacement,
} from '@dagestan/shared';

import { PROMO_RUBRICS, PROMO_SCREENS } from '@dagestan/shared';

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
import { PLACEMENTS, placementInfo } from './placements';

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
  const info = placementInfo(params.placement);
  const placement: PromoPlacement = info.value;

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
        title="Главная и реклама"
        description="Карусели на главной и на витрине доставки и фото плиток главной. Порядок карточек здесь — порядок в приложении."
      />

      <div className="mb-5">
        <a
          href="/places"
          className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:text-ink-100"
        >
          ← К заведениям
        </a>
      </div>

      {(['carousel', 'tile'] as const).map((kind) => (
        <div key={kind} className="mb-3 flex flex-wrap items-center gap-2">
          <span className="w-28 shrink-0 text-xs text-ink-500">
            {kind === 'carousel' ? 'Карусели' : 'Плитки главной'}
          </span>
          {PLACEMENTS.filter((tab) => tab.kind === kind).map((tab) => (
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
      ))}

      <Card className="mb-5 mt-5">
        <p className="text-sm text-ink-200">{info.description}</p>
        <p className="mt-2 text-xs text-ink-400">Картинка: {info.imageHint}</p>
        {info.kind === 'tile' && (
          <p className="mt-1 text-xs text-ink-500">
            На плитке — первая включённая карточка. Чтобы сменить фото, поднимите другую карточку
            выше или скройте текущую.
          </p>
        )}
      </Card>

      <Card className="mb-5">
        <CreatePromoBannerForm
          placement={placement}
          places={places}
          kind={info.kind}
          imageHint={info.imageHint}
        />
      </Card>

      {banners.length === 0 ? (
        <Card>
          <EmptyState
            title={info.kind === 'tile' ? 'Своего фото нет' : 'Баннеров пока нет'}
            description={info.emptyHint}
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
                    {info.kind === 'tile' ? (
                      banner.id === banners.find((item) => item.isActive)?.id && (
                        <Badge tone="success">Сейчас на плитке</Badge>
                      )
                    ) : (
                      <Badge tone={banner.actionType === 'none' ? 'warning' : 'success'}>
                        {actionLabel(banner)}
                      </Badge>
                    )}
                    {scheduleLabel(banner) && <Badge tone="neutral">{scheduleLabel(banner)}</Badge>}
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
                  <EditPromoBannerForm
                    banner={banner}
                    places={places}
                    kind={info.kind}
                    imageHint={info.imageHint}
                  />
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

/** Куда ведёт нажатие — коротко, для списка. */
function actionLabel(banner: PromoBannerAdminDto): string {
  switch (banner.actionType) {
    case 'place':
      return `→ ${banner.targetPlaceName ?? 'заведение'}`;
    case 'rubric':
      return `→ ${PROMO_RUBRICS[banner.actionValue as keyof typeof PROMO_RUBRICS] ?? banner.actionValue}`;
    case 'screen':
      return `→ ${PROMO_SCREENS.find((screen) => screen.value === banner.actionValue)?.label ?? banner.actionValue}`;
    case 'url':
      // Только адрес сайта: «burgerhouse.ru», без https:// и пути
      return `→ ${(banner.actionValue ?? '').slice('https://'.length).split('/')[0]}`;
    default:
      return 'без перехода';
  }
}

/** Срок показа: ещё не начался, уже закончился или идёт до даты. */
function scheduleLabel(banner: PromoBannerAdminDto): string | null {
  const now = Date.now();
  const date = (iso: string) =>
    new Date(iso).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  if (banner.startsAt && new Date(banner.startsAt).getTime() > now) {
    return `Запланирован с ${date(banner.startsAt)}`;
  }
  if (banner.endsAt && new Date(banner.endsAt).getTime() <= now) return 'Срок показа вышел';
  if (banner.endsAt) return `До ${date(banner.endsAt)}`;
  return null;
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
