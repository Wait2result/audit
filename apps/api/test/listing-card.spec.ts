import {
  DAGESTAN_BOUNDS,
  boundsAround,
  cardEmphasis,
  cardFacts,
  formatListingAge,
  formatPriceCompact,
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

describe('cardFacts', () => {
  it('убирает «Продам» и то, что уже есть в заголовке', () => {
    expect(
      cardFacts('Продам · Chery · Tiggo 8 · 2015 · 242 000 км · Механика', 'Chery Tiggo 8', 4),
    ).toEqual(['2015', '242 000 км', 'Механика']);
  });

  it('сдачу оставляет: «Сдам надолго» — это характеристика', () => {
    expect(cardFacts('Сдам надолго · 2 комн. · 54 м²', 'Квартира у моря', 4)).toEqual([
      'Сдам надолго',
      '2 комн.',
      '54 м²',
    ]);
  });

  it('учитывает регистр, «ё» и повторы; ограничивает число', () => {
    expect(cardFacts('Тойота · тойота · Белый · 2020 · AT', 'Тойота Камри', 3)).toEqual([
      'Белый',
      '2020',
      'AT',
    ]);
  });

  it('короткое значение не считается «уже в заголовке» случайно', () => {
    expect(cardFacts('3 · 4x4', 'Дом 3 этажа, 4x4', 4)).toEqual(['3']);
  });

  it('пустая строка — пустой список', () => {
    expect(cardFacts('', 'Диван', 3)).toEqual([]);
  });
});

describe('cardEmphasis', () => {
  it('у вакансии главное — должность, у остального — цена', () => {
    expect(cardEmphasis('job-vacancies')).toBe('title');
    expect(cardEmphasis('job')).toBe('title');
    expect(cardEmphasis('transport-cars')).toBe('price');
    expect(cardEmphasis('realty-flats')).toBe('price');
  });
});

describe('formatPriceCompact', () => {
  it('сокращает суммы для меток карты (копейки на входе)', () => {
    expect(formatPriceCompact(36_400_000, 'total')).toBe('364 тыс');
    expect(formatPriceCompact(250_000_000, 'total')).toBe('2,5 млн');
    expect(formatPriceCompact(300_000_000, 'total')).toBe('3 млн');
    expect(formatPriceCompact(4_580_000, 'per_month')).toBe('46 тыс/мес');
    expect(formatPriceCompact(150_000, 'per_month')).toBe('1,5 тыс/мес');
    expect(formatPriceCompact(450_000, 'per_day')).toBe('4,5 тыс/сут');
    expect(formatPriceCompact(95_000, 'total')).toBe('950 ₽');
  });

  it('без цены — «Дог.»', () => {
    expect(formatPriceCompact(null, 'total')).toBe('Дог.');
  });
});

describe('boundsAround', () => {
  it('прямоугольник вокруг точки: вписывает круг радиуса', () => {
    const center = { latitude: 42.9849, longitude: 47.5047 };
    const box = boundsAround(center, 25);

    // 25 км по широте — около 0,2246°
    expect(box.north - center.latitude).toBeCloseTo(25 / 111.32, 5);
    expect(center.latitude - box.south).toBeCloseTo(25 / 111.32, 5);
    // по долготе градус короче, значит, градусов больше
    expect(box.east - center.longitude).toBeGreaterThan(box.north - center.latitude);
    // точка ровно в середине
    expect((box.south + box.north) / 2).toBeCloseTo(center.latitude, 9);
    expect((box.west + box.east) / 2).toBeCloseTo(center.longitude, 9);
  });

  it('границы Дагестана корректны (юг < север, запад < восток)', () => {
    expect(DAGESTAN_BOUNDS.south).toBeLessThan(DAGESTAN_BOUNDS.north);
    expect(DAGESTAN_BOUNDS.west).toBeLessThan(DAGESTAN_BOUNDS.east);
  });
});
