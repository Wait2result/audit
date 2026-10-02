import { Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  type CinemaDto,
  type CinemaScheduleDto,
  type MovieDetailsDto,
  type MovieDto,
  type MovieShowtimesDto,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CitiesService } from '../cities/cities.service.js';
import {
  buildTicketUrl,
  KinoplanClient,
  type KinoplanRelease,
  type KinoplanReleaseDetails,
  type KinoplanSeance,
} from './kinoplan-client.js';
import type { CreateCinemaDto, UpdateCinemaDto } from './cinema.schema.js';

/**
 * Кино (Этап 4 ТЗ).
 *
 * Сеансы и фильмы не хранятся в базе — это ежедневно меняющееся зеркало
 * систем самих кинотеатров (см. docs/ADR/0004-кино-kinoplan.md). Расписание
 * запрашивается по требованию у Kinoplan и кешируется в Redis, ровно как
 * устроена погода (WeatherService). В базе — только сам кинотеатр
 * (адрес, город, данные для обращения к Kinoplan): редко меняющийся
 * справочник, которым управляет админ.
 */
@Injectable()
export class CinemaService {
  private readonly logger = new Logger(CinemaService.name);
  private static readonly CACHE_TTL_SECONDS = 1800;
  /** Найденный трейлер уже не изменится — держим неделю */
  private static readonly MOVIE_CACHE_TTL_SECONDS = 7 * 86_400;
  /**
   * А вот «трейлера нет» — состояние временное: у только вышедшего фильма
   * карточку в кинотеатре заполняют не сразу. Перепроверяем каждые три часа,
   * иначе трейлер, появившийся днём, ждал бы до завтра.
   */
  private static readonly MOVIE_NO_TRAILER_TTL_SECONDS = 3 * 3600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly cities: CitiesService,
    private readonly kinoplan: KinoplanClient,
  ) {}

  // ── Публичное расписание ──────────────────────────────────────────────────

  async getSchedule(cityId: string, date?: string): Promise<CinemaScheduleDto> {
    const city = await this.cities.findById(cityId);
    const targetDate = date ?? todayInTimezone(city.timezone);

    const cacheKey = `cinema:schedule:${cityId}:${targetDate}`;
    const cached = await this.redis.getJson<CinemaScheduleDto>(cacheKey);
    if (cached) return cached;

    const cinemas = await this.prisma.cinema.findMany({
      where: { cityId, isActive: true, deletedAt: null },
    });

    const schedule = await this.buildSchedule(cinemas, targetDate);

    await this.redis.setJson(cacheKey, schedule, CinemaService.CACHE_TTL_SECONDS);
    return schedule;
  }

  /**
   * Опрашивает все кинотеатры параллельно. Падение одного (сеть, протухший
   * токен) не должно скрывать расписание остальных — в отличие от погоды,
   * где источник один и его недоступность является ошибкой уровня API,
   * здесь источников несколько, и «сеансов не нашлось» — не ошибка, а
   * законный ответ (в частности, всегда для Дербента, где кинотеатра с
   * собственным сайтом пока нет).
   */
  private async buildSchedule(cinemas: CinemaRecord[], date: string): Promise<CinemaScheduleDto> {
    const results = await Promise.allSettled(
      cinemas.map(async (cinema) => ({
        cinema,
        releases: await this.kinoplan.getPlaybill(
          cinema.kinoplanToken,
          cinema.kinoplanCityId,
          date,
        ),
      })),
    );

    const byTitle = new Map<string, MovieShowtimesDto>();

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn({ err: result.reason }, 'Не удалось получить расписание кинотеатра');
        continue;
      }

      const { cinema, releases } = result.value;
      for (const release of releases) {
        const key = normalizeTitle(release.title);
        let entry = byTitle.get(key);

        if (!entry) {
          entry = { movie: mapMovie(release), showtimes: [] };
          byTitle.set(key, entry);
        } else if (isMoreComplete(release, entry.movie)) {
          // Каждый кинотеатр заводит карточку фильма у себя сам, и жанр с
          // возрастным рейтингом иногда просто не заполняют. Если у другого
          // кинотеатра та же карточка заполнена полнее — берём её, а не
          // первую попавшуюся (иначе ужастик может показаться как «0+»
          // только потому, что первым в ответе пришёл именно недозаполненный
          // кинотеатр).
          entry.movie = mapMovie(release);
        }

        for (const seance of release.seances) {
          entry.showtimes.push(mapShowtime(seance, cinema, release.id));
        }
      }
    }

    return (
      Array.from(byTitle.values())
        // Kinoplan включает в афишу и фильмы без сеансов на конкретную дату
        // (например, ещё идущие в прокате, но не показываемые сегодня) —
        // карточка без единого сеанса пользователю ничем не полезна.
        .filter((entry) => entry.showtimes.length > 0)
        .map((entry) => ({
          ...entry,
          showtimes: entry.showtimes.sort((a, b) => a.startTime.localeCompare(b.startTime)),
        }))
        .sort((a, b) => a.movie.title.localeCompare(b.movie.title, 'ru'))
    );
  }

  /**
   * Карточка фильма с описанием и трейлером.
   *
   * Спрашивается отдельно и только по нажатию: в расписании этих данных нет,
   * а тянуть их для всего списка — это десяток лишних запросов к Kinoplan
   * ради того, что человек, скорее всего, не откроет.
   */
  async getMovie(cityId: string, movieId: number): Promise<MovieDetailsDto> {
    const cacheKey = `cinema:movie:${cityId}:${movieId}`;
    const cached = await this.redis.getJson<MovieDetailsDto>(cacheKey);
    if (cached) return cached;

    const cinemas = await this.prisma.cinema.findMany({
      where: { cityId, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Идентификатор фильма у каждого кинотеатра свой, а в расписании города
    // они перемешаны — поэтому спрашиваем по очереди, пока фильм не найдётся.
    let release: KinoplanReleaseDetails | null = null;
    let source: (typeof cinemas)[number] | null = null;

    for (const cinema of cinemas) {
      try {
        release = await this.kinoplan.getRelease(
          cinema.kinoplanToken,
          movieId,
          cinema.kinoplanCityId,
          cinema.kinoplanCinemaId,
        );
        source = cinema;
        break;
      } catch {
        continue;
      }
    }

    if (!release || !source) {
      throw AppException.notFound('Фильм не найден', ErrorCode.CINEMA_NOT_FOUND);
    }

    // Карточка фильма заполняется каждым кинотеатром отдельно, и трейлер
    // у одного может быть, а у другого — нет. Поэтому, если здесь пусто,
    // ищем тот же фильм у остальных наших кинотеатров.
    const trailer = release.trailer?.hd
      ? release.trailer
      : await this.findTrailerElsewhere(release.title, source.id);

    const details: MovieDetailsDto = {
      ...mapMovie(release),
      description: release.description?.trim() || null,
      countries: release.countries.map((country) => country.title),
      year: release.year,
      trailerUrl: trailer?.hd ?? null,
      trailerThumbnailUrl: trailer?.thumbnail ?? null,
    };

    await this.redis.setJson(
      cacheKey,
      details,
      details.trailerUrl
        ? CinemaService.MOVIE_CACHE_TTL_SECONDS
        : CinemaService.MOVIE_NO_TRAILER_TTL_SECONDS,
    );
    return details;
  }

  /**
   * Ищет трейлер того же фильма у остальных подключённых кинотеатров.
   *
   * Идентификатор фильма у каждого кинотеатра свой, поэтому сопоставляем по
   * названию — и терпимо к разнице в написании: один кинотеатр заводит
   * «Человек-паук», другой «Человек паук».
   */
  private async findTrailerElsewhere(
    title: string,
    exceptCinemaId: string,
  ): Promise<{ hd: string | null; thumbnail: string | null } | null> {
    const others = await this.prisma.cinema.findMany({
      where: { isActive: true, deletedAt: null, NOT: { id: exceptCinemaId } },
      include: { city: { select: { timezone: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    for (const other of others) {
      try {
        const releases = await this.kinoplan.getPlaybill(
          other.kinoplanToken,
          other.kinoplanCityId,
          todayInTimezone(other.city.timezone),
        );

        const match = releases.find((release) => sameTitle(release.title, title));
        if (!match) continue;

        const details = await this.kinoplan.getRelease(
          other.kinoplanToken,
          match.id,
          other.kinoplanCityId,
          other.kinoplanCinemaId,
        );

        if (details.trailer?.hd) return details.trailer;
      } catch {
        // Недоступность соседнего кинотеатра — не повод ронять карточку
        continue;
      }
    }

    return null;
  }

  // ── Справочник кинотеатров ────────────────────────────────────────────────

  async listByCity(cityId: string): Promise<CinemaDto[]> {
    const cinemas = await this.prisma.cinema.findMany({
      where: { cityId, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return cinemas.map(toDto);
  }

  async create(dto: CreateCinemaDto, actorId: string, context: AuditContext): Promise<CinemaDto> {
    await this.cities.findById(dto.cityId);

    const cinema = await this.prisma.cinema.create({ data: dto });

    await this.audit.record({
      actorId,
      action: 'cinema.create',
      targetType: 'cinema',
      targetId: cinema.id,
      after: cinema,
      ...context,
    });

    return toDto(cinema);
  }

  async update(
    id: string,
    dto: UpdateCinemaDto,
    actorId: string,
    context: AuditContext,
  ): Promise<CinemaDto> {
    const before = await this.prisma.cinema.findFirst({ where: { id, deletedAt: null } });
    if (!before) {
      throw AppException.notFound('Кинотеатр не найден', ErrorCode.CINEMA_NOT_FOUND);
    }
    if (dto.cityId) {
      await this.cities.findById(dto.cityId);
    }

    const cinema = await this.prisma.cinema.update({ where: { id }, data: dto });

    await this.audit.record({
      actorId,
      action: 'cinema.update',
      targetType: 'cinema',
      targetId: id,
      before,
      after: cinema,
      ...context,
    });

    return toDto(cinema);
  }

  async softDelete(id: string, actorId: string, context: AuditContext): Promise<void> {
    const before = await this.prisma.cinema.findFirst({ where: { id, deletedAt: null } });
    if (!before) {
      throw AppException.notFound('Кинотеатр не найден', ErrorCode.CINEMA_NOT_FOUND);
    }

    await this.prisma.cinema.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit.record({
      actorId,
      action: 'cinema.delete',
      targetType: 'cinema',
      targetId: id,
      before,
      ...context,
    });
  }
}

interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

interface CinemaRecord {
  id: string;
  cityId: string;
  name: string;
  address: string;
  phone: string | null;
  websiteUrl: string;
  kinoplanToken: string;
  kinoplanCinemaId: number;
  kinoplanCityId: number;
}

function toDto(cinema: CinemaRecord): CinemaDto {
  return {
    id: cinema.id,
    cityId: cinema.cityId,
    name: cinema.name,
    address: cinema.address,
    phone: cinema.phone,
    websiteUrl: cinema.websiteUrl,
  };
}

function mapMovie(
  release: Pick<KinoplanRelease, 'id' | 'title' | 'poster' | 'age_rating' | 'genres' | 'duration'>,
): MovieDto {
  return {
    id: release.id,
    title: release.title,
    posterUrl: release.poster,
    ageRating: release.age_rating,
    genres: release.genres.map((g) => g.title),
    durationMinutes: release.duration,
  };
}

function mapShowtime(seance: KinoplanSeance, cinema: CinemaRecord, releaseId: number) {
  const hall = parseHall(seance.hall);

  return {
    id: `${cinema.id}:${seance.id}`,
    cinemaId: cinema.id,
    cinemaName: cinema.name,
    startTime: seance.start_date_time,
    hallLabel: hall.label,
    hallFeature: hall.feature,
    format: seance.formats[0]?.title ?? null,
    priceMin: seance.price.min / 100,
    priceMax: seance.price.max / 100,
    buyUrl: buildTicketUrl(cinema.kinoplanCinemaId, releaseId, seance.id),
  };
}

/**
 * Кинотеатры называют залы кто во что горазд: Октябрь пишет «Зал 2», Парамакс
 * и Синема Холл — просто «1» или «3 Dolby Atmos» (номер плюс особенность
 * зала слитно), а Москва в Каспийске вообще без номеров — «Синий», «Красный».
 * Разбираем это в единый вид: номер/имя зала отдельно, особенность (Dolby
 * Atmos, VIP) отдельно — иначе «3 Dolby Atmos» на экране не понять, что
 * из этого номер зала, а что описание звука.
 */
function parseHall(hall: { title: string; is_vip: boolean } | null): {
  label: string | null;
  feature: string | null;
} {
  if (!hall) return { label: null, feature: null };

  const raw = hall.title.trim();
  if (!raw) return { label: null, feature: hall.is_vip ? 'VIP' : null };

  const withNumber = raw.match(/^(\d+)\s*(.*)$/);
  let label: string;
  let rest: string;

  if (withNumber) {
    label = `Зал ${withNumber[1]}`;
    rest = (withNumber[2] ?? '').trim();
  } else if (/^зал(\s|$)/i.test(raw)) {
    // \b здесь не годится: он определяет границу слова через [A-Za-z0-9_],
    // а кириллица в эту категорию не входит, и после «Зал» граница слова
    // просто не находится — регулярка молча не срабатывает ни на чём
    label = raw;
    rest = '';
  } else {
    label = `Зал ${raw}`;
    rest = '';
  }

  const feature = rest || (hall.is_vip ? 'VIP' : '');
  return { label, feature: feature || null };
}

/**
 * Считает карточку фильма более полной, если в ней появились жанры,
 * которых раньше не было. Пустой список жанров — надёжный признак того, что
 * кинотеатр не заполнил карточку до конца (в отличие от возрастного рейтинга:
 * «0+» само по себе законное значение для детского фильма, и по нему одному
 * не отличить недозаполненную карточку от настоящего мультфильма).
 */
function isMoreComplete(candidate: KinoplanRelease, current: MovieDto): boolean {
  return candidate.genres.length > 0 && current.genres.length === 0;
}

/**
 * Название фильма, приведённое к виду для сравнения.
 *
 * Каждый кинотеатр заводит фильм у себя руками, поэтому написание гуляет:
 * «Человек-паук» и «Человек паук», лишние пробелы, «ё» вместо «е». Без этого
 * один и тот же фильм показывался бы в расписании двумя карточками.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim();
}

function sameTitle(left: string, right: string): boolean {
  return normalizeTitle(left) === normalizeTitle(right);
}

/** Сегодняшняя дата в часовом поясе города, формат YYYY-MM-DD. */
function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
