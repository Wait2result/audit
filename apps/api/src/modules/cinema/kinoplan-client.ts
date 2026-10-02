import { Injectable, Logger } from '@nestjs/common';

/**
 * Клиент недокументированного публичного API Kinoplan — платформы, на
 * которой работают сайты кинотеатров «Парамакс», «Синема Холл», «Октябрь»
 * и «Москва» (см. docs/ADR/0004-кино-kinoplan.md).
 *
 * Это тот же API, которым пользуется сам сайт кинотеатра (тот же базовый
 * адрес, тот же публичный токен, встроенный в HTML сайта) — не сторонний
 * агрегатор. Формат запросов найден анализом JS-бандла сайта kino-paramax.ru.
 */
@Injectable()
export class KinoplanClient {
  private readonly logger = new Logger(KinoplanClient.name);

  private static readonly BASE_URL = 'https://kinokassa.kinoplan24.ru';

  async getPlaybill(
    token: string,
    kinoplanCityId: number,
    date: string,
  ): Promise<KinoplanRelease[]> {
    const params = new URLSearchParams({
      city_id: String(kinoplanCityId),
      date,
      no_premiere: 'false',
    });

    const url = `${KinoplanClient.BASE_URL}/api/v2/release/playbill?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: KinoplanClient.headers(token),
      });

      if (!response.ok) {
        throw new Error(`Kinoplan ответил ${response.status}`);
      }

      const body = (await response.json()) as KinoplanPlaybillResponse;
      return body.releases ?? [];
    } catch (err) {
      this.logger.warn({ err, kinoplanCityId, date }, 'Сбой обращения к Kinoplan');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Подробности о фильме: описание и трейлер. В расписании их нет —
   * это отдельный запрос, и делается он только когда человек открывает
   * карточку фильма, а не для всего списка сразу.
   */
  async getRelease(
    token: string,
    releaseId: number,
    kinoplanCityId: number,
    kinoplanCinemaId: number,
  ): Promise<KinoplanReleaseDetails> {
    const params = new URLSearchParams({
      city_id: String(kinoplanCityId),
      cinema_id: String(kinoplanCinemaId),
    });

    const url = `${KinoplanClient.BASE_URL}/api/v2/release/${releaseId}?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: KinoplanClient.headers(token),
      });

      if (!response.ok) {
        throw new Error(`Kinoplan ответил ${response.status}`);
      }

      const body = (await response.json()) as { release: KinoplanReleaseDetails };
      return body.release;
    } catch (err) {
      this.logger.warn({ err, releaseId }, 'Сбой обращения к Kinoplan за фильмом');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Токен сайта кинотеатра плюс заголовки, без которых API отвечает 400. */
  private static headers(token: string): Record<string, string> {
    return {
      'X-Application-Token': token,
      'X-Platform': 'widget',
      'X-Preferred-Language': 'ru',
      Accept: 'application/json',
    };
  }
}

/**
 * Ссылка на покупку билета на конкретный сеанс.
 *
 * Это тот же адрес, который сайт кинотеатра открывает по нажатию на сеанс:
 * виджет Kinoplan сам собирает его из трёх идентификаторов (см. разбор
 * kinowidget.min.js в docs/ADR/0004-кино-kinoplan.md) и на телефоне открывает
 * обычной страницей. Человек попадает сразу в выбор мест нужного сеанса,
 * а не на общее расписание, где сеанс ещё нужно найти.
 */
export function buildTicketUrl(
  kinoplanCinemaId: number,
  releaseId: number,
  seanceId: string,
): string {
  return `${KINOWIDGET_BASE_URL}/${kinoplanCinemaId}/${releaseId}/${seanceId}`;
}

const KINOWIDGET_BASE_URL = 'https://kinowidget.kinoplan.ru';

// ── Формат ответа Kinoplan (используемое подмножество) ──────────────────────

interface KinoplanPlaybillResponse {
  releases: KinoplanRelease[];
}

export interface KinoplanRelease {
  /** Идентификатор фильма в Kinoplan — часть ссылки на покупку билета */
  id: number;
  title: string;
  poster: string | null;
  duration: number | null;
  age_rating: string | null;
  genres: { id: number; title: string }[];
  seances: KinoplanSeance[];
}

/** Ответ по одному фильму — без сеансов, зато с описанием и трейлером. */
export interface KinoplanReleaseDetails {
  id: number;
  title: string;
  poster: string | null;
  duration: number | null;
  age_rating: string | null;
  genres: { id: number; title: string }[];
  countries: { id: number; title: string }[];
  year: number | null;
  description: string | null;
  /** Трейлер лежит на CDN Kinoplan обычным mp4 — его можно играть в приложении */
  trailer: { hd: string | null; thumbnail: string | null } | null;
}

export interface KinoplanSeance {
  id: string;
  hall: { id: number; title: string; is_vip: boolean } | null;
  formats: { id: number; title: string }[];
  start_date_time: string;
  price: { min: number; max: number };
}
