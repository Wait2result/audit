import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  PLACE_GROUPS,
  type AddPlaceMemberDto,
  type CreatePlaceDto,
  type MediaDto,
  type PaginatedResponse,
  type PlaceDetailsDto,
  type PlaceDto,
  type PlaceListQuery,
  type PlaceMemberDto,
  type PlaceScheduleDto,
  type PlaceType,
  type UpdateMyPlaceDto,
  type UpdatePlaceDto,
  type UpdateScheduleDto,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import { minutesInTimezone, weekdayInTimezone } from '../../common/utils/timezone.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CitiesService } from '../cities/cities.service.js';
import { MediaService } from '../media/media.service.js';
import { CategoriesService } from './categories.service.js';
import {
  closingMinute,
  minutesFromTime,
  openStateAt,
  timeFromMinutes,
  type ScheduleDay,
} from './open-hours.js';

const MINUTES_IN_DAY = 1440;
/** Часовой пояс по умолчанию: все наши города в нём, но город решает сам */
const DEFAULT_TIMEZONE = 'Europe/Moscow';

interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Заведения: витрина для приложения и управление из панели и кабинета.
 *
 * Лента не кешируется: заведение меняет стоп-лист прямо во время смены, и
 * увидеть вчерашний кеш вместо «закончилось» — хуже, чем лишний запрос к базе.
 */
