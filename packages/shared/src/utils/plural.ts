/**
 * Русское склонение существительного при числе: 1 позиция, 2 позиции,
 * 5 позиций. Числа 11–14 — исключение, они всегда идут с формой «позиций»,
 * поэтому сначала отсекаются остатки от деления на 100.
 *
 * Живёт в общем коде: «1 заведений» в панели и «1 заведение» в приложении —
 * это одна и та же ошибка, исправлять её дважды незачем.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  if (abs >= 11 && abs <= 14) return many;

  const last = abs % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;

  return many;
}

/** То же, но сразу с числом: «3 позиции». */
export function pluralize(count: number, one: string, few: string, many: string): string {
  return `${count} ${plural(count, one, few, many)}`;
}
