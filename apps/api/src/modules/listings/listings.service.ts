import { Injectable } from '@nestjs/common';
import {
  catalogLayer,
  ErrorCode,
  LISTING_PRICE_UNIT_SUFFIX,
  ListingAddressVisibility,
  ListingSort,
  approximatePoint,
  defaultPriceUnit,
  describeAttributes,
  describeCardFacts,
  distanceKm,
  isPromoted,
  rentPeriodUnit,
  transactionCardLabel,
  type FavoriteListingAvailability,
  type FavoriteListingDto,
  type GeoPoint,
  type ListingDetailsDto,
  type ListingDto,
  type ListingListQuery,
  type ListingMapPointDto,
  type ListingMapQuery,
  type ListingPhoneDto,
  type ListingSuggestionDto,
  type ListingPriceUnit,
  type ListingRankContext,
  type ListingSellerDto,
  type SellerListingDto,
  type SellerListingsQuery,
  type SellerProfileDto,
  type MediaDto,
  type PaginatedResponse,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ModerationStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CitiesService } from '../cities/cities.service.js';
import { MediaService } from '../media/media.service.js';
import {
  ListingCategoriesService,
  type CategoryRecord,
  type ListingCatalogue,
} from './listing-categories.service.js';
import { LOCATION_SELECT, listingPlaceLabel, publicLocation } from './listing-location.js';
import {
  feedCountSql,
  feedIdsByDistanceSql,
  feedIdsSql,
  feedWhere,
  mapPointsSql,
  searchPoint,
  type FeedCursorRow,
} from './listing-query.js';
import {
  PART_LAYER_SELECT,
  partCardFacts,
  partDto,
  type StoredCompatibility,
  type StoredPartNumber,
} from './listing-parts.js';
import {
  LISTING_RANK_WINDOW,
  distanceCursor,
  feedCursor,
  pageFromRanked,
  parseDistanceCursor,
  parseFeedCursor,
  sortByScore,
} from './listing-ranking.js';

/** Что нужно карточке списка. Один набор полей на все выдачи ленты. */
export const LISTING_SELECT = {
  id: true,
  cityId: true,
  categoryId: true,
  title: true,
  transactionType: true,
  rentPeriod: true,
  price: true,
  priceMax: true,
  priceUnit: true,
  isNegotiable: true,
  pricePerSqm: true,
  coverMediaId: true,
  attributes: true,
  rooms: true,
  areaTotal: true,
  floor: true,
  floorsTotal: true,
  year: true,
  mileage: true,
  condition: true,
  bumpedAt: true,
  highlightedUntil: true,
  // Дальше — то, что нужно ранжированию и подписи «Махачкала · 3 км».
  // Тянем всегда, а не только для «Рекомендуемых»: это несколько чисел и
  // дат в строке, и отдельный набор полей на каждую сортировку стоил бы
  // дороже (два места, где можно забыть добавить поле), чем эта выборка
  ...LOCATION_SELECT,
  viewsCount: true,
  phoneViewsCount: true,
  promotedAt: true,
  promotedUntil: true,
  searchText: true,
  category: { select: { slug: true } },
  district: { select: { name: true } },
  city: { select: { name: true, latitude: true, longitude: true } },
  seller: { select: { isVerified: true, ratingAverage: true, ratingCount: true } },
  // Слой запчасти: совместимость и номер для строки под заголовком
  ...PART_LAYER_SELECT,
  _count: { select: { compatibility: true } },
} satisfies Prisma.ListingSelect;

export type ListingRow = Prisma.ListingGetPayload<{ select: typeof LISTING_SELECT }>;

/** Сколько точек отдаёт карта: больше на экране всё равно не разглядеть. */
const MAP_LIMIT = 500;

/**
 * Объявления: лента, карточка и избранное.
 *
 * Лента не кешируется: объявление снимают с публикации по жалобе, и показать
 * вчерашний кеш с мошенником — ровно то, чего вся постмодерация пытается
 * избежать.
 */
