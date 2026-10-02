import { useEffect, useState } from 'react';

/**
 * Значение с задержкой: меняется, только когда исходное перестало меняться
 * на `delayMs`. Для подсказок адреса — запрос уходит, когда человек
 * остановился, а не на каждую набранную букву.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
