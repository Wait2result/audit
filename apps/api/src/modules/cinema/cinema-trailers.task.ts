import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CinemaService } from './cinema.service.js';

/**
 * Поиск трейлеров к новым фильмам — сам, без участия человека.
 *
 * Зачем задача, если трейлер и так подгружается по нажатию: у только
 * вышедшего фильма кинотеатр заполняет карточку не сразу — сеансы уже есть,
 * а трейлера ещё нет. Задача раз в три часа обходит афишу и дозапрашивает
 * недостающее, поэтому к моменту, когда человек откроет фильм, трейлер
 * обычно уже найден и лежит в кеше.
 *
 * Отдельного расписания у задачи нет: она опирается на тот же CinemaService,
 * что и экран, — то есть ищет теми же способами, включая поиск у соседних
 * кинотеатров, если у своего карточка пустая.
 */
@Injectable()
export class CinemaTrailersTask {
  private readonly logger = new Logger(CinemaTrailersTask.name);

  /** Сколько дней афиши просматривать вперёд */
  private static readonly DAYS_AHEAD = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cinema: CinemaService,
  ) {}

  @Cron(CronExpression.EVERY_3_HOURS, { name: 'cinema-trailers' })
  async refreshTrailers(): Promise<void> {
    const cities = await this.prisma.city.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, timezone: true },
    });

    let checked = 0;
    let withTrailer = 0;

    for (const city of cities) {
      for (const date of datesAhead(city.timezone, CinemaTrailersTask.DAYS_AHEAD)) {
        let schedule;
        try {
          schedule = await this.cinema.getSchedule(city.id, date);
        } catch (err) {
          this.logger.warn({ err, city: city.name, date }, 'Не удалось получить афишу');
          continue;
        }

        for (const { movie } of schedule) {
          try {
            const details = await this.cinema.getMovie(city.id, movie.id);
            checked += 1;
            if (details.trailerUrl) withTrailer += 1;
          } catch (err) {
            this.logger.warn({ err, movie: movie.title }, 'Не удалось получить карточку фильма');
          }
        }
      }
    }

    this.logger.log(`Трейлеры: проверено фильмов ${checked}, с трейлером ${withTrailer}`);
  }
}

/** Сегодня и следующие дни в часовом поясе города, формат YYYY-MM-DD. */
function datesAhead(timezone: string, days: number): string[] {
  const now = Date.now();

  return Array.from({ length: days }, (_, offset) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(now + offset * 24 * 60 * 60 * 1000)),
  );
}