@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cities: CitiesService,
    private readonly media: MediaService,
    private readonly categories: ListingCategoriesService,
  ) {}

  // ── Лента ─────────────────────────────────────────────────────────────────

  async list(query: ListingListQuery, userId?: string): Promise<PaginatedResponse<ListingDto>> {
    await this.assertCityFilter(query);
    const catalogue = await this.categories.catalogue();

    // Неизвестная или выключенная категория — ошибка запроса, а не «покажем
    // всё»: молча снятый фильтр выдаёт человеку чужую категорию
    const category = query.category ? catalogue.requireBySlug(query.category) : null;
    const categoryIds = category ? catalogue.subtreeIds(category.id) : [];

    // «Рекомендуемые» — умолчание: лента без сортировки ранжируется, а не
    // просто идёт по дате
    const sort = query.sort ?? ListingSort.RECOMMENDED;
    const sorted = { ...query, sort };
    const where = feedWhere(sorted, {
      categoryIds,
      attributes: catalogue.attributesForSubtree(categoryIds),
      priceUnit: this.resolvePriceUnit(query, category, catalogue),
      userId,
    });

    const point = searchPoint(query);

    // Счёт делаем только на первой странице: «1 284 объявления» человек
    // читает один раз, а повторять подсчёт на каждой подгрузке — это лишний
    // тяжёлый запрос к базе на каждое пролистывание. Условие у счёта то же,
    // что у ленты, — с радиусом и всеми фильтрами, поэтому число честное
    const [page, total] = await Promise.all([
      this.page(sorted, where, sort, point),
      query.cursor ? Promise.resolve(undefined) : this.count(where),
    ]);

    const covers = await this.coverMap(page.items.map((row) => row.coverMediaId));
    const favorites = await this.favoriteIds(
      userId,
      page.items.map((row) => row.id),
    );

    return {
      items: page.items.map((row) =>
        this.toDto(
          row,
          covers.get(row.coverMediaId ?? '') ?? null,
          favorites.has(row.id),
          catalogue,
          point,
        ),
      ),
      nextCursor: page.nextCursor,
      hasMore: page.nextCursor !== null,
      ...(total === undefined ? {} : { total }),
    };
  }

  /**
   * Единица, в которой сравнивается цена в этом запросе. Явная — из запроса;
   * иначе — из категории и сделки: «Снять посуточно» сравнивает «в сутки».
   * Без категории остаётся «целиком»: это единственная шкала, общая для
   * большинства вещей.
   */
  private resolvePriceUnit(
    query: Pick<ListingListQuery, 'priceUnit' | 'transactionType' | 'rentPeriod'>,
    category: CategoryRecord | null,
    catalogue: ListingCatalogue,
  ): ListingPriceUnit {
    if (query.priceUnit) return query.priceUnit;
    if (!category) {
      // Без категории единицу задаёт сделка и срок: «Снять посуточно» сравнивает
      // «в сутки», а не «целиком» — иначе вся аренда выпала бы из выдачи по цене
      if (query.transactionType === 'rent' && query.rentPeriod) {
        return rentPeriodUnit(query.rentPeriod);
      }
      return 'total';
    }

    const transaction = query.transactionType ?? category.defaultTransaction;
    const period = query.rentPeriod ?? category.defaultRentPeriod;
    return defaultPriceUnit(catalogue.priceRules(category), transaction, period);
  }

  /**
   * Город справочника проверяется, только когда по нему и фильтруют: лента
   * с точкой или «Весь Дагестан» от города не зависит.
   */
  private async assertCityFilter(
    query: Pick<ListingListQuery, 'cityId' | 'latitude' | 'longitude' | 'regionWide' | 'radiusKm'>,
  ): Promise<void> {
    const byCircle = searchPoint(query) !== null && query.radiusKm !== undefined;
    if (query.cityId && !byCircle && !query.regionWide) {
      await this.cities.findById(query.cityId);
    }
  }

  /**
   * Страница по сортировке. «Ближе ко мне» без центра поиска невозможно —
   * тогда это обычная лента по дате, а не пустой экран с просьбой включить
   * определение места.
   */
  private page(
    query: ListingListQuery,
    where: Prisma.Sql,
    sort: ListingSort,
    point: GeoPoint | null,
  ): Promise<{ items: ListingRow[]; nextCursor: string | null }> {
    if (sort === ListingSort.DISTANCE && point) return this.distancePage(query, where, point);
    if (sort === ListingSort.DISTANCE) {
      return this.datePage({ ...query, sort: ListingSort.DATE }, where, query.cursor);
    }
    if (sort === ListingSort.RECOMMENDED) return this.rankedPage(query, where, point);
    return this.datePage(query, where, query.cursor);
  }

  /**
   * «Ближе ко мне»: порядок и страницы целиком в базе — по расстоянию от
   * центра поиска, курсором (расстояние, id). Пагинация честная на любой
   * глубине, а не только в первых четырёхстах объявлениях.
   */
  private async distancePage(
    query: ListingListQuery,
    where: Prisma.Sql,
    point: GeoPoint,
  ): Promise<{ items: ListingRow[]; nextCursor: string | null }> {
    const cursor = parseDistanceCursor(query.cursor) ?? undefined;
    const ids = await this.prisma.$queryRaw<{ id: string; distance: number }[]>(
      feedIdsByDistanceSql(where, point, query.limit + 1, cursor),
    );

    const hasMore = ids.length > query.limit;
    const pageIds = hasMore ? ids.slice(0, query.limit) : ids;
    const items = await this.rowsByIds(pageIds.map((row) => row.id));
    const last = pageIds[pageIds.length - 1];

    return {
      items,
      nextCursor: hasMore && last ? distanceCursor(Number(last.distance), last.id) : null,
    };
  }

  private async count(where: Prisma.Sql): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>(feedCountSql(where));
    return rows[0]?.count ?? 0;
  }

  /**
   * Строки по списку идентификаторов в том же порядке, в каком их отдал
   * SQL: findMany по IN порядок не гарантирует.
   */
  private async rowsByIds(ids: string[]): Promise<ListingRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.listing.findMany({
      where: { id: { in: ids } },
      select: LISTING_SELECT,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id)).filter((row): row is ListingRow => Boolean(row));
  }

  /** Обычная лента: порядок знает база, страницу отдаёт курсор по ключам сортировки. */
  private async datePage(
    query: ListingListQuery,
    where: Prisma.Sql,
    cursorId: string | undefined,
  ): Promise<{ items: ListingRow[]; nextCursor: string | null }> {
    let cursor: FeedCursorRow | undefined;
    if (cursorId) {
      const found = await this.prisma.listing.findUnique({
        where: { id: cursorId },
        select: { id: true, bumpedAt: true, price: true },
      });
      cursor = found ?? undefined;
    }

    const ids = await this.prisma.$queryRaw<{ id: string }[]>(
      feedIdsSql(where, query.sort, query.limit + 1, cursor),
    );
    const rows = await this.rowsByIds(ids.map((row) => row.id));

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const last = items[items.length - 1];

    return { items, nextCursor: hasMore && last ? last.id : null };
  }

  /**
   * «Рекомендуемые»: окно свежих объявлений, разложенное по оценке. Когда
   * окно кончается, лента продолжается по дате — почему именно так,
   * написано в listing-ranking.ts.
   */
  private async rankedPage(
    query: ListingListQuery,
    where: Prisma.Sql,
    point: GeoPoint | null,
  ): Promise<{ items: ListingRow[]; nextCursor: string | null }> {
    const cursor = parseFeedCursor(query.cursor);

    // Курсор уже за окном — дальше обычная лента по дате
    if (cursor?.phase === 'date') {
      const page = await this.datePage({ ...query, sort: ListingSort.DATE }, where, cursor.id);
      return {
        items: page.items,
        nextCursor: page.nextCursor ? feedCursor('date', page.nextCursor) : null,
      };
    }

    // На одну больше окна — чтобы знать, есть ли что-то за ним. Окно всегда
    // по дате: оценка считается уже в памяти
    const ids = await this.prisma.$queryRaw<{ id: string }[]>(
      feedIdsSql(where, ListingSort.DATE, LISTING_RANK_WINDOW + 1),
    );
    const window = await this.rowsByIds(ids.map((row) => row.id));

    const hasTail = window.length > LISTING_RANK_WINDOW;
    const rows = hasTail ? window.slice(0, LISTING_RANK_WINDOW) : window;

    // Момент расчёта один на все страницы: приложение присылает freshBefore,
    // и только поэтому окно от страницы к странице раскладывается одинаково
    const context: ListingRankContext = {
      now: query.freshBefore ?? new Date(),
      search: query.search,
      point,
    };

    const ordered = sortByScore(rows, context);

    const page = pageFromRanked(ordered, cursor?.id, query.limit);
    const last = page.items[page.items.length - 1];

    if (!page.exhausted && last) {
      return { items: page.items, nextCursor: feedCursor('ranked', last.id) };
    }

    // Окно пройдено. Дальше лента идёт по дате, и продолжать её нужно от
    // САМОГО СТАРОГО объявления окна, а не от последней показанной карточки:
    // по оценке она может оказаться где угодно внутри окна
    const tail = rows[rows.length - 1];

    return {
      items: page.items,
      nextCursor: hasTail && tail ? feedCursor('date', tail.id) : null,
    };
  }

  // ── Карта и подсказки ─────────────────────────────────────────────────────

  /**
   * Точки для карты результатов: те же условия, что у ленты, в видимой
   * области. Только объявления со своей точкой — рисовать «где-то в городе»
   * на карте нечестно.
   */
  async mapPoints(query: ListingMapQuery, userId?: string): Promise<ListingMapPointDto[]> {
    await this.assertCityFilter(query);
    const catalogue = await this.categories.catalogue();
    const category = query.category ? catalogue.requireBySlug(query.category) : null;
    const categoryIds = category ? catalogue.subtreeIds(category.id) : [];

    const where = feedWhere(
      { ...query, limit: MAP_LIMIT },
      {
        categoryIds,
        attributes: catalogue.attributesForSubtree(categoryIds),
        priceUnit: this.resolvePriceUnit(query, category, catalogue),
        userId,
      },
    );

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        latitude: number;
        longitude: number;
        addressVisibility: string;
        price: number | null;
        priceUnit: ListingPriceUnit;
        coverMediaId: string | null;
        title: string;
      }[]
    >(mapPointsSql(where, query.bbox, MAP_LIMIT));

    const covers = await this.coverMap(rows.map((row) => row.coverMediaId));

    return rows.map((row) => {
      // Скрытый адрес — и на карте результатов точка примерная
      const point =
        row.addressVisibility === ListingAddressVisibility.EXACT
          ? { latitude: row.latitude, longitude: row.longitude }
          : approximatePoint({ latitude: row.latitude, longitude: row.longitude });
      return {
        id: row.id,
        ...point,
        title: row.title,
        price: { value: row.price, unit: row.priceUnit },
        cover: covers.get(row.coverMediaId ?? '') ?? null,
      };
    });
  }

  /**
   * Подсказки к строке поиска: категории и марки — из справочника в памяти,
   * популярные заголовки — из базы по началу строки (триграммный индекс).
   */
  async suggest(cityId: string, q: string): Promise<ListingSuggestionDto[]> {
    const needle = q.trim().toLowerCase();
    if (needle.length === 0) return [];
    const catalogue = await this.categories.catalogue();
    const result: ListingSuggestionDto[] = [];

    for (const category of catalogue.categories) {
      if (!category.isActive || !category.parentId) continue;
      if (category.name.toLowerCase().includes(needle)) {
        result.push({
          type: 'category',
          label: catalogue.displayName(category),
          categorySlug: category.slug,
        });
      }
      if (result.length >= 3) break;
    }

    const brandKinds = ['car_brand', 'phone_brand', 'computer_brand', 'electronics_brand'];
    const seen = new Set<string>();
    for (const kind of brandKinds) {
      for (const entry of catalogue.dictionaryEntries(kind, '')) {
        if (seen.has(entry.value) || entry.value === 'other') continue;
        // «тойота» подсказывает Toyota: по написаниям из справочника
        if (
          entry.label.toLowerCase().startsWith(needle) ||
          entry.aliases.some((alias) => alias.startsWith(needle))
        ) {
          seen.add(entry.value);
          result.push({ type: 'brand', label: entry.label, value: entry.value });
        }
        if (seen.size >= 3) break;
      }
    }

    const titles = await this.prisma.$queryRaw<{ title: string }[]>(Prisma.sql`
      SELECT l."title" FROM "listings" l
      WHERE l."deleted_at" IS NULL AND l."status" = 'approved' AND l."city_id" = ${cityId}::uuid
        AND l."title" ILIKE ${`${needle}%`}
      GROUP BY l."title" ORDER BY count(*) DESC, l."title" ASC LIMIT 5`);
    for (const row of titles) {
      if (result.some((item) => item.label.toLowerCase() === row.title.toLowerCase())) continue;
      result.push({ type: 'query', label: row.title });
    }

    return result.slice(0, 8);
  }

  // ── Карточка ──────────────────────────────────────────────────────────────

  async findOne(id: string, userId?: string, point?: GeoPoint | null): Promise<ListingDetailsDto> {
    const listing = await this.prisma.listing.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: { select: { slug: true } },
        district: { select: { name: true } },
        city: { select: { name: true, latitude: true, longitude: true } },
        // Слой запчасти целиком — на странице объявления нужны все строки
        compatibility: { orderBy: { sortOrder: 'asc' } },
        partNumbers: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { compatibility: true } },
        seller: {
          select: {
            id: true,
            firstName: true,
            avatarId: true,
            createdAt: true,
            isVerified: true,
            ratingAverage: true,
            ratingCount: true,
          },
        },
      },
    });

    // Опубликованное — всем. Проданное и снятое автором — тоже всем, как
    // история продавца (без связи с ним). Снятое модератором, черновик и
    // проверка — только автору; остальным то же «не найдено», что и
    // несуществующее: по разнице ответов иначе перебирают чужие объявления
    const visible =
      listing &&
      (listing.status === ModerationStatus.approved ||
        listing.status === ModerationStatus.archived ||
        listing.sellerId === userId);

    if (!listing || !visible) {
      throw AppException.notFound('Объявление не найдено', ErrorCode.LISTING_NOT_FOUND);
    }

    const catalogue = await this.categories.catalogue();
    const [covers, photos, favorites, avatars] = await Promise.all([
      this.coverMap([listing.coverMediaId]),
      this.media.listForOwner('listing', listing.id),
      this.favoriteIds(userId, [listing.id]),
      listing.seller.avatarId ? this.media.findByIds([listing.seller.avatarId]) : [],
    ]);

    const base = this.toDto(
      listing,
      covers.get(listing.coverMediaId ?? '') ?? null,
      favorites.has(listing.id),
      catalogue,
      point,
    );
    const attributes = this.allAttributes(listing);

    return {
      ...base,
      description: listing.description,
      location: publicLocation(listing),
      photos,
      attributes,
      part: partDto(listing.category.slug, listing.compatibility, listing.partNumbers),
      attributeLabels: catalogue.labelsFor(catalogue.attributesOf(listing.categoryId), attributes),
      condition: listing.condition,
      seller: this.toSellerDto(listing.seller, avatars[0] ?? null),
      allowChat: listing.allowChat,
      allowCalls: listing.allowCalls,
      phoneMasked: listing.allowCalls ? maskPhone(listing.contactPhone) : null,
      publishedAt: listing.publishedAt?.toISOString() ?? null,
      availability: favoriteAvailability(listing),
      isMine: listing.sellerId === userId,
    };
  }

  // ── Продавец ──────────────────────────────────────────────────────────────

  /** Публичный профиль продавца: только то, что можно показывать всем. */
  async sellerProfile(sellerId: string): Promise<SellerProfileDto> {
    const seller = await this.publicSeller(sellerId);
    const [activeCount, completedCount, avatars] = await Promise.all([
      this.prisma.listing.count({
        where: { sellerId, deletedAt: null, status: ModerationStatus.approved },
      }),
      this.prisma.listing.count({
        where: { sellerId, deletedAt: null, status: ModerationStatus.archived },
      }),
      seller.avatarId ? this.media.findByIds([seller.avatarId]) : [],
    ]);
    const card = this.toSellerDto(seller, avatars[0] ?? null);

    return {
      id: card.id,
      name: card.name,
      avatar: card.avatar,
      memberSince: card.memberSince,
      isVerified: seller.isVerified,
      rating: card.rating.count > 0 ? card.rating : null,
      activeCount,
      completedCount,
    };
  }

  /**
   * Объявления продавца: «Активные» — опубликованные, свежие первыми;
   * «Завершённые» — проданные и снятые автором, недавно закрытые первыми.
   * Снятое модератором сюда не попадает — это не история продавца.
   */
  async sellerListings(
    sellerId: string,
    query: SellerListingsQuery,
    viewerId?: string,
  ): Promise<PaginatedResponse<SellerListingDto>> {
    await this.publicSeller(sellerId);
    const active = query.status === 'active';
    const rows = await this.prisma.listing.findMany({
      where: {
        sellerId,
        deletedAt: null,
        status: active ? ModerationStatus.approved : ModerationStatus.archived,
      },
      orderBy: active
        ? [{ bumpedAt: 'desc' }, { id: 'desc' }]
        : [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: { ...LISTING_SELECT, status: true, archiveReason: true, deletedAt: true },
    });

    const page = rows.slice(0, query.limit);
    const catalogue = await this.categories.catalogue();
    const [covers, favorites] = await Promise.all([
      this.coverMap(page.map((row) => row.coverMediaId)),
      this.favoriteIds(
        viewerId,
        page.map((row) => row.id),
      ),
    ]);

    return {
      items: page.map((row) => ({
        ...this.toDto(
          row,
          covers.get(row.coverMediaId ?? '') ?? null,
          favorites.has(row.id),
          catalogue,
        ),
        availability: favoriteAvailability(row),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      hasMore: rows.length > query.limit,
    };
  }

  /** Продавец, которого можно показывать: не удалён и не заблокирован. */
  private async publicSeller(sellerId: string) {
    const seller = await this.prisma.user.findFirst({
      where: { id: sellerId, deletedAt: null, status: 'active' },
      select: {
        id: true,
        firstName: true,
        avatarId: true,
        createdAt: true,
        isVerified: true,
        ratingAverage: true,
        ratingCount: true,
      },
    });
    if (!seller) throw AppException.notFound('Продавец не найден');
    return seller;
  }

  /**
   * Полный номер телефона — отдельным запросом, по нажатию «Показать номер».
   * В списке номер не отдаётся: иначе базу телефонов собирает первый же скрипт.
   */
  async revealPhone(listingId: string): Promise<ListingPhoneDto> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null, status: ModerationStatus.approved },
      select: { contactPhone: true, contactName: true, allowCalls: true },
    });

    if (!listing || !listing.allowCalls) {
      throw AppException.notFound('Объявление не найдено', ErrorCode.LISTING_NOT_FOUND);
    }

    await this.prisma.listing.update({
      where: { id: listingId },
      data: { phoneViewsCount: { increment: 1 } },
    });

    return { phone: listing.contactPhone, contactName: listing.contactName };
  }

  // ── Избранное ─────────────────────────────────────────────────────────────

  /**
   * Переключатель сердечка. Возвращает новое состояние. Добавить можно только
   * опубликованное: снятое или чужой черновик в избранном — это утечка того,
   * что не должно быть видно.
   */
  async toggleFavorite(userId: string, listingId: string): Promise<{ isFavorite: boolean }> {
    const existing = await this.prisma.favoriteListing.findUnique({
      where: { userId_listingId: { userId, listingId } },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.favoriteListing.delete({ where: { id: existing.id } });
      return { isFavorite: false };
    }

    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null, status: ModerationStatus.approved },
      select: { id: true },
    });

    if (!listing) {
      throw AppException.notFound('Объявление не найдено', ErrorCode.LISTING_NOT_FOUND);
    }

    await this.prisma.favoriteListing.create({ data: { userId, listingId } });
    return { isFavorite: true };
  }

  // ── Вспомогательное ───────────────────────────────────────────────────────

  /** Обложки одним запросом: иначе список из двадцати карточек даст двадцать. */
  private async coverMap(ids: (string | null)[]): Promise<Map<string, MediaDto>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const media = await this.media.findByIds(unique);
    return new Map(media.map((item) => [item.id, item]));
  }

  /**
   * Избранные объявления человека — свежие отметки первыми. В отличие от
   * ленты, здесь есть и проданное, и снятое: с пометкой, что с ним стало.
   * Курсор — момент отметки и её id.
   */
  async favoriteListings(
    userId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<PaginatedResponse<FavoriteListingDto>> {
    const cursor = parseFavoriteCursor(query.cursor);
    const favorites = await this.prisma.favoriteListing.findMany({
      where: {
        userId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        createdAt: true,
        listing: {
          select: { ...LISTING_SELECT, status: true, archiveReason: true, deletedAt: true },
        },
      },
    });

    const page = favorites.slice(0, query.limit);
    const last = page.at(-1);
    const catalogue = await this.categories.catalogue();
    const covers = await this.coverMap(page.map((item) => item.listing.coverMediaId));

    return {
      items: page.map(({ listing }) => ({
        ...this.toDto(listing, covers.get(listing.coverMediaId ?? '') ?? null, true, catalogue),
        availability: favoriteAvailability(listing),
      })),
      nextCursor:
        favorites.length > query.limit && last
          ? `${last.createdAt.toISOString()}|${last.id}`
          : null,
      hasMore: favorites.length > query.limit,
    };
  }

  private async favoriteIds(
    userId: string | undefined,
    listingIds: string[],
  ): Promise<Set<string>> {
    if (!userId || listingIds.length === 0) return new Set();
    const rows = await this.prisma.favoriteListing.findMany({
      where: { userId, listingId: { in: listingIds } },
      select: { listingId: true },
    });
    return new Set(rows.map((row) => row.listingId));
  }

  /**
   * Характеристики из колонок и из `attributes` вместе — так, как их видит
   * приложение. Внутри они хранятся раздельно по причинам производительности
   * (см. ADR-0008), но снаружи это одно поле.
   */
  allAttributes(row: {
    attributes: unknown;
    rooms: number | null;
    areaTotal: number | null;
    floor: number | null;
    floorsTotal: number | null;
    year: number | null;
    mileage: number | null;
    condition: string | null;
  }): Record<string, string | number | boolean | string[]> {
    const json = (row.attributes ?? {}) as Record<string, string | number | boolean | string[]>;
    const columns: Record<string, string | number | boolean | string[]> = {};

    if (row.rooms !== null) columns.rooms = row.rooms;
    if (row.areaTotal !== null) columns.areaTotal = row.areaTotal;
    if (row.floor !== null) columns.floor = row.floor;
    if (row.floorsTotal !== null) columns.floorsTotal = row.floorsTotal;
    if (row.year !== null) columns.year = row.year;
    if (row.mileage !== null) columns.mileage = row.mileage;
    if (row.condition !== null) columns.condition = row.condition;

    return { ...json, ...columns };
  }

  /**
   * Строка под заголовком карточки: сделка и ключевые характеристики —
   * «Сдам надолго · 2 комн. · 54 м² · 3/9 эт.».
   */
  summaryFor(
    row: Parameters<ListingsService['allAttributes']>[0] & {
      categoryId: string;
      transactionType: ListingRow['transactionType'];
      rentPeriod: ListingRow['rentPeriod'];
      compatibility?: readonly StoredCompatibility[];
      partNumbers?: readonly StoredPartNumber[];
      _count?: { compatibility?: number };
    },
    catalogue: ListingCatalogue,
  ): string {
    const attributes = catalogue.attributesOf(row.categoryId);
    const values = this.allAttributes(row);
    const labels = catalogue.labelsFor(attributes, values);
    const category = catalogue.findById(row.categoryId);
    // Приоритеты категории (CARD_FACTS): самое нужное для сравнения, а не все
    // заполненные поля. Нет приоритетов — прежний набор по флагу «в карточке»
    const summary =
      (category && describeCardFacts(category.slug, attributes, values, labels)) ??
      describeAttributes(attributes, values, labels);
    // Подпись сделки — только там, где сделок несколько: «Продам диван»
    // в категории, где иначе и не бывает, — шум
    const transaction =
      category && category.allowedTransactions.length > 1
        ? transactionCardLabel(row.transactionType, row.rentPeriod, category.slug)
        : null;

    // У запчасти: производитель, оригинальность и состояние (из характеристик),
    // затем номер и коротко — к чему подходит. Полная совместимость — на странице
    const layer =
      category && catalogLayer(category.slug)
        ? partCardFacts(row.compatibility ?? [], row.partNumbers ?? [], row._count?.compatibility)
        : null;

    return [transaction, summary, layer?.number, layer?.compatibility].filter(Boolean).join(' · ');
  }

  toDto(
    row: ListingRow,
    cover: MediaDto | null,
    isFavorite: boolean,
    catalogue: ListingCatalogue,
    point?: GeoPoint | null,
  ): ListingDto {
    return {
      id: row.id,
      cityId: row.cityId,
      categoryId: row.categoryId,
      categorySlug: row.category.slug,
      title: row.title,
      transactionType: row.transactionType,
      rentPeriod: row.rentPeriod,
      price: {
        value: row.price,
        max: row.priceMax,
        unit: row.priceUnit,
        isNegotiable: row.isNegotiable,
        perSqm: row.pricePerSqm,
      },
      cover,
      attributesSummary: this.summaryFor(row, catalogue),
      placeLabel: listingPlaceLabel(row),
      cityName: row.city.name,
      districtName: row.cityDistrict ?? row.district?.name ?? null,
      // В карточке расстояние показывается ТОЛЬКО от своей точки объявления.
      // В ранжировании центр города — разумное приближение, а в подписи
      // «0 км» от центра Махачкалы у квартиры на окраине — просто неправда
      distanceKm:
        point && row.latitude !== null && row.longitude !== null
          ? distanceKm(point, { latitude: row.latitude, longitude: row.longitude })
          : null,
      bumpedAt: row.bumpedAt.toISOString(),
      highlightedUntil: row.highlightedUntil?.toISOString() ?? null,
      promoted: isPromoted(row),
      isFavorite,
      viewsCount: row.viewsCount,
    };
  }

  toSellerDto(
    seller: {
      id: string;
      firstName: string | null;
      createdAt: Date;
      ratingAverage: number;
      ratingCount: number;
    },
    avatar: MediaDto | null,
  ): ListingSellerDto {
    return {
      id: seller.id,
      // Фамилию не показываем — как и в отзывах о заведениях
      name: seller.firstName ?? 'Продавец',
      avatar,
      memberSince: seller.createdAt.toISOString(),
      rating: {
        average: Math.round(seller.ratingAverage * 10) / 10,
        count: seller.ratingCount,
      },
    };
  }
}

