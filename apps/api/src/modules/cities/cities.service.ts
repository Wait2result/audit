import { Injectable } from '@nestjs/common';
import { ErrorCode, type CityDto, type DistrictDto } from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateCityDto, UpdateCityDto } from './cities.schema.js';

/**
 * Города — основа всей архитектуры (пункт 2 ТЗ).
 *
 * Каждый объект в системе (ресторан, объявление, новость, поездка) связан
 * с городом. Добавление нового города — это создание одной записи здесь;
 * все рубрики начинают работать в нём автоматически.
 *
 * Список городов кешируется: он меняется раз в месяцы, а запрашивается при
 * каждом запуске приложения. Держать его в Redis вместо базы — самая
 * дешёвая оптимизация в проекте.
 */
@Injectable()
export class CitiesService {
  private static readonly CACHE_KEY = 'cities:active';
  private static readonly CACHE_TTL_SECONDS = 3600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  /** Список активных городов для выбора в приложении. */
  async listActive(): Promise<CityDto[]> {
    const cached = await this.redis.getJson<CityDto[]>(CitiesService.CACHE_KEY);
    if (cached) return cached;

    const cities = await this.prisma.city.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const result = cities.map(toDto);
    await this.redis.setJson(CitiesService.CACHE_KEY, result, CitiesService.CACHE_TTL_SECONDS);

    return result;
  }

  /** Полный список, включая выключенные города. Только для панели управления. */
  async listAll(): Promise<CityDto[]> {
    const cities = await this.prisma.city.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return cities.map(toDto);
  }

  async findById(id: string): Promise<CityDto> {
    const city = await this.prisma.city.findFirst({ where: { id, deletedAt: null } });
    if (!city) {
      throw AppException.notFound('Город не найден', ErrorCode.CITY_NOT_FOUND);
    }
    return toDto(city);
  }

  async findBySlug(slug: string): Promise<CityDto> {
    const city = await this.prisma.city.findFirst({ where: { slug, deletedAt: null } });
    if (!city) {
      throw AppException.notFound('Город не найден', ErrorCode.CITY_NOT_FOUND);
    }
    return toDto(city);
  }

  /**
   * Районы города для выбора места в объявлении (карта + список — Этап 7).
   * Есть не у каждого города: Каспийск и Дербент административно на районы
   * не делятся, и для них список будет просто пустым.
   */
  async listDistricts(cityId: string): Promise<DistrictDto[]> {
    const districts = await this.prisma.district.findMany({
      where: { cityId, deletedAt: null },
      orderBy: { name: 'asc' },
    });

    return districts.map((district) => ({
      id: district.id,
      name: district.name,
      slug: district.slug,
    }));
  }

  /**
   * Проверяет, что город существует и активен.
   * Вызывается везде, где пользователь присылает cityId, — чтобы в базу
   * не попали объявления в несуществующем городе.
   */
  async assertActive(cityId: string): Promise<void> {
    const city = await this.prisma.city.findFirst({
      where: { id: cityId, deletedAt: null },
      select: { isActive: true },
    });

    if (!city) {
      throw AppException.notFound('Город не найден', ErrorCode.CITY_NOT_FOUND);
    }
    if (!city.isActive) {
      throw AppException.badRequest('Город временно недоступен', ErrorCode.CITY_INACTIVE);
    }
  }

  async create(dto: CreateCityDto, actorId: string, context: AuditContext): Promise<CityDto> {
    const existing = await this.prisma.city.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw AppException.conflict(`Город с идентификатором «${dto.slug}» уже существует`);
    }

    const city = await this.prisma.city.create({ data: dto });
    await this.invalidateCache();

    await this.audit.record({
      actorId,
      action: 'city.create',
      targetType: 'city',
      targetId: city.id,
      after: city,
      ...context,
    });

    return toDto(city);
  }

  async update(
    id: string,
    dto: UpdateCityDto,
    actorId: string,
    context: AuditContext,
  ): Promise<CityDto> {
    const before = await this.prisma.city.findFirst({ where: { id, deletedAt: null } });
    if (!before) {
      throw AppException.notFound('Город не найден', ErrorCode.CITY_NOT_FOUND);
    }

    if (dto.slug && dto.slug !== before.slug) {
      const conflict = await this.prisma.city.findUnique({ where: { slug: dto.slug } });
      if (conflict) {
        throw AppException.conflict(`Город с идентификатором «${dto.slug}» уже существует`);
      }
    }

    const city = await this.prisma.city.update({ where: { id }, data: dto });
    await this.invalidateCache();

    await this.audit.record({
      actorId,
      action: 'city.update',
      targetType: 'city',
      targetId: id,
      before,
      after: city,
      ...context,
    });

    return toDto(city);
  }

  /**
   * «Мягкое» удаление: город скрывается, но остаётся в базе.
   * Полное удаление невозможно — на город ссылаются заказы, объявления
   * и поездки, а история этих записей должна сохраняться.
   */
  async softDelete(id: string, actorId: string, context: AuditContext): Promise<void> {
    const before = await this.prisma.city.findFirst({ where: { id, deletedAt: null } });
    if (!before) {
      throw AppException.notFound('Город не найден', ErrorCode.CITY_NOT_FOUND);
    }

    await this.prisma.city.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.invalidateCache();

    await this.audit.record({
      actorId,
      action: 'city.delete',
      targetType: 'city',
      targetId: id,
      before,
      ...context,
    });
  }

  private async invalidateCache(): Promise<void> {
    await this.redis.del(CitiesService.CACHE_KEY);
  }
}

interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

interface CityRecord {
  id: string;
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isActive: boolean;
  sortOrder: number;
}

function toDto(city: CityRecord): CityDto {
  return {
    id: city.id,
    name: city.name,
    slug: city.slug,
    latitude: city.latitude,
    longitude: city.longitude,
    timezone: city.timezone,
    isActive: city.isActive,
    sortOrder: city.sortOrder,
  };
}
