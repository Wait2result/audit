import type {
  ListingArchiveReason,
  ListingCondition,
  ListingPriceUnit,
  ListingReportReason,
  ListingReportStatus,
} from '../constants/listings.js';
import type { ListingAttribute } from '../constants/listing-attributes.js';
import type { CategoryShortcut, ListingCardLayout } from '../constants/listing-categories.js';
import type { ModerationStatus } from '../constants/moderation.js';
import type { ListingAddressVisibility } from '../constants/geo.js';
import type { ListingRentPeriod, ListingTransactionType } from '../constants/transactions.js';
import type { MediaDto } from './api.js';
import type { ListingPartDto } from '../schemas/listing-part.schema.js';
import type { ListingLocationDto, MyListingLocationDto } from './geo.js';

/**
 * Объявления (Этап 7).
 *
 * Все суммы — целые копейки; форматирует тот, кто показывает. Телефон в
 * списке не отдаётся: он приходит отдельным запросом по нажатию «Показать
 * номер», иначе номера соберёт первый же скрипт.
 */

/** Узел дерева категорий. */
export interface ListingCategoryDto {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  /** «Квартира», «Автомобиль» — как назвать объект в заголовке формы */
  itemLabel: string | null;
  image: MediaDto | null;
  /** Единица цены, предлагаемая формой по умолчанию */
  defaultPriceUnit: ListingPriceUnit;
  /** Допустимые единицы цены. Какие из них подходят сделке — решает PriceConfig */
  priceUnits: ListingPriceUnit[];
  /** Какие сделки бывают в категории. Пусто — сделки нет (вещи, работа) */
  transactions: ListingTransactionType[];
  defaultTransaction: ListingTransactionType | null;
  defaultRentPeriod: ListingRentPeriod | null;
  cardLayout: ListingCardLayout;
  iconKey: string | null;
  /** Ярлык: категория-ссылка на другую с готовым фильтром */
  shortcut: CategoryShortcut | null;
  /** Категория снята; объявления переехали в указанную */
  deprecatedToSlug: string | null;
  /** Можно ли размещать объявление прямо здесь */
  isLeaf: boolean;
  /**
   * Поля категории. Приходят только по запросу `withAttributes`: по ним
   * приложение строит и форму подачи, и экран фильтров.
   */
  attributes?: readonly ListingAttribute[];
  children: ListingCategoryDto[];
}

/** Категория в панели: со скрытыми и со служебными полями. */
export interface ListingCategoryAdminDto extends Omit<ListingCategoryDto, 'children'> {
  attributeKeys: string[];
  sortOrder: number;
  isActive: boolean;
  /** Сколько опубликованных объявлений внутри — чтобы не удалить живую категорию */
  listingsCount: number;
  children: ListingCategoryAdminDto[];
}

/** Запись справочника: марка, модель, бренд. */
export interface ListingDictionaryEntryDto {
  value: string;
  label: string;
  /** Значение родителя (у модели — марка) */
  parent: string | null;
  /** Другие написания — по ним работает поиск в списке: «тойота» → Toyota */
  aliases: string[];
}

/** Цена одной строкой: значение, единица и признак «торг уместен». */
export interface ListingPriceDto {
  /** В копейках. Пусто — цена не указана */
  value: number | null;
  /** Верхняя граница вилки: «60 000 — 90 000» */
  max: number | null;
  unit: ListingPriceUnit;
  isNegotiable: boolean;
  /** Цена за квадратный метр, копейки — только у продажи недвижимости с площадью */
  perSqm: number | null;
}

/** Автор объявления — ровно столько, сколько видит покупатель. */
export interface ListingSellerDto {
  id: string;
  /** Имя без фамилии */
  name: string;
  avatar: MediaDto | null;
  /** С какого момента человек в приложении — «на сайте с марта 2026» */
  memberSince: string;
  rating: { average: number; count: number };
}

/** Карточка объявления в списке. */
export interface ListingDto {
  id: string;
  cityId: string;
  categoryId: string;
  categorySlug: string;
  title: string;
  /** Что делает продавец: продаёт, сдаёт, отдаёт. Пусто — у категории сделки нет */
  transactionType: ListingTransactionType | null;
  rentPeriod: ListingRentPeriod | null;
  price: ListingPriceDto;
  cover: MediaDto | null;
  /** Готовая строка характеристик: «2 комн. · 54,5 м² · 3/9 эт.» */
  attributesSummary: string;
  /**
   * Где находится, одной строкой: «Манаскент», «Махачкала, Советский район».
   * Для старых объявлений без адреса — город справочника.
   */
  placeLabel: string;
  /** Город справочника, к которому приписано объявление */
  cityName: string;
  districtName: string | null;
  /**
   * Сколько километров до человека. Пусто — он не разрешил геолокацию, и
   * тогда в карточке остаётся один город: выдуманное расстояние хуже, чем
   * его отсутствие.
   */
  distanceKm: number | null;
  /** Момент последнего поднятия — по нему отсортирована лента */
  bumpedAt: string;
  /** Подложка в списке действует до этого момента (платное выделение) */
  highlightedUntil: string | null;
  /**
   * Объявление сейчас продвигается: в карточке это видно меткой «Продвигается»
   * — покупатель знает, почему оно выше (аудит, п. 15)
   */
  promoted: boolean;
  /** В избранном у того, кто спрашивает. У гостя всегда false */
  isFavorite: boolean;
  /** Просмотры: разные люди, не открытия страницы (повторы за сутки не считаются) */
  viewsCount: number;
}