@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cities: CitiesService,
    private readonly media: MediaService,
    private readonly categories: CategoriesService,
  ) {}

  // ── Витрина ───────────────────────────────────────────────────────────────

  async list(query: PlaceListQuery, userId?: string): Promise<PaginatedResponse<PlaceDto>> {
    const city = await this.cities.findById(query.cityId);
    const now = new Date();

    // Условия складываются через AND: у поиска и у плитки категории свои
    // списки OR, и записать их одним полем OR нельзя — они бы объединились
    // в «или», и поиск по слову выдал бы всю категорию целиком
    const and: Prisma.PlaceWhereInput[] = [];

    if (query.search) {
      and.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { address: { contains: query.search, mode: 'insensitive' } },
          // Человек ищет «хинкал», а не заведение: заведение подходит,
          // если такое блюдо есть у него в меню и не убрано
          {
            items: {
              some: {
                deletedAt: null,
                isActive: true,
                name: { contains: query.search, mode: 'insensitive' },
              },
            },
          },
        ],
      });
    }

    // Правила категории приходят из базы: владелец меняет их в панели,
    // и список заведений должен меняться следом, без выпуска приложения
    const category = query.category ? await this.categories.findBySlug(query.category) : null;

    if (category) {
      and.push(this.categories.whereFor(category));
    }

    const where: Prisma.PlaceWhereInput = {
      cityId: query.cityId,
      deletedAt: null,
      isActive: true,
      ...(query.types ? { type: { in: parseTypes(query.types) } } : {}),
      ...(query.cuisine ? { cuisines: { has: query.cuisine } } : {}),
      ...(query.hasDelivery ? { hasDelivery: true } : {}),
      ...(query.maxMinutes ? { deliveryMinutes: { not: null, lte: query.maxMinutes } } : {}),
      // Избранное — тоже условие запроса, иначе «показать ещё» ломается
      ...(query.favoritesOnly && userId ? { favorites: { some: { userId } } } : {}),
      // «Открыто сейчас» уходит в условие запроса, а не фильтрует ответ:
      // иначе постраничная выдача отдавала бы неполные страницы
      ...(query.openNow ? { schedules: { some: openNowFilter(now, city.timezone) } } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };

    const rows = await this.prisma.place.findMany({
      where,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: orderForSort(query.sort),
      include: { schedules: true },
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const covers = await this.coverMap(items.map((row) => row.coverMediaId));
    const favorites = await this.favoriteIds(
      userId,
      items.map((row) => row.id),
    );

    return {
      items: items.map((row) =>
        toPlaceDto(
          row,
          row.schedules,
          covers.get(row.coverMediaId ?? '') ?? null,
          now,
          city.timezone,
          favorites.has(row.id),
        ),
      ),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  /**
   * Какие из этих заведений у человека в избранном.
   * Одним запросом на всю страницу, а не по запросу на карточку.
   */
  private async favoriteIds(userId: string | undefined, placeIds: string[]): Promise<Set<string>> {
    if (!userId || placeIds.length === 0) return new Set();

    const rows = await this.prisma.favoritePlace.findMany({
      where: { userId, placeId: { in: placeIds } },
      select: { placeId: true },
    });

    return new Set(rows.map((row) => row.placeId));
  }

  /** Переключатель сердечка. Возвращает новое состояние. */
  async toggleFavorite(userId: string, placeId: string): Promise<{ isFavorite: boolean }> {
    const place = await this.prisma.place.findFirst({
      where: { id: placeId, deletedAt: null },
      select: { id: true },
    });

    if (!place) {
      throw AppException.notFound('Заведение не найдено', ErrorCode.PLACE_NOT_FOUND);
    }

    const existing = await this.prisma.favoritePlace.findUnique({
      where: { userId_placeId: { userId, placeId } },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.favoritePlace.delete({ where: { id: existing.id } });

      return { isFavorite: false };
    }

    await this.prisma.favoritePlace.create({ data: { userId, placeId } });

    return { isFavorite: true };
  }

  async findOne(id: string, userId?: string): Promise<PlaceDetailsDto> {
    const place = await this.prisma.place.findFirst({
      where: { id, deletedAt: null, isActive: true },
      include: { schedules: true, city: true, district: true },
    });

    if (!place) {
      throw AppException.notFound('Заведение не найдено', ErrorCode.PLACE_NOT_FOUND);
    }

    const now = new Date();
    const covers = await this.coverMap([place.coverMediaId]);
    const photos = await this.media.listForOwner('place', place.id);
    const favorites = await this.favoriteIds(userId, [place.id]);

    return {
      ...toPlaceDto(
        place,
        place.schedules,
        covers.get(place.coverMediaId ?? '') ?? null,
        now,
        place.city.timezone,
        favorites.has(place.id),
      ),
      description: place.description,
      phone: place.phone,
      latitude: place.latitude,
      longitude: place.longitude,
      districtName: place.district?.name ?? null,
      schedule: toScheduleDto(place.schedules),
      photos,
    };
  }

  /** Список кухонь, которые реально проставлены заведениями города. */
  async cuisines(cityId: string): Promise<string[]> {
    const rows = await this.prisma.place.findMany({
      where: { cityId, deletedAt: null, isActive: true },
      select: { cuisines: true },
    });

    const all = new Set(rows.flatMap((row) => row.cuisines));

    return [...all].sort((a, b) => a.localeCompare(b, 'ru'));
  }

  // ── Управление из панели ──────────────────────────────────────────────────

  async listForAdmin(
    pagination: { cursor?: string; limit: number },
    filters: { cityId?: string; search?: string },
  ): Promise<PaginatedResponse<PlaceDto & { isActive: boolean; cityName: string }>> {
    const rows = await this.prisma.place.findMany({
      where: {
        deletedAt: null,
        ...(filters.cityId ? { cityId: filters.cityId } : {}),
        ...(filters.search ? { name: { contains: filters.search, mode: 'insensitive' } } : {}),
      },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { schedules: true, city: true },
    });

    const hasMore = rows.length > pagination.limit;
    const items = hasMore ? rows.slice(0, pagination.limit) : rows;
    const now = new Date();
    const covers = await this.coverMap(items.map((row) => row.coverMediaId));

    return {
      items: items.map((row) => ({
        ...toPlaceDto(
          row,
          row.schedules,
          covers.get(row.coverMediaId ?? '') ?? null,
          now,
          row.city.timezone,
        ),
        isActive: row.isActive,
        cityName: row.city.name,
      })),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  async create(dto: CreatePlaceDto, actorId: string, context: AuditContext): Promise<PlaceDto> {
    await this.cities.findById(dto.cityId);

    const place = await this.prisma.place.create({
      data: {
        ...toPrismaData(dto),
        cityId: dto.cityId,
        type: dto.type,
        name: dto.name,
        address: dto.address,
        // Заведение без расписания считалось бы закрытым круглосуточно,
        // поэтому сразу заводим неделю с обычными часами
        schedules: {
          create: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday })),
        },
      },
      include: { schedules: true, city: true },
    });

    await this.audit.record({
      actorId,
      action: 'place.create',
      targetType: 'place',
      targetId: place.id,
      after: place,
      ...context,
    });

    return toPlaceDto(place, place.schedules, null, new Date(), place.city.timezone);
  }

  async update(
    id: string,
    dto: UpdatePlaceDto | UpdateMyPlaceDto,
    actorId: string,
    context: AuditContext,
  ): Promise<PlaceDto> {
    const before = await this.prisma.place.findFirst({ where: { id, deletedAt: null } });
    if (!before) {
      throw AppException.notFound('Заведение не найдено', ErrorCode.PLACE_NOT_FOUND);
    }

    if ('cityId' in dto && dto.cityId) {
      await this.cities.findById(dto.cityId);
    }

    const place = await this.prisma.place.update({
      where: { id },
      data: toPrismaData(dto),
      include: { schedules: true, city: true },
    });

    if (dto.coverMediaId) {
      await this.media.attach({
        mediaIds: [dto.coverMediaId],
        ownerType: 'place',
        ownerId: id,
        userId: actorId,
      });
    }

    await this.audit.record({
      actorId,
      action: 'place.update',
      targetType: 'place',
      targetId: id,
      before,
      after: place,
      ...context,
    });

    const covers = await this.coverMap([place.coverMediaId]);

    return toPlaceDto(
      place,
      place.schedules,
      covers.get(place.coverMediaId ?? '') ?? null,
      new Date(),
      place.city.timezone,
    );
  }

  async softDelete(id: string, actorId: string, context: AuditContext): Promise<void> {
    const before = await this.prisma.place.findFirst({ where: { id, deletedAt: null } });
    if (!before) {
      throw AppException.notFound('Заведение не найдено', ErrorCode.PLACE_NOT_FOUND);
    }

    await this.prisma.place.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit.record({
      actorId,
      action: 'place.delete',
      targetType: 'place',
      targetId: id,
      before,
      ...context,
    });
  }

  // ── Часы работы ───────────────────────────────────────────────────────────

  async updateSchedule(
    placeId: string,
    dto: UpdateScheduleDto,
    actorId: string,
    context: AuditContext,
  ): Promise<PlaceScheduleDto[]> {
    const before = await this.prisma.placeSchedule.findMany({ where: { placeId } });

    // Неделя записывается целиком: не бывает состояния, когда половина дней
    // обновилась, а половина осталась старой
    await this.prisma.$transaction(
      dto.days.map((day) =>
        this.prisma.placeSchedule.upsert({
          where: { placeId_weekday: { placeId, weekday: day.weekday } },
          create: {
            placeId,
            weekday: day.weekday,
            isClosed: day.isClosed,
            opensMinute: minutesFromTime(day.opensAt),
            closesMinute: minutesFromTime(day.closesAt),
          },
          update: {
            isClosed: day.isClosed,
            opensMinute: minutesFromTime(day.opensAt),
            closesMinute: minutesFromTime(day.closesAt),
          },
        }),
      ),
    );

    const after = await this.prisma.placeSchedule.findMany({ where: { placeId } });

    await this.audit.record({
      actorId,
      action: 'place.schedule',
      targetType: 'place',
      targetId: placeId,
      before,
      after,
      ...context,
    });

    return toScheduleDto(after);
  }

  // ── Доступы сотрудников заведения ─────────────────────────────────────────

  async listMembers(placeId: string): Promise<PlaceMemberDto[]> {
    const rows = await this.prisma.placeMember.findMany({
      where: { placeId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { firstName: true, lastName: true, phone: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      name: [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') || 'Без имени',
      phone: row.user.phone,
      role: row.role,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async addMember(
    placeId: string,
    dto: AddPlaceMemberDto,
    actorId: string,
    context: AuditContext,
  ): Promise<PlaceMemberDto> {
    const place = await this.prisma.place.findFirst({ where: { id: placeId, deletedAt: null } });
    if (!place) {
      throw AppException.notFound('Заведение не найдено', ErrorCode.PLACE_NOT_FOUND);
    }

    // Доступ выдаётся существующему аккаунту: приглашений по коду нет,
    // потому что код можно передать кому угодно, а номер привязан к человеку
    const user = await this.prisma.user.findFirst({
      where: { phone: dto.phone, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });

    if (!user) {
      throw AppException.badRequest(
        'Пользователь с таким номером не найден. Сначала он должен зарегистрироваться в приложении.',
        ErrorCode.USER_NOT_FOUND,
      );
    }

    const member = await this.prisma.placeMember.upsert({
      where: { placeId_userId: { placeId, userId: user.id } },
      create: { placeId, userId: user.id, role: dto.role, grantedById: actorId },
      update: { role: dto.role, grantedById: actorId, deletedAt: null },
    });

    await this.audit.record({
      actorId,
      action: 'place.member.add',
      targetType: 'place',
      targetId: placeId,
      after: { userId: user.id, phone: user.phone, role: dto.role },
      ...context,
    });

    return {
      id: member.id,
      userId: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Без имени',
      phone: user.phone,
      role: dto.role,
      createdAt: member.createdAt.toISOString(),
    };
  }

  async removeMember(
    placeId: string,
    userId: string,
    actorId: string,
    context: AuditContext,
  ): Promise<void> {
    const member = await this.prisma.placeMember.findFirst({
      where: { placeId, userId, deletedAt: null },
    });

    if (!member) {
      throw AppException.notFound('Доступ не найден', ErrorCode.PLACE_ACCESS_DENIED);
    }

    await this.prisma.placeMember.update({
      where: { id: member.id },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      actorId,
      action: 'place.member.remove',
      targetType: 'place',
      targetId: placeId,
      before: member,
      ...context,
    });
  }

  // ── Кабинет ───────────────────────────────────────────────────────────────

  async myPlaces(userId: string) {
    const rows = await this.prisma.placeMember.findMany({
      where: { userId, deletedAt: null, place: { deletedAt: null } },
      include: { place: { include: { city: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });

    const covers = await this.coverMap(rows.map((row) => row.place.coverMediaId));

    return rows.map((row) => ({
      id: row.place.id,
      name: row.place.name,
      type: row.place.type,
      cityName: row.place.city.name,
      role: row.role,
      isActive: row.place.isActive,
      ordersEnabled: row.place.ordersEnabled,
      cover: covers.get(row.place.coverMediaId ?? '') ?? null,
    }));
  }

  /** Заведение глазами его сотрудника: видно и выключенное, и скрытое. */
  async myPlace(placeId: string): Promise<PlaceDetailsDto> {
    const place = await this.prisma.place.findFirst({
      where: { id: placeId, deletedAt: null },
      include: { schedules: true, city: true, district: true },
    });

    if (!place) {
      throw AppException.notFound('Заведение не найдено', ErrorCode.PLACE_NOT_FOUND);
    }

    const covers = await this.coverMap([place.coverMediaId]);

    return {
      ...toPlaceDto(
        place,
        place.schedules,
        covers.get(place.coverMediaId ?? '') ?? null,
        new Date(),
        place.city.timezone,
      ),
      description: place.description,
      phone: place.phone,
      latitude: place.latitude,
      longitude: place.longitude,
      districtName: place.district?.name ?? null,
      schedule: toScheduleDto(place.schedules),
      photos: await this.media.listForOwner('place', place.id),
    };
  }

  /** Обложки одним запросом: иначе список из двадцати карточек даст двадцать. */
  private async coverMap(ids: (string | null)[]): Promise<Map<string, MediaDto>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();

    const media = await this.media.findByIds(unique);

    return new Map(media.map((item) => [item.id, item]));
  }
}

// ── Преобразования ───────────────────────────────────────────────────────────

/**
 * Порядок выдачи.
 *
 * `id` в конце каждого варианта — не украшение: без однозначного порядка
 * курсорная пагинация может показать одну запись дважды, а другую пропустить.
 * Заведения без оценок и без указанного срока доставки уходят вниз, а не
 * наверх: пустое значение — не «лучшее».
 */
function orderForSort(sort: PlaceListQuery['sort']): Prisma.PlaceOrderByWithRelationInput[] {
  switch (sort) {
    case 'rating':
      return [{ ratingAverage: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }];
    case 'fast':
      return [{ deliveryMinutes: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    case 'cheap':
      return [{ averageCheck: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    default:
      return [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }];
  }
}

function parseTypes(raw: string): PlaceType[] {
  const known = new Set<string>([...PLACE_GROUPS.food, ...PLACE_GROUPS.shops]);

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is PlaceType => known.has(value));
}

/**
 * Условие «работает прямо сейчас» для запроса к базе.
 *
 * Два случая: сегодняшняя смена и вчерашняя, перешедшая за полночь. Во
 * втором случае текущие минуты сравниваются со сдвигом на сутки — так же,
 * как это делает openStateAt.
 */
function openNowFilter(now: Date, timeZone: string): Prisma.PlaceScheduleWhereInput {
  const weekday = weekdayInTimezone(now, timeZone);
  const minute = minutesInTimezone(now, timeZone);
  const yesterday = weekday === 1 ? 7 : weekday - 1;

  return {
    OR: [
      {
        weekday,
        isClosed: false,
        opensMinute: { lte: minute },
        closesMinute: { gt: minute },
      },
      // Смена, начавшаяся вчера: «до 02:00» хранится как 1560
      {
        weekday: yesterday,
        isClosed: false,
        closesMinute: { gt: minute + MINUTES_IN_DAY },
      },
    ],
  };
}

interface PlaceRow {
  id: string;
  cityId: string;
  type: string;
  name: string;
  address: string;
  cuisines: string[];
  averageCheck: number | null;
  ordersEnabled: boolean;
  hasDelivery: boolean;
  hasPickup: boolean;
  deliveryFee: number;
  freeDeliveryFrom: number | null;
  minOrderAmount: number;
  deliveryMinutes: number | null;
  ratingAverage: number;
  ratingCount: number;
}

function toPlaceDto(
  place: PlaceRow,
  schedules: ScheduleDay[],
  cover: MediaDto | null,
  now: Date,
  timeZone: string,
  isFavorite = false,
): PlaceDto {
  return {
    id: place.id,
    cityId: place.cityId,
    type: place.type as PlaceType,
    name: place.name,
    address: place.address,
    cuisines: place.cuisines,
    averageCheck: place.averageCheck,
    cover,
    openState: openStateAt(
      schedules,
      weekdayInTimezone(now, timeZone || DEFAULT_TIMEZONE),
      minutesInTimezone(now, timeZone || DEFAULT_TIMEZONE),
    ),
    ordersEnabled: place.ordersEnabled,
    delivery: {
      hasDelivery: place.hasDelivery,
      hasPickup: place.hasPickup,
      deliveryFee: place.deliveryFee,
      freeDeliveryFrom: place.freeDeliveryFrom,
      minOrderAmount: place.minOrderAmount,
      deliveryMinutes: place.deliveryMinutes,
    },
    // Среднее округляется до десятых: «4.8». Большая точность в карточке
    // ничего не добавляет, а «4.7666» выглядит как ошибка
    rating: {
      average: Math.round(place.ratingAverage * 10) / 10,
      count: place.ratingCount,
    },
    isFavorite,
  };
}

function toScheduleDto(schedules: ScheduleDay[]): PlaceScheduleDto[] {
  return [...schedules]
    .sort((a, b) => a.weekday - b.weekday)
    .map((day) => ({
      weekday: day.weekday,
      isClosed: day.isClosed,
      opensAt: timeFromMinutes(day.opensMinute),
      closesAt: timeFromMinutes(closingMinute(day.opensMinute, day.closesMinute)),
    }));
}

/** Поля, общие для создания и правки. `undefined` означает «не трогать». */
function toPrismaData(dto: Partial<CreatePlaceDto>) {
  return {
    districtId: dto.districtId ?? undefined,
    name: dto.name,
    description: dto.description ?? undefined,
    address: dto.address,
    latitude: dto.latitude ?? undefined,
    longitude: dto.longitude ?? undefined,
    phone: dto.phone ?? undefined,
    cuisines: dto.cuisines,
    averageCheck: dto.averageCheck ?? undefined,
    coverMediaId: dto.coverMediaId ?? undefined,
    ordersEnabled: dto.ordersEnabled,
    hasDelivery: dto.hasDelivery,
    hasPickup: dto.hasPickup,
    deliveryFee: dto.deliveryFee,
    freeDeliveryFrom: dto.freeDeliveryFrom ?? undefined,
    minOrderAmount: dto.minOrderAmount,
    deliveryMinutes: dto.deliveryMinutes ?? undefined,
    isActive: dto.isActive,
    sortOrder: dto.sortOrder,
  };
}
