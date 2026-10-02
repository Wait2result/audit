/**
 * Общие формы ответов API.
 * Один и тот же формат для всех списков и всех ошибок — приложению
 * не нужно знать особенности каждой рубрики.
 */

/** Ответ со списком (курсорная пагинация). */
export interface PaginatedResponse<T> {
  items: T[];
  /** Курсор для запроса следующей порции. null = список закончился. */
  nextCursor: string | null;
  /** Есть ли ещё записи */
  hasMore: boolean;
  /**
   * Общее количество. Может отсутствовать: на больших таблицах точный
   * подсчёт дорогой, и мы его намеренно не делаем.
   */
  total?: number;
}

/** Короткая карточка города для выбора на онбординге. */
export interface CityDto {
  id: string;
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isActive: boolean;
  /** Порядок отображения в списке выбора города */
  sortOrder: number;
}

/** Административный район города — есть не у каждого города. */
export interface DistrictDto {
  id: string;
  name: string;
  slug: string;
}

/** Файл (фото/видео), пригодный для показа. */
export interface MediaDto {
  id: string;
  url: string;
  /** Уменьшенная копия для списков — грузится в разы быстрее оригинала */
  thumbnailUrl: string | null;
  type: 'image' | 'video';
  width: number | null;
  height: number | null;
  /** Текстовое описание для незрячих пользователей и SEO */
  alt: string | null;
}

/** Текущая погода для выбранного города. */
export interface CurrentWeatherDto {
  /** Температура воздуха, °C */
  temperature: number;
  /** Ощущается как, °C */
  feelsLike: number;
  /** Код состояния погоды по стандарту WMO (0–99, как у Open-Meteo) */
  conditionCode: number;
  /** Человекочитаемое описание состояния на русском */
  conditionText: string;
  /** Вероятность осадков, % */
  precipitationProbability: number;
  /** Осадки за последний час, мм */
  precipitationMm: number;
  /** Скорость ветра, км/ч */
  windSpeedKmh: number;
  /** Порывы ветра, км/ч */
  windGustsKmh: number;
  /** Влажность воздуха, % */
  humidity: number;
  /** Атмосферное давление, гПа */
  pressureHpa: number;
  /** Облачность, % */
  cloudCoverPercent: number;
  /** УФ-индекс */
  uvIndex: number;
  /**
   * Сейчас светло или темно в самом городе (по восходу/закату там, а не по
   * времени на телефоне). Используется для оформления виджета погоды —
   * ночная тема после заката, дневная днём.
   */
  isDay: boolean;
  /** Восход, ISO-строка с учётом часового пояса города */
  sunrise: string;
  /** Закат, ISO-строка с учётом часового пояса города */
  sunset: string;
}

/**
 * Один час почасового прогноза.
 *
 * Набор полей намеренно такой же подробный, как у CurrentWeatherDto (кроме
 * восхода/заката — они не относятся к конкретному часу): по каждому часу
 * можно посмотреть УФ-индекс, влажность и остальные показатели, а не только
 * температуру.
 */
export interface HourlyForecastDto {
  /** Время часа, ISO-строка с учётом часового пояса города */
  time: string;
  temperature: number;
  feelsLike: number;
  conditionCode: number;
  conditionText: string;
  precipitationProbability: number;
  precipitationMm: number;
  windSpeedKmh: number;
  windGustsKmh: number;
  humidity: number;
  pressureHpa: number;
  cloudCoverPercent: number;
  uvIndex: number;
}

/**
 * Один день дневного прогноза.
 *
 * У Open-Meteo дневная сводка не включает влажность и давление (это
 * почасовые/текущие показатели без осмысленного «среднего за день»),
 * поэтому здесь их нет — но восход, закат, ветер, УФ и осадки за день есть.
 */
export interface DailyForecastDto {
  /** Дата, формат YYYY-MM-DD */
  date: string;
  tempMin: number;
  tempMax: number;
  feelsLikeMin: number;
  feelsLikeMax: number;
  conditionCode: number;
  conditionText: string;
  precipitationProbability: number;
  /** Суммарные осадки за день, мм */
  precipitationMm: number;
  windSpeedMaxKmh: number;
  windGustsMaxKmh: number;
  uvIndexMax: number;
  /** Восход, ISO-строка с учётом часового пояса города */
  sunrise: string;
  /** Закат, ISO-строка с учётом часового пояса города */
  sunset: string;
}

/**
 * Прогноз погоды для города (Этап 3 ТЗ).
 *
 * Источник данных скрыт за этой формой намеренно: сегодня это Open-Meteo,
 * завтра может стать другой провайдер — приложению это будет не видно.
 */
