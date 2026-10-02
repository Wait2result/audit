import { describe, expect, it } from 'vitest';

import {
  classifyDagestan,
  classifyNational,
  datelinePlace,
  sameStory,
  stems,
  type DagestanInput,
} from '../src/modules/news/news-classifier.js';
import { isAdvertising, isPaidCategory } from '../src/modules/news/ads.js';
import { extractArticle } from '../src/modules/news/article.js';
import { findDuplicates } from '../src/modules/news/dedupe.js';
import { articleKey, parseListing, pathOf } from '../src/modules/news/listing.js';
import { extractPageImage, extractSliderImage } from '../src/modules/news/page-image.js';
import { htmlToParagraphs, parseFeed } from '../src/modules/news/rss.js';

const cities = [
  { id: 'mkh', name: 'Махачкала' },
  { id: 'kas', name: 'Каспийск' },
  { id: 'der', name: 'Дербент' },
];

function input(overrides: Partial<DagestanInput>): DagestanInput {
  return {
    title: '',
    bodyStart: '',
    category: null,
    description: '',
    hasImage: true,
    cities,
    ...overrides,
  };
}

/**
 * Правила отбора новостей Дагестана — на реальных заголовках из ленты
 * РИА «Дагестан». Правила без ИИ ошибаются на пограничных случаях; эти
 * примеры фиксируют то, что должно работать всегда.
 */
describe('Классификация новостей Дагестана', () => {
  it('пожар в городе показывается только в этом городе', () => {
    const verdict = classifyDagestan(
      input({
        title: 'В Махачкале горит автосервис, есть угроза распространения огня',
        description: 'МАХАЧКАЛА, 18 сентября',
      }),
    );
    expect(verdict).toMatchObject({ kind: 'kept', scope: 'city', cityId: 'mkh' });
  });

  it('выборы в республике показываются во всех городах', () => {
    const verdict = classifyDagestan(
      input({
        title: '32,8% избирателей Дагестана проголосовали в первый день парламентских выборов',
        category: 'Политика',
      }),
    );
    expect(verdict).toMatchObject({ kind: 'kept', scope: 'dagestan', cityId: null });
  });

  it('событие в городе, значимое для республики, — тоже во всех городах', () => {
    const verdict = classifyDagestan(
      input({
        title: 'Глава Махачкалы проголосовал на выборах в Народное Собрание Дагестана',
        description: 'МАХАЧКАЛА, 19 сентября',
      }),
    );
    expect(verdict).toMatchObject({ kind: 'kept', scope: 'dagestan' });
  });

  it('визит президента в столицу — новость всей республики', () => {
    const verdict = classifyDagestan(
      input({
        title: 'Путин принял участие в открытии новой ВПП аэропорта Махачкалы',
        description: 'МАХАЧКАЛА, 18 сентября',
      }),
    );
    expect(verdict).toMatchObject({ kind: 'kept', scope: 'dagestan' });
  });

  it('общероссийская заметка без связи с Дагестаном отсеивается', () => {
    const verdict = classifyDagestan(
      input({
        title: 'В России аллерген-специфическая иммунотерапия станет доступнее',
        bodyStart: 'Минздрав России сообщил о новом порядке.',
      }),
    );
    expect(verdict.kind).toBe('dropped');
  });

  it('название издания в подписи не считается упоминанием Дагестана', () => {
    const verdict = classifyDagestan(
      input({
        title: 'В России изменят правила выдачи льгот',
        bodyStart: 'Об этом сообщает РИА «Дагестан».',
        hasImage: false,
      }),
    );
    expect(verdict.kind).toBe('dropped');
  });

  it('малозначимая заметка без картинки не проходит порог', () => {
    const verdict = classifyDagestan(
      input({ title: 'В музее открылась выставка детских рисунков', hasImage: false }),
    );
    expect(verdict.kind).toBe('dropped');
  });

  it('новый город из таблицы City подхватывается без правки кода', () => {
    const verdict = classifyDagestan(
      input({
        title: 'В Избербаше горит склад, пострадали люди',
        cities: [...cities, { id: 'izb', name: 'Избербаш' }],
      }),
    );
    expect(verdict).toMatchObject({ kind: 'kept', scope: 'city', cityId: 'izb' });
  });
});

