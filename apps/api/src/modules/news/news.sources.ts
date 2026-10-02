import type { NewsScope } from '@dagestan/shared';

/**
 * Белый список источников новостей (Этап 5).
 *
 * Достоверность обеспечивается прежде всего выбором источников: только
 * крупные федеральные агентства и издания, официальные и республиканские
 * издания. Набор задаёт редакционную позицию лент, поэтому меняется правкой
 * этого файла — добавить источник значит добавить одну запись.
 */

export type SourceRole =
  /** Новости Дагестана: классифицируются на «город» / «Дагестан» */
  | 'dagestan'
  /** Федеральное издание: ленты «Россия» и «Мир» */
  | 'national'
  /** Только подтверждает чужие новости, сам не показывается */
  | 'corroboration';

/** Страница рубрики издания: её заметки приходят с меткой рубрики. */
export interface RubricPage {
  /** Путь на сайте издания: `/news/politics` */
  path: string;
  /** Рубрика в нашем виде: по ней работают баллы значимости */
  label: string;
}

export interface NewsSource {
  id: string;
  name: string;
  feedUrl: string;
  role: SourceRole;
  /**
   * Откуда берётся полный текст новости:
   *   'feed'    — лента отдаёт его сама (формат Яндекс.Новостей, для перепечатки);
   *   'article' — читаем страницу статьи;
   *   null      — полного текста нет, источник только подтверждает чужие новости.
   *
   * Показываем только те новости, у которых полный текст открывается в
   * приложении, поэтому у всех показываемых источников это поле заполнено.
   */
  fullText: 'feed' | 'article' | null;
  /**
   * Можно ли брать картинку превью со страницы статьи (og:image). У Интерфакса
   * там готовая карточка для соцсетей с заголовком, вшитым в картинку, —
   * заголовок дублировался бы. Там, где страницы обычно с фото, отсутствие
   * картинки в ленте не считается «нет фото»: она подтянется со страницы.
   */
  previewImage: boolean;
  /**
   * Местное издание: все его новости — про этот город (slug из таблицы City).
   * Такая заметка попадает в городскую ленту, если не имеет республиканского
   * масштаба, даже когда название города в заголовке не упомянуто.
   */
  homeCity?: string;
  /**
   * У издания есть страницы по городам (`/news/g_<slug>`), где редакция сама
   * помечает новости городом. Используем эту разметку вместо угадывания по
   * заголовку.
   */
  cityPages?: boolean;
  /**
   * Страницы рубрик издания. Лента держит лишь последние ~50 заметок (2–3
   * дня), а страницы рубрик уходят глубже — так лента новостей получается
   * длиннее, чем на один-два дня.
   */
  rubricPages?: readonly RubricPage[];
  /**
   * Издание пишет о всём Кавказе: берём только заметки, где упомянут Дагестан
   * или его города.
   */
  requireMention?: boolean;
}

