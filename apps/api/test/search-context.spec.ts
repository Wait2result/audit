import { SearchHistory, type SmartSearchResponse } from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { isFollowUp } from '../src/modules/smart-search/smart-search.service.js';
import { bodyOrEngineCode, renderSql, searchSql } from '../src/modules/listings/listing-query.js';
import { MAKHACHKALA, attributesOf, harness } from './helpers/smart-search-fixtures.js';

/**
 * Где искать — решает открытая категория, а не история, не прошлый поиск и не
 * последний открытый раздел (ТЗ аудита, п. 2–10).
 *
 * Ошибка, которую закрывают эти тесты: человек искал «рейку» в «Доме и
 * ремонте», перешёл в «Транспорт → Автомобили → Запчасти», набрал «NCP165» —
 * и оказался снова в «Доме и ремонте». Сессия умного поиска одна на все
 * экраны объявлений, сервер считал короткую фразу уточнением прошлого поиска
 * и брал из него категорию.
 */

type Step = { text: string; category?: string };

/** Несколько фраз подряд в одной сессии — как на телефоне. */
async function session(steps: Step[]) {
  const h = harness({ parser: 'local' });
  let sessionId: string | undefined;
  const answers: {
    response: SmartSearchResponse;
    query: (typeof h.calls.listings)[number] | undefined;
  }[] = [];
  for (const step of steps) {
    const before = h.calls.listings.length;
    const response = await h.service.search({
      text: step.text,
      limit: 1,
      ...(sessionId ? { sessionId } : {}),
      context: {
        cityId: MAKHACHKALA.id,
        screen: 'listings',
        ...(step.category ? { listingCategory: step.category } : {}),
      },
    });
    sessionId = response.sessionId;
    answers.push({
      response,
      query: h.calls.listings.length > before ? h.calls.listings.at(-1) : undefined,
    });
  }
  return answers;
}

const last = <T>(items: T[]): T => items[items.length - 1]!;

describe('поиск в открытой категории: прошлый поиск не выбирает категорию', () => {
  it('сценарий 1: «рейка» в «Доме и ремонте», потом «NCP165» в запчастях — запчасти', async () => {
    const answers = await session([
      { text: 'рейка', category: 'home' },
      { text: 'NCP165', category: 'transport-parts' },
    ]);
    const { query } = last(answers);
    expect(query?.category).toBe('transport-parts');
    expect(String(query?.search)).toContain('ncp165');
  });

  it('то же с пробелом: «NCP 165» — код кузова целиком, «165» не теряется', async () => {
    const answers = await session([
      { text: 'рейка', category: 'home' },
      { text: 'NCP 165', category: 'transport-parts' },
    ]);
    const { query } = last(answers);
    expect(query?.category).toBe('transport-parts');
    expect(query?.search).toBe('ncp165');
  });

  it('сценарий 2: «рейка» в «Доме и ремонте» ищется словом, а не превращается во весь раздел', async () => {
    const [answer] = await session([{ text: 'рейка', category: 'home' }]);
    expect(answer!.query?.category).toBe('home');
    expect(answer!.query?.search).toBe('рейка');
  });

  it('сценарий 3: история с «рейкой» не влияет на категорию нового запроса', async () => {
    const data = new Map<string, string>();
    const history = new SearchHistory(
      {
        get: (key) => Promise.resolve(data.get(key) ?? null),
        set: (key, value) => Promise.resolve(void data.set(key, value)),
        remove: (key) => Promise.resolve(void data.delete(key)),
      },
      'test.history',
    );
    await history.add('рейка');
    const answers = await session([{ text: 'NCP165', category: 'transport-parts' }]);
    expect(await history.load()).toEqual(['рейка']);
    expect(last(answers).query?.category).toBe('transport-parts');
  });

  it('сценарий 4: последний открытый раздел — «Дом и ремонт», поиск в запчастях — по запчастям', async () => {
    const answers = await session([
      { text: 'смеситель', category: 'home' },
      { text: 'краска', category: 'home' },
      { text: 'NCP165', category: 'transport-parts' },
    ]);
    expect(last(answers).query?.category).toBe('transport-parts');
  });

  it('прошлый поиск в той же категории, ушедший в другой раздел, тоже не уводит', async () => {
    const answers = await session([
      { text: 'смеситель', category: 'transport-parts' },
      { text: 'NCP 165', category: 'transport-parts' },
    ]);
    for (const { query } of answers) expect(query?.category).toBe('transport-parts');
  });

  it('без категории: код кузова после «смесителя» — новый поиск, а не уточнение смесителей', async () => {
    const answers = await session([{ text: 'смеситель' }, { text: 'NCP 165' }]);
    const { query } = last(answers);
    expect(query?.category).toBeUndefined();
    expect(query?.search).toBe('ncp165');
  });

  it('уточнение в той же категории работает: «Toyota Succeed» → «до миллиона»', async () => {
    const answers = await session([
      { text: 'Toyota Succeed', category: 'transport-cars' },
      { text: 'до миллиона', category: 'transport-cars' },
    ]);
    const { query } = last(answers);
    expect(query?.category).toBe('transport-cars');
    expect(attributesOf(query)).toMatchObject({ brand: 'toyota', model: 'succeed' });
    expect(query?.priceTo).toBe(100_000_000);
  });

  it('уточнение не переносится в другую категорию: «до миллиона» в запчастях — без Succeed', async () => {
    const answers = await session([
      { text: 'Toyota Succeed', category: 'transport-cars' },
      { text: 'до миллиона', category: 'transport-parts' },
    ]);
    const { query } = last(answers);
    expect(query?.category).toBe('transport-parts');
    expect(attributesOf(query).model).toBeUndefined();
  });
});