describe('Датлайн РИА «Дагестан»', () => {
  it('достаёт место из заглавных букв', () => {
    expect(datelinePlace('МАХАЧКАЛА, 18 сентября')).toBe('махачкала');
    expect(datelinePlace('КАСПИЙСК, 2 января.')).toBe('каспийск');
  });

  it('обычный текст с запятой местом не считается', () => {
    expect(datelinePlace('Сегодня в городе, как сообщили')).toBeNull();
  });
});

describe('Федеральные ленты', () => {
  it('«В мире», «Мир», «Бывший СССР» уходят в мировую ленту, «В России» и «Россия» — в российскую', () => {
    expect(classifyNational({ category: 'В мире' })).toMatchObject({
      kind: 'kept',
      scope: 'world',
    });
    expect(classifyNational({ category: 'Мир' })).toMatchObject({ kind: 'kept', scope: 'world' });
    expect(classifyNational({ category: 'Бывший СССР' })).toMatchObject({
      kind: 'kept',
      scope: 'world',
    });
    expect(classifyNational({ category: 'В России' })).toMatchObject({
      kind: 'kept',
      scope: 'russia',
    });
    expect(classifyNational({ category: 'Россия' })).toMatchObject({
      kind: 'kept',
      scope: 'russia',
    });
    expect(classifyNational({ category: 'Силовые структуры' })).toMatchObject({
      kind: 'kept',
      scope: 'russia',
    });
  });

  it('развлекательные и «жизненные» рубрики, спорт и Москва в ленты не попадают', () => {
    for (const category of [
      'Москва',
      'Спорт',
      'Из жизни',
      'Забота о себе',
      'Ценности',
      'Путешествия',
      'Авто',
      null,
    ]) {
      expect(classifyNational({ category }).kind).toBe('dropped');
    }
  });
});

describe('Один и тот же сюжет у разных агентств', () => {
  it('узнаёт событие, описанное разными падежами', () => {
    const tass = stems('ВС РФ уничтожили 12 украинских беспилотников над Белгородской областью');
    const interfax = stems(
      'Над Белгородской областью уничтожены украинские беспилотники — Минобороны',
    );
    expect(sameStory(tass, interfax)).toBe(true);
  });

  it('разные события не склеиваются', () => {
    const one = stems('ЦБ сохранил ключевую ставку на прежнем уровне');
    const two = stems('В Токио прошёл первый матч чемпионата мира по волейболу');
    expect(sameStory(one, two)).toBe(false);
  });

  it('пустой текст ни с чем не совпадает', () => {
    expect(sameStory(new Set(), stems('любой заголовок новости'))).toBe(false);
  });
});

