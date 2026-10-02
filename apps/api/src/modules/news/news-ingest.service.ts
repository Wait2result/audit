import { Injectable, Logger } from '@nestjs/common';
import type { NewsScope } from '@dagestan/shared';

import { dayInTimezone } from '../../common/utils/timezone.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { isAdvertising, isPaidCategory } from './ads.js';
import { extractArticle } from './article.js';
import { articleKey, parseListing } from './listing.js';
import { findDuplicates } from './dedupe.js';
import {
  classifyDagestan,
  classifyNational,
  sameStory,
  specialRubric,
  stems,
  type CityRef,
} from './news-classifier.js';
import { NEWS_LIMITS, NEWS_SOURCES, type NewsSource } from './news.sources.js';
import { extractPageImage } from './page-image.js';
import { parseFeed, type RawFeedItem } from './rss.js';

// Только латиница: HTTP-заголовки не принимают кириллицу, и запрос падает до отправки
const USER_AGENT = 'DagestanApp/1.0 (news aggregator; reads public RSS feeds)';
const LOCK_KEY = 'news:ingest:lock';
/** Сбор может идти дольше минуты: блокировка держится с запасом и снимается по окончании */
const LOCK_TTL_SECONDS = 300;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Все наши города в одном часовом поясе; день новости считаем по нему */
const DEFAULT_TIMEZONE = 'Europe/Moscow';

/**
 * Заметки старше этого срока не берём вовсе: в приложении показываются новости не
 * старше `maxAgeDays`, а запас в сутки нужен, чтобы заметка не пропадала на границе.
 */
const COLLECT_DAYS = NEWS_LIMITS.maxAgeDays + 1;

/** Город со slug: по нему строится адрес страницы города «/news/g_<slug>» */
type CityRow = CityRef & { slug: string };

/** Заметка со страницы города или рубрики: редакция сама её разметила. */
interface Listed {
  item: RawFeedItem;
  city?: CityRow;
  category?: string;
}

interface Candidate {
  source: NewsSource;
  item: RawFeedItem;
  scope: NewsScope | null;
  cityId: string | null;
  score: number;
  lead: string | null;
  body: string | null;
}

export interface IngestReport {
  skipped: boolean;
  created: number;
  sources: Record<string, string>;
}

/**
 * Сбор новостей из внешних лент (Этап 5).
 *
 * Устойчивость важнее полноты: падение одного источника не должно ни
 * ломать остальные, ни ронять сервер — поэтому каждый источник забирается
 * отдельно, а любая ошибка превращается в строку отчёта.
 */
@Injectable()
export class NewsIngestService {
  private readonly logger = new Logger(NewsIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async run(): Promise<IngestReport> {
    // Запуск по расписанию может наложиться на запуск при старте сервера
    const locked = await this.redis.client.set(LOCK_KEY, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
    if (!locked) return { skipped: true, created: 0, sources: {} };

    try {
      return await this.ingest();
    } finally {
      await this.redis.del(LOCK_KEY);
    }
  }

  private async ingest(): Promise<IngestReport> {
    const cities = await this.prisma.city.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, slug: true },
    });

    const sources: Record<string, string> = {};
    const candidates = await this.collect(cities, sources);

    const created = await this.store(candidates);
    await this.purgeAdvertising();
    await this.recountCorroboration();
    await this.curateFederal();
    // Повторы убираем до чтения страниц: незачем скачивать текст копии
    await this.removeDuplicates();
    await this.enrichArticles();
    await this.enrichImages();
    // …и после: у заметок появились лиды и фото, и сравнение стало точнее
    await this.removeDuplicates();
    await this.cleanup();

