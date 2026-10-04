import { Injectable } from '@nestjs/common';
import type {
  CinemaScheduleDto,
  SmartSearchClarification,
  SmartSearchIntentCore,
} from '@dagestan/shared';

import { CinemaService } from '../../cinema/cinema.service.js';
import { resolvePlace, cityOptions } from '../normalize/location.js';
import { containsAllStems, norm, words } from '../normalize/text.js';
import { daysBetween, localTimeOf, resolveDay, timeWindow, todayIn } from '../normalize/time.js';
import type {
  DomainAdapter,
  DomainRequestContext,
  ExecuteOutcome,
  NormalizeOutcome,
} from './domain-adapter.js';
import { emptyQuery } from './domain-adapter.js';

/** Сколько дней вперёд у кинотеатров обычно есть расписание. */
const MAX_DAYS_AHEAD = 14;

export const CINEMA_FILTER_KEYS = ['movie', 'genre', 'cinema', 'format'] as const;

export interface CinemaPlan {
  cityId: string;
  date: string;
  window: { from: string; to: string } | null;
  movie: string | null;
  genre: string | null;
  cinema: string | null;
  format: string | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Слова, которые не являются названием фильма: «кино», «фильмы сегодня», «что идёт». */
const GENERIC_CINEMA_WORDS = new Set([
  'кино',
  'фильм',
  'фильмы',
  'фильмов',
  'фильма',
  'сеанс',
  'сеансы',
  'сеансов',
  'кинотеатр',
  'кинотеатры',
  'что',
  'идет',
  'идёт',
  'посмотреть',
  'смотреть',
  'сегодня',
  'завтра',
  'вечером',
  'утром',
  'днем',
  'днём',
  'ночью',
  'новинки',
  'афиша',
  'показывают',
  'где',
  'есть',
  'ли',
  'в',
  'на',
  'после',
  'до',
]);

/**
 * Название фильма из слов запроса, если модель не положила его в filters.movie
 * (реальный ответ Qwen3: «Есть ли сегодня Форсаж?» → query «Форсаж»).
 * Общие слова («кино», «фильмы сегодня») фильмом не становятся.
 */
export function movieFromQuery(query: string | null): string | null {
  if (!query) return null;
  const rest = words(query).filter((word) => !GENERIC_CINEMA_WORDS.has(word) && !/^\d/.test(word));
  return rest.length > 0 ? rest.join(' ') : null;
}

/** Минуты от начала дня расписания: сеанс в 00:10 следующих суток — это 24:10. */
function minutesInScheduleDay(startTime: string, date: string): number {
  const [hours, minutes] = localTimeOf(startTime).split(':').map(Number) as [number, number];
  const nextDay = startTime.slice(0, 10) > date;
  return (nextDay ? 24 * 60 : 0) + hours * 60 + minutes;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** Намерение «кино» → город, дата, время и что искать в расписании. */
export function normalizeCinema(
  intent: SmartSearchIntentCore,
  context: DomainRequestContext,
): NormalizeOutcome<CinemaPlan> {
  const query = emptyQuery('cinema', intent);

  const place = resolvePlace(intent, context, { allowRegion: false });
  if (place.kind === 'clarify')
    return { kind: 'clarify', query, clarification: place.clarification };
  if (place.kind !== 'city') {
    return {
      kind: 'clarify',
      query,
      clarification: {
        reason: 'city_required',
        question: 'В каком городе смотреть кино?',
        options: cityOptions(context.cities),
      },
    };
  }
  const city = place.city;
  query.location = { cityId: city.id, cityName: city.name, mode: place.mode };

  const today = todayIn(city.timezone, context.now);
  let date = resolveDay(intent.time?.date ?? null, city.timezone, context.now) ?? today;
  const ahead = daysBetween(today, date);
  if (ahead < 0 || ahead > MAX_DAYS_AHEAD) {
    query.ignored.push({ field: 'date', reason: 'Расписание есть только на ближайшие две недели' });
    date = today;
  }
  const window = timeWindow(intent.time);
  query.time = { date, from: window?.from ?? null, to: window?.to ?? null };
  query.conditions.push({ field: 'date', label: 'Дата', value: date, display: date });
  if (window)
    query.conditions.push({ field: 'time', label: 'Время', value: window, display: window.label });

  // Пожелания в кино не сужают расписание: «желательно IMAX» — подсказка, а не фильтр
  for (const key of Object.keys(intent.preferences)) {
    query.ignored.push({ field: key, reason: 'Пожелание не сужает расписание' });
  }

  const plan: CinemaPlan = {
    cityId: city.id,
    date,
    window: window ? { from: window.from, to: window.to } : null,
    // «Фильмы», «кино» в поле фильма — не название (реальный ответ Qwen3: movie «фильмы»)
    movie: movieFromQuery(text(intent.filters.movie)) ?? movieFromQuery(intent.query),
    genre: text(intent.filters.genre),
    cinema: text(intent.filters.cinema),
    format: text(intent.filters.format),
  };
  for (const [field, label, value] of [
    ['movie', 'Фильм', plan.movie],
    ['genre', 'Жанр', plan.genre],
    ['cinema', 'Кинотеатр', plan.cinema],
    ['format', 'Формат', plan.format],
  ] as const) {
    if (value) query.conditions.push({ field, label, value, display: value });
  }
  query.params = { cityId: city.id, date };
  return { kind: 'ready', plan, query };
}

/**
 * Отбор по расписанию, которое вернул существующий сервис кино. Данные не
 * копируются и не придумываются: из реального расписания убирается то, что
 * не подходит. Несколько разных фильмов под одно название («Форсаж») —
 * уточнение с их реальными названиями.
 */
export function filterSchedule(
  schedule: CinemaScheduleDto,
  plan: CinemaPlan,
): { schedule: CinemaScheduleDto } | { clarification: SmartSearchClarification } {
  let movies = schedule;

  if (plan.movie) {
    const matched = movies.filter((item) => containsAllStems(item.movie.title, plan.movie!));
    const titles = [...new Set(matched.map((item) => item.movie.title))];
    if (titles.length > 1 && !titles.some((title) => norm(title) === norm(plan.movie!))) {
      return {
        clarification: {
          reason: 'ambiguous_movie',
          question: 'Какой фильм нужен?',
          options: titles
            .slice(0, 6)
            .map((title) => ({ label: title, value: title, kind: 'movie' })),
        },
      };
    }
    const exact = matched.filter((item) => norm(item.movie.title) === norm(plan.movie!));
    movies = exact.length > 0 ? exact : matched;
  }
  if (plan.genre) {
    movies = movies.filter((item) =>
      item.movie.genres.some((genre) => containsAllStems(genre, plan.genre!)),
    );
  }

  return {
    schedule: movies
      .map((item) => ({
        movie: item.movie,
        showtimes: item.showtimes.filter((showtime) => {
          // Ночной сеанс (00:10 следующих суток) — продолжение дня расписания:
          // «после 20:00» его включает, а не теряет
          const time = minutesInScheduleDay(showtime.startTime, plan.date);
          const to =
            plan.window && plan.window.to === '23:59'
              ? 30 * 60
              : plan.window
                ? toMinutes(plan.window.to)
                : 0;
          return (
            (!plan.window || (time >= toMinutes(plan.window.from) && time <= to)) &&
            (!plan.cinema || containsAllStems(showtime.cinemaName, plan.cinema)) &&
            (!plan.format ||
              containsAllStems(
                `${showtime.format ?? ''} ${showtime.hallFeature ?? ''}`,
                plan.format,
              ))
          );
        }),
      }))
      .filter((item) => item.showtimes.length > 0),
  };
}

/** Кино: расписание — `CinemaService.getSchedule`, то же, что у экрана «Кино». */
@Injectable()
export class CinemaSearchAdapter implements DomainAdapter<CinemaPlan> {
  readonly domain = 'cinema' as const;
  readonly label = 'Кино';

  constructor(private readonly cinema: CinemaService) {}

  promptSection(): Promise<string> {
    return Promise.resolve(
      [
        'cinema — расписание кинотеатров городов приложения: какие фильмы идут, где и когда.',
        `  Фильтры: ${CINEMA_FILTER_KEYS.join(', ')} (movie — название фильма как написал человек).`,
        '  Дата — в time.date ("today", "tomorrow" или ГГГГ-ММ-ДД), время — time.from/time.to или time.period.',
      ].join('\n'),
    );
  }

  allowedFilterKeys(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(CINEMA_FILTER_KEYS));
  }

  normalize(
    intent: SmartSearchIntentCore,
    context: DomainRequestContext,
  ): Promise<NormalizeOutcome<CinemaPlan>> {
    return Promise.resolve(normalizeCinema(intent, context));
  }

  async execute(plan: CinemaPlan, context: DomainRequestContext): Promise<ExecuteOutcome> {
    const schedule = await this.cinema.getSchedule(plan.cityId, plan.date);
    const filtered = filterSchedule(schedule, plan);
    if ('clarification' in filtered)
      return { kind: 'clarify', clarification: filtered.clarification };
    const limited = filtered.schedule.slice(0, context.limit);
    return {
      kind: 'results',
      results: { domain: 'cinema', cityId: plan.cityId, date: plan.date, schedule: limited },
      count: limited.length,
      total: filtered.schedule.length,
    };
  }
}
