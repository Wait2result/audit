import type { SmartSearchDayPeriod, SmartSearchIntentCore } from '@dagestan/shared';

/**
 * Время суток словами — официальное правило умного поиска, а не догадка
 * модели: модель возвращает только «evening», границы задаёт сервер.
 * Показывается человеку в применённых условиях («вечер, с 17:00»).
 */
export const DAY_PERIOD_WINDOWS: Readonly<
  Record<SmartSearchDayPeriod, { from: string; to: string; label: string }>
> = {
  morning: { from: '06:00', to: '11:59', label: 'утро' },
  day: { from: '12:00', to: '16:59', label: 'день' },
  evening: { from: '17:00', to: '23:59', label: 'вечер' },
  night: { from: '22:00', to: '23:59', label: 'ночь' },
};

/** Сегодняшняя дата в поясе города: «2026-10-03». */
export function todayIn(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function shift(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Сколько дней между двумя датами «ГГГГ-ММ-ДД». */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000,
  );
}

/** «today» / «tomorrow» / дата → дата в поясе города; неверная дата — null. */
export function resolveDay(
  day: NonNullable<SmartSearchIntentCore['time']>['date'],
  timezone: string,
  now: Date,
): string | null {
  const today = todayIn(timezone, now);
  switch (day) {
    case null:
      return null;
    case 'today':
      return today;
    case 'tomorrow':
      return shift(today, 1);
    case 'day_after_tomorrow':
      return shift(today, 2);
    case 'yesterday':
      return shift(today, -1);
    default: {
      const parsed = new Date(`${day}T12:00:00Z`);
      return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day
        ? null
        : day;
    }
  }
}

/** Окно времени: явные «с 19:00» важнее слова «вечером». */
export function timeWindow(
  time: SmartSearchIntentCore['time'],
): { from: string; to: string; label: string } | null {
  if (!time) return null;
  const period = time.period ? DAY_PERIOD_WINDOWS[time.period] : null;
  const from = time.from ?? period?.from ?? null;
  const to = time.to ?? period?.to ?? null;
  if (!from && !to) return null;
  const parts = [
    period && !time.from && !time.to ? period.label : null,
    from ? `с ${from}` : null,
    to && to !== '23:59' ? `до ${to}` : null,
  ].filter(Boolean);
  return { from: from ?? '00:00', to: to ?? '23:59', label: parts.join(', ') };
}

/** Время «ЧЧ:ММ» из ISO-строки с поясом города («2026-10-03T19:30:00+03:00»). */
export function localTimeOf(iso: string): string {
  return iso.slice(11, 16);
}
