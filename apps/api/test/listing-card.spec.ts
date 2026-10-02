import {
  formatListingAge,
  formatViewsShort,
  groupFilterFields,
  resolveCardLayout,
  type ListingCardLayout,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

const now = new Date(2026, 9, 2, 15, 0, 0);
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('formatListingAge', () => {
  it('свежее — относительно, старше суток — по календарю', () => {
    expect(formatListingAge(ago(10_000), now)).toBe('Только что');
    expect(formatListingAge(ago(5 * MIN), now)).toBe('5 мин назад');
    expect(formatListingAge(ago(2 * HOUR), now)).toBe('2 ч назад');
    expect(formatListingAge(new Date(2026, 9, 2, 3, 0), now)).toBe('Сегодня');
    expect(formatListingAge(new Date(2026, 9, 1, 23, 0), now)).toBe('Вчера');
    expect(formatListingAge(new Date(2026, 8, 14, 12, 0), now)).toBe('14 сентября');
    expect(formatListingAge(new Date(2025, 11, 31, 12, 0), now)).toBe('31 декабря 2025');
  });

  it('время «из будущего» из-за расхождения часов — это «сейчас»', () => {
    expect(formatListingAge(new Date(now.getTime() + 3000), now)).toBe('Только что');
  });

  it('принимает ISO-строку', () => {
    expect(formatListingAge(ago(30 * MIN).toISOString(), now)).toBe('30 мин назад');
  });
});

describe('formatViewsShort', () => {
  it('сокращает тысячи', () => {
    expect(formatViewsShort(38)).toBe('38');
    expect(formatViewsShort(1200)).toBe('1,2 тыс');
    expect(formatViewsShort(15_400)).toBe('15 тыс');
  });
});

describe('resolveCardLayout', () => {
  interface Cat {
    cardLayout: ListingCardLayout;
    children?: Cat[];
  }
  const cat = (cardLayout: ListingCardLayout, children?: Cat[]): Cat => ({
    cardLayout,
    children,
  });

  it('без категории — сетка', () => {
    expect(resolveCardLayout(null)).toBe('grid');
  });

  it('собственный вид подкатегории', () => {
    expect(resolveCardLayout(cat('list'))).toBe('list');
    expect(resolveCardLayout(cat('grid'))).toBe('grid');
  });

  it('раздел — список, только если все подкатегории списком', () => {
    expect(resolveCardLayout(cat('grid', [cat('list'), cat('list')]))).toBe('list');
    expect(resolveCardLayout(cat('grid', [cat('list'), cat('grid')]))).toBe('grid');
    expect(resolveCardLayout(cat('grid', []))).toBe('grid');
  });
});

describe('groupFilterFields', () => {
  const f = (key: string, showInCard = false) => ({ key, showInCard });

  it('раскладывает по блокам', () => {
    const groups = groupFilterFields([
      f('brand', true),
      f('year', true),
      f('condition', true),
      f('sellerType', true),
      f('color'),
      f('vin'),
    ]);
    expect(groups.main.map((x) => x.key)).toEqual(['brand', 'year']);
    expect(groups.condition.map((x) => x.key)).toEqual(['condition']);
    expect(groups.seller.map((x) => x.key)).toEqual(['sellerType']);
    expect(groups.extra.map((x) => x.key)).toEqual(['color', 'vin']);
  });

  it('ограничивает основные поля и переносит остальное в дополнительные', () => {
    const many = Array.from({ length: 9 }, (_, i) => f(`k${i}`, true));
    const groups = groupFilterFields(many);
    expect(groups.main).toHaveLength(6);
    expect(groups.extra).toHaveLength(3);
  });

  it('без отмеченных полей первые из дополнительных становятся основными', () => {
    const groups = groupFilterFields([f('a'), f('b'), f('c'), f('d'), f('e')]);
    expect(groups.main.map((x) => x.key)).toEqual(['a', 'b', 'c']);
    expect(groups.extra.map((x) => x.key)).toEqual(['d', 'e']);
  });

  it('пустой список — пустые группы', () => {
    expect(groupFilterFields([])).toEqual({ main: [], condition: [], seller: [], extra: [] });
  });
});
