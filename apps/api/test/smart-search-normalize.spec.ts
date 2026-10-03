import { describe, expect, it } from 'vitest';

import {
  extractAmounts,
  formatRubles,
  isGroundedNumber,
  parseAmount,
} from '../src/modules/smart-search/normalize/amounts.js';
import { matchCity, sameStem } from '../src/modules/smart-search/normalize/text.js';
import { resolveDay, timeWindow } from '../src/modules/smart-search/normalize/time.js';
import { groundIntent } from '../src/modules/smart-search/planner/query-planner.js';
import { CITIES, NOW, core } from './helpers/smart-search-fixtures.js';

describe('Суммы во фразе', () => {
  it.each([
    ['до 1.2 миллиона', 1_200_000],
    ['до 1,2 млн', 1_200_000],
    ['до миллиона', 1_000_000],
    ['полтора миллиона', 1_500_000],
    ['до 40 тысяч', 40_000],
    ['40 тыс', 40_000],
    ['70к', 70_000],
    ['до 1 200 000 ₽', 1_200_000],
    ['до 500000', 500_000],
    ['300 тр', 300_000],
    ['2 ляма', 2_000_000],
  ])('«%s» → %d', (text, expected) => {
    expect(extractAmounts(text)).toContain(expected);
  });

  it('единицы памяти: «256 гигов», «1 ТБ»', () => {
    expect(extractAmounts('256 гигов')).toContain(256);
    expect(extractAmounts('на 1 тб')).toContain(1024);
  });

  it('значение модели: число как есть, строка — разбором, мусор — null', () => {
    expect(parseAmount(1_200_000)).toBe(1_200_000);
    expect(parseAmount('1.2 млн')).toBe(1_200_000);
    expect(parseAmount('недорого')).toBeNull();
    expect(parseAmount(-5)).toBeNull();
    expect(parseAmount(Number.NaN)).toBeNull();
  });

  it('сверка числа с фразой: придуманная цена не проходит', () => {
    expect(isGroundedNumber(1_200_000, 'Toyota Succeed до 1.2 миллиона')).toBe(true);
    expect(isGroundedNumber(40_000, 'двушка до 40 тысяч')).toBe(true);
    expect(isGroundedNumber(30_000, 'айфон недорого')).toBe(false);
    expect(isGroundedNumber(900_000, 'Toyota Succeed до миллиона')).toBe(false);
  });

  it('рубли выводятся с разрядами', () => {
    expect(formatRubles(1_200_000)).toBe('1 200 000 ₽');
  });
});

describe('Сверка чисел намерения', () => {
  it('«недорого» с выдуманной ценой: цена убирается, остальное остаётся', () => {
    const { intent, dropped } = groundIntent(
      core({ domain: 'listings', filters: { brand: 'Apple', price: { max: 30_000 } } }),
      'айфон недорого',
    );
    expect(intent.filters).toEqual({ brand: 'Apple' });
    expect(dropped).toEqual(['price']);
  });

  it('названная цена остаётся; мелкие числа из слов («двушка» → 2) не сверяются', () => {
    const { intent, dropped } = groundIntent(
      core({ domain: 'listings', filters: { rooms: 2, price: { max: 40_000 } } }),
      'двушка до 40 тысяч',
    );
    expect(intent.filters).toEqual({ rooms: 2, price: { max: 40_000 } });
    expect(dropped).toEqual([]);
  });

  it('из двух границ остаётся та, что названа', () => {
    const { intent, dropped } = groundIntent(
      core({ domain: 'listings', filters: { price: { min: 500_000, max: 1_000_000 } } }),
      'до миллиона',
    );
    expect(intent.filters.price).toEqual({ max: 1_000_000 });
    expect(dropped).toEqual(['price']);
  });

  it('строки-названия («iPhone 15 и новее») не принимаются за числа', () => {
    const { intent } = groundIntent(
      core({ domain: 'listings', filters: { model: { min: 'iPhone 15' }, memory: { min: 256 } } }),
      'айфон 15 или новее, 256 гигов',
    );
    expect(intent.filters).toEqual({ model: { min: 'iPhone 15' }, memory: { min: 256 } });
  });
});

describe('Города и время', () => {
  it('город — по падежу, только из городов приложения', () => {
    expect(matchCity('в Каспийске', CITIES)).toMatchObject({
      kind: 'city',
      city: { name: 'Каспийск' },
    });
    expect(matchCity('Махачкалы', CITIES)).toMatchObject({
      kind: 'city',
      city: { name: 'Махачкала' },
    });
    expect(matchCity('Дагестане', CITIES)).toEqual({ kind: 'region' });
    expect(matchCity('Владивосток', CITIES)).toEqual({ kind: 'unknown' });
    expect(sameStem('Дюну', 'Дюна')).toBe(true);
    expect(sameStem('Каспийск', 'Кисловодск')).toBe(false);
  });

  it('«сегодня», «завтра» — по часовому поясу города', () => {
    expect(resolveDay('today', 'Europe/Moscow', NOW)).toBe('2026-10-03');
    expect(resolveDay('tomorrow', 'Europe/Moscow', NOW)).toBe('2026-10-04');
    expect(resolveDay('2026-02-30', 'Europe/Moscow', NOW)).toBeNull();
  });

  it('«вечером» — официальное окно сервера, явное «после 19:00» важнее', () => {
    expect(timeWindow({ date: null, from: null, to: null, period: 'evening' })).toMatchObject({
      from: '17:00',
      to: '23:59',
    });
    expect(timeWindow({ date: null, from: '19:00', to: null, period: 'evening' })).toMatchObject({
      from: '19:00',
    });
    expect(timeWindow({ date: 'today', from: null, to: null, period: null })).toBeNull();
  });
});
