import type { PromoPlacement } from '@dagestan/shared';

/** Карусель — несколько карточек по очереди; плитка — одно фото, первое включённое. */
export type PlacementKind = 'carousel' | 'tile';

export interface PlacementInfo {
  value: PromoPlacement;
  label: string;
  kind: PlacementKind;
  description: string;
  /** Какую картинку загружать: размер и где оставить место под надпись */
  imageHint: string;
  emptyHint: string;
}

const HALF_TILE =
  '1536 × 1024 (3:2), PNG, JPEG или WebP. Левый верхний угол спокойный и темнее — там белый заголовок; главное — справа и ниже. Края плитка обрежет по месту.';

const CAROUSEL =
  '1600 × 400 (4:1), PNG, JPEG или WebP. Левая половина темнее — там заголовок и подзаголовок карточки.';

/**
 * Места показа карточек. Надпись на плитке задаёт приложение («Объявления —
 * Купить, продать, найти»), здесь — только фото; заголовок карточки плитки —
 * подпись для панели.
 */
export const PLACEMENTS: readonly PlacementInfo[] = [
  {
    value: 'home',
    label: 'Главная',
    kind: 'carousel',
    description:
      'Карусель на главной между погодой и рубриками. Карточки сменяют друг друга каждые 5 секунд; нажатие — на выбор: заведение, рубрика, экран приложения или ссылка. В приложении видны только включённые карточки в своём сроке показа.',
    imageHint: CAROUSEL,
    emptyHint: 'Нет карточек — карусели на главной не видно.',
  },
  {
    value: 'delivery',
    label: 'Доставка',
    kind: 'carousel',
    description: 'Карусель на витрине доставки «Заказать».',
    imageHint: CAROUSEL,
    emptyHint: 'Нет карточек — карусели на витрине не видно.',
  },
  {
    value: 'tile_listings',
    label: 'Объявления',
    kind: 'tile',
    description: 'Фото плитки «Объявления — Купить, продать, найти».',
    imageHint: HALF_TILE,
    emptyHint: 'Плитка показывает фото по умолчанию из приложения.',
  },
  {
    value: 'tile_order',
    label: 'Заказать',
    kind: 'tile',
    description:
      'Фото плитки «Заказать — Еда и доставка». Сюда можно поставить рекламу кафе или ресторана: нажатие на плитку всё равно открывает раздел доставки целиком.',
    imageHint: HALF_TILE,
    emptyHint: 'Плитка показывает фото по умолчанию из приложения.',
  },
  {
    value: 'tile_cinema',
    label: 'Сейчас в кино',
    kind: 'tile',
    description:
      'Фото плитки «Сейчас в кино». Без своего фото плитка показывает афишу фильма из сегодняшних сеансов города.',
    imageHint: HALF_TILE,
    emptyHint: 'Плитка показывает афишу из сегодняшних сеансов.',
  },
  {
    value: 'tile_news',
    label: 'Новости',
    kind: 'tile',
    description: 'Фото плитки «Новости — Что происходит».',
    imageHint: HALF_TILE,
    emptyHint: 'Плитка показывает фото по умолчанию из приложения.',
  },
  {
    value: 'tile_rides',
    label: 'Попутчики',
    kind: 'tile',
    description: 'Фото широкой плитки «Попутчики — Поездки между городами».',
    imageHint:
      '1600 × 400 (4:1) или 1536 × 1024 — тогда всё важное в средней горизонтальной полосе: верх и низ плитка обрежет.',
    emptyHint: 'Плитка показывает фото по умолчанию из приложения.',
  },
];

/** Место показа из адреса страницы; неизвестное — карусель главной. */
export function placementInfo(raw: string | undefined): PlacementInfo {
  return PLACEMENTS.find((item) => item.value === raw) ?? (PLACEMENTS[0] as PlacementInfo);
}
