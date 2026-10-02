import type { DailyForecastDto, HourlyForecastDto } from '@dagestan/shared';

import type { IconName } from '../components/Icon';

/** Один показатель в детальной карточке часа/дня — иконка, подпись, значение. */
export interface WeatherMetric {
  icon: IconName;
  label: string;
  value: string;
}

function round(value: number): number {
  return Math.round(value);
}

/** Время из ISO-строки вида «2026-09-16T11:00» — часовой пояс уже учтён сервером. */
export function formatHour(iso: string): string {
  return iso.slice(11, 16);
}

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WEEKDAYS_FULL = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
];

/** День недели по дате «2026-09-16». Полдень — чтобы не пересечь полночь из-за
 * разницы часовых поясов устройства и города. */
function dateOf(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

export function formatWeekdayShort(date: string): string {
  return WEEKDAYS[dateOf(date).getDay()] ?? '';
}

/** «Среда, 16 сентября» — заголовок детальной карточки дня. */
export function formatDayTitle(date: string): string {
  const d = dateOf(date);
  const day = WEEKDAYS_FULL[d.getDay()] ?? '';
  const formatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return `${day}, ${formatted}`;
}

/** Показатели часа для детальной карточки — тот же набор, что и у «сейчас». */
export function buildHourMetrics(hour: HourlyForecastDto): WeatherMetric[] {
  return [
    {
      icon: 'rain',
      label: 'Осадки',
      value: `${hour.precipitationProbability}% · ${hour.precipitationMm} мм`,
    },
    {
      icon: 'wind',
      label: 'Ветер',
      value: `${round(hour.windSpeedKmh)} км/ч, порывы до ${round(hour.windGustsKmh)}`,
    },
    { icon: 'humidity', label: 'Влажность', value: `${hour.humidity}%` },
    { icon: 'pressure', label: 'Давление', value: `${round(hour.pressureHpa)} гПа` },
    { icon: 'cloud', label: 'Облачность', value: `${hour.cloudCoverPercent}%` },
    { icon: 'sun', label: 'УФ-индекс', value: round(hour.uvIndex).toString() },
  ];
}

/** Показатели дня для детальной карточки — без влажности и давления: у
 * Open-Meteo это почасовые показатели, за сутки осмысленного среднего нет. */
export function buildDayMetrics(day: DailyForecastDto): WeatherMetric[] {
  return [
    {
      icon: 'rain',
      label: 'Осадки',
      value: `${day.precipitationProbability}% · ${day.precipitationMm} мм`,
    },
    {
      icon: 'wind',
      label: 'Ветер',
      value: `до ${round(day.windSpeedMaxKmh)} км/ч, порывы до ${round(day.windGustsMaxKmh)}`,
    },
    { icon: 'sun', label: 'УФ-индекс', value: round(day.uvIndexMax).toString() },
    { icon: 'sunrise', label: 'Восход', value: formatHour(day.sunrise) },
    { icon: 'sunset', label: 'Закат', value: formatHour(day.sunset) },
  ];
}