export interface WeatherDto {
  cityId: string;
  current: CurrentWeatherDto;
  /** Ближайшие ~48 часов */
  hourly: HourlyForecastDto[];
  /**
   * Сутки вперёд с шагом 15 минут — для ползунка времени на экране погоды.
   * Набор показателей тот же, что у часового прогноза.
   */
  quarterHourly: HourlyForecastDto[];
  /** Ближайшие 7 дней, включая сегодня */
  daily: DailyForecastDto[];
  /**
   * Когда данные реально были получены от источника — а не «сейчас».
   * Показывается на экране («Обновлено в HH:MM»), чтобы не выдавать
   * закешированный прогноз за только что полученный.
   *
   * По времени города, как и все остальные времена здесь: человек в другом
   * часовом поясе должен видеть время того города, погоду которого смотрит.
   */
  updatedAt: string;
  /** Обязательная атрибуция источника данных (требование лицензии Open-Meteo) */
  attribution: string;
}

/** Кинотеатр (Этап 4 ТЗ). */
export interface CinemaDto {
  id: string;
  cityId: string;
  name: string;
  address: string;
  phone: string | null;
  /** Сайт кинотеатра — источник данных о сеансах и место покупки билета */
  websiteUrl: string;
}

/** Фильм, идущий в кинотеатрах города. */
export interface MovieDto {
  /** Идентификатор фильма в системе кинотеатров — по нему запрашиваются
   * описание и трейлер (см. GET /cinema/movie) */
  id: number;
  title: string;
  posterUrl: string | null;
  /** Например «6+», «16+» */
  ageRating: string | null;
  genres: string[];
  durationMinutes: number | null;
}

/** Один сеанс конкретного фильма в конкретном кинотеатре. */
export interface ShowtimeDto {
  id: string;
  cinemaId: string;
  cinemaName: string;
  /** ISO-строка с учётом часового пояса города */
  startTime: string;
  /** «Зал 3», «Зал Синий» — нормализованное название, единое для всех кинотеатров */
  hallLabel: string | null;
  /** Особенность зала сверх номера: «Dolby Atmos», «VIP» — если её нет, null */
  hallFeature: string | null;
  format: string | null;
  /** Минимальная и максимальная цена билета, ₽ */
  priceMin: number;
  priceMax: number;
  /**
   * Ссылка на покупку билета именно на этот сеанс: открывается выбор мест
   * в нужном зале на нужное время. Это та же страница, которую показывает
   * сам сайт кинотеатра по нажатию на сеанс. Билеты продаёт кинотеатр,
   * мы только приводим человека к нужному месту.
   */
  buyUrl: string;
}

/** Фильм со всеми его сеансами на выбранную дату во всех кинотеатрах города. */
export interface MovieShowtimesDto {
  movie: MovieDto;
  showtimes: ShowtimeDto[];
}

/** Расписание кино на дату для города — пустой массив, если сеансов нет. */
export type CinemaScheduleDto = MovieShowtimesDto[];

/** Карточка фильма: то, что в расписании, плюс описание и трейлер. */
export interface MovieDetailsDto extends MovieDto {
  description: string | null;
  countries: string[];
  year: number | null;
  /**
   * Прямая ссылка на видео трейлера (mp4). Играется внутри приложения:
   * уводить человека на сторонний сайт ради просмотра не нужно.
   * null — трейлера у этого фильма нет.
   */
  trailerUrl: string | null;
  /** Кадр-заставка трейлера, пока видео не запущено */
  trailerThumbnailUrl: string | null;
}

/** Лента новостей: «Город» — только выбранный, «Дагестан» — во всех городах. */
export type NewsScope = 'city' | 'dagestan' | 'russia' | 'world';

/** Карточка новости в ленте (Этап 5 ТЗ). */
export interface NewsSummaryDto {
  id: string;
  title: string;
  /** Заключающая мысль — короткий лид из источника */
  lead: string | null;
  imageUrl: string | null;
  /** ISO-строка в поясе города: время читается прямо из строки, без пересчёта */
  publishedAt: string;
  scope: NewsScope;
  cityId: string | null;
  sourceName: string;
  sourceCategory: string | null;
  /** Адрес оригинала: ссылка на источник внизу статьи */
  url: string;
}

export interface NewsDetailsDto extends NewsSummaryDto {
  /** Полный текст обычными абзацами — HTML в приложение не отдаётся */
  paragraphs: string[];
}

/** Ответ health-check: используется мониторингом для проверки «сервер жив». */
export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  environment: string;
  uptimeSeconds: number;
  checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; message?: string }>;
}

/**
 * Разрешение на загрузку файла.
 *
 * Сервер выдаёт временную ссылку, по которой файл кладётся в хранилище
 * напрямую, минуя сервер приложения: гонять сто мегабайт через него —
 * значит занять его на всё время загрузки. После загрузки обязателен
 * шаг подтверждения, и только там файл проверяется по-настоящему.
 */
export interface UploadTicket {
  /** Идентификатор записи о файле — понадобится на шаге подтверждения */
  mediaId: string;
  /** Адрес, по которому файл отправляется методом PUT */
  uploadUrl: string;
  /** Через сколько секунд ссылка перестанет работать */
  expiresInSeconds: number;
  /** Заголовки, которые обязательно приложить к запросу загрузки */
  requiredHeaders: Record<string, string>;
}
