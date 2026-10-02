import { Injectable } from '@nestjs/common';
import {
  EXACT_ADDRESS_SECTIONS,
  ErrorCode,
  LISTING_DAILY_LIMIT,
  LISTING_MAX_PHOTOS,
  ListingAddressVisibility,
  ModerationStatus,
  attributesSchemaFor,
  canAuthorTransition,
  canBump,
  classifyListingTitle,
  createListingSchema,
  defaultPriceUnit,
  expiresAtFor,
  hoursUntilBump,
  rentPeriodChoices,
  rentPeriodOfUnit,
  transactionCardLabel,
  validatePrice,
  type ArchiveListingDto,
  type CreateListingDto,
  type DraftListingDto,
  type GeoCoordinates,
  type GeoPlaceDto,
  type ListingAttribute,
  type ListingAttributeColumns,
  type ListingLocationInput,
  type ListingPriceUnit,
  type ListingRentPeriod,
  type ListingTransactionType,
  type MyListingDetailsDto,
  type MyListingDto,
  type MyListingsQuery,
  type PaginatedResponse,
  type UpdateMyListingDto,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ListingCondition } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CitiesService } from '../cities/cities.service.js';
import { GeocodingService } from '../geo/geocoding.service.js';
import { MediaService } from '../media/media.service.js';
import { prepareAttributes, type PreparedAttributes } from './listing-attribute-store.js';
import {
  ListingCategoriesService,
  type CategoryRecord,
  type ListingCatalogue,
} from './listing-categories.service.js';
import {
  LOCATION_SELECT,
  locationColumns,
  myLocation,
  phoneColumns,
  type LocationColumns,
} from './listing-location.js';
import { ListingsService } from './listings.service.js';

/**
 * Сколько ждать адрес по точке при сохранении. Обогащение — «по
 * возможности»: объявление с точкой сохраняется и без адреса, а держать
 * человека на кнопке «Опубликовать» из-за медленного геокодера нельзя.
 */
const ENRICH_TIMEOUT_MS = 4000;

/** Место объявления, готовое к записи. */
interface ResolvedPlace {
  columns: LocationColumns;
  /** Ближайший город справочника — к нему приписывается объявление */
  city: { id: string; name: string } | null;
  /** Район города из справочника, если геокодер назвал такой же */
  districtId: string | null;
}

/**
 * Подача объявления и кабинет автора (Этап 7, часть 2).
 *
 * Отдельно от витрины: там «показать всем опубликованное», здесь «изменить
 * своё». Разные правила доступа и разные последствия ошибки — смешивать их
 * в одном сервисе означает однажды отдать чужой черновик в ленту.
 *
 * Проверка перед публикацией не предусмотрена: объявление появляется сразу,
 * разбор — по жалобам. Поэтому ограничение частоты (сколько объявлений в
 * сутки) здесь — не формальность, а основная защита от заливки мусора.
 */
