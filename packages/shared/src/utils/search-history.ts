/**
 * История поиска объявлений на устройстве: четыре последних выполненных
 * запроса, без повторов, свежий — сверху.
 *
 * Одна история на все экраны. Раньше у каждой строки поиска была своя копия,
 * прочитанная при открытии экрана: очистили историю в выдаче — экран под ней
 * (главная объявлений) держал старый список и при следующем поиске записывал
 * его обратно, и «Очистить» будто не работало.
 *
 * Хранилище подменяемое: в приложении это память телефона, в тестах — объект.
 */

/** Сколько запросов помнить. */
export const SEARCH_HISTORY_LIMIT = 4;

/** Короче — не запрос, а случайное нажатие. */
const MIN_LENGTH = 2;

export interface SearchHistoryStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Одинаковые запросы с разным регистром и пробелами — один запрос. */
function sameQuery(a: string, b: string): boolean {
  const norm = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(a) === norm(b);
}

/** Новый запрос сверху; повтор поднимается, а не дублируется; лишние — вон. */
export function pushHistory(
  history: readonly string[],
  text: string,
  limit = SEARCH_HISTORY_LIMIT,
): string[] {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length < MIN_LENGTH) return [...history];
  return [clean, ...history.filter((item) => !sameQuery(item, clean))].slice(0, limit);
}

/** Убрать один запрос. */
export function removeFromHistory(history: readonly string[], text: string): string[] {
  return history.filter((item) => !sameQuery(item, text));
}

/** Разбор сохранённой записи: испорченная — пустая история, длинная — обрезается. */
export function parseHistory(raw: string | null, limit = SEARCH_HISTORY_LIMIT): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    let result: string[] = [];
    // Через pushHistory с конца: старые записи (их бывало до десяти) приводятся
    // к нынешним правилам — без повторов и не больше четырёх
    for (const item of [...parsed].reverse()) {
      if (typeof item === 'string') result = pushHistory(result, item, limit);
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * История поверх хранилища. Каждое действие сразу пишет результат: после
 * перезапуска приложения видно ровно то, что было на экране.
 */
export class SearchHistory {
  private items: string[] = [];
  private loaded = false;

  constructor(
    private readonly storage: SearchHistoryStorage,
    private readonly key: string,
    private readonly limit = SEARCH_HISTORY_LIMIT,
  ) {}

  async load(): Promise<string[]> {
    if (!this.loaded) {
      this.items = parseHistory(await this.storage.get(this.key), this.limit);
      this.loaded = true;
    }
    return [...this.items];
  }

  /** Запрос выполнен — в историю. Набранный, но не выполненный текст сюда не попадает. */
  async add(text: string): Promise<string[]> {
    await this.load();
    this.items = pushHistory(this.items, text, this.limit);
    await this.storage.set(this.key, JSON.stringify(this.items));
    return [...this.items];
  }

  async remove(text: string): Promise<string[]> {
    await this.load();
    this.items = removeFromHistory(this.items, text);
    if (this.items.length === 0) await this.storage.remove(this.key);
    else await this.storage.set(this.key, JSON.stringify(this.items));
    return [...this.items];
  }

  async clear(): Promise<string[]> {
    this.items = [];
    this.loaded = true;
    await this.storage.remove(this.key);
    return [];
  }
}