export const NEWS_SOURCES: readonly NewsSource[] = [
  {
    id: 'ria-dagestan',
    name: 'РИА «Дагестан»',
    feedUrl: 'https://riadagestan.ru/rss',
    role: 'dagestan',
    fullText: 'feed',
    previewImage: true,
    cityPages: true,
    rubricPages: [
      { path: '/news/politics', label: 'Политика' },
      { path: '/news/president', label: 'Политика' },
      { path: '/news/the_government_of_the', label: 'Политика' },
      { path: '/news/economy', label: 'Экономика' },
      { path: '/news/selskoe_khozyaystvo', label: 'Экономика' },
      { path: '/news/society', label: 'Общество' },
      { path: '/news/health', label: 'Общество' },
      { path: '/news/education', label: 'Общество' },
      { path: '/news/incidents', label: 'Происшествия' },
      { path: '/news/investigation_and_courts', label: 'Происшествия' },
      { path: '/news/culture', label: 'Культура' },
      { path: '/news/tourism_events', label: 'Туризм' },
    ],
  },
  {
    id: 'aif-dagestan',
    name: 'АиФ Дагестан',
    feedUrl: 'https://dag.aif.ru/rss/all.php',
    role: 'dagestan',
    fullText: 'feed',
    previewImage: false,
  },
  {
    id: 'vestnik-kavkaza',
    name: 'Вестник Кавказа',
    feedUrl: 'https://vestikavkaza.ru/rss',
    role: 'dagestan',
    fullText: 'feed',
    previewImage: false,
    requireMention: true,
  },
  {
    id: 'midag',
    name: '«Махачкалинские известия»',
    feedUrl: 'https://midag.ru/rss',
    role: 'dagestan',
    fullText: 'feed',
    previewImage: true,
    homeCity: 'makhachkala',
  },
  {
    id: 'kaspiy-media',
    name: '«Каспий-Медиа»',
    feedUrl: 'https://kaspiy-media.ru/rss',
    role: 'dagestan',
    fullText: 'feed',
    previewImage: true,
    homeCity: 'kaspiysk',
  },
  {
    id: 'derbend',
    name: 'Портал «Дербент»',
    feedUrl: 'https://derbend.ru/rss',
    role: 'dagestan',
    fullText: 'article',
    previewImage: true,
  },
  {
    id: 'dagpravda',
    name: '«Дагестанская правда»',
    feedUrl: 'https://dagpravda.ru/rss',
    role: 'dagestan',
    fullText: 'feed',
    previewImage: true,
  },
  {
    id: 'lenta',
    name: 'Лента.ру',
    feedUrl: 'https://lenta.ru/rss/news',
    role: 'national',
    fullText: 'article',
    previewImage: false,
  },
  {
    id: 'kommersant',
    name: 'Коммерсантъ',
    feedUrl: 'https://www.kommersant.ru/RSS/news.xml',
    role: 'national',
    fullText: 'article',
    // Фото — из ленты; og:image у Коммерсанта — карточка для соцсетей
    previewImage: false,
  },
  {
    id: 'interfax',
    name: 'Интерфакс',
    feedUrl: 'https://www.interfax.ru/rss.asp',
    role: 'corroboration',
    fullText: null,
    previewImage: false,
  },
  {
    id: 'tass',
    name: 'ТАСС',
    feedUrl: 'https://tass.ru/rss/v2.xml',
    role: 'corroboration',
    fullText: null,
    previewImage: false,
  },
  {
    id: 'rbc',
    name: 'РБК',
    feedUrl: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss',
    role: 'corroboration',
    fullText: null,
    previewImage: false,
  },
  {
    id: 'vedomosti',
    name: 'Ведомости',
    feedUrl: 'https://www.vedomosti.ru/rss/news',
    role: 'corroboration',
    fullText: null,
    previewImage: false,
  },
  {
    id: 'rg',
    name: 'Российская газета',
    feedUrl: 'https://rg.ru/xml/index.xml',
    role: 'corroboration',
    fullText: null,
    previewImage: false,
  },
  {
    id: 'izvestia',
    name: 'Известия',
    feedUrl: 'https://iz.ru/xml/rss/all.xml',
    role: 'corroboration',
    fullText: null,
    previewImage: false,
  },
  {
    id: 'kp',
    name: 'Комсомольская правда',
    feedUrl: 'https://www.kp.ru/rss/allsections.xml',
    role: 'corroboration',
    fullText: null,
    previewImage: false,
  },
  {
    id: 'mk',
    name: 'Московский комсомолец',
    feedUrl: 'https://www.mk.ru/rss/news/index.xml',
    role: 'corroboration',
    fullText: null,
    previewImage: false,
  },
  {
    id: 'ria',
    name: 'РИА Новости',
    feedUrl: 'https://ria.ru/export/rss2/archive/index.xml',
    role: 'corroboration',
    fullText: null,
    previewImage: false,
  },
];

/** Лимиты и пороги отбора «самого интересного» — в одном месте. */
export const NEWS_LIMITS = {
  /**
   * Минимальные баллы значимости, чтобы новость Дагестана попала в ленту.
   * Два балла — это заметка с фото; без порога-минимума в ленту не попадают
   * заметки без фото и без единого признака значимости.
   */
  minScore: 2,
  /** Сколько новостей одной ленты сохраняем за сутки (лучшие по баллам) */
  perDay: { dagestan: 30, city: 15, russia: 30, world: 30 } as Record<string, number>,
  /** Сколько однотипных заметок одной рубрики допускаем за сутки */
  perRubricPerDay: 4,
  /** Сколько агентств должно подтвердить федеральную новость */
  minCorroboration: 2,
  /** Окно, в котором заметки разных агентств считаются об одном событии */
  corroborationWindowHours: 12,
  /** За какой срок пересчитываем подтверждения и отбираем федеральные новости */
  federalWindowHours: 72,
  /** Новости старше этого срока не показываются: лента должна быть свежей */
  maxAgeDays: 4,
  /** Сколько дней хранить: не меньше срока сбора, иначе заметки будут удаляться и добавляться заново */
  retentionDays: 7,
  /** Сколько новостей за один забор дополняем картинкой со страницы статьи */
  imageEnrichPerRun: 40,
  /** Сколько страниц статей за один забор читаем ради полного текста */
  articleFetchPerRun: 40,
  /** Одновременных запросов к страницам статей: вежливо к источнику и быстро для нас */
  fetchConcurrency: 4,
  /** На сколько минут запоминаем списки рубрик: их читать чаще нет смысла */
  listingCacheMinutes: 25,
} as const;

export const SCOPE_LABELS: Record<NewsScope, string> = {
  city: 'Город',
  dagestan: 'Дагестан',
  russia: 'Россия',
  world: 'Мир',
};
