/**
 * Момент времени в часовом поясе города: «2026-09-18T21:09:15+03:00».
 *
 * Приложение читает часы прямо из строки, не пересчитывая их в пояс
 * телефона, — иначе человек в другом часовом поясе видел бы время не города,
 * а своё (так уже было с сеансами кино и временем обновления погоды).
 */
export function isoInTimezone(date: Date, timeZone: string): string {
  // Швейцарская локаль даёт ровно «ГГГГ-ММ-ДД ЧЧ:ММ:СС» без лишних букв
  const local = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(' ', 'T');

  const offsetName = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;

  // Для UTC формат отдаёт просто «GMT», без смещения
  const offset = offsetName?.replace('GMT', '') || '+00:00';

  return `${local}${offset}`;
}

/**
 * День недели момента в поясе города: 1 — понедельник … 7 — воскресенье.
 * Нумерация ISO, как в расписаниях заведений.
 */
export function weekdayInTimezone(date: Date, timeZone: string): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return order.indexOf(short) + 1;
}

/** Сколько минут прошло с полуночи в поясе города. */
export function minutesInTimezone(date: Date, timeZone: string): number {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const [hours, minutes] = time.split(':');

  return Number(hours) * 60 + Number(minutes);
}

/** Календарный день момента в поясе города, формат YYYY-MM-DD. */
export function dayInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