/** Что стало с объявлением из избранного — одной меткой для приложения. */
export function favoriteAvailability(listing: {
  status: ModerationStatus;
  archiveReason: string | null;
  deletedAt: Date | null;
}): FavoriteListingAvailability {
  if (listing.deletedAt) return 'unavailable';
  if (listing.status === ModerationStatus.approved) return 'active';
  if (listing.status === ModerationStatus.archived) {
    return listing.archiveReason === 'sold' ? 'sold' : 'archived';
  }
  // Снято модератором, на проверке, черновик — покупателю одно и то же
  return 'unavailable';
}

function parseFavoriteCursor(raw: string | undefined): { createdAt: Date; id: string } | null {
  if (!raw) return null;
  const [date, id] = raw.split('|');
  const createdAt = new Date(date ?? '');
  if (!id || Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

/** «+79280001122» → «+7 928 ••• ••-22»: достаточно, чтобы узнать свой номер. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 11) return '•••';
  return `+${digits[0] ?? '7'} ${digits.slice(1, 4)} ••• ••-${digits.slice(9)}`;
}

/** Приписка к цене: «/мес», «/сут». У цены целиком приписки нет. */
export function priceSuffix(unit: keyof typeof LISTING_PRICE_UNIT_SUFFIX): string {
  return LISTING_PRICE_UNIT_SUFFIX[unit];
}
