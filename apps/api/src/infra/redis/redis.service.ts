import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';

/**
 * Redis — быстрое хранилище «в памяти».
 *
 * Используется для трёх задач:
 *   1. Кеш — то, что одинаково для всех (погода, афиша, список городов).
 *      При наплыве трафика база не нагружается вовсе.
 *   2. Счётчики ограничения частоты запросов (защита от перебора и DDoS).
 *   3. Короткоживущие токены (например, «пропуск» после ввода SMS-кода):
 *      они сами исчезают по истечении срока, чистить базу не нужно.
 *
 * Данные в Redis не являются источником истины: при его перезапуске
 * приложение продолжает работать, просто медленнее.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      // Не подключаемся сразу при создании объекта — только по команде,
      // чтобы падение Redis не мешало приложению стартовать.
      lazyConnect: true,
      retryStrategy: (times: number) => Math.min(times * 200, 5000),
    });

    this.client.on('error', (err: Error) => {
      this.logger.error({ err }, 'Ошибка соединения с Redis');
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log('Подключение к Redis установлено');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async ping(): Promise<number> {
    const start = Date.now();
    await this.client.ping();
    return Date.now() - start;
  }

  // ── Кеш ───────────────────────────────────────────────────────────────────

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Повреждённое значение в кеше не должно ронять запрос: считаем, что кеша нет.
      await this.client.del(key);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.client.del(...keys);
  }

  // ── Счётчики ──────────────────────────────────────────────────────────────

  /**
   * Увеличивает счётчик и возвращает его значение вместе с остатком времени жизни.
   *
   * Обе команды отправляются одной пачкой (pipeline) — это один поход в Redis
   * вместо двух. На горячем пути (а лимиты проверяются на каждом запросе)
   * такая экономия заметна.
   */
  async incrementWithTtl(
    key: string,
    windowSeconds: number,
  ): Promise<{ count: number; ttl: number }> {
    const results = await this.client
      .multi()
      .incr(key)
      // NX = установить срок жизни только если он ещё не установлен.
      // Иначе окно бы продлевалось при каждом запросе и никогда не заканчивалось.
      .expire(key, windowSeconds, 'NX')
      .ttl(key)
      .exec();

    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[2]?.[1] ?? windowSeconds);

    return { count, ttl: ttl < 0 ? windowSeconds : ttl };
  }

  /**
   * Поставить метку, если её ещё нет, — атомарно (SET NX). true — метка
   * поставлена сейчас, false — уже стояла. Для «один раз за период»:
   * просмотр объявления одним человеком за сутки.
   */
  async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /** Текущее значение счётчика без изменения. */
  async getCount(key: string): Promise<number> {
    const value = await this.client.get(key);
    return value === null ? 0 : Number(value);
  }

  // ── Одноразовые токены ────────────────────────────────────────────────────

  /** Сохраняет значение, которое само исчезнет через ttlSeconds. */
  async setEphemeral(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  /**
   * Читает значение и сразу удаляет его — атомарно.
   *
   * Нужно для одноразовых токенов: даже если два запроса придут
   * одновременно, значение получит только один из них.
   */
  async consumeEphemeral(key: string): Promise<string | null> {
    return this.client.getdel(key);
  }
}
