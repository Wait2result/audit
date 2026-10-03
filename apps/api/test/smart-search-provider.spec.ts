import { describe, expect, it } from 'vitest';

import { AiProviderError, DisabledAiProvider } from '../src/modules/smart-search/ai/ai-provider.js';
import { OllamaProvider, type FetchLike } from '../src/modules/smart-search/ai/ollama.provider.js';

/**
 * Ollama — за прослойкой AiProvider. Настоящая модель в тестах не нужна:
 * сеть подменяется, проверяется поведение при отказах.
 */

const SETTINGS = {
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen3:8b',
  timeoutMs: 50,
  maxResponseChars: 2000,
  contextTokens: 8192,
};

const REQUEST = {
  system: 'правила',
  messages: [{ role: 'user' as const, content: 'фраза' }],
  jsonSchema: { type: 'object' },
};

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('Ollama', () => {
  it('запрос: без потока, без «рассуждений», температура 0, схема ответа, только правила и фраза', async () => {
    const seen: { url: string; init: Parameters<FetchLike>[1] }[] = [];
    const fetchImpl: FetchLike = (url, init) => {
      seen.push({ url, init });
      return Promise.resolve(reply(200, { message: { content: '{"ok":true}' } }));
    };
    const result = await new OllamaProvider(SETTINGS, fetchImpl).complete(REQUEST);
    expect(result.text).toBe('{"ok":true}');
    const body = JSON.parse(seen[0]!.init.body!) as Record<string, unknown>;
    expect(seen[0]!.url).toBe('http://127.0.0.1:11434/api/chat');
    expect(body).toMatchObject({
      model: 'qwen3:8b',
      stream: false,
      think: false,
      format: { type: 'object' },
      options: { temperature: 0, num_ctx: 8192 },
    });
    expect(body.messages).toEqual([
      { role: 'system', content: 'правила' },
      { role: 'user', content: 'фраза' },
    ]);
    expect(Object.keys(seen[0]!.init.headers)).toEqual(['Content-Type']);
  });

  it('таймаут — ошибка AI_TIMEOUT, а не зависший запрос', async () => {
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    await expect(new OllamaProvider(SETTINGS, fetchImpl).complete(REQUEST)).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    });
  });

  it('Ollama не запущена — AI_UNAVAILABLE', async () => {
    const fetchImpl: FetchLike = () =>
      Promise.reject(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    await expect(new OllamaProvider(SETTINGS, fetchImpl).complete(REQUEST)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
  });

  it('слишком большой ответ отбрасывается', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(reply(200, 'x'.repeat(5000)));
    await expect(new OllamaProvider(SETTINGS, fetchImpl).complete(REQUEST)).rejects.toMatchObject({
      code: 'AI_RESPONSE_TOO_LARGE',
    });
  });

  it('ответ без текста или не JSON — AI_BAD_RESPONSE', async () => {
    await expect(
      new OllamaProvider(SETTINGS, () => Promise.resolve(reply(200, 'не json'))).complete(REQUEST),
    ).rejects.toMatchObject({ code: 'AI_BAD_RESPONSE' });
    await expect(
      new OllamaProvider(SETTINGS, () => Promise.resolve(reply(200, { message: {} }))).complete(
        REQUEST,
      ),
    ).rejects.toMatchObject({ code: 'AI_BAD_RESPONSE' });
  });

  it('схему не приняли (400) — повтор с обычным JSON-форматом', async () => {
    const formats: unknown[] = [];
    const fetchImpl: FetchLike = (_url, init) => {
      const body = JSON.parse(init.body!) as { format: unknown };
      formats.push(body.format);
      return Promise.resolve(
        body.format === 'json'
          ? reply(200, { message: { content: '{}' } })
          : reply(400, { error: 'bad schema' }),
      );
    };
    await new OllamaProvider(SETTINGS, fetchImpl).complete(REQUEST);
    expect(formats).toEqual([{ type: 'object' }, 'json']);
  });

  it('проверка состояния: модель скачана / не скачана / сервер недоступен', async () => {
    const tags =
      (names: string[]): FetchLike =>
      () =>
        Promise.resolve(reply(200, { models: names.map((name) => ({ name })) }));
    expect((await new OllamaProvider(SETTINGS, tags(['qwen3:8b'])).health()).status).toBe('ok');
    const missing = await new OllamaProvider(SETTINGS, tags(['llama3:8b'])).health();
    expect(missing).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('ollama pull qwen3:8b'),
    });
    const down = await new OllamaProvider(SETTINGS, () =>
      Promise.reject(new Error('down')),
    ).health();
    expect(down.status).toBe('unavailable');
  });

  it('адрес — только http(s)', () => {
    expect(() => new OllamaProvider({ ...SETTINGS, baseUrl: 'file:///etc/passwd' })).toThrow();
  });
});

describe('Модель выключена', () => {
  it('отвечает AI_DISABLED, состояние — disabled', async () => {
    const provider = new DisabledAiProvider();
    await expect(provider.complete()).rejects.toBeInstanceOf(AiProviderError);
    await expect(provider.complete()).rejects.toMatchObject({ code: 'AI_DISABLED' });
    expect((await provider.health()).status).toBe('disabled');
  });
});
