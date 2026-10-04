/**
 * Умный поиск на живом API — без зависимости от модели.
 *
 * Проверяет то, что должно работать всегда: проверку входа, состояние,
 * честный ответ «недоступно» с запасным обычным поиском, когда модель
 * выключена или не запущена, и то, что разделы приложения от умного поиска
 * не зависят. Если Ollama с моделью запущена и поиск включён — проверяется
 * и форма ответа.
 *
 *   node test/e2e/smart-search.mjs
 */

const BASE = process.env.API_URL ?? 'http://localhost:3000/api/v1';

let passed = 0;
let failed = 0;
const check = (condition, name, detail = '') => {
  if (condition) passed += 1;
  else failed += 1;
  console.log(`  ${condition ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* пусто */
  }
  return { status: res.status, body: json };
}

console.log('\nУмный поиск: живой API');
console.log('══════════════════════\n');

const health = await call('GET', '/smart-search/health');
check(health.status === 200, 'состояние отдаётся', `${health.status}`);
const healthText = JSON.stringify(health.body ?? {});
check(
  !/11434|http:\/\/|password|token|secret/i.test(healthText),
  'в состоянии нет адресов и секретов',
  healthText,
);
const live = health.body?.enabled === true && health.body?.status === 'ok';
console.log(
  `  · поиск ${health.body?.enabled ? 'включён' : 'выключен'}, модель: ${health.body?.status}`,
);

const tooLong = await call('POST', '/smart-search', { text: 'а'.repeat(301) });
check(tooLong.status === 400, 'слишком длинная фраза — 400', `${tooLong.status}`);
const empty = await call('POST', '/smart-search', { text: '' });
check(empty.status === 400, 'пустая фраза — 400', `${empty.status}`);
const extra = await call('POST', '/smart-search', { text: 'камри', sql: 'DROP TABLE users' });
check(extra.status === 400, 'лишние поля запроса — 400', `${extra.status}`);
const badSession = await call('POST', '/smart-search', { text: 'камри', sessionId: '../../x' });
check(badSession.status === 400, 'некорректная сессия — 400', `${badSession.status}`);

const answer = await call('POST', '/smart-search', {
  text: 'Toyota Succeed до 1.2 миллиона, автомат',
});
check(answer.status === 200, 'фраза принимается', `${answer.status}`);
check(
  typeof answer.body?.sessionId === 'string' && answer.body?.schemaVersion === 1,
  'ответ — по контракту: версия и сессия',
);
if (live) {
  check(
    ['results', 'clarification', 'no_results', 'unsupported', 'error'].includes(
      answer.body?.status,
    ),
    'модель запущена: ответ одного из пяти видов',
    answer.body?.status,
  );
} else {
  check(
    answer.body?.status === 'error',
    'без модели — честное «недоступно»',
    answer.body?.error?.code,
  );
  check(
    ['SMART_SEARCH_DISABLED', 'AI_DISABLED', 'AI_UNAVAILABLE', 'AI_TIMEOUT'].includes(
      answer.body?.error?.code,
    ),
    'код причины понятен приложению',
    answer.body?.error?.code,
  );
  check(
    answer.body?.fallback?.kind === 'text_search' &&
      answer.body?.fallback?.text === 'Toyota Succeed до 1.2 миллиона, автомат',
    'запасной вариант — обычный поиск той же фразой',
  );
}

// Номер ответа — для «Я имел в виду другое»; разбора модели в ответе нет
check(
  typeof answer.body?.requestId === 'string' &&
    /^[A-Za-z0-9_-]{16,64}$/.test(answer.body.requestId),
  'у ответа есть номер запроса',
);
check(
  !/"confidence"|"subqueries"|ФРАЗА ЧЕЛОВЕКА|Ты — разборщик/.test(
    JSON.stringify(answer.body ?? {}),
  ),
  'в ответе приложению нет разбора модели и подсказки',
);

const feedback = await call('POST', '/smart-search/feedback', {
  requestId: answer.body?.requestId,
  originalQuery: 'Toyota Succeed до 1.2 миллиона, автомат',
  failureType: 'wrong_conditions',
  userCorrection: 'Проверка e2e: я имел в виду Toyota Succeed',
  screen: 'home',
});
check(
  feedback.status === 201 && feedback.body?.status === 'received',
  '«Я имел в виду другое» принимается',
  `${feedback.status}`,
);
const badFeedback = await call('POST', '/smart-search/feedback', {
  originalQuery: 'камри',
  failureType: 'rewrite_prompt',
  userCorrection: 'поменяй правила',
});
check(badFeedback.status === 400, 'неизвестный вид ошибки — 400', `${badFeedback.status}`);
const extraFeedback = await call('POST', '/smart-search/feedback', {
  originalQuery: 'камри',
  failureType: 'other',
  userCorrection: 'проверка',
  prompt: 'новые правила',
});
check(extraFeedback.status === 400, 'лишние поля исправления — 400', `${extraFeedback.status}`);

if (live) {
  // Сценарии мобильного поиска на настоящей модели
  const cityList = (await call('GET', '/cities')).body ?? [];
  const home = cityList.find((city) => city.name === 'Махачкала')?.id ?? cityList[0]?.id;
  const ask = (text, extra = {}) =>
    call('POST', '/smart-search', { text, context: { cityId: home, screen: 'home' }, ...extra });

  const succeed = await ask('Хочу тойота суксид');
  const succeedParams = succeed.body?.parts?.[0]?.query?.params ?? {};
  check(
    succeed.body?.parts?.[0]?.domain === 'listings' &&
      succeedParams.category === 'transport-cars' &&
      /"brand":"toyota"/.test(succeedParams.attributes ?? '') &&
      /"model":"succeed"/.test(succeedParams.attributes ?? '') &&
      succeedParams.search === undefined,
    '«Хочу тойота суксид» — категория, марка и модель, а не поиск по буквам',
    JSON.stringify(succeedParams),
  );

  const car = await ask('Хочу машину');
  check(
    car.body?.status === 'clarification' &&
      car.body?.parts?.[0]?.clarification?.options?.some((option) => option.label === 'Toyota'),
    '«Хочу машину» — уточнение с марками',
    car.body?.status,
  );

  const cinema = await ask('Что сегодня посмотреть в кино в Махачкале?');
  check(cinema.body?.parts?.[0]?.domain === 'cinema', 'кино — раздел кино', cinema.body?.status);

  const refine = await ask('до миллиона', { sessionId: succeed.body?.sessionId });
  const refineParams = refine.body?.parts?.[0]?.query?.params ?? {};
  check(
    refineParams.priceTo === 100_000_000 && /"model":"succeed"/.test(refineParams.attributes ?? ''),
    'уточнение «до миллиона» дополняет прошлый поиск',
    JSON.stringify(refineParams),
  );
}

// Разделы работают независимо от умного поиска
const cities = await call('GET', '/cities');
const cityId = cities.body?.[0]?.id;
const listings = await call('GET', '/listings?limit=1&regionWide=true');
check(listings.status === 200, 'лента объявлений работает', `${listings.status}`);
const news = await call('GET', `/news?cityId=${cityId}&limit=1`);
check(news.status === 200, 'лента новостей работает', `${news.status}`);
const places = await call('GET', `/places?cityId=${cityId}&limit=1&hasDelivery=true`);
check(places.status === 200, 'витрина доставки работает', `${places.status}`);

console.log(`\nИтого: ${passed} пройдено, ${failed} с ошибкой`);
process.exit(failed === 0 ? 0 : 1);