describe('Разбор RSS', () => {
  it('превращает HTML полного текста в абзацы обычного текста', () => {
    const paragraphs = htmlToParagraphs(
      '<p>Первый <b>абзац</b>&nbsp;с&nbsp;«кавычками».</p><p>Второй <a href="/x">абзац</a>.</p><script>alert(1)</script>',
    );
    expect(paragraphs[0]).toBe('Первый абзац с «кавычками».');
    expect(paragraphs[1]).toBe('Второй абзац.');
    expect(paragraphs.join(' ')).not.toContain('<');
  });

  it('не оставляет пробел перед точкой после выделенной подписи', () => {
    expect(htmlToParagraphs('<p><b>РИА «Дагестан».</b> Текст.</p>')[0]).toBe(
      'РИА «Дагестан». Текст.',
    );
  });

  it('разбирает ленту в формате Яндекс.Новостей', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:yandex="http://news.yandex.ru"><channel>
  <item>
    <title>Заголовок</title>
    <link>https://example.ru/1</link>
    <guid>1</guid>
    <pubDate>Fri, 18 Sep 2026 10:00:00 +0300</pubDate>
    <category>Политика</category>
    <description>МАХАЧКАЛА, 18 сентября</description>
    <enclosure url="https://example.ru/1.jpg" type="image/jpeg"/>
    <yandex:full-text>&lt;p&gt;Один.&lt;/p&gt;&lt;p&gt;Два.&lt;/p&gt;</yandex:full-text>
  </item>
  <item><title>Без ссылки</title></item>
</channel></rss>`;

    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Заголовок',
      url: 'https://example.ru/1',
      category: 'Политика',
      imageUrl: 'https://example.ru/1.jpg',
      paragraphs: ['Один.', 'Два.'],
    });
  });

  it('пустая или битая лента не роняет сбор', () => {
    expect(parseFeed('<rss><channel></channel></rss>')).toEqual([]);
  });
});

describe('Чтение страницы статьи', () => {
  const page = `<html><body>
    <div class="timeline"><a href="/russia/1"><img src="/chужое.jpg"></a></div>
    <article itemprop="articleBody">
      <h1 itemprop="headline">Заголовок статьи</h1>
      <p>Москва. 19 сентября. INTERFAX.RU - Первый абзац текста новости.</p>
      <p>"Прямая речь", - сказал он.</p>
      <p>Читайте также: другая новость</p>
      <img src="/ftproot/photo.jpg">
      <script>window.x = 1</script>
    </article>
  </body></html>`;

  it('берёт только тело статьи, без заголовка и служебных строк', () => {
    const article = extractArticle(page, 'https://www.interfax.ru/world/123');
    expect(article?.paragraphs).toEqual([
      'Москва. 19 сентября. INTERFAX.RU - Первый абзац текста новости.',
      '"Прямая речь", - сказал он.',
    ]);
  });

  it('берёт фото из самой статьи, а не из боковой ленты', () => {
    const article = extractArticle(page, 'https://www.interfax.ru/world/123');
    expect(article?.imageUrl).toBe('https://www.interfax.ru/ftproot/photo.jpg');
  });

  it('страница без тела статьи не ломает сбор', () => {
    expect(
      extractArticle('<html><body><p>Тут нет статьи</p></body></html>', 'https://x.ru/1'),
    ).toBeNull();
    expect(extractArticle('<article><div>пусто</div></article>', 'https://x.ru/1')).toBeNull();
  });
});

describe('Местные издания и страницы городов', () => {
  it('заметка местного издания без названия города в заголовке уходит в городскую ленту', () => {
    const verdict = classifyDagestan(
      input({
        title: 'Врио главы принял участие в заседании комиссии',
        hasImage: false,
        homeCity: cities[1],
      }),
    );
    expect(verdict).toMatchObject({ kind: 'kept', scope: 'city', cityId: 'kas' });
  });

  it('республиканская новость из местного издания всё равно уходит всем городам', () => {
    const verdict = classifyDagestan(
      input({
        title: 'Путин открыл в Дагестане новую взлётную полосу аэропорта',
        homeCity: cities[1],
      }),
    );
    expect(verdict).toMatchObject({ kind: 'kept', scope: 'dagestan', cityId: null });
  });

  it('город, названный в заголовке, важнее города страницы', () => {
    const verdict = classifyDagestan(
      input({ title: 'В Дербенте горит склад, пострадали люди', homeCity: cities[0] }),
    );
    expect(verdict).toMatchObject({ kind: 'kept', scope: 'city', cityId: 'der' });
  });

  it('разбирает карточки страницы города', () => {
    const html = `
      <article class="news-card">
        <a href="https://riadagestan.ru/news/g_derbent/nazvanie"><div><img src="/storage/news/AbC_medium.webp" alt="x"></div></a>
        <div class="news-card-body">
          <h3 class="news-card-title"><a href="https://riadagestan.ru/news/g_derbent/nazvanie" class="news-card-title-link">В Дербенте открыли &laquo;сквер&raquo;</a></h3>
          <div class="news-card-meta"> 14.09.2026 14:19 </div>
        </div>
      </article>
      <article class="news-card"><div>карточка без ссылки и даты</div></article>`;

    const items = parseListing(html, 'https://riadagestan.ru');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'В Дербенте открыли «сквер»',
      url: 'https://riadagestan.ru/news/g_derbent/nazvanie',
      imageUrl: 'https://riadagestan.ru/storage/news/AbC.webp',
    });
    expect(items[0]?.publishedAt.toISOString()).toBe('2026-09-14T11:19:00.000Z');
  });

  it('заметку из ленты и со страницы города сопоставляет по пути, а не по домену', () => {
    expect(pathOf('https://riadagestan.ru/news/g_derbent/x')).toBe(
      pathOf('http://www.riadagestan.ru/news/g_derbent/x'),
    );
  });
});

describe('Реклама', () => {
  it('узнаёт обязательную маркировку: «Реклама | ИНН | erid»', () => {
    expect(
      isAdvertising('Магнит будет собирать урожай', [
        'Обычный текст новости.',
        'Реклама | АО "ТАНДЕР" | ИНН 2310031475 | erid: CQH36pWzJqVGY33CHGBz2uDrLLCBYWdgkNzsHsVQuCtQEV',
      ]),
    ).toBe(true);
  });

  it('узнаёт маркировку вида «Реклама, 18+ АНО …»', () => {
    expect(
      isAdvertising('Школа', ['Текст.', 'Реклама, 18+ АНО ДПО «Академия ИТ», ИНН 0600010064']),
    ).toBe(true);
  });

  it('узнаёт токен erid отдельно от слова «реклама»', () => {
    expect(isAdvertising('Заголовок', ['Текст. erid: 2VtzqwQkXyZ9abc'])).toBe(true);
  });

  it('узнаёт пометки платных и партнёрских материалов', () => {
    expect(isAdvertising('Заголовок', ['Материал опубликован на правах рекламы.'])).toBe(true);
    expect(isAdvertising('Заголовок', ['Партнёрский материал'])).toBe(true);
  });

  it('обычная новость про рекламу или про реки — не реклама', () => {
    expect(
      isAdvertising('ФАС оштрафовала магазин за рекламу', [
        'ФАС сообщила о нарушении закона о рекламе.',
      ]),
    ).toBe(false);
    expect(isAdvertising('Вода в реке Терек поднялась', ['Уровень воды вырос на 40 см.'])).toBe(
      false,
    );
    expect(isAdvertising('Заголовок', null)).toBe(false);
  });

  it('рубрики платных материалов отсеиваются', () => {
    expect(isPaidCategory('Новости компаний')).toBe(true);
    expect(isPaidCategory('Публикации от партнеров')).toBe(true);
    expect(isPaidCategory('Политика')).toBe(false);
    expect(isPaidCategory(null)).toBe(false);
  });
});

describe('Лента и картинки', () => {
  const wrap = (item: string) =>
    `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item>
      <title>Заголовок</title><link>https://x.ru/1</link><guid>1</guid>
      <pubDate>Fri, 18 Sep 2026 10:00:00 +0300</pubDate>${item}
    </item></channel></rss>`;

  it('видео в enclosure не принимает за картинку', () => {
    const xml = wrap('<enclosure url="https://x.ru/video.mp4" length="1" type="video/mp4"/>');
    expect(parseFeed(xml)[0]?.imageUrl).toBeNull();
  });

  it('пропускает смайлы и берёт настоящее фото из текста', () => {
    const xml = wrap(
      '<content:encoded><![CDATA[<p><img src="https://s.w.org/images/core/emoji/16.0.1/72x72/1f537.png"> Текст <img src="https://x.ru/photo.jpg"></p>]]></content:encoded>',
    );
    expect(parseFeed(xml)[0]?.imageUrl).toBe('https://x.ru/photo.jpg');
  });

  it('приводит рубрику из капса к обычному виду', () => {
    expect(parseFeed(wrap('<category>ПРОИСШЕСТВИЯ: ДТП </category>'))[0]?.category).toBe(
      'Происшествия',
    );
    expect(parseFeed(wrap('<category>Политика</category>'))[0]?.category).toBe('Политика');
  });

  it('читает текст страницы Ленты.ру по абзацам с её классом', () => {
    const html = `<div class="topic-body__content">
      <p class="topic-body__content-text">Первый абзац новости.</p>
      <p class="topic-body__content-text">Второй абзац с <a href="/x">ссылкой</a>.</p>
    </div><p>Подвал сайта, который в текст не входит</p>`;
    expect(extractArticle(html, 'https://lenta.ru/news/1')?.paragraphs).toEqual([
      'Первый абзац новости.',
      'Второй абзац с ссылкой.',
    ]);
  });
});

describe('Мелочи разбора', () => {
  it('«Дербентский район» не считается городом Дербент', () => {
    const verdict = classifyDagestan(
      input({ title: 'В Дербентском районе горит склад, пострадали люди', hasImage: true }),
    );
    // Малая территория без своей вкладки — не наш город: в городскую ленту не попадает
    expect(verdict.kind === 'kept' ? verdict.scope : null).not.toBe('city');
  });

  it('убирает эмодзи из текста новости', () => {
    const paragraphs = htmlToParagraphs(
      '<p>🏆Бронзовую медаль завоевал воспитанник 🥉 секции.</p><p>🔷 Итоги</p>',
    );
    expect(paragraphs).toEqual(['Бронзовую медаль завоевал воспитанник секции.', 'Итоги']);
  });
});

describe('Слово «Дагестан» в городской заметке', () => {
  it('концерт в городе ко Дню единства народов Дагестана остаётся городской новостью', () => {
    const verdict = classifyDagestan(
      input({
        title: 'Жасмин даст бесплатный концерт в Дербенте в День единства народов Дагестана',
      }),
    );
    expect(verdict).toMatchObject({ kind: 'kept', scope: 'city', cityId: 'der' });
  });

  it('без названия города то же слово по-прежнему делает новость республиканской', () => {
    const verdict = classifyDagestan(
      input({ title: 'В Дагестане построят новую автодорогу к горным селам' }),
    );
    expect(verdict).toMatchObject({ kind: 'kept', scope: 'dagestan' });
  });
});

describe('Издания обо всём Кавказе', () => {
  it('заметка без упоминания Дагестана отсеивается', () => {
    const verdict = classifyDagestan(
      input({ title: 'Президент Киргизии прибыл в США с рабочим визитом', requireMention: true }),
    );
    expect(verdict.kind).toBe('dropped');
  });

  it('заметка про Дагестан проходит', () => {
    const verdict = classifyDagestan(
      input({ title: 'Дагестан получит 2,5 млрд рублей на ремонт дамбы', requireMention: true }),
    );
    expect(verdict.kind).toBe('kept');
  });
});

describe('Рубрики федеральных изданий', () => {
  it('Коммерсантъ: «Мир» — в мировую ленту, «Политика», «Происшествия», «Бизнес» — в российскую', () => {
    expect(classifyNational({ category: 'Мир' })).toMatchObject({ scope: 'world' });
    for (const category of ['Политика', 'Происшествия', 'Бизнес', 'Экономика', 'Общество']) {
      expect(classifyNational({ category })).toMatchObject({ kind: 'kept', scope: 'russia' });
    }
    for (const category of ['Спорт', 'Культура', 'Телекоммуникации', 'Новости']) {
      expect(classifyNational({ category }).kind).toBe('dropped');
    }
  });
});

describe('Фото на странице статьи', () => {
  const slider = `<div class="sidebar"><img src="/wp-content/uploads/2026/09/other-630x400.jpeg"></div>
    <div class="content_slider content_slider_single"><ul>
      <li style="background: URL('https://x.ru/wp-content/uploads/2026/09/IMG_1-630x400.jpeg')"><a href="https://x.ru/wp-content/uploads/2026/09/IMG_1.jpeg"></a></li>
    </ul></div>`;

  it('берёт фото из слайдера поста, а не из боковой ленты', () => {
    expect(extractSliderImage(slider, 'https://x.ru/p/1')).toBe(
      'https://x.ru/wp-content/uploads/2026/09/IMG_1.jpeg',
    );
  });

  it('без слайдера картинки нет — боковые превью чужих новостей не подходят', () => {
    expect(
      extractSliderImage('<img src="/wp-content/uploads/2026/09/other.jpeg">', 'https://x.ru/p/1'),
    ).toBeNull();
  });

  it('og:image важнее слайдера', () => {
    const html = `<meta property="og:image" content="https://x.ru/og.jpg">${slider}`;
    expect(extractPageImage(html, 'https://x.ru/p/1')).toBe('https://x.ru/og.jpg');
  });
});

describe('Повторы новостей', () => {
  const at = (hours: number) => new Date(Date.UTC(2026, 8, 18, 12) + hours * 3_600_000);
  let counter = 0;

  function row(overrides: Partial<Parameters<typeof findDuplicates>[0][number]>) {
    counter += 1;
    return {
      id: `n${counter}`,
      source: 'ria-dagestan',
      title: `Заголовок ${counter}`,
      lead: null,
      imageUrl: `https://x.ru/${counter}.jpg`,
      bodyLength: 1000,
      publishedAt: at(0),
      ...overrides,
    };
  }

  /** Заметки недели про выборы: общие слова есть у всех, но событий разные. */
  const week = [
    row({
      title: 'Врио главы Дагестана проголосовал на избирательном участке',
      lead: 'Фёдор Щукин проголосовал на выборах депутатов Госдумы и Народного Собрания Дагестана.',
    }),
    row({
      title: 'В РД в Единый день голосования задействуют 1726 избирательных участков',
      lead: 'В Дагестане в дни голосования будут работать участки, сообщили в избирательной комиссии республики.',
    }),
    row({
      title: 'Горячая линия для избирателей будет работать в дни голосования',
      lead: 'Позвонить на линию избирателям Дагестана можно круглосуточно.',
    }),
    row({
      title: 'Ветеран СВО Шамсудин Кубутаев проголосовал на выборах в Агульском районе',
      lead: 'Участник СВО пришёл на избирательный участок в Агульском районе Дагестана.',
    }),
    row({
      title: 'В Дагестане на треть снизилось число наркопреступлений',
      lead: 'Число преступлений, связанных с наркотиками, в республике снизилось на треть.',
    }),
  ];
  const priority = () => 0;

  it('разные новости одной «выборной» недели не считаются повторами', () => {
    expect(findDuplicates(week, priority)).toEqual([]);
  });

  it('точная копия заголовка — повтор, даже если в одном «ё», а в другом «е»', () => {
    const first = row({
      title: 'Фёдор Щукин и Глава Росавиации посетили компанию «Азимут»',
      imageUrl: 'https://x.ru/a.jpg',
      publishedAt: at(0),
    });
    const copy = row({
      title: 'Федор Щукин и Глава Росавиации посетили компанию «Азимут»',
      imageUrl: 'https://x.ru/b.jpg',
      publishedAt: at(1),
    });

    expect(findDuplicates([...week, first, copy], priority)).toEqual([copy.id]);
  });

  it('из двух копий остаётся та, у которой полнее текст', () => {
    const short = row({ title: 'Опережая график: новая ВПП аэропорта Махачкалы', bodyLength: 300 });
    const full = row({
      title: 'Опережая график: новая ВПП аэропорта Махачкалы',
      bodyLength: 4000,
      source: 'derbend',
    });

    expect(findDuplicates([short, full], priority)).toEqual([short.id]);
  });

  it('та же статья под другим адресом — то же фото и общие слова — повтор', () => {
    const a = row({
      title: 'Руководитель Росводресурсов прибыл в Дагестан',
      lead: 'Дмитрий Кирилов оценит восстановительные работы на водных объектах.',
      imageUrl: 'https://x.ru/same.jpg',
    });
    const b = row({
      title: 'Глава Росводресурсов прибыл в Дагестан для оценки работ',
      lead: 'Дмитрий Кирилов оценит восстановительные работы на водных объектах республики.',
      imageUrl: 'https://x.ru/same.jpg',
    });

    expect(findDuplicates([...week, a, b], priority)).toHaveLength(1);
  });

  it('одно событие у двух изданий с общими редкими словами — повтор', () => {
    const vk = row({
      source: 'vestnik-kavkaza',
      title: 'Дагестан получит 2,5 млрд рублей на ремонт Тишиклинской дамбы',
      lead: 'Средства направят на капитальный ремонт Тишиклинского водохранилища и дамбы.',
    });
    const aif = row({
      source: 'aif-dagestan',
      title: 'Дагестану выделят 2,5 млрд на капитальный ремонт Тишиклинской дамбы',
      lead: 'Деньги пойдут на ремонт дамбы Тишиклинского водохранилища.',
      publishedAt: at(3),
    });

    expect(findDuplicates([...week, vk, aif], priority)).toHaveLength(1);
  });

  it('одинаковые заголовки с разницей в несколько суток — разные новости', () => {
    const old = row({ title: 'Погода в Махачкале на выходные', publishedAt: at(0) });
    const fresh = row({ title: 'Погода в Махачкале на выходные', publishedAt: at(24 * 5) });

    expect(findDuplicates([old, fresh], priority)).toEqual([]);
  });

  it('одну статью РИА под разными рубриками сопоставляет по ключу статьи', () => {
    expect(articleKey('https://riadagestan.ru/news/g_makhachkala/x_y')).toBe(
      articleKey('https://riadagestan.ru/news/society/x_y'),
    );
    expect(articleKey('https://riadagestan.ru/news/society/x_y')).not.toBe(
      articleKey('https://riadagestan.ru/news/society/other'),
    );
  });
});
