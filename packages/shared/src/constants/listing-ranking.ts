/**
 * Ранжирование ленты объявлений (Этап 7).
 *
 * «Рекомендуемые» — не «по дате». Порядок складывается из пяти признаков:
 * насколько объявление отвечает запросу, насколько оно свежее, насколько
 * близко, насколько полно заполнено и насколько на него реагируют. Плюс
 * платное продвижение, которое НЕ видно глазом: ни рамки, ни ярлыка «ТОП»,
 * ни отдельного блока — только вес в этой формуле.
 *
 * Все коэффициенты собраны здесь одним объектом, а не рассыпаны по коду
 * выдачи: подкрутить «свежесть важнее близости» должно означать правку
 * одного числа и выпуск сервера, а не переписывание запроса и экранов.
 *
 * Функции чистые и лежат в shared, а не в модуле API, по двум причинам:
 * их нужно покрыть тестами без базы, и приложению они понадобятся, когда
 * появится предпросмотр «как моё объявление выглядит в выдаче».
 */

/** Веса слагаемых. Ноль отключает признак, не ломая остальные. */
export interface ListingRankingWeights {
  /** Свежесть: когда объявление подняли в последний раз */
  freshness: number;
  /** Близость к человеку */
  location: number;
  /** Полнота: фотография, цена, заполненные характеристики */
  quality: number;
  /** Отклик: просмотры и показы телефона */
  activity: number;
  /** Продавец: подтверждённый телефон и рейтинг по сделкам */
  seller: number;
}

/** Ступень затухания надбавки за продвижение. */
export interface ListingPromotionStep {
  /** До скольких часов с момента включения действует множитель */
  untilHours: number;
  multiplier: number;
}

export interface ListingRankingConfig {
  weights: ListingRankingWeights;
  /**
   * За сколько часов свежесть падает вдвое. 72 часа: объявление трёхдневной
   * давности стоит половины сегодняшнего, недельное — примерно шестую часть.
   */
  freshnessHalfLifeHours: number;
  /** До этого расстояния близость считается идеальной — «в моём районе» */
  locationNearKm: number;
  /** Дальше этого близость не даёт ничего: разница 60 и 80 км уже не важна */
  locationFarKm: number;
  /**
   * Потолок близости для объявлений без своей точки.
   *
   * Их расстояние считается от центра города, и без потолка объявление
   * вообще без координат получало бы за близость больше, чем настоящее
   * соседнее в трёх километрах. Отсутствие данных не должно вознаграждаться:
   * «тот же город» — это половина признака, а не весь.
   */
  locationCityCap: number;
  /**
   * Насколько «размыто» объявление без своей точки в сортировке «Ближе ко
   * мне». Его расстояние — до центра города, и без надбавки объявление,
   * про которое известно только «Махачкала», встало бы впереди соседнего
   * дома. Десять километров — примерный радиус города: «где-то здесь».
   */
  locationCityUncertaintyKm: number;
  /** Сколько просмотров считается полным откликом */
  activitySaturationViews: number;
  /** Показ телефона весомее просмотра: человек собрался звонить */
  activityPhoneWeight: number;
  /**
   * Ступени надбавки за продвижение. Первые часы сильнее: продвижение
   * покупают ради всплеска, а не ради вечного первого места.
   */
  promotionSteps: readonly ListingPromotionStep[];
  /**
   * Шаг между ступенями релевантности. Заведомо больше любого возможного
   * значения остальных слагаемых — и в этом весь смысл: подходящее запросу
   * объявление стоит выше неподходящего ВСЕГДА, сколько бы за него ни
   * заплатили. Продвижение переставляет карточки внутри своей ступени.
   */
  relevanceTierStep: number;
}

