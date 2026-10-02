import { LISTING_PRICE_UNIT_SUFFIX, type ListingPriceUnit } from '../constants/listings.js';

/**
 * Цена для метки на карте: «364 тыс», «2,5 млн», «45 тыс/мес». На карте
 * места мало, и полная сумма с пробелами закрыла бы соседние метки.
 * Деньги приходят копейками.
 */
export function formatPriceCompact(kopecks: number | null, unit: ListingPriceUnit): string {
  if (kopecks === null) return 'Дог.';

  const rubles = kopecks / 100;
  const suffix = LISTING_PRICE_UNIT_SUFFIX[unit];

  let body: string;
  if (rubles >= 1_000_000) {
    const millions = rubles / 1_000_000;
    // «2,5 млн», но не «2,0 млн»
    body = `${(Math.round(millions * 10) / 10).toString().replace('.', ',')} млн`;
  } else if (rubles >= 10_000) {
    body = `${Math.round(rubles / 1000)} тыс`;
  } else if (rubles >= 1000) {
    body = `${(Math.round(rubles / 100) / 10).toString().replace('.', ',')} тыс`;
  } else {
    body = `${Math.round(rubles)} ₽`;
  }

  return `${body}${suffix}`;
}
