import {
  SEED_PLACE_CATEGORIES,
  createPlaceCategorySchema,
  createPlaceSchema,
  placeMatchesCategory,
  replyReviewSchema,
  updateMenuItemSchema,
  updateMyPlaceSchema,
  upsertReviewSchema,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import {
  closingMinute,
  minutesFromTime,
  openStateAt,
  timeFromMinutes,
  type ScheduleDay,
} from '../src/modules/places/open-hours.js';
import { minutesInTimezone, weekdayInTimezone } from '../src/common/utils/timezone.js';

/**
 * Часы работы заведений.
 *
 * Самое хрупкое место рубрики: заведения, работающие за полночь. Если
 * посчитать наивно, шаурмичная «до 02:00» будет числиться закрытой весь
 * вечер, потому что 02:00 меньше 22:00.
 */

const day = (weekday: number, opensAt: string, closesAt: string): ScheduleDay => ({
  weekday,
  isClosed: false,
  opensMinute: minutesFromTime(opensAt),
  closesMinute: minutesFromTime(closesAt),
});

describe('Перевод времени', () => {
  it('разбирает и собирает время суток', () => {
    expect(minutesFromTime('09:00')).toBe(540);
    expect(minutesFromTime('23:30')).toBe(1410);
    expect(minutesFromTime('00:00')).toBe(0);
    expect(timeFromMinutes(540)).toBe('09:00');
    expect(timeFromMinutes(1410)).toBe('23:30');
  });

  it('минуты за пределами суток показывает временем суток', () => {
    expect(timeFromMinutes(1560)).toBe('02:00');
    expect(timeFromMinutes(1440)).toBe('00:00');
  });

  it('не принимает мусор вместо времени', () => {
    expect(() => minutesFromTime('25:00')).toThrow();
    expect(() => minutesFromTime('9:00')).toThrow();
    expect(() => minutesFromTime('вечером')).toThrow();
  });

  it('закрытие раньше открытия означает работу за полночь', () => {
    expect(closingMinute(600, 120)).toBe(1560);
    expect(closingMinute(540, 1320)).toBe(1320);
  });
});

describe('Открыто ли заведение', () => {
  const week = [1, 2, 3, 4, 5, 6, 7].map((weekday) => day(weekday, '09:00', '23:00'));

  it('днём открыто, ночью закрыто', () => {
    expect(openStateAt(week, 3, minutesFromTime('14:00'))).toMatchObject({ isOpenNow: true });
    expect(openStateAt(week, 3, minutesFromTime('08:59')).isOpenNow).toBe(false);
    expect(openStateAt(week, 3, minutesFromTime('23:00')).isOpenNow).toBe(false);
  });

  it('показывает, до скольки работает', () => {
    expect(openStateAt(week, 3, minutesFromTime('14:00')).label).toBe('Открыто до 23:00');
  });

  it('до открытия говорит, когда откроется', () => {
    expect(openStateAt(week, 3, minutesFromTime('07:00')).label).toBe('Откроется в 09:00');
  });

  it('заведение до 02:00 ночью ещё открыто', () => {
    const nightly = [1, 2, 3, 4, 5, 6, 7].map((weekday) => day(weekday, '10:00', '02:00'));

    expect(openStateAt(nightly, 3, minutesFromTime('23:30')).isOpenNow).toBe(true);
    // Час ночи четверга — это ещё смена среды
    expect(openStateAt(nightly, 4, minutesFromTime('01:00'))).toMatchObject({
      isOpenNow: true,
      label: 'Открыто до 02:00',
    });
    expect(openStateAt(nightly, 4, minutesFromTime('03:00')).isOpenNow).toBe(false);
  });

  it('ночная смена воскресенья продолжается в понедельник', () => {
    const nightly = [1, 2, 3, 4, 5, 6, 7].map((weekday) => day(weekday, '10:00', '02:00'));

    expect(openStateAt(nightly, 1, minutesFromTime('01:00')).isOpenNow).toBe(true);
  });

  it('выходной день закрыт, и виден ближайший рабочий', () => {
    const withDayOff = week.map((d) => (d.weekday === 1 ? { ...d, isClosed: true } : d));

    const state = openStateAt(withDayOff, 1, minutesFromTime('14:00'));
    expect(state.isOpenNow).toBe(false);
    expect(state.label).toBe('Откроется завтра в 09:00');
  });

  it('круглосуточное заведение открыто в любой час', () => {
    const always = [1, 2, 3, 4, 5, 6, 7].map((weekday) => day(weekday, '00:00', '00:00'));

    expect(openStateAt(always, 5, minutesFromTime('03:00')).isOpenNow).toBe(true);
    expect(openStateAt(always, 5, minutesFromTime('15:00')).isOpenNow).toBe(true);
  });

  it('пустое расписание не ломает карточку', () => {
    expect(openStateAt([], 3, 600)).toMatchObject({ isOpenNow: false, label: 'Закрыто' });
  });
});

describe('Время в поясе города', () => {
  it('день недели считается по городу, а не по серверу', () => {
    // Понедельник 00:30 по Махачкале — это ещё воскресенье по Лондону
    const moment = new Date('2026-09-20T21:30:00Z');

    expect(weekdayInTimezone(moment, 'Europe/Moscow')).toBe(1);
    expect(weekdayInTimezone(moment, 'Europe/London')).toBe(7);
  });

  it('минуты с полуночи считаются по городу', () => {
    const moment = new Date('2026-09-19T21:30:00Z');

    expect(minutesInTimezone(moment, 'Europe/Moscow')).toBe(minutesFromTime('00:30'));
    expect(minutesInTimezone(moment, 'UTC')).toBe(minutesFromTime('21:30'));
  });
});

describe('Частичное сохранение не сбрасывает поля', () => {
  it('правка одной галочки не трогает остальные настройки', () => {
    // Zod подставляет значения по умолчанию даже в .partial(), поэтому
    // умолчания живут только в схеме создания. Иначе включение приёма
    // заказов молча выключало бы доставку и обнуляло минимальную сумму.
    const parsed = updateMyPlaceSchema.parse({ ordersEnabled: true });

    expect(parsed).toEqual({ ordersEnabled: true });
    expect('hasDelivery' in parsed).toBe(false);
    expect('minOrderAmount' in parsed).toBe(false);
  });

  it('у создания умолчания остаются', () => {
    const parsed = createPlaceSchema.parse({
      cityId: '3f6a2c2e-5a1e-4a5d-9a1a-1f1c2d3e4f50',
      type: 'cafe',
      name: 'Кофейня',
      address: 'улица Ленина, 1',
    });

    expect(parsed.hasPickup).toBe(true);
    expect(parsed.hasDelivery).toBe(false);
    expect(parsed.minOrderAmount).toBe(0);
    expect(parsed.isActive).toBe(true);
  });

  it('правка позиции меню тоже частичная', () => {
    const parsed = updateMenuItemSchema.parse({ price: 12345 });

    expect(parsed).toEqual({ price: 12345 });
  });
});

describe('категории витрины (Этап 6)', () => {
  it('у каждой начальной категории есть название и хотя бы одно правило отбора', () => {
    for (const category of SEED_PLACE_CATEGORIES) {
      expect(category.name.length).toBeGreaterThan(1);
      expect(category.cuisines.length + category.types.length).toBeGreaterThan(0);
    }
  });

  it('коды категорий не повторяются', () => {
    const slugs = SEED_PLACE_CATEGORIES.map((category) => category.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('слова правил записаны в нижнем регистре: сравнение идёт по вхождению', () => {
    for (const category of SEED_PLACE_CATEGORIES) {
      for (const word of category.cuisines) {
        expect(word).toBe(word.toLowerCase());
      }
    }
  });

  it('«Дагестанская кухня» попадает в «Традиционную», хотя слово написано иначе', () => {
    const traditional = SEED_PLACE_CATEGORIES.find((c) => c.slug === 'traditional')!;

    expect(
      placeMatchesCategory({ cuisines: ['Дагестанская кухня'], type: 'restaurant' }, traditional),
    ).toBe(true);
  });

  it('хинкальная попадает в «Традиционную», даже если кухня названа одним словом', () => {
    const traditional = SEED_PLACE_CATEGORIES.find((c) => c.slug === 'traditional')!;

    expect(placeMatchesCategory({ cuisines: ['хинкал'], type: 'cafe' }, traditional)).toBe(true);
  });

  it('шашлычная не попадает в «Пиццу»', () => {
    const pizza = SEED_PLACE_CATEGORIES.find((c) => c.slug === 'pizza')!;

    expect(placeMatchesCategory({ cuisines: ['шашлык'], type: 'restaurant' }, pizza)).toBe(false);
  });

  it('вид заведения тоже относит его к категории: супермаркет — это «Продукты»', () => {
    const grocery = SEED_PLACE_CATEGORIES.find((c) => c.slug === 'grocery')!;

    expect(placeMatchesCategory({ cuisines: [], type: 'supermarket' }, grocery)).toBe(true);
  });

  it('код новой категории проверяется: только латиница, цифры и дефис', () => {
    const base = { name: 'Пельменные' };

    expect(createPlaceCategorySchema.safeParse({ ...base, slug: 'dumplings' }).success).toBe(true);
    expect(createPlaceCategorySchema.safeParse({ ...base, slug: 'fast-food' }).success).toBe(true);
    expect(createPlaceCategorySchema.safeParse({ ...base, slug: 'Пельмени' }).success).toBe(false);
    expect(createPlaceCategorySchema.safeParse({ ...base, slug: 'a b' }).success).toBe(false);
    expect(createPlaceCategorySchema.safeParse({ ...base, slug: '-x-' }).success).toBe(false);
  });

  it('код приводится к нижнему регистру: ссылки не должны зависеть от регистра', () => {
    const parsed = createPlaceCategorySchema.parse({ name: 'Гриль', slug: 'GRILL' });

    expect(parsed.slug).toBe('grill');
  });

  it('у новой категории правила пустые, а сама она включена', () => {
    const parsed = createPlaceCategorySchema.parse({ name: 'Пельменные', slug: 'dumplings' });

    expect(parsed.cuisines).toEqual([]);
    expect(parsed.types).toEqual([]);
    expect(parsed.isActive).toBe(true);
  });
});

describe('отзывы: проверка данных (Этап 6)', () => {
  it('оценка обязательна и лежит в 1..5', () => {
    expect(upsertReviewSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(upsertReviewSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(upsertReviewSchema.safeParse({ rating: 3.5 }).success).toBe(false);
    expect(upsertReviewSchema.safeParse({}).success).toBe(false);
    expect(upsertReviewSchema.safeParse({ rating: 5 }).success).toBe(true);
  });

  it('текст необязателен: большинство людей ставят звёзды, но не пишут', () => {
    const parsed = upsertReviewSchema.parse({ rating: 4 });

    expect(parsed.text).toBeUndefined();
  });

  it('слишком длинный отзыв отклоняется', () => {
    const long = 'а'.repeat(1001);

    expect(upsertReviewSchema.safeParse({ rating: 4, text: long }).success).toBe(false);
  });

  it('ответ заведения не может быть пустым', () => {
    expect(replyReviewSchema.safeParse({ reply: ' ' }).success).toBe(false);
    expect(replyReviewSchema.safeParse({ reply: 'Спасибо!' }).success).toBe(true);
  });
});
