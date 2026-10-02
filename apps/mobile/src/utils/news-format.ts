const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** Календарный день момента в поясе города, формат YYYY-MM-DD. */
function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * «Сегодня, 14:32» / «Вчера, 21:09» / «17 сентября, 09:15».
 *
 * Дата и время берутся прямо из строки вида «2026-09-18T21:09:15+03:00» — в ней
 * уже время города. Пересчитывать её через Date нельзя: телефон переведёт
 * время в свой пояс, и новость «вчера вечером» окажется «сегодня утром».
 * А вот «сегодня» определяется по поясу города, а не телефона.
 */
export function formatNewsDate(iso: string, timeZone: string, now: Date = new Date()): string {
  const day = iso.slice(0, 10);
  const time = iso.slice(11, 16);

  if (day === dayKey(now, timeZone)) return `Сегодня, ${time}`;
  if (day === dayKey(new Date(now.getTime() - 24 * 3_600_000), timeZone)) return `Вчера, ${time}`;

  const [year, month, date] = day.split('-').map(Number);
  const monthName = MONTHS[(month ?? 1) - 1] ?? '';
  const thisYear = Number(dayKey(now, timeZone).slice(0, 4));

  return `${date} ${monthName}${year !== thisYear ? ` ${year}` : ''}, ${time}`;
}