@Injectable()
export class ListingsLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cities: CitiesService,
    private readonly media: MediaService,
    private readonly categories: ListingCategoriesService,
    private readonly listings: ListingsService,
    private readonly geocoding: GeocodingService,
  ) {}

  // ── Доступ ────────────────────────────────────────────────────────────────

  /**
   * Своё объявление или отказ.
   *
   * Единственная точка проверки владельца: идентификатор, пришедший из
   * запроса, сам по себе ничего не разрешает. Чужое и несуществующее
   * отвечают ОДИНАКОВО — иначе по разнице ответов перебором выясняют, какие
   * объявления существуют.
   */
  private async own(listingId: string, userId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, sellerId: userId, deletedAt: null },
    });

    if (!listing) {
      throw AppException.notFound('Объявление не найдено', ErrorCode.LISTING_NOT_FOUND);
    }

    return listing;
  }

  // ── Подача ────────────────────────────────────────────────────────────────

  /**
   * Новое объявление — сразу опубликованное. Форма проверена полностью:
   * сделка, единица цены, обязательные характеристики.
   */
  async create(userId: string, dto: CreateListingDto): Promise<MyListingDto> {
    return this.insert(userId, dto, true);
  }

  /**
   * Черновик: форма заполняется в несколько шагов, и человек может выйти из
   * неё на середине. Обязательных полей нет — кроме города и категории.
   */
  async createDraft(userId: string, dto: DraftListingDto): Promise<MyListingDto> {
    return this.insert(userId, dto, false);
  }

  private async insert(
    userId: string,
    dto: CreateListingDto | DraftListingDto,
    publish: boolean,
  ): Promise<MyListingDto> {
    const catalogue = await this.categories.catalogue();
    const category = this.leafCategory(catalogue, dto.categoryId);

    if (dto.title) assertNotRequest(dto.title);
    if (publish) await this.assertDailyLimit(userId);

    // Место: точка, адрес и его части. Город справочника — ближайший к
    // точке, а не тот, что выбран в приложении: объявление из Каспийска,
    // поданное человеком с «Махачкалой» в настройках, — каспийское
    const place = dto.location ? await this.resolvePlace(dto.location) : null;
    const city = place?.city ?? (await this.cities.findById(dto.cityId));

    const deal = this.resolveDeal(category, catalogue, dto, publish);
    const prepared = this.prepare(catalogue, category, dto.attributes ?? {}, publish, deal);

    const price = dto.price ?? null;
    const now = new Date();

    const listing = await this.prisma.$transaction(async (tx) => {
      const created = await tx.listing.create({
        data: {
          sellerId: userId,
          cityId: city.id,
          districtId: place?.districtId ?? null,
          categoryId: dto.categoryId,
          title: dto.title ?? '',
          description: dto.description ?? '',
          transactionType: deal.transactionType,
          rentPeriod: deal.rentPeriod,
          price,
          priceMax: dto.priceMax ?? null,
          priceUnit: deal.priceUnit,
          isNegotiable: dto.isNegotiable ?? false,
          pricePerSqm: pricePerSqm(deal, price, prepared.columns.areaTotal),
          ...(place?.columns ?? {}),
          addressVisibility: dto.addressVisibility ?? this.defaultVisibility(catalogue, category),
          ...(dto.contactPhone ? phoneColumns(dto.contactPhone) : { contactPhone: '' }),
          contactName: dto.contactName ?? null,
          allowChat: dto.allowChat ?? true,
          allowCalls: dto.allowCalls ?? true,
          attributes: prepared.json,
          searchText: prepared.searchText,
          ...columnData(prepared.columns),
          status: publish ? ModerationStatus.APPROVED : ModerationStatus.DRAFT,
          publishedAt: publish ? now : null,
          expiresAt: publish ? expiresAtFor(now) : null,
          bumpedAt: now,
        },
      });

      if (prepared.values.length > 0) {
        await tx.listingAttributeValue.createMany({
          data: prepared.values.map((value) => ({ ...value, listingId: created.id })),
        });
      }

      return created;
    });

    await this.setPhotos(listing.id, userId, dto.photoIds ?? []);

    return this.toMyDto(listing.id, userId);
  }

  /**
   * Правка своего объявления. Город и категорию автор не меняет.
   *
   * Характеристики, сделка и цена проверяются заново по правилам категории:
   * иначе «сдам надолго» с ценой «целиком» можно было бы получить правкой,
   * хотя подача такого не пропускает. Опубликованное после правки остаётся
   * видимым, но попадает в очередь повторной проверки.
   */
  async update(listingId: string, userId: string, dto: UpdateMyListingDto): Promise<MyListingDto> {
    const listing = await this.own(listingId, userId);
    const catalogue = await this.categories.catalogue();
    const category = catalogue.requireById(listing.categoryId);
    const isDraft = listing.status === ModerationStatus.DRAFT;

    const data: Prisma.ListingUpdateInput = {};

    if (dto.title !== undefined) {
      assertNotRequest(dto.title);
      data.title = dto.title;
    }
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priceMax !== undefined) data.priceMax = dto.priceMax ?? null;
    if (dto.isNegotiable !== undefined) data.isNegotiable = dto.isNegotiable;
    if (dto.contactPhone) Object.assign(data, phoneColumns(dto.contactPhone));
    if (dto.contactName !== undefined) data.contactName = dto.contactName ?? null;
    if (dto.allowChat !== undefined) data.allowChat = dto.allowChat;
    if (dto.allowCalls !== undefined) data.allowCalls = dto.allowCalls;
    if (dto.addressVisibility !== undefined) data.addressVisibility = dto.addressVisibility;

    // Новое место меняет и город справочника, и район: оба — следствие
    // точки, а не выбор автора
    if (dto.location) {
      const place = await this.resolvePlace(dto.location);
      Object.assign(data, place.columns);
      if (place.city) data.city = { connect: { id: place.city.id } };
      data.district = place.districtId
        ? { connect: { id: place.districtId } }
        : { disconnect: true };
    }

    // Сделка и цена проверяются по итоговому состоянию: то, что прислали,
    // поверх того, что было
    const deal = this.resolveDeal(
      category,
      catalogue,
      {
        transactionType:
          dto.transactionType !== undefined ? dto.transactionType : listing.transactionType,
        rentPeriod: dto.rentPeriod !== undefined ? dto.rentPeriod : listing.rentPeriod,
        priceUnit:
          dto.priceUnit ?? (dto.transactionType !== undefined ? undefined : listing.priceUnit),
        price: dto.price !== undefined ? dto.price : listing.price,
      },
      !isDraft,
    );
    data.transactionType = deal.transactionType;
    data.rentPeriod = deal.rentPeriod;
    data.priceUnit = deal.priceUnit;
    const price = dto.price !== undefined ? (dto.price ?? null) : listing.price;
    data.price = price;

    let areaTotal: number | null | undefined = listing.areaTotal;

    if (dto.attributes !== undefined) {
      const prepared = this.prepare(catalogue, category, dto.attributes, !isDraft, deal);

      Object.assign(data, columnData(prepared.columns));
      data.attributes = prepared.json;
      data.searchText = prepared.searchText;
      data.attributeValues = {
        deleteMany: {},
        createMany: { data: prepared.values },
      };
      areaTotal = prepared.columns.areaTotal as number | null | undefined;
    }

    data.pricePerSqm = pricePerSqm(deal, price, areaTotal);

    if (listing.status === ModerationStatus.APPROVED) data.needsReview = true;

    await this.prisma.listing.update({ where: { id: listingId }, data });

    if (dto.photoIds !== undefined) {
      await this.setPhotos(listingId, userId, dto.photoIds);
    }

    return this.toMyDto(listingId, userId);
  }

  /**
   * Состав и порядок фотографий. Первая становится обложкой — это и есть
   * «сделать главной»: отдельного действия не нужно, достаточно перестановки.
   */
  async setPhotos(listingId: string, userId: string, photoIds: string[]): Promise<void> {
    if (photoIds.length > LISTING_MAX_PHOTOS) {
      throw AppException.badRequest(
        `Не больше ${LISTING_MAX_PHOTOS} фотографий`,
        ErrorCode.VALIDATION_FAILED,
      );
    }

    await this.media.setOrder({
      mediaIds: photoIds,
      ownerType: 'listing',
      ownerId: listingId,
      userId,
    });

    await this.prisma.listing.update({
      where: { id: listingId },
      data: { coverMediaId: photoIds[0] ?? null },
    });
  }

  // ── Жизненный цикл ────────────────────────────────────────────────────────

  /**
   * Публикация черновика и возврат из архива — одно и то же действие.
   * Черновик перед публикацией проходит полную проверку: заголовок,
   * описание, телефон, обязательные характеристики, сделка и цена.
   */
  async publish(listingId: string, userId: string): Promise<MyListingDto> {
    const listing = await this.own(listingId, userId);

    if (!canAuthorTransition(listing.status, ModerationStatus.APPROVED)) {
      // Снятое модератором автор не возвращает сам: иначе снятие не значит
      // ничего, и разбор жалобы превращается в переписку
      throw AppException.badRequest(
        listing.status === ModerationStatus.SUSPENDED
          ? 'Объявление снято сотрудником. Исправьте его и отправьте на проверку'
          : 'Объявление уже опубликовано',
        ErrorCode.LISTING_INVALID_TRANSITION,
      );
    }

    await this.assertComplete(listing);
    // Черновик публикуется только с точкой: иначе он не найдётся поиском по
    // радиусу. Старые объявления из архива возвращаются как были — у них
    // точки могло не быть изначально, и в круг они попадают по городу
    if (
      listing.status === ModerationStatus.DRAFT &&
      (listing.latitude === null || listing.longitude === null)
    ) {
      throw AppException.badRequest(
        'Укажите, где находится объявление: выберите адрес или поставьте точку на карте',
        ErrorCode.VALIDATION_FAILED,
      );
    }
    await this.assertDailyLimit(userId);

    const now = new Date();
    await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        status: ModerationStatus.APPROVED,
        publishedAt: listing.publishedAt ?? now,
        // Срок считается заново: продление — это ещё тридцать дней, а не
        // остаток от прошлого размещения
        expiresAt: expiresAtFor(now),
        archiveReason: null,
        statusReason: null,
        bumpedAt: now,
      },
    });

    return this.toMyDto(listingId, userId);
  }

  /**
   * «Исправить и отправить повторно»: снятое сотрудником уходит на проверку,
   * а не сразу в ленту. Автор видит причину снятия и правит объявление; в
   * ленту его возвращает модератор.
   */
  async resubmit(listingId: string, userId: string): Promise<MyListingDto> {
    const listing = await this.own(listingId, userId);

    if (!canAuthorTransition(listing.status, ModerationStatus.PENDING)) {
      throw AppException.badRequest(
        'На проверку отправляется только снятое объявление',
        ErrorCode.LISTING_INVALID_TRANSITION,
      );
    }

    await this.assertComplete(listing);

    await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        status: ModerationStatus.PENDING,
        resubmittedAt: new Date(),
        statusChangedAt: new Date(),
        needsReview: false,
      },
    });

    return this.toMyDto(listingId, userId);
  }

  /**
   * Поднять объявление наверх ленты. Раз в сутки: без ограничения тот, кто
   * нажимает чаще, вытеснил бы всех остальных, и лента перестала бы быть
   * лентой.
   */
  async bump(listingId: string, userId: string): Promise<MyListingDto> {
    const listing = await this.own(listingId, userId);
    const now = new Date();

    if (listing.status !== ModerationStatus.APPROVED) {
      throw AppException.badRequest(
        'Поднять можно только опубликованное объявление',
        ErrorCode.LISTING_INVALID_TRANSITION,
      );
    }

    if (!canBump(listing.bumpedAt, now)) {
      const hours = hoursUntilBump(listing.bumpedAt, now);
      throw AppException.badRequest(
        `Поднять можно будет через ${hours} ч`,
        ErrorCode.LISTING_BUMP_TOO_SOON,
      );
    }

    await this.prisma.listing.update({ where: { id: listingId }, data: { bumpedAt: now } });

    return this.toMyDto(listingId, userId);
  }

  /** «Продано» или «снято» — объявление уходит в архив, но не стирается. */
  async archive(listingId: string, userId: string, dto: ArchiveListingDto): Promise<MyListingDto> {
    const listing = await this.own(listingId, userId);

    if (!canAuthorTransition(listing.status, ModerationStatus.ARCHIVED)) {
      throw AppException.badRequest(
        'Объявление уже не опубликовано',
        ErrorCode.LISTING_INVALID_TRANSITION,
      );
    }

    await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        status: ModerationStatus.ARCHIVED,
        archiveReason: dto.reason,
        statusChangedAt: new Date(),
      },
    });

    return this.toMyDto(listingId, userId);
  }

  /**
   * Удаление своего объявления. Мягкое: спор «вы стёрли моё объявление»
   * нечем закрыть, если строки действительно нет.
   */
  async remove(listingId: string, userId: string): Promise<void> {
    await this.own(listingId, userId);

    await this.prisma.listing.update({
      where: { id: listingId },
      data: { deletedAt: new Date() },
    });
  }

  // ── Кабинет ───────────────────────────────────────────────────────────────

  /** Свои объявления: видно всё, включая черновики, снятое и архив. */
  async myListings(
    userId: string,
    query: MyListingsQuery,
  ): Promise<PaginatedResponse<MyListingDto>> {
    const where: Prisma.ListingWhereInput = {
      sellerId: userId,
      deletedAt: null,
      ...(query.group === 'review'
        ? {
            status: {
              in: [ModerationStatus.PENDING, ModerationStatus.SUSPENDED, ModerationStatus.REJECTED],
            },
          }
        : query.status
          ? { status: query.status }
          : {}),
    };

    const catalogue = await this.categories.catalogue();
    // Счёт — один раз, с первой страницей: «Мои объявления · 4» на главном экране
    const [rows, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        orderBy: [{ bumpedAt: 'desc' }, { id: 'asc' }],
        select: MY_LISTING_SELECT,
      }),
      query.cursor ? Promise.resolve(undefined) : this.prisma.listing.count({ where }),
    ]);

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const covers = await this.media.findByIds(
      items.map((row) => row.coverMediaId).filter((id): id is string => Boolean(id)),
    );
    const coverMap = new Map(covers.map((cover) => [cover.id, cover]));

    return {
      items: items.map((row) =>
        this.myDto(row, coverMap.get(row.coverMediaId ?? '') ?? null, catalogue),
      ),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
      ...(total === undefined ? {} : { total }),
    };
  }

  /**
   * Своё объявление целиком — для экрана правки. В отличие от публичной
   * карточки, здесь настоящий телефон и полные характеристики: это не то,
   * что видит покупатель, а то, что можно менять.
   */
  async findOne(listingId: string, userId: string): Promise<MyListingDetailsDto> {
    // own() и так проверяет владельца — не дублируем ту же проверку в myRow
    const listing = await this.own(listingId, userId);
    const row = await this.myRow(listingId, userId);
    const catalogue = await this.categories.catalogue();

    const photos = await this.media.listForOwner('listing', listing.id);
    const cover = row.coverMediaId ? await this.media.findByIds([row.coverMediaId]) : [];

    return {
      ...this.myDto(row, cover[0] ?? null, catalogue),
      description: listing.description,
      location: myLocation(listing),
      addressVisibility: listing.addressVisibility,
      photos,
      attributes: this.listings.allAttributes(row),
      condition: listing.condition,
      contactPhone: listing.contactPhone,
      contactName: listing.contactName,
      allowChat: listing.allowChat,
      allowCalls: listing.allowCalls,
    };
  }

  // ── Проверки ──────────────────────────────────────────────────────────────

  /** Подкатегория, в которой можно размещать. */
  private leafCategory(catalogue: ListingCatalogue, categoryId: string): CategoryRecord {
    const category = catalogue.requireById(categoryId);

    // Размещают в подкатегории, а не в разделе: «Транспорт» без уточнения
    // не даёт ни полей формы, ни осмысленного места в выдаче
    if (!category.isLeaf || category.shortcut) {
      throw AppException.badRequest('Выберите подкатегорию', ErrorCode.LISTING_CATEGORY_NOT_LEAF);
    }
    if (!category.isActive || category.deprecatedToId) {
      throw AppException.badRequest(
        'В этой категории больше нельзя размещать объявления',
        ErrorCode.LISTING_CATEGORY_NOT_FOUND,
      );
    }

    return category;
  }

  /**
   * Сделка и единица цены по правилам категории.
   *
   * Категория без сделок (диван, вакансия) — сделки нет. С одной сделкой
   * («продам» у вещей) — она подставляется сама. С несколькими — при
   * публикации выбор обязателен, у черновика допустимо умолчание.
   */
  private resolveDeal(
    category: CategoryRecord,
    catalogue: ListingCatalogue,
    input: {
      transactionType?: ListingTransactionType | null;
      rentPeriod?: ListingRentPeriod | null;
      priceUnit?: ListingPriceUnit;
      price?: number | null;
    },
    strict: boolean,
  ): Deal {
    const allowed = category.allowedTransactions;
    let transactionType: ListingTransactionType | null = null;

    if (allowed.length > 0) {
      if (input.transactionType) {
        if (!allowed.includes(input.transactionType)) {
          throw AppException.badRequest(
            'Такой сделки в этой категории не бывает',
            ErrorCode.VALIDATION_FAILED,
          );
        }
        transactionType = input.transactionType;
      } else if (allowed.length === 1) {
        transactionType = allowed[0] ?? null;
      } else if (!strict) {
        transactionType = category.defaultTransaction;
      } else {
        throw AppException.badRequest('Укажите тип сделки', ErrorCode.VALIDATION_FAILED);
      }
    } else if (input.transactionType) {
      throw AppException.badRequest(
        'В этой категории сделка не указывается',
        ErrorCode.VALIDATION_FAILED,
      );
    }

    const rules = catalogue.priceRules(category);

    let rentPeriod: ListingRentPeriod | null = null;
    if (transactionType === 'rent') {
      rentPeriod = category.defaultRentPeriod ?? input.rentPeriod ?? null;
      // Срок — отдельный выбор только там, где аренда ровно «посуточно или
      // надолго» (жильё). Там, где ещё есть час и неделя, срок — это сама
      // единица цены, и второго выбора нет
      if (strict && rentPeriodChoices(rules).length > 1 && !rentPeriod) {
        throw AppException.badRequest(
          'Укажите срок аренды: посуточно или надолго',
          ErrorCode.VALIDATION_FAILED,
        );
      }
    }

    // Срок, названный явно, не может противоречить единице: «посуточно» и
    // цена «в неделю» вместе — ошибка, её находит validatePrice
    const priceUnit = input.priceUnit ?? defaultPriceUnit(rules, transactionType, rentPeriod);
    const error = validatePrice(rules, {
      transactionType,
      rentPeriod,
      price: input.price,
      priceUnit,
    });
    if (error) throw AppException.badRequest(error, ErrorCode.VALIDATION_FAILED);

    // Срок по единице: «в сутки» — посуточно, «в месяц» — надолго. Так
    // «Снять посуточно» находит и квартиру, и автомобиль, сданный в сутки
    if (transactionType === 'rent' && !rentPeriod) rentPeriod = rentPeriodOfUnit(priceUnit);

    return { transactionType, rentPeriod, priceUnit };
  }

  /**
   * Характеристики: проверка по полям категории и раскладка по местам
   * хранения. У черновика обязательные поля не требуются — они проверятся
   * при публикации.
   *
   * Населённый пункт и районы в поисковый текст отсюда больше не
   * добавляются: они — колонки места, и в поисковый вектор их кладёт
   * триггер базы (миграция listing_location_search).
   */
  private prepare(
    catalogue: ListingCatalogue,
    category: CategoryRecord,
    raw: Record<string, unknown>,
    strict: boolean,
    deal: Deal,
  ): PreparedAttributes {
    const attributes = catalogue.attributesOf(category.id);
    const schemaAttributes: readonly ListingAttribute[] = strict
      ? attributes
      : attributes.map((attribute) => ({ ...attribute, required: false }));

    const parsed = attributesSchemaFor(schemaAttributes, catalogue.lookup).parse(raw);
    const parent = category.parentId ? catalogue.findById(category.parentId) : null;

    return prepareAttributes(attributes, parsed, catalogue.labelsFor(attributes, parsed), [
      category.name,
      parent?.name,
      transactionCardLabel(deal.transactionType, deal.rentPeriod, category.slug),
      ...catalogue.aliasesFor(attributes, parsed),
    ]);
  }

  // ── Место ─────────────────────────────────────────────────────────────────

  /**
   * Место из формы → колонки, город справочника и район.
   *
   * Если приложение не прислало населённый пункт (точку поставили руками, а
   * адрес по ней не нашёлся), сервер сам спрашивает геокодер — «по
   * возможности»: при сбое или долгом ответе объявление сохраняется с одной
   * точкой. Координаты не теряются никогда.
   */
  private async resolvePlace(input: ListingLocationInput): Promise<ResolvedPlace> {
    const point = { latitude: input.latitude, longitude: input.longitude };
    const enrichment = input.city || input.settlement ? null : await this.enrich(point);
    const columns = locationColumns(input, enrichment);

    const city = await this.nearestCity(point);
    const districtId =
      city && columns.cityDistrict
        ? await this.districtByName(city.id, columns.cityDistrict)
        : null;

    return { columns, city, districtId };
  }

  private async enrich(point: GeoCoordinates): Promise<GeoPlaceDto | null> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ENRICH_TIMEOUT_MS);
    });
    try {
      return await Promise.race([this.geocoding.reverseQuietly(point), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Ближайший город справочника. Нужен не для поиска — поиск идёт по точке, —
   * а для всего, что по-прежнему живёт городами: подписи у объявлений без
   * адреса, «ленты своего города» у старых клиентов.
   */
  private async nearestCity(point: GeoCoordinates): Promise<{ id: string; name: string } | null> {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
      SELECT c."id", c."name" FROM "cities" c
      WHERE c."is_active" AND c."deleted_at" IS NULL
      ORDER BY ST_Distance(
        ST_SetSRID(ST_MakePoint(c."longitude", c."latitude"), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${point.longitude}::float8, ${point.latitude}::float8), 4326)::geography
      )
      LIMIT 1`);
    return rows[0] ?? null;
  }

  /**
   * Район города из справочника по названию, которое дал геокодер: «Советский
   * район» → запись района Махачкалы. Человек районы больше не выбирает —
   * связь нужна, чтобы район оставался дополнительным фильтром.
   */
  private async districtByName(cityId: string, name: string): Promise<string | null> {
    const district = await this.prisma.district.findFirst({
      where: { cityId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    return district?.id ?? null;
  }

  /**
   * Видимость адреса по умолчанию: у услуг и бизнеса адрес — часть
   * предложения, у частного продавца — личные данные.
   */
  private defaultVisibility(
    catalogue: ListingCatalogue,
    category: CategoryRecord,
  ): ListingAddressVisibility {
    const root = category.parentId ? catalogue.findById(category.parentId) : category;
    return root && EXACT_ADDRESS_SECTIONS.includes(root.slug)
      ? ListingAddressVisibility.EXACT
      : ListingAddressVisibility.APPROXIMATE;
  }

  /** Черновик или архив перед публикацией: всё ли заполнено. */
  private async assertComplete(listing: {
    categoryId: string;
    cityId: string;
    title: string;
    description: string;
    contactPhone: string;
    transactionType: ListingTransactionType | null;
    rentPeriod: ListingRentPeriod | null;
    price: number | null;
    priceUnit: ListingPriceUnit;
    attributes: unknown;
    rooms: number | null;
    areaTotal: number | null;
    floor: number | null;
    floorsTotal: number | null;
    year: number | null;
    mileage: number | null;
    condition: string | null;
  }): Promise<void> {
    const catalogue = await this.categories.catalogue();
    const category = this.leafCategory(catalogue, listing.categoryId);

    const base = createListingSchema.safeParse({
      cityId: listing.cityId,
      categoryId: listing.categoryId,
      title: listing.title,
      description: listing.description,
      contactPhone: listing.contactPhone,
    });
    if (!base.success) {
      const issue = base.error.issues[0];
      throw AppException.badRequest(
        issue ? `Заполните объявление: ${issue.message.toLowerCase()}` : 'Заполните объявление',
        ErrorCode.VALIDATION_FAILED,
      );
    }

    this.resolveDeal(category, catalogue, listing, true);
    attributesSchemaFor(catalogue.attributesOf(category.id), catalogue.lookup).parse(
      this.listings.allAttributes(listing),
    );
  }

  /**
   * Сколько объявлений человек подал за сутки.
   *
   * При публикации без проверки это основная защита от заливки: мошеннику
   * невыгодно заводить по одному объявлению в сутки.
   */
  private async assertDailyLimit(userId: string): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const published = await this.prisma.listing.count({
      where: { sellerId: userId, publishedAt: { gte: since }, deletedAt: null },
    });

    if (published >= LISTING_DAILY_LIMIT) {
      throw AppException.badRequest(
        `Больше ${LISTING_DAILY_LIMIT} объявлений в сутки размещать нельзя`,
        ErrorCode.LISTING_DAILY_LIMIT,
      );
    }
  }

  // ── DTO ───────────────────────────────────────────────────────────────────

  /** Строка кабинета по набору `MY_LISTING_SELECT` — общая для DTO списка и правки. */
  private async myRow(listingId: string, userId: string): Promise<MyListingRow> {
    return this.prisma.listing.findFirstOrThrow({
      where: { id: listingId, sellerId: userId },
      select: MY_LISTING_SELECT,
    });
  }

  private async toMyDto(listingId: string, userId: string): Promise<MyListingDto> {
    const row = await this.myRow(listingId, userId);
    const covers = row.coverMediaId ? await this.media.findByIds([row.coverMediaId]) : [];
    const catalogue = await this.categories.catalogue();

    return this.myDto(row, covers[0] ?? null, catalogue);
  }

  private myDto(
    row: MyListingRow,
    cover: Parameters<ListingsService['toDto']>[1],
    catalogue: ListingCatalogue,
  ): MyListingDto {
    const now = new Date();

    return {
      ...this.listings.toDto(row, cover, false, catalogue),
      status: row.status,
      statusReason: row.statusReason,
      archiveReason: row.archiveReason,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      viewsCount: row.viewsCount,
      phoneViewsCount: row.phoneViewsCount,
      favoritesCount: row._count.favorites,
      canBump: row.status === 'approved' && canBump(row.bumpedAt, now),
      hoursUntilBump: hoursUntilBump(row.bumpedAt, now),
    };
  }
}

interface Deal {
  transactionType: ListingTransactionType | null;
  rentPeriod: ListingRentPeriod | null;
  priceUnit: ListingPriceUnit;
}

/**
 * Колонки характеристик в типах базы: числа — числом, состояние —
 * перечислением, отсутствующее в наборе — null (очищено при правке).
 */
function columnData(columns: ListingAttributeColumns): {
  rooms?: number | null;
  areaTotal?: number | null;
  floor?: number | null;
  floorsTotal?: number | null;
  year?: number | null;
  mileage?: number | null;
  condition?: ListingCondition | null;
} {
  const numeric = (value: number | string | null | undefined): number | null | undefined =>
    value === undefined ? undefined : value === null ? null : Number(value);

  return {
    ...('rooms' in columns ? { rooms: numeric(columns.rooms) } : {}),
    ...('areaTotal' in columns ? { areaTotal: numeric(columns.areaTotal) } : {}),
    ...('floor' in columns ? { floor: numeric(columns.floor) } : {}),
    ...('floorsTotal' in columns ? { floorsTotal: numeric(columns.floorsTotal) } : {}),
    ...('year' in columns ? { year: numeric(columns.year) } : {}),
    ...('mileage' in columns ? { mileage: numeric(columns.mileage) } : {}),
    ...('condition' in columns
      ? { condition: (columns.condition as ListingCondition | null | undefined) ?? null }
      : {}),
  };
}

/** Цена за м² — только у продажи целиком и только при известной площади (в десятых). */
function pricePerSqm(
  deal: Deal,
  price: number | null,
  areaTotal: number | string | null | undefined,
): number | null {
  const area = typeof areaTotal === 'number' ? areaTotal : Number(areaTotal);
  if (price === null || !Number.isFinite(area) || area <= 0) return null;
  if (deal.priceUnit !== 'total' || (deal.transactionType && deal.transactionType !== 'sale')) {
    return null;
  }
  return Math.round(price / (area / 10));
}

/**
 * Поля кабинета: то же, что у карточки ленты, плюс состояние и счётчики.
 * Собирается из набора витрины, чтобы одно поле не пришлось добавлять в
 * двух местах и однажды забыть в одном.
 */
const MY_LISTING_SELECT = {
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
  ...LOCATION_SELECT,
  districtId: true,
  viewsCount: true,
  phoneViewsCount: true,
  promotedAt: true,
  promotedUntil: true,
  status: true,
  statusReason: true,
  archiveReason: true,
  expiresAt: true,
  searchText: true,
  category: { select: { slug: true } },
  district: { select: { name: true } },
  city: { select: { name: true, latitude: true, longitude: true } },
  seller: { select: { isVerified: true, ratingAverage: true, ratingCount: true } },
  _count: { select: { favorites: true } },
} satisfies Prisma.ListingSelect;

/**
 * «Куплю», «сниму», «ищу квартиру» — покупатель ищет через поиск, а не
 * объявлением (ТЗ «Объявления», п. 4). Форма предупреждает сразу; сервер
 * проверяет сам, чтобы запрос не прошёл мимо формы.
 */
function assertNotRequest(title: string): void {
  const verdict = classifyListingTitle(title);
  if (verdict.kind === 'request') {
    throw AppException.badRequest(verdict.message, ErrorCode.LISTING_REQUEST_NOT_ALLOWED);
  }
}

type MyListingRow = Prisma.ListingGetPayload<{ select: typeof MY_LISTING_SELECT }>;