    this.logger.log({ created, sources }, 'Новости обновлены');
    return { skipped: false, created, sources };
  }

  // ── Забор и классификация ─────────────────────────────────────────────────

  private async collect(cities: CityRow[], report: Record<string, string>): Promise<Candidate[]> {
    const fetched = await Promise.allSettled(
      NEWS_SOURCES.map(async (source) => ({
        source,
        items: parseFeed(await this.fetchText(source.feedUrl, 10_000, 3_000_000)),
        listed: await this.fetchListings(source, cities),
      })),
    );

    const dagestan: Candidate[] = [];
    const rest: Candidate[] = [];
    const federalSince = Date.now() - NEWS_LIMITS.federalWindowHours * HOUR;
    const collectSince = Date.now() - COLLECT_DAYS * DAY;

    fetched.forEach((result, index) => {
      const source = NEWS_SOURCES[index];
      if (!source) return;

      if (result.status === 'rejected') {
        report[source.id] = 'ошибка забора';
        this.logger.warn({ err: result.reason, source: source.id }, 'Лента недоступна');
        return;
      }

      const { items: feedItems, listed } = result.value;

      // Заметки со страниц городов и рубрик, которых нет в основной ленте
      // (лента держит только последние ~50), добавляем отсюда
      const inFeed = new Set(feedItems.map((item) => articleKey(item.url)));
      const items = [
        ...feedItems,
        ...[...listed.entries()].filter(([key]) => !inFeed.has(key)).map(([, entry]) => entry.item),
      ];

      report[source.id] = `записей: ${items.length}`;
      const home = source.homeCity
        ? cities.find((city) => city.slug === source.homeCity)
        : undefined;

      for (const item of items) {
        // Старые заметки не нужны: в приложении их не покажут. У федеральных записей
        // срок ещё короче — окно подтверждения, иначе их сразу удалила бы очистка
        if (
          item.publishedAt.getTime() < (source.role === 'dagestan' ? collectSince : federalSince)
        ) {
          continue;
        }

        const tag = listed.get(articleKey(item.url));
        const category = item.category ?? tag?.category ?? null;

        // Реклама и платные материалы в ленту не попадают ни при каких баллах
        if (isPaidCategory(category) || isAdvertising(item.title, item.paragraphs)) continue;

        if (source.role === 'dagestan') {
          const verdict = classifyDagestan({
            title: item.title,
            bodyStart: (item.paragraphs ?? []).slice(0, 2).join(' '),
            category,
            description: item.description,
            // Сайты, где у статей почти всегда есть фото, не наказываем за то,
            // что лента его не приложила: оно подтянется со страницы
            hasImage: Boolean(item.imageUrl) || source.previewImage,
            cities,
            ...homeCityOf(tag?.city ?? home),
            ...(source.requireMention ? { requireMention: true } : {}),
          });
          if (verdict.kind === 'dropped') continue;

          dagestan.push({
            source,
            item: { ...item, category },
            scope: verdict.scope,
            cityId: verdict.cityId,
            score: verdict.score,
            lead: buildLead(item.paragraphs, item.description),
            body:
              source.fullText === 'feed' && item.paragraphs ? item.paragraphs.join('\n\n') : null,
          });
        } else if (source.role === 'national') {
          const verdict = classifyNational({ category });
          if (verdict.kind === 'dropped') continue;

          rest.push({
            source,
            item,
            scope: verdict.scope,
            cityId: null,
            score: 0,
            lead: buildLead(null, item.description),
            body: null,
          });
        } else {
          rest.push({ source, item, scope: null, cityId: null, score: 0, lead: null, body: null });
        }
      }
    });

    return [...this.selectDagestan(dagestan), ...rest];
  }

  /**
   * Страницы городов («/news/g_<slug>») и рубрик издания. Адрес города строится
   * из slug в нашей таблице, поэтому новый город подхватывается сам; у города
   * без такой страницы издание просто не отвечает — это не ошибка.
   *
   * Списки на один заход читаются подряд, а не сразу все: издание не должно
   * получать пачку запросов за секунду. Разобранный список запоминается на
   * несколько минут — чаще ленту рубрики обновлять незачем.
   */
  private async fetchListings(source: NewsSource, cities: CityRow[]): Promise<Map<string, Listed>> {
    const listed = new Map<string, Listed>();
    if (!source.cityPages && !source.rubricPages) return listed;

    const origin = new URL(source.feedUrl).origin;
    const since = Date.now() - COLLECT_DAYS * DAY;

    const jobs: { path: string; city?: CityRow; category?: string }[] = [
      ...(source.cityPages ? cities.map((city) => ({ path: `/news/g_${city.slug}`, city })) : []),
      ...(source.rubricPages ?? []).map((rubric) => ({
        path: rubric.path,
        category: rubric.label,
      })),
    ];

    const pages = await mapLimit(jobs, NEWS_LIMITS.fetchConcurrency, async (job) => ({
      job,
      items: await this.listing(`${origin}${job.path}`, origin),
    }));

    for (const { job, items } of pages) {
      for (const item of items) {
        const path = articleKey(item.url);
        if (item.publishedAt.getTime() < since) continue;

        const known = listed.get(path);
        if (known) {
          // Заметка бывает и в разделе города, и в рубрике — берём обе метки
          if (job.city && !known.city) known.city = job.city;
          if (job.category && !known.category) {
            known.category = job.category;
            known.item = { ...known.item, category: job.category };
          }
          continue;
        }

        listed.set(path, {
          item: job.category ? { ...item, category: job.category } : item,
          ...(job.city ? { city: job.city } : {}),
          ...(job.category ? { category: job.category } : {}),
        });
      }
    }

    return listed;
  }

  private async listing(url: string, origin: string): Promise<RawFeedItem[]> {
    const cacheKey = `news:listing:${url}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) {
      return (
        JSON.parse(cached) as (Omit<RawFeedItem, 'publishedAt'> & { publishedAt: string })[]
      ).map((item) => ({ ...item, publishedAt: new Date(item.publishedAt) }));
    }

    try {
      const items = parseListing(await this.fetchText(url, 10_000, 2_000_000), origin);
      await this.redis.setEphemeral(
        cacheKey,
        JSON.stringify(items),
        NEWS_LIMITS.listingCacheMinutes * 60,
      );
      return items;
    } catch {
      // У раздела может не быть страницы, а сайт — отвечать: это не ошибка сбора
      return [];
    }
  }

  /**
   * Отбор «самого интересного»: лучшие по баллам, без потока однотипных
   * заметок и не больше дневного лимита на ленту. Повторы одного сюжета здесь
   * не ищем — этим занимается `removeDuplicates` по уже сохранённым записям, где
   * известны и текст, и фото.
   */
  private selectDagestan(list: Candidate[]): Candidate[] {
    const sorted = [...list].sort(
      (a, b) => b.score - a.score || b.item.publishedAt.getTime() - a.item.publishedAt.getTime(),
    );

    const kept: Candidate[] = [];
    const perRubric = new Map<string, number>();
    const perFeed = new Map<string, number>();

    for (const candidate of sorted) {
      const day = dayInTimezone(candidate.item.publishedAt, DEFAULT_TIMEZONE);

      const rubric = specialRubric(candidate.item.category);
      if (rubric) {
        const key = `${rubric}|${day}`;
        if ((perRubric.get(key) ?? 0) >= NEWS_LIMITS.perRubricPerDay) continue;
        perRubric.set(key, (perRubric.get(key) ?? 0) + 1);
      }

      const scope = candidate.scope ?? 'dagestan';
      const feedKey = `${scope}|${candidate.cityId ?? ''}|${day}`;
      if ((perFeed.get(feedKey) ?? 0) >= (NEWS_LIMITS.perDay[scope] ?? 15)) continue;
      perFeed.set(feedKey, (perFeed.get(feedKey) ?? 0) + 1);

      kept.push(candidate);
    }

    return kept;
  }

  // ── Сохранение ────────────────────────────────────────────────────────────

  private async store(candidates: Candidate[]): Promise<number> {
    if (candidates.length === 0) return 0;

    // Известные записи ищем по источнику отдельно: один запрос с сотнями пар
    // «источник + guid» база разбирает медленно
    const known = new Set<string>();
    for (const source of NEWS_SOURCES) {
      const guids = candidates
        .filter((c) => c.source.id === source.id)
        .map((c) => c.item.guid.slice(0, 600));
      if (guids.length === 0) continue;

      const existing = await this.prisma.newsItem.findMany({
        where: { source: source.id, externalId: { in: guids } },
        select: { externalId: true },
      });
      existing.forEach((row) => known.add(`${source.id}|${row.externalId}`));
    }

    const fresh = candidates.filter(
      (c) => !known.has(`${c.source.id}|${c.item.guid.slice(0, 600)}`),
    );
    if (fresh.length === 0) return 0;

    const result = await this.prisma.newsItem.createMany({
      skipDuplicates: true,
      data: fresh.map((c) => ({
        source: c.source.id,
        externalId: c.item.guid.slice(0, 600),
        url: c.item.url.slice(0, 1000),
        title: c.item.title.slice(0, 500),
        lead: c.lead,
        body: c.body,
        imageUrl: c.item.imageUrl?.slice(0, 1000) ?? null,
        scope: c.scope,
        cityId: c.cityId,
        sourceCategory: c.item.category?.slice(0, 120) ?? null,
        score: c.score,
        publishedAt: c.item.publishedAt,
      })),
    });

    return result.count;
  }

  // ── Подтверждение несколькими агентствами ─────────────────────────────────

  /**
   * Федеральная новость считается достоверной и значимой, когда о ней
   * независимо сообщили минимум два издания. Заметки разных изданий
   * сопоставляются по общим основам слов заголовка и лида.
   *
   * Записи упорядочены по времени, и каждая сравнивается только с теми, что
   * вышли в пределах окна подтверждения: иначе сравнений было бы миллионы.
   */
  private async recountCorroboration(): Promise<void> {
    const ids = NEWS_SOURCES.filter((s) => s.role !== 'dagestan').map((s) => s.id);
    const since = new Date(Date.now() - NEWS_LIMITS.federalWindowHours * HOUR);

    const rows = await this.prisma.newsItem.findMany({
      where: { source: { in: ids }, publishedAt: { gte: since } },
      orderBy: { publishedAt: 'asc' },
      select: {
        id: true,
        source: true,
        title: true,
        lead: true,
        publishedAt: true,
        corroboration: true,
      },
    });

    const sets = rows.map((row) => stems(`${row.title} ${row.lead ?? ''}`));
    const others = rows.map(() => new Set<string>());
    const window = NEWS_LIMITS.corroborationWindowHours * HOUR;

    for (let i = 0; i < rows.length; i += 1) {
      const a = rows[i];
      if (!a) continue;

      for (let j = i + 1; j < rows.length; j += 1) {
        const b = rows[j];
        if (!b || b.publishedAt.getTime() - a.publishedAt.getTime() > window) break;
        if (a.source === b.source) continue;

        if (sameStory(sets[i] ?? new Set(), sets[j] ?? new Set())) {
          others[i]?.add(b.source);
          others[j]?.add(a.source);
        }
      }
    }

    const byValue = new Map<number, string[]>();
    rows.forEach((row, index) => {
      const value = 1 + (others[index]?.size ?? 0);
      if (value === row.corroboration) return;
      byValue.set(value, [...(byValue.get(value) ?? []), row.id]);
    });

    for (const [value, groupIds] of byValue) {
      await this.prisma.newsItem.updateMany({
        where: { id: { in: groupIds } },
        data: { corroboration: value },
      });
    }
  }

  /**
   * Один сюжет — одна карточка. Издания повторяют типовые сводки («в
   * аэропорту … ввели ограничения») десятками, и каждая из них «подтверждена»
   * соседними. Из группы похожих оставляем лучшую — с картинкой, самую
   * подтверждённую, с лидом, — остальные перестают показываться. Затем режем
   * по дневному лимиту ленты. Снятые записи остаются в базе как
   * «подтверждающие», поэтому счёт подтверждений у других новостей не портится.
   *
   * В отбор идут только заметки с фото: ленты «Россия» и «Мир» без картинок
   * не показываются, и заметка без фото не должна вытеснять своего двойника с фото.
   */
  private async curateFederal(): Promise<void> {
    const rows = await this.prisma.newsItem.findMany({
      where: {
        scope: { in: ['russia', 'world'] },
        isHidden: false,
        imageUrl: { not: null },
        publishedAt: { gte: new Date(Date.now() - NEWS_LIMITS.federalWindowHours * HOUR) },
        corroboration: { gte: NEWS_LIMITS.minCorroboration },
      },
      select: {
        id: true,
        scope: true,
        title: true,
        lead: true,
        corroboration: true,
        publishedAt: true,
      },
    });

    const ranked = rows
      .map((row) => ({ row, set: stems(`${row.title} ${row.lead ?? ''}`) }))
      .sort(
        (a, b) =>
          b.row.corroboration - a.row.corroboration ||
          Number(Boolean(b.row.lead)) - Number(Boolean(a.row.lead)) ||
          b.row.publishedAt.getTime() - a.row.publishedAt.getTime(),
      );

    const window = NEWS_LIMITS.corroborationWindowHours * HOUR;
    const kept: typeof ranked = [];
    const demote: string[] = [];
    const perFeed = new Map<string, number>();

    for (const entry of ranked) {
      const duplicate = kept.some(
        (other) =>
          Math.abs(other.row.publishedAt.getTime() - entry.row.publishedAt.getTime()) <= window &&
          sameStory(other.set, entry.set),
      );

      const scope = entry.row.scope ?? 'russia';
      const key = `${scope}|${dayInTimezone(entry.row.publishedAt, DEFAULT_TIMEZONE)}`;
      const overLimit = (perFeed.get(key) ?? 0) >= (NEWS_LIMITS.perDay[scope] ?? 30);

      if (duplicate || overLimit) {
        demote.push(entry.row.id);
        continue;
      }

      perFeed.set(key, (perFeed.get(key) ?? 0) + 1);
      kept.push(entry);
    }

    if (demote.length > 0) {
      await this.prisma.newsItem.updateMany({
        where: { id: { in: demote } },
        data: { scope: null },
      });
    }
  }

  // ── Повторы ───────────────────────────────────────────────────────────────

  /**
   * Одна новость — одна карточка. Издания перепечатывают друг друга, а одну и ту
   * же статью РИА «Дагестан» выдаёт и в ленте, и на страницах города и рубрики.
   * Копии перестают показываться (`scope = null`); запись остаётся в базе, поэтому
   * при следующем сборе копия не появится заново. Правила сравнения — в `dedupe.ts`.
   */
  private async removeDuplicates(): Promise<void> {
    const groups: { scopes: NewsScope[]; onlyConfirmed: boolean }[] = [
      { scopes: ['city', 'dagestan'], onlyConfirmed: false },
      { scopes: ['russia'], onlyConfirmed: true },
      { scopes: ['world'], onlyConfirmed: true },
    ];
    const since = new Date(Date.now() - COLLECT_DAYS * DAY);
    const priority = (source: string) => NEWS_SOURCES.findIndex((s) => s.id === source);

    const drop: string[] = [];

    for (const group of groups) {
      const rows = await this.prisma.newsItem.findMany({
        where: {
          scope: { in: group.scopes },
          isHidden: false,
          publishedAt: { gte: since },
          ...(group.onlyConfirmed
            ? { corroboration: { gte: NEWS_LIMITS.minCorroboration }, imageUrl: { not: null } }
            : {}),
        },
        select: {
          id: true,
          source: true,
          title: true,
          lead: true,
          imageUrl: true,
          body: true,
          publishedAt: true,
        },
      });

      drop.push(
        ...findDuplicates(
          rows.map((row) => ({
            id: row.id,
            source: row.source,
            title: row.title,
            lead: row.lead,
            imageUrl: row.imageUrl,
            bodyLength: row.body?.length ?? 0,
            publishedAt: row.publishedAt,
          })),
          priority,
        ),
      );
    }

    if (drop.length > 0) {
      await this.prisma.newsItem.updateMany({ where: { id: { in: drop } }, data: { scope: null } });
      this.logger.log({ count: drop.length }, 'Повторы убраны из ленты');
    }
  }

  // ── Реклама ───────────────────────────────────────────────────────────────

  /**
   * Заметки, уже попавшие в базу, перепроверяем на рекламную маркировку: она
   * стоит в конце текста, а правила отсева могли появиться позже сбора.
   * Кандидатов выбирает база по подстроке, точное решение — за `isAdvertising`.
   */
  private async purgeAdvertising(): Promise<void> {
    const rows = await this.prisma.newsItem.findMany({
      where: {
        scope: { not: null },
        OR: [
          { body: { contains: 'erid', mode: 'insensitive' } },
          { body: { contains: 'реклам', mode: 'insensitive' } },
          { body: { contains: 'партнерск', mode: 'insensitive' } },
          { body: { contains: 'партнёрск', mode: 'insensitive' } },
          { body: { contains: 'пресс-релиз', mode: 'insensitive' } },
          { sourceCategory: { contains: 'компаний', mode: 'insensitive' } },
        ],
      },
      select: { id: true, title: true, body: true, sourceCategory: true },
    });

    const ads = rows
      .filter(
        (row) =>
          isPaidCategory(row.sourceCategory) ||
          isAdvertising(row.title, row.body?.split('\n\n') ?? null),
      )
      .map((row) => row.id);

    if (ads.length > 0) {
      await this.prisma.newsItem.updateMany({ where: { id: { in: ads } }, data: { scope: null } });
      this.logger.log({ count: ads.length }, 'Рекламные материалы убраны из ленты');
    }
  }

  // ── Полный текст ──────────────────────────────────────────────────────────

  /**
   * Полный текст для заметок, которых нет в ленте с текстом: у Ленты.ру,
   * Коммерсанта и портала «Дербент» ленты его не отдают, а заметки со страниц
   * городов и рубрик приходят только с заголовком. Страницу читаем один раз и
   * берём с неё всё сразу: текст, лид и, если фото ещё нет, фото.
   * Читаем лишь новости, уже отобранные в ленту, — лишних запросов к
   * изданию быть не должно.
   */
  private async enrichArticles(): Promise<void> {
    const ids = NEWS_SOURCES.filter(
      (source) => source.fullText === 'article' || source.cityPages || source.rubricPages,
    ).map((s) => s.id);

    const pending = await this.prisma.newsItem.findMany({
      where: {
        source: { in: ids },
        body: null,
        isHidden: false,
        publishedAt: { gte: new Date(Date.now() - COLLECT_DAYS * DAY) },
        // Новости Дагестана показываются сразу, федеральные — после подтверждения
        OR: [
          { scope: { in: ['city', 'dagestan'] } },
          {
            scope: { in: ['russia', 'world'] },
            corroboration: { gte: NEWS_LIMITS.minCorroboration },
            imageUrl: { not: null },
          },
        ],
      },
      orderBy: { publishedAt: 'desc' },
      take: NEWS_LIMITS.articleFetchPerRun,
      select: { id: true, source: true, url: true, title: true, lead: true, imageUrl: true },
    });

    await mapLimit(pending, NEWS_LIMITS.fetchConcurrency, async (row) => {
      const triedKey = `news:text-tried:${row.id}`;
      if (await this.redis.client.get(triedKey)) return;
      await this.redis.setEphemeral(triedKey, '1', 6 * 3600);

      const source = NEWS_SOURCES.find((s) => s.id === row.source);
      if (!source || !sameSite(row.url, source.feedUrl)) return;

      try {
        const html = await this.fetchText(row.url, 8_000, 2_000_000);
        const article = extractArticle(html, row.url);
        if (!article) return;

        // Маркировка рекламы стоит в конце текста, а текст мы видим только теперь
        if (isAdvertising(row.title, article.paragraphs)) {
          await this.prisma.newsItem.update({ where: { id: row.id }, data: { scope: null } });
          return;
        }

        // Своё фото статьи ставим, только если картинки ещё нет
        const image =
          row.imageUrl ??
          article.imageUrl ??
          (source.previewImage ? extractPageImage(html, row.url) : null);

        await this.prisma.newsItem.update({
          where: { id: row.id },
          data: {
            body: article.paragraphs.join('\n\n'),
            // У заметок без описания в ленте заключающую мысль берём из начала статьи
            ...(row.lead === null ? { lead: buildLead(article.paragraphs, '') } : {}),
            ...(row.imageUrl === null && image ? { imageUrl: image } : {}),
          },
        });
      } catch {
        // Страница недоступна — заметка подождёт следующего захода
      }
    });
  }

  // ── Картинки ──────────────────────────────────────────────────────────────

  /**
   * Заметки, чей текст пришёл в ленте, а фото — нет («Дагестанская правда»,
   * «Каспий-Медиа», «Махачкалинские известия»). Фото ищем на странице статьи;
   * файл не копируется — приложение подгружает его по адресу издания.
   */
  private async enrichImages(): Promise<void> {
    const withPreview = NEWS_SOURCES.filter((source) => source.previewImage).map((s) => s.id);

    const pending = await this.prisma.newsItem.findMany({
      where: {
        source: { in: withPreview },
        imageUrl: null,
        isHidden: false,
        publishedAt: { gte: new Date(Date.now() - COLLECT_DAYS * DAY) },
        OR: [
          { scope: { in: ['city', 'dagestan'] } },
          {
            scope: { in: ['russia', 'world'] },
            corroboration: { gte: NEWS_LIMITS.minCorroboration },
          },
        ],
      },
      orderBy: { publishedAt: 'desc' },
      take: NEWS_LIMITS.imageEnrichPerRun,
      select: { id: true, source: true, url: true },
    });

    await mapLimit(pending, NEWS_LIMITS.fetchConcurrency, async (row) => {
      const triedKey = `news:img-tried:${row.id}`;
      if (await this.redis.client.get(triedKey)) return;
      // Одна попытка в сутки: страница без картинки не должна опрашиваться каждые 15 минут
      await this.redis.setEphemeral(triedKey, '1', DAY / 1000);

      const source = NEWS_SOURCES.find((s) => s.id === row.source);
      if (!source || !sameSite(row.url, source.feedUrl)) return;

      try {
        const html = await this.fetchText(row.url, 8_000, 2_000_000);
        const image = extractPageImage(html, row.url);
        if (image) {
          await this.prisma.newsItem.update({ where: { id: row.id }, data: { imageUrl: image } });
        }
      } catch {
        // Нет картинки — карточка покажет оформленную заглушку
      }
    });
  }

  // ── Очистка ───────────────────────────────────────────────────────────────

  private async cleanup(): Promise<void> {
    const now = Date.now();

    await this.prisma.newsItem.deleteMany({
      where: { publishedAt: { lt: new Date(now - NEWS_LIMITS.retentionDays * DAY) } },
    });

    // Подтверждающие записи и неподтверждённые федеральные новости нужны лишь
    // на время сопоставления
    await this.prisma.newsItem.deleteMany({
      where: {
        publishedAt: { lt: new Date(now - NEWS_LIMITS.federalWindowHours * HOUR) },
        OR: [
          { scope: null },
          {
            scope: { in: ['russia', 'world'] },
            corroboration: { lt: NEWS_LIMITS.minCorroboration },
          },
        ],
      },
    });
  }

  // ── Сеть ──────────────────────────────────────────────────────────────────

  private async fetchText(url: string, timeoutMs: number, maxBytes: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/rss+xml, application/xml, text/html;q=0.8, */*;q=0.5',
        },
        redirect: 'follow',
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > maxBytes) throw new Error('слишком большой ответ');

      return new TextDecoder('utf-8').decode(buffer);
    } finally {
      clearTimeout(timer);
    }
  }
}

// ── Вспомогательное ──────────────────────────────────────────────────────────

/** Выполняет задачи с ограничением по числу одновременных. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index] as T);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Поле для классификатора: пустой объект, когда у заметки нет «своего» города. */
function homeCityOf(city: CityRow | undefined): { homeCity?: CityRef } {
  return city ? { homeCity: { id: city.id, name: city.name } } : {};
}

/** Ссылка ведёт на сайт того же источника: чужие адреса из ленты не запрашиваем. */
function sameSite(url: string, feedUrl: string): boolean {
  try {
    const host = new URL(url);
    if (host.protocol !== 'https:' && host.protocol !== 'http:') return false;

    const base = new URL(feedUrl).hostname.split('.').slice(-2).join('.');
    return host.hostname === base || host.hostname.endsWith(`.${base}`);
  } catch {
    return false;
  }
}

/**
 * Лид из начала полного текста. Датлайн и подпись издания («МАХАЧКАЛА,
 * 18 сентября – РИА «Дагестан».») в заключающую мысль не годятся.
 */
export function buildLead(paragraphs: string[] | null, description: string): string | null {
  const first = paragraphs?.[0];
  if (!first) return shorten(description.trim());

  const strip = (text: string) =>
    text
      .replace(
        /^[А-ЯЁ][А-ЯЁ\- ]{2,40},\s*\d{1,2}\s*[а-яё]+\s*[–—-]\s*РИА\s*[«"]Дагестан[»"]\.?\s*/,
        '',
      )
      .trim();

  // После подписи издания в источнике остаётся точка или запятая — убираем
  let text = strip(first).replace(/^[\s.,;:–—-]+/, '');
  if (text.length < 40 && paragraphs?.[1]) text = `${text} ${paragraphs[1]}`.trim();

  return shorten(text);
}

/** Заключающая мысль — пара предложений, а не первый экран статьи. */
function shorten(raw: string): string | null {
  // Агентства склеивают конец предложения с началом прямой речи
  // («…сообщили в Росавиации."Сняты ограничения…») — разделяем
  const text = raw.replace(/([.!?])(?=["«А-ЯЁ])/g, '$1 ');
  if (!text) return null;
  if (text.length <= 240) return text;

  const cut = text.slice(0, 240);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));

  return end > 80 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}
