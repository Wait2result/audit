import {
  SEARCH_HISTORY_LIMIT,
  SearchHistory,
  listingCategoryNeedsConfirmation,
  listingPartOf,
  parseHistory,
  pushHistory,
  removeFromHistory,
  type SearchHistoryStorage,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { MAKHACHKALA, harness } from './helpers/smart-search-fixtures.js';

/**
 * Поиск в «Объявлениях»: история запросов (4 последних, без повторов, своё
 * «×» и «Очистить») и подтверждение найденной категории («Подходит» /
 * «Выбрать другую категорию») — вместо строки «Понял запрос».
 */

/** Память телефона в тестах: переживает «перезапуск» — новый экземпляр истории. */
class MemoryStorage implements SearchHistoryStorage {
  readonly data = new Map<string, string>();
  get(key: string) {
    return Promise.resolve(this.data.get(key) ?? null);
  }
  set(key: string, value: string) {
    this.data.set(key, value);
    return Promise.resolve();
  }
  remove(key: string) {
    this.data.delete(key);
    return Promise.resolve();
  }
}

const KEY = 'dg.listingSearchHistory';
const restart = (storage: MemoryStorage) => new SearchHistory(storage, KEY);

describe('История поиска объявлений', () => {
  it('выполненный поиск «Конь» остаётся в истории после перезапуска', async () => {
    const storage = new MemoryStorage();
    await restart(storage).add('Конь');
    expect(await restart(storage).load()).toEqual(['Конь']);
  });

  it('повтор «Конь» не дублируется — запрос один и поднимается наверх', async () => {
    const storage = new MemoryStorage();
    const history = restart(storage);
    await history.add('Конь');
    await history.add('iPhone 16');
    await history.add('конь');
    expect(await restart(storage).load()).toEqual(['конь', 'iPhone 16']);
  });

  it('пять разных поисков — остаются четыре последних', async () => {
    const storage = new MemoryStorage();
    const history = restart(storage);
    for (const text of ['Конь', 'Вязка', 'Телефон iPhone', 'Диски R16', 'Вариатор на суксид']) {
      await history.add(text);
    }
    expect(SEARCH_HISTORY_LIMIT).toBe(4);
    expect(await restart(storage).load()).toEqual([
      'Вариатор на суксид',
      'Диски R16',
      'Телефон iPhone',
      'Вязка',
    ]);
  });

  it('«×» у запроса удаляет только его', async () => {
    const storage = new MemoryStorage();
    const history = restart(storage);
    for (const text of ['Конь', 'Вязка', 'Диски R16']) await history.add(text);
    await history.remove('Вязка');
    expect(await restart(storage).load()).toEqual(['Диски R16', 'Конь']);
  });

  it('«Очистить» удаляет всё — и после перезапуска история пустая', async () => {
    const storage = new MemoryStorage();
    const history = restart(storage);
    for (const text of ['Конь', 'Вязка']) await history.add(text);
    await history.clear();
    expect(await history.load()).toEqual([]);
    expect(storage.data.has(KEY)).toBe(false);
    expect(await restart(storage).load()).toEqual([]);
  });

  it('очищенная история не воскресает, если другой экран держал старую копию', async () => {
    // Регрессия: главная и выдача держали по своей копии; теперь копия одна
    const storage = new MemoryStorage();
    const shared = restart(storage);
    await shared.add('Конь');
    await shared.clear();
    await shared.add('Вязка');
    expect(await restart(storage).load()).toEqual(['Вязка']);
  });

  it('набранный, но не выполненный текст в историю не попадает', async () => {
    const storage = new MemoryStorage();
    const history = restart(storage);
    await history.load();
    // Набор текста не пишет ничего: в историю ведёт только add (поиск выполнен)
    expect(storage.data.size).toBe(0);
    expect(await restart(storage).load()).toEqual([]);
  });

  it('пустое, слишком короткое и пробелы — не запросы', () => {
    expect(pushHistory([], ' ')).toEqual([]);
    expect(pushHistory([], 'к')).toEqual([]);
    expect(pushHistory([], '  конь   на   продажу ')).toEqual(['конь на продажу']);
  });

  it('старая запись (до десяти запросов, с повторами) читается по новым правилам', () => {
    const old = JSON.stringify(['a1', 'Конь', 'конь', 'b2', 'c3', 'd4', 'e5', 7, null]);
    expect(parseHistory(old)).toEqual(['a1', 'Конь', 'b2', 'c3']);
    expect(parseHistory('{испорчено')).toEqual([]);
    expect(removeFromHistory(['Конь', 'Вязка'], 'КОНЬ')).toEqual(['Вязка']);
  });
});

describe('Найденная категория: подтверждение «Подходит»', () => {
  const understand = async (text: string) => {
    const h = harness({ parser: 'local' });
    const response = await h.service.search({
      text,
      limit: 1,
      context: { cityId: MAKHACHKALA.id, screen: 'listings' },
    });
    const part = listingPartOf(response);
    return { query: part?.query ?? null, calls: h.calls };
  };

  it('«Конь» → Сельхозживотные, и это предположение — его подтверждают', async () => {
    const { query } = await understand('Конь');
    expect(query?.params.category).toBe('animals-livestock');
    expect(listingCategoryNeedsConfirmation(query!, null)).toBe(true);
  });

  it('внутри уже открытых «Сельхозживотных» спрашивать нечего', async () => {
    const { query } = await understand('Конь');
    expect(listingCategoryNeedsConfirmation(query!, 'animals-livestock')).toBe(false);
  });

  it.each(['Toyota Succeed', 'детское кресло', 'вариатор на суксид', 'iphone 16'])(
    '«%s» однозначен (марка, модель, деталь или тип товара) — выдача сразу',
    async (text) => {
      const { query } = await understand(text);
      expect(listingCategoryNeedsConfirmation(query!, null)).toBe(false);
    },
  );

  it('«конь до 100 тысяч» — названа цена, это уже не одна категория', async () => {
    const { query } = await understand('конь до 100 тысяч');
    expect(listingCategoryNeedsConfirmation(query!, null)).toBe(false);
  });

  it('«диски r16»: тип товара в условиях один раз', async () => {
    const { query } = await understand('диски r16');
    const fields = query!.conditions.map((condition) => condition.field);
    expect(fields.filter((field) => field === 'tireType')).toHaveLength(1);
  });
});
