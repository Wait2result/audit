import {
  PROMO_SCREENS,
  type HomeTileKey,
  type PromoActionType,
  type PromoBannerDto,
} from '@dagestan/shared';
import type { Href, useRouter } from 'expo-router';
import { Linking } from 'react-native';

import type { AdSlide } from '../components/AdCarousel';
import type { ThemeColors } from '../theme';

/**
 * Рекламные карточки: из баннера панели — в слайд карусели, из нажатия — в
 * переход. Одно место для главной и витрины доставки, чтобы новое действие не
 * пришлось добавлять в двух экранах.
 */

/** Куда ведут рубрики главной — те же переходы, что у плиток. */
export function rubricHref(key: HomeTileKey): Href {
  switch (key) {
    case 'listings':
      return '/listings';
    case 'order':
      return '/places';
    case 'cinema':
      return '/cinema';
    case 'news':
      return '/news';
    default:
      return `/coming-soon?title=${encodeURIComponent('Попутчики')}`;
  }
}

const RUBRIC_KEYS: readonly string[] = ['listings', 'order', 'cinema', 'news', 'rides'];

/**
 * Пока у карточки нет своей картинки (или она ещё грузится) — однотонная
 * подложка одного из фирменных цветов, по кругу: блок не скачет по высоте и не
 * остаётся белым пятном.
 */
export function promoSlides(banners: PromoBannerDto[] | undefined, colors: ThemeColors): AdSlide[] {
  const tints = [colors.ink, colors.primaryDark, colors.accent];

  return (banners ?? []).map((banner, index) => ({
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle ?? '',
    imageUrl: banner.image?.url ?? banner.image?.thumbnailUrl ?? null,
    tint: tints[index % tints.length]!,
    actionType: banner.actionType ?? (banner.targetPlaceId ? 'place' : 'none'),
    actionValue: banner.actionValue ?? banner.targetPlaceId,
    // Подборка владельца, а не сторонняя реклама — метки «Реклама» нет. Появится
    // настоящая рекламная система — здесь будет реальный признак
    isOwn: true,
  }));
}

/**
 * Выполнить действие карточки. Незнакомое или неполное действие (старый
 * сервер, экран, которого в этой версии нет) — ничего не делает, а не падает.
 */
export function openPromoAction(
  router: ReturnType<typeof useRouter>,
  slide: { actionType?: PromoActionType; actionValue?: string | null },
): void {
  const value = slide.actionValue ?? '';
  switch (slide.actionType) {
    case 'place':
      if (value) router.push({ pathname: '/places/[id]', params: { id: value } });
      return;
    case 'rubric':
      if (RUBRIC_KEYS.includes(value)) router.push(rubricHref(value as HomeTileKey));
      return;
    case 'screen': {
      // Путь — из закрытого списка: так переход типизирован, а чужой путь не откроется
      const screen = PROMO_SCREENS.find((item) => item.value === value);
      if (screen) router.push(screen.value);
      return;
    }
    case 'url':
      // Только https: ссылка из панели не должна открывать в телефоне что угодно
      if (value.startsWith('https://')) void Linking.openURL(value);
      return;
    default:
      return;
  }
}
