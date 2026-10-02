/**
 * Возраст объявления для карточки: «Только что», «2 ч назад», «Вчера»,
 * «14 сентября». Чистая функция: «сейчас» приходит снаружи, поэтому один и
 * тот же момент даёт одну и ту же подпись и в приложении, и в тесте.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

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

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Свежее — относительно («5 мин назад», «3 ч назад»): на доске важно, что
 * объявление только что появилось. Старше суток — по календарю, потому что
 * «27 ч назад» никто не считает.
 */
export function formatListingAge(iso: string | Date, now: Date = new Date()): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const elapsed = now.getTime() - date.getTime();

  // Часы на телефоне и на сервере расходятся на секунды: «из будущего» — это «сейчас»
  if (elapsed < MINUTE) return 'Только что';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} мин назад`;
  if (sameDay(date, now) && elapsed < 6 * HOUR) return `${Math.floor(elapsed / HOUR)} ч назад`;
  if (sameDay(date, now)) return 'Сегодня';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Вчера';

  const month = MONTHS[date.getMonth()];
  return date.getFullYear() === now.getFullYear()
    ? `${date.getDate()} ${month}`
    : `${date.getDate()} ${month} ${date.getFullYear()}`;
}

/** «38», «1,2 тыс» — на узкой плитке длинное число не помещается. */
export function formatViewsShort(count: number): string {
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  return `${thousands < 10 ? thousands.toFixed(1).replace('.', ',') : Math.round(thousands)} тыс`;
}