describe('слова другой категории не уводят из открытой', () => {
  it('«Конь» в запчастях: ищется словом в запчастях, «Сельхозживотные» — только подсказка', async () => {
    const [answer] = await session([{ text: 'Конь', category: 'transport-parts' }]);
    expect(answer!.query?.category).toBe('transport-parts');
    expect(answer!.query?.search).toBe('конь');
    expect(answer!.response.parts[0]?.query?.elsewhere?.slug).toBe('animals-livestock');
  });

  it('«Конь» без открытой категории — сама категория «Сельхозживотные»', async () => {
    const [answer] = await session([{ text: 'Конь' }]);
    expect(answer!.query?.category).toBe('animals-livestock');
    expect(answer!.response.parts[0]?.query?.elsewhere ?? null).toBeNull();
  });

  it('«Toyota Succeed» в запчастях — «Подходит к», а не переход в «Автомобили»', async () => {
    const [answer] = await session([{ text: 'Toyota Succeed', category: 'transport-parts' }]);
    expect(answer!.query?.category).toBe('transport-parts');
    expect(attributesOf(answer!.query)).toMatchObject({
      compatBrand: 'toyota',
      compatModel: 'succeed',
    });
    expect(answer!.response.parts[0]?.query?.elsewhere ?? null).toBeNull();
  });

  it('«iPhone 18» в запчастях машин — словами в запчастях', async () => {
    const [answer] = await session([{ text: 'iPhone 18', category: 'transport-parts' }]);
    expect(answer!.query?.category).toBe('transport-parts');
    expect(String(answer!.query?.search)).toContain('18');
  });

  it('«NCP165» в «Доме и ремонте»: ищется там же, автозапчасти — подсказка', async () => {
    const [answer] = await session([{ text: 'NCP165', category: 'home' }]);
    expect(answer!.query?.category).toBe('home');
    expect(answer!.query?.search).toBe('ncp165');
    expect(answer!.response.parts[0]?.query?.elsewhere?.slug).toBe('transport-parts');
  });

  it('направление внутри открытого основного типа — можно: «рейка» в «Автомобилях» → запчасти', async () => {
    const [answer] = await session([{ text: 'рейка суксид', category: 'transport' }]);
    expect(answer!.query?.category).toBe('transport-parts');
  });
});

