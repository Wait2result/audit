const MONTHS_GENITIVE = [
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

/** «сентября 2026» — для строки «На площадке с сентября 2026». */
export function formatMemberSince(iso: string): string {
  const date = new Date(iso);
  return `${MONTHS_GENITIVE[date.getMonth()] ?? ''} ${date.getFullYear()}`.trim();
}