/** Объявление целиком. */
export interface ListingDetailsDto extends ListingDto {
  description: string;
  /** Место с учётом того, что продавец разрешил показать */
  location: ListingLocationDto;
  photos: MediaDto[];
  /** Значения характеристик: ключ поля набора → значение */
  attributes: Record<string, string | number | boolean | string[]>;
  /** Слой запчасти: номера и совместимость. Пусто у объявлений, которые не запчасти */
  part: ListingPartDto | null;
  /** Подписи значений из справочников: «toyota» → «Toyota» */
  attributeLabels: Record<string, string>;
  condition: ListingCondition | null;
  seller: ListingSellerDto;
  allowChat: boolean;
  allowCalls: boolean;
  /** «+7 928 ••• ••-45». Полный номер — отдельным запросом */
  phoneMasked: string | null;
  publishedAt: string | null;
  /** Продано или снято автором — страница остаётся как история, без связи */
  availability: ListingAvailability;
  /** Своё объявление — у автора видны действия кабинета */
  isMine: boolean;
}

/**
 * Что сейчас с объявлением из избранного. Избранное не теряет снятое:
 * человек должен увидеть «продано», а не молча потерять карточку.
 */
export type FavoriteListingAvailability = 'active' | 'sold' | 'archived' | 'unavailable';

/** Что сейчас с объявлением: в продаже, продано, снято автором, недоступно. */
export type ListingAvailability = FavoriteListingAvailability;

export interface FavoriteListingDto extends ListingDto {
  availability: FavoriteListingAvailability;
}

/**
 * Публичный профиль продавца. Только то, что можно показывать всем: имя,
 * аватар, дата регистрации, подтверждён ли телефон (без самого номера),
 * рейтинг и счёт объявлений. Телефона, почты, фамилии, адреса здесь нет.
 */
export interface SellerProfileDto {
  id: string;
  name: string;
  avatar: MediaDto | null;
  /** Когда зарегистрировался — «На площадке с сентября 2026» */
  memberSince: string;
  /** Телефон подтверждён кодом из SMS */
  isVerified: boolean;
  /** Пусто, пока оценок нет */
  rating: { average: number; count: number } | null;
  activeCount: number;
  /** Проданные и снятые автором — история продавца */
  completedCount: number;
}

/** Объявление в профиле продавца: с пометкой «продано/снято» у завершённых. */
export interface SellerListingDto extends ListingDto {
  availability: ListingAvailability;
}

/** Объявление глазами автора: видно и то, что скрыто от остальных. */
export interface MyListingDto extends ListingDto {
  status: ModerationStatus;
  /** Почему снято — текст от сотрудника платформы */
  statusReason: string | null;
  archiveReason: ListingArchiveReason | null;
  expiresAt: string | null;
  viewsCount: number;
  phoneViewsCount: number;
  favoritesCount: number;
  /** Можно ли поднять прямо сейчас */
  canBump: boolean;
  /** Через сколько часов поднятие станет возможным */
  hoursUntilBump: number;
}

/**
 * Своё объявление целиком — для экрана правки.
 *
 * Не то же самое, что `ListingDetailsDto`: там номер замаскирован и продавец
 * показан глазами покупателя, а здесь нужно ровно то, что можно менять —
 * настоящий телефон, полный адрес, координаты и сырые характеристики без
 * форматирования в строку.
 */
export interface MyListingDetailsDto extends MyListingDto {
  description: string;
  /** Точное место целиком. Пусто у старых объявлений, поданных без точки */
  location: MyListingLocationDto | null;
  addressVisibility: ListingAddressVisibility;
  photos: MediaDto[];
  attributes: Record<string, string | number | boolean | string[]>;
  part: ListingPartDto | null;
  condition: ListingCondition | null;
  contactPhone: string;
  contactName: string | null;
  allowChat: boolean;
  allowCalls: boolean;
}

/** Объявление в панели. */
export interface ListingAdminDto extends ListingDto {
  status: ModerationStatus;
  statusReason: string | null;
  categoryName: string;
  seller: ListingSellerDto;
  sellerPhone: string;
  reportsCount: number;
  viewsCount: number;
  createdAt: string;
  publishedAt: string | null;
  expiresAt: string | null;
  promotedUntil: string | null;
  highlightedUntil: string | null;
}

/** Жалоба в панели. */
export interface ListingReportDto {
  id: string;
  listingId: string;
  listingTitle: string;
  reason: ListingReportReason;
  comment: string | null;
  status: ListingReportStatus;
  resolution: string | null;
  reporterName: string;
  createdAt: string;
  /** Сколько всего жалоб на это объявление */
  listingReportsCount: number;
}

/** Ответ на «Показать номер». */
export interface ListingPhoneDto {
  phone: string;
  contactName: string | null;
}

/** Статистика объявления в кабинете автора. */
export interface ListingStatsDto {
  viewsCount: number;
  phoneViewsCount: number;
  favoritesCount: number;
}

/** Подсказка в строке поиска: категория, марка или популярный запрос. */
export interface ListingSuggestionDto {
  type: 'category' | 'brand' | 'query';
  label: string;
  /** У категории — её код: подсказка открывает категорию, а не ищет слово */
  categorySlug?: string;
  /** У марки — значение справочника */
  value?: string;
}

/** Точка на карте результатов: только объявления со своей точкой. */
export interface ListingMapPointDto {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  price: { value: number | null; unit: ListingPriceUnit };
  cover: MediaDto | null;
}
