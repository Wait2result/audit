/**
 * Дата в часовом поясе города, а не телефона: расписание показывается по
 * времени кинотеатра. Иначе у человека в другом часовом поясе «Сегодня»
 * съезжает на соседний день — а ночью это происходит даже дома.
 */
export function toIsoDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Пояс по умолчанию — общий для всех наших городов, он же стоит в базе. */
export const DEFAULT_CITY_TIMEZONE = 'Europe/Moscow';
