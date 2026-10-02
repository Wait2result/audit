/**
 * Часы работы заведения.
 *
 * Время хранится минутами от полуночи, и закрытие может быть больше 1440:
 * заведение, работающее до 02:00, — это `closesMinute = 1560`. Благодаря
 * этому «работает за полночь» перестаёт быть особым случаем: интервал всегда
 * возрастающий, а проверка — обычное сравнение чисел.
 *
 * Все вычисления идут в часовом поясе города, а не телефона: человек в
 * другом поясе должен видеть время заведения (эта ошибка уже случалась
 * с сеансами кино и временем обновления погоды).
 */

const MINUTES_IN_DAY = 1440;

export interface ScheduleDay {
  /** 1 — понедельник … 7 — воскресенье (как в ISO) */
  weekday: number;
  isClosed: boolean;
  opensMinute: number;
  closesMinute: number;
}

/** «09:00» → 540. Ничего не разбирает молча: неверная строка — исключение. */
export function minutesFromTime(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`Некорректное время: ${time}`);

  return Number(match[1]) * 60 + Number(match[2]);
}

/** 1560 → «02:00»: минуты за пределами суток показываются временем суток. */
export function timeFromMinutes(minute: number): string {
  const normalized = ((minute % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hours = Math.floor(normalized / 60);

  return `${String(hours).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

/**
 * Закрытие раньше открытия в форме означает работу за полночь: «10:00 → 02:00»
 * превращается в 600 → 1560. Равные значения — круглосуточно.
 */
export function closingMinute(opensMinute: number, closesMinute: number): number {
  return closesMinute <= opensMinute ? closesMinute + MINUTES_IN_DAY : closesMinute;
}

/** Предыдущий день недели: у воскресенья это суббота, а не «нулевой день». */
function previousWeekday(weekday: number): number {
  return weekday === 1 ? 7 : weekday - 1;
}

export interface OpenState {
  isOpenNow: boolean;
  /** Готовая строка для карточки: «Открыто до 23:00» или «Откроется в 09:00» */
  label: string;
}

/**
 * Работает ли заведение в указанный момент.
 *
 * Проверяются два дня: сегодняшний и вчерашний — вчерашняя смена может
 * тянуться в сегодняшнее утро («до 02:00»).
 */
export function openStateAt(
  days: readonly ScheduleDay[],
  weekday: number,
  minute: number,
): OpenState {
  const today = days.find((day) => day.weekday === weekday);
  const yesterday = days.find((day) => day.weekday === previousWeekday(weekday));

  if (today && !today.isClosed) {
    const closes = closingMinute(today.opensMinute, today.closesMinute);
    if (minute >= today.opensMinute && minute < closes) {
      return { isOpenNow: true, label: `Открыто до ${timeFromMinutes(today.closesMinute)}` };
    }
  }

  // Вчерашняя смена, перешедшая за полночь: сегодняшние минуты сдвигаем на сутки
  if (yesterday && !yesterday.isClosed) {
    const closes = closingMinute(yesterday.opensMinute, yesterday.closesMinute);
    if (closes > MINUTES_IN_DAY && minute + MINUTES_IN_DAY < closes) {
      return { isOpenNow: true, label: `Открыто до ${timeFromMinutes(yesterday.closesMinute)}` };
    }
  }

  return { isOpenNow: false, label: closedLabel(days, weekday, minute) };
}

/** «Откроется в 09:00» — ближайшее открытие в пределах недели. */
function closedLabel(days: readonly ScheduleDay[], weekday: number, minute: number): string {
  const today = days.find((day) => day.weekday === weekday);
  if (today && !today.isClosed && minute < today.opensMinute) {
    return `Откроется в ${timeFromMinutes(today.opensMinute)}`;
  }

  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const next = days.find((day) => day.weekday === ((weekday + ahead - 1) % 7) + 1);
    if (next && !next.isClosed) {
      const dayName = ahead === 1 ? 'завтра' : WEEKDAY_NAMES[next.weekday];
      return `Откроется ${dayName} в ${timeFromMinutes(next.opensMinute)}`;
    }
  }

  return 'Закрыто';
}

const WEEKDAY_NAMES: Record<number, string> = {
  1: 'в понедельник',
  2: 'во вторник',
  3: 'в среду',
  4: 'в четверг',
  5: 'в пятницу',
  6: 'в субботу',
  7: 'в воскресенье',
};
