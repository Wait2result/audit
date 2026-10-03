/**
 * Числа во фразе человека: «до 1.2 млн», «40 тысяч», «70к», «до миллиона»,
 * «полтора миллиона», «1 200 000», «256 гигов», «1 ТБ».
 *
 * Зачем серверу свой разбор, если число уже вернула модель: модель может
 * «досочинить» цену («айфон недорого» → 30 000). Поэтому каждое крупное число
 * из её ответа сверяется с числами, которые человек действительно написал
 * (`isGroundedNumber`). Не нашлось — условие не применяется, а человека
 * спрашивают.
 */

const MULTIPLIERS: readonly [RegExp, number][] = [
  [/^(миллиард\p{L}*|млрд)$/u, 1_000_000_000],
  [/^(миллион\p{L}*|млн|лям\p{L}*|кк)$/u, 1_000_000],
  [/^(тысяч\p{L}*|тыщ\p{L}*|тыс|тыс\.|тр|т\.р\.?|к|k)$/u, 1_000],
];

function multiplierOf(word: string | undefined): number | null {
  if (!word) return null;
  for (const [pattern, value] of MULTIPLIERS) if (pattern.test(word)) return value;
  return null;
}

/** Числа из текста в рублях (или в штуках — для памяти, лет, минут). */
export function extractAmounts(text: string): number[] {
  const value = text
    .toLowerCase()
    .replace(/ё/g, 'е')
    // «1 200 000» → «1200000»: пробел внутри числа разделяет тысячи
    .replace(/(\d)[\s\u00a0](?=\d{3}(?!\d))/g, '$1');

  const result: number[] = [];

  const pattern =
    /(\d+(?:[.,]\d+)?)\s*(миллиард\p{L}*|млрд|миллион\p{L}*|млн|лям\p{L}*|кк|тысяч\p{L}*|тыщ\p{L}*|тыс\.?|т\.р\.?|тр|тб|tb|к|k)?(?![\p{L}\d])/gu;
  for (const match of value.matchAll(pattern)) {
    const number = Number((match[1] ?? '').replace(',', '.'));
    if (!Number.isFinite(number)) continue;
    const unit = match[2];
    if (unit === 'тб' || unit === 'tb') {
      result.push(number * 1024, number);
      continue;
    }
    const multiplier = multiplierOf(unit);
    result.push(multiplier ? Math.round(number * multiplier) : number);
  }

  // Слова без цифр: «до миллиона», «полтора миллиона», «полмиллиона», «тысяча»
  for (const match of value.matchAll(
    /(?:^|[^\p{L}\d.,])(полтора|полторы|полутора)\s+(миллион\p{L}*|млн|тысяч\p{L}*|тыс)/gu,
  )) {
    const multiplier = multiplierOf(match[2]);
    if (multiplier) result.push(1.5 * multiplier);
  }
  if (/(?:^|[^\p{L}])пол\s?миллиона/u.test(value)) result.push(500_000);
  for (const match of value.matchAll(
    /(?:^|[^\p{L}\d.,]\s*)(миллион\p{L}*|тысяч[ауи]?)(?!\p{L})/gu,
  )) {
    const before = value.slice(0, match.index ?? 0).trimEnd();
    if (/[\d.,]$/.test(before) || /(полтора|полторы|полутора)$/.test(before)) continue;
    const multiplier = multiplierOf(match[1]);
    if (multiplier) result.push(multiplier);
  }

  return result;
}

/**
 * Сумма из значения модели: число как есть, строка — разбором («1.2 млн»).
 * Отрицательное, бесконечное и нечисловое — null.
 */
export function parseAmount(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : null;
  if (typeof input !== 'string') return null;
  const [first] = extractAmounts(input);
  return first !== undefined && first >= 0 ? first : null;
}

/** Есть ли такое число во фразе человека (с точностью до полупроцента). */
export function isGroundedNumber(value: number, text: string): boolean {
  return extractAmounts(text).some(
    (amount) => Math.abs(amount - value) <= Math.max(0.5, amount * 0.005),
  );
}

/** «1 200 000 ₽» */
export function formatRubles(value: number): string {
  return `${Math.round(value)
    .toLocaleString('ru-RU')
    .replace(/\u00a0/g, ' ')} ₽`;
}