describe('нераспознанное остаётся словами поиска', () => {
  it('«iPhone 18» без категории: модели нет в справочнике — число остаётся в поиске', async () => {
    const [answer] = await session([{ text: 'iPhone 18' }]);
    expect(String(answer!.query?.search ?? '')).toContain('18');
  });

  it('«редкая деталь XYZ-123» — не пустой фильтр', async () => {
    const [answer] = await session([{ text: 'редкая деталь XYZ-123' }]);
    expect(answer!.query?.search ?? attributesOf(answer!.query).partNumber).toBeTruthy();
  });
});

describe('номера деталей: любое название номера — поиск по номеру', () => {
  const PHRASES = [
    'артикул 45510-52010',
    'номер детали 45510-52010',
    'номер запчасти 45510-52010',
    'каталожный номер 45510-52010',
    'номер производителя 45510-52010',
    'OEM 45510-52010',
    'номер замены 45510-52010',
    'кросс 45510-52010',
    'кросс-номер 45510-52010',
  ];
  for (const text of PHRASES) {
    it(`«${text}» в запчастях → номер 45510-52010, без лишних слов`, async () => {
      const [answer] = await session([{ text, category: 'transport-parts' }]);
      expect(attributesOf(answer!.query).partNumber).toBe('45510-52010');
      expect(answer!.query?.search).toBeUndefined();
      expect(attributesOf(answer!.query).motoType).toBeUndefined();
    });
  }

  it('«кросс 45510-52010» без категории — не мотоцикл «кросс»', async () => {
    const [answer] = await session([{ text: 'кросс 45510-52010' }]);
    expect(attributesOf(answer!.query).motoType).toBeUndefined();
    expect(String(answer!.query?.search)).toContain('45510-52010');
  });
});

describe('продолжение или новый поиск', () => {
  it.each(['NCP165', 'NCP 165', '1NZ', '45510-52010', 'Denso 90915-YZZD1'])(
    '«%s» — новый поиск',
    (text) => expect(isFollowUp(text)).toBe(false),
  );
  it.each(['до миллиона', 'а автомат?', '2015', 'в Каспийске'])('«%s» — уточнение', (text) =>
    expect(isFollowUp(text)).toBe(true),
  );
});

describe('поиск словами находит код кузова в «Подходит к»', () => {
  it('код кузова и мотора распознаётся', () => {
    expect(bodyOrEngineCode('NCP165')).toBe('NCP165');
    expect(bodyOrEngineCode('ncp160')).toBe('NCP160');
    expect(bodyOrEngineCode('1NZ')).toBe('1NZ');
    expect(bodyOrEngineCode('1nz-fe')).toBe('1NZ-FE');
    expect(bodyOrEngineCode('рейка')).toBeNull();
    expect(bodyOrEngineCode('ncp 165')).toBeNull();
  });

  it('«NCP165» ищется и по совместимости запчасти', () => {
    const sql = renderSql(searchSql('NCP165')!);
    expect(sql).toContain('listing_compatibility');
    expect(sql).toContain("'NCP165%'");
  });

  it('обычное слово совместимость не трогает', () => {
    expect(renderSql(searchSql('диван')!)).not.toContain('listing_compatibility');
  });
});

describe('марка открытой категории сильнее модели чужой техники', () => {
  it('«Galaxy» в «Телефонах» — Samsung, а не поиск «ford galaxy»', async () => {
    const [answer] = await session([{ text: 'Galaxy', category: 'electronics-phones' }]);
    const query = answer!.query;
    expect(query?.category).toBe('electronics-phones');
    expect(String(query?.attributes)).toContain('"brand":"samsung"');
    expect(String(query?.search ?? '')).not.toContain('ford');
  });

  it('вне категории «Galaxy» по-прежнему решает общий разбор', async () => {
    const [answer] = await session([{ text: 'Ford Galaxy', category: 'transport-cars' }]);
    expect(String(answer!.query?.attributes)).toContain('"brand":"ford"');
  });
});