export const LISTING_RANKING: ListingRankingConfig = {
  weights: {
    freshness: 1,
    location: 1.2,
    quality: 0.6,
    activity: 0.4,
    seller: 0.3,
  },
  freshnessHalfLifeHours: 72,
  locationNearKm: 2,
  locationFarKm: 60,
  locationCityCap: 0.5,
  locationCityUncertaintyKm: 10,
  activitySaturationViews: 200,
  activityPhoneWeight: 5,
  promotionSteps: [
    { untilHours: 6, multiplier: 2 },
    { untilHours: 12, multiplier: 1.7 },
    { untilHours: 24, multiplier: 1.4 },
  ],
  relevanceTierStep: 100,
};

// ─────────────────────────────────────────────────────────────────────────────
//  Расстояние
// ─────────────────────────────────────────────────────────────────────────────

/** Точка на карте. */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Расстояние по прямой в километрах.
 *
 * Считаем сами, а не запросом к PostGIS: расстояние нужно и для сортировки
 * сотни строк, и для подписи «3 км» в карточке, и вызывать ради этого базу
 * на каждую карточку — лишняя работа. Дорог формула не знает: «3 км» в
 * карточке — это по прямой, как во всех досках объявлений.
 */
export function distanceKm(from: GeoPoint, to: GeoPoint): number {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Прямоугольник вокруг точки — для условия «в пределах N км» в запросе.
 *
 * База умеет быстро отобрать по диапазону координат, но не по окружности.
 * Поэтому сначала прямоугольник запросом (грубо, с запасом по углам), а
 * точное расстояние — уже по отобранным строкам.
 */
export function boundingBox(
  center: GeoPoint,
  radiusKm: number,
): { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number } {
  const latitudeDelta = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  // Меридианы сходятся к полюсам: на широте Дагестана градус долготы короче
  // градуса широты примерно на треть, и без этой поправки прямоугольник был
  // бы уже нужного с востока и запада
  const cosLatitude = Math.max(0.01, Math.cos(toRadians(center.latitude)));
  const longitudeDelta = latitudeDelta / cosLatitude;

  return {
    minLatitude: center.latitude - latitudeDelta,
    maxLatitude: center.latitude + latitudeDelta,
    minLongitude: center.longitude - longitudeDelta,
    maxLongitude: center.longitude + longitudeDelta,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Слагаемые
// ─────────────────────────────────────────────────────────────────────────────

/** Данные объявления, нужные для оценки. Все — из ленты, без лишних запросов. */
export interface ListingRankInput {
  title: string;
  /** Поисковый текст: марка, модель, значения перечислений — словами */
  searchText?: string;
  /** Момент последнего поднятия */
  bumpedAt: Date;
  /** Цена в копейках; пусто — цена не указана */
  price: number | null;
  hasPhoto: boolean;
  /** Сколько характеристик категории заполнено */
  attributesCount: number;
  hasAddress: boolean;
  viewsCount: number;
  phoneViewsCount: number;
  latitude: number | null;
  longitude: number | null;
  /** Координаты города объявления — запасной вариант, когда своих нет */
  cityPoint: GeoPoint | null;
  promotedAt: Date | null;
  promotedUntil: Date | null;
  /** Телефон продавца подтверждён */
  sellerVerified?: boolean;
  /** Рейтинг продавца 0–5 и число отзывов */
  sellerRating?: number;
  sellerRatingCount?: number;
}

/** Условия запроса, одинаковые для всей выдачи. */
export interface ListingRankContext {
  /**
   * Момент, на который считается выдача. Для всей страницы и всех следующих
   * страниц он ОДИН и тот же (приложение присылает freshBefore) — иначе
   * порядок менялся бы между подгрузками и карточки повторялись бы.
   */
  now: Date;
  /** Поисковый запрос, если он был */
  search?: string;
  /** Откуда смотрит человек */
  point?: GeoPoint | null;
}

/**
 * Ступень соответствия запросу: 2 — запрос целиком в заголовке, 1 — все
 * слова запроса в заголовке или в поисковом тексте (марка, модель, значения
 * перечислений), 0 — совпало только в описании.
 *
 * Ступени, а не плавная оценка, потому что разница между ними должна быть
 * непреодолимой: см. `relevanceTierStep`.
 */
export function relevanceTier(title: string, search?: string, searchText?: string): number {
  const query = search?.trim().toLowerCase() ?? '';
  if (query.length === 0) return 0;

  const haystack = title.toLowerCase();
  if (haystack.includes(query)) return 2;

  const words = query.split(/\s+/).filter((word) => word.length > 1);
  if (words.length === 0) return 0;
  if (words.every((word) => haystack.includes(word))) return 1;

  const extended = `${haystack} ${searchText?.toLowerCase() ?? ''}`;
  if (words.every((word) => extended.includes(word))) return 1;

  return 0;
}

/**
 * Продавец: подтверждённый телефон — половина признака, рейтинг по сделкам —
 * вторая. Без отзывов рейтинг не считается ни плохим, ни хорошим: середина.
 */
export function sellerScore(input: ListingRankInput): number {
  let score = input.sellerVerified ? 0.5 : 0;
  if (input.sellerRating !== undefined && (input.sellerRatingCount ?? 0) > 0) {
    score += 0.5 * Math.max(0, Math.min(1, input.sellerRating / 5));
  } else {
    score += 0.25;
  }
  return score;
}

/** Свежесть: 1 — только что подняли, дальше вдвое каждые `halfLife` часов. */
export function freshnessScore(
  input: ListingRankInput,
  context: ListingRankContext,
  config = LISTING_RANKING,
): number {
  const ageHours = (context.now.getTime() - input.bumpedAt.getTime()) / 3_600_000;
  if (ageHours <= 0) return 1;
  return 0.5 ** (ageHours / config.freshnessHalfLifeHours);
}

/**
 * Близость: 1 в пределах `locationNearKm`, дальше линейно до нуля на
 * `locationFarKm`. Не знаем, откуда смотрит человек, — признак молчит
 * (0 у всех), а не выдумывает расстояние.
 */
export function locationScore(
  input: ListingRankInput,
  context: ListingRankContext,
  config = LISTING_RANKING,
): number {
  const distance = listingDistanceKm(input, context.point);
  if (distance === null) return 0;

  const exact = input.latitude !== null && input.longitude !== null;
  // Без своей точки расстояние приблизительное — и признак урезан потолком
  const ceiling = exact ? 1 : config.locationCityCap;

  if (distance <= config.locationNearKm) return ceiling;
  if (distance >= config.locationFarKm) return 0;

  const fade =
    1 - (distance - config.locationNearKm) / (config.locationFarKm - config.locationNearKm);

  return Math.min(ceiling, fade);
}

/**
 * Расстояние до объявления. Своя точка точнее, центр города — грубее, но
 * лучше, чем ничего: объявление из Дербента не должно выглядеть соседним.
 */
export function listingDistanceKm(input: ListingRankInput, point?: GeoPoint | null): number | null {
  if (!point) return null;

  if (input.latitude !== null && input.longitude !== null) {
    return distanceKm(point, { latitude: input.latitude, longitude: input.longitude });
  }

  return input.cityPoint ? distanceKm(point, input.cityPoint) : null;
}

/**
 * Расстояние для сортировки «Ближе ко мне».
 *
 * Отличается от `listingDistanceKm` одним: объявление без своей точки
 * получает надбавку за неизвестность. Иначе сортировка врёт — наверх
 * попадают карточки, про которые вообще неизвестно, где они, и человек
 * видит первыми объявления без расстояния.
 */
export function sortingDistanceKm(
  input: ListingRankInput,
  point: GeoPoint,
  config = LISTING_RANKING,
): number | null {
  const distance = listingDistanceKm(input, point);
  if (distance === null) return null;

  const exact = input.latitude !== null && input.longitude !== null;

  return exact ? distance : distance + config.locationCityUncertaintyKm;
}

/**
 * Полнота: объявление с фотографией, ценой и заполненными характеристиками
 * полезнее пустого «продам, звоните». Это же тихо подталкивает продавцов
 * заполнять форму — без единого укоряющего сообщения на экране.
 */
export function qualityScore(input: ListingRankInput): number {
  let score = 0;
  if (input.hasPhoto) score += 0.45;
  if (input.price !== null) score += 0.2;
  if (input.hasAddress) score += 0.1;
  score += 0.25 * Math.min(1, input.attributesCount / 4);

  return Math.min(1, score);
}

/**
 * Отклик. Логарифм, а не доля: разница между 0 и 20 просмотрами говорит
 * больше, чем между 500 и 520, и без сжатия одно старое популярное
 * объявление занимало бы верх выдачи месяцами.
 */
export function activityScore(input: ListingRankInput, config = LISTING_RANKING): number {
  const weighted = input.viewsCount + input.phoneViewsCount * config.activityPhoneWeight;
  if (weighted <= 0) return 0;

  return Math.min(1, Math.log1p(weighted) / Math.log1p(config.activitySaturationViews));
}

/**
 * Множитель продвижения. Единица — объявление не продвигается или срок уже
 * вышел; дальше по ступеням от момента включения.
 *
 * Именно множитель, а не прибавка: прибавка вынесла бы наверх пустое
 * объявление без фотографии, если за него заплатили, а множитель усиливает
 * то, что и так чего-то стоит. Заплатить за место в выдаче можно —
 * заплатить за то, чтобы стать ответом на чужой запрос, нельзя.
 */
export function promotionMultiplier(
  input: Pick<ListingRankInput, 'promotedAt' | 'promotedUntil'>,
  now: Date,
  config = LISTING_RANKING,
): number {
  if (!input.promotedUntil || input.promotedUntil.getTime() <= now.getTime()) return 1;

  // Продвижение включили, а момента старта нет (старые записи или ручное
  // поднятие из панели) — считаем от начала: надбавка максимальная
  const startedAt = input.promotedAt ?? now;
  const hours = Math.max(0, (now.getTime() - startedAt.getTime()) / 3_600_000);

  for (const step of config.promotionSteps) {
    if (hours < step.untilHours) return step.multiplier;
  }

  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Итог
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Оценка объявления. Чем больше — тем выше в «Рекомендуемых».
 *
 * Ступень соответствия запросу стоит отдельным слагаемым с большим шагом,
 * всё остальное умножается на надбавку за продвижение. Из этого следует
 * главное свойство, ради которого всё и написано: оплаченное объявление
 * никогда не обгонит подходящее запросу, но может обогнать такое же
 * подходящее — см. `maxComponentScore`.
 */
export function scoreListing(
  input: ListingRankInput,
  context: ListingRankContext,
  config = LISTING_RANKING,
): number {
  const components =
    config.weights.freshness * freshnessScore(input, context, config) +
    config.weights.location * locationScore(input, context, config) +
    config.weights.quality * qualityScore(input) +
    config.weights.activity * activityScore(input, config) +
    config.weights.seller * sellerScore(input);

  const promoted = components * promotionMultiplier(input, context.now, config);

  return (
    relevanceTier(input.title, context.search, input.searchText) * config.relevanceTierStep +
    promoted
  );
}

/**
 * Наибольшее, что могут дать все слагаемые вместе с максимальной надбавкой.
 *
 * Нужно не для выдачи, а для проверки настройки: если это число догонит
 * `relevanceTierStep`, платное продвижение начнёт перебивать соответствие
 * запросу. Тест на это есть, и он должен падать при неудачной правке весов.
 */
export function maxComponentScore(config = LISTING_RANKING): number {
  const weights = config.weights;
  const sum =
    weights.freshness + weights.location + weights.quality + weights.activity + weights.seller;
  const maxMultiplier = config.promotionSteps.reduce(
    (max, step) => Math.max(max, step.multiplier),
    1,
  );

  return sum * maxMultiplier;
}
