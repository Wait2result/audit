/**
 * Порядок фотографий объявления. Первая — обложка: её видно в ленте.
 * Чистые функции — одни и те же для формы и для проверок.
 */

/** Сдвинуть фото на место левее (-1) или правее (+1). За края — без изменений. */
export function movePhoto<T>(photos: readonly T[], from: number, direction: -1 | 1): T[] {
  const to = from + direction;
  if (from < 0 || from >= photos.length || to < 0 || to >= photos.length) return [...photos];
  const next = [...photos];
  const moved = next[from] as T;
  next[from] = next[to] as T;
  next[to] = moved;
  return next;
}

/** Сделать фото обложкой: перенести в начало, порядок остальных не меняется. */
export function makeCoverPhoto<T>(photos: readonly T[], index: number): T[] {
  if (index <= 0 || index >= photos.length) return [...photos];
  return [photos[index] as T, ...photos.filter((_, position) => position !== index)];
}
