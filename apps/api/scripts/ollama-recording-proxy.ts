/**
 * Прозрачный прокси между API и Ollama для оценки умного поиска.
 *
 * Пересылает каждый запрос в настоящую Ollama без изменений и записывает
 * подсказку, сырой ответ модели и время — чтобы оценка видела, что именно
 * вернула Qwen3, а не только итог API. Режимы (`/__mode?set=…`) имитируют
 * отказы для проверки защиты: Ollama недоступна, таймаут, мусор вместо
 * JSON, неизвестный раздел или поле, неверный тип значения.
 *
 * Только для разработки. Запуск:
 *   npx tsx apps/api/scripts/ollama-recording-proxy.ts [порт=11435] [ollama=http://127.0.0.1:11434]
 * и в .env.local: OLLAMA_BASE_URL=http://127.0.0.1:11435
 */
import http from 'node:http';

const PORT = Number(process.argv[2] ?? 11435);
const TARGET = (process.argv[3] ?? 'http://127.0.0.1:11434').replace(/\/$/, '');

interface LogEntry {
  id: number;
  mode: string;
  at: number;
  request: { messages?: { content: string }[] } | null;
  content: string | null;
  latencyMs: number;
  status?: number;
  promptEvalCount?: number | null;
  evalCount?: number | null;
  ollamaTotalMs?: number | null;
}

let mode = 'passthrough';
let nextId = 1;
const log: LogEntry[] = [];

/** Ответ модели, который подставляется в режимах-имитациях. */
function fakeContent(current: string): string | null {
  const base = {
    schemaVersion: '1',
    intent: 'search',
    domain: 'listings',
    query: null,
    filters: {},
    preferences: {},
    location: null,
    time: null,
    sort: null,
    clarification: { needed: false, question: null, options: [] },
    confidence: 0.9,
    unresolved: [],
    subqueries: [],
  };
  switch (current) {
    case 'garbage':
      return 'Конечно! Вот ваш SQL: SELECT * FROM users; -- и список объявлений';
    case 'unknown_domain':
      return JSON.stringify({ ...base, domain: 'admin_panel' });
    case 'unknown_field':
      return JSON.stringify({
        ...base,
        filters: { sqlQuery: 'DROP TABLE users', brand: 'Toyota' },
      });
    case 'wrong_type':
      return JSON.stringify({ ...base, confidence: 'high', filters: { price: [{ max: 1 }] } });
    default:
      return null;
  }
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/__mode') {
    mode = url.searchParams.get('set') ?? mode;
    return send(res, 200, { mode });
  }
  if (url.pathname === '/__log') {
    const since = Number(url.searchParams.get('since') ?? 0);
    return send(res, 200, { next: nextId, entries: log.filter((entry) => entry.id >= since) });
  }

  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => void handle());
  async function handle(): Promise<void> {
    const body = Buffer.concat(chunks).toString('utf8');
    const isChat = url.pathname === '/api/chat';

    if (mode === 'down') {
      // Как будто Ollama не запущена: соединение рвётся без ответа
      req.socket.destroy();
      return;
    }
    if (isChat && mode === 'timeout') {
      // Дольше любого разумного AI_TIMEOUT_MS; модель не вызывается, чтобы
      // поздний ответ не попал в журнал следующего запроса
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      return send(res, 504, { error: 'timeout' });
    }
    const fake = isChat ? fakeContent(mode) : null;
    if (fake !== null) {
      log.push({
        id: nextId++,
        mode,
        at: Date.now(),
        request: safeJson(body),
        content: fake,
        latencyMs: 0,
      });
      return send(res, 200, { message: { role: 'assistant', content: fake }, done: true });
    }

    const started = Date.now();
    try {
      const upstream = await fetch(TARGET + url.pathname + url.search, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body }),
      });
      const text = await upstream.text();
      if (isChat) {
        const parsed = safeJson(text) as {
          message?: { content?: string };
          prompt_eval_count?: number;
          eval_count?: number;
          total_duration?: number;
        } | null;
        log.push({
          id: nextId++,
          mode,
          at: started,
          request: safeJson(body),
          status: upstream.status,
          content: parsed?.message?.content ?? null,
          promptEvalCount: parsed?.prompt_eval_count ?? null,
          evalCount: parsed?.eval_count ?? null,
          ollamaTotalMs: parsed?.total_duration ? Math.round(parsed.total_duration / 1e6) : null,
          latencyMs: Date.now() - started,
        });
        // Подсказка одна и та же — храним её один раз, чтобы журнал не рос
        const last = log[log.length - 1];
        const system = last?.request?.messages?.[0];
        if (
          log.length > 1 &&
          system &&
          system.content === log[0]?.request?.messages?.[0]?.content
        ) {
          system.content = '[та же системная подсказка]';
        }
      }
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(text);
    } catch (error) {
      send(res, 502, { error: String(error) });
    }
  }
});

function safeJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Прокси Ollama: 127.0.0.1:${PORT} → ${TARGET}`);
});
