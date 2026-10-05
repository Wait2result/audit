/**
 * Числа во фразе человека: «до 1.2 млн», «40 тысяч», «70к», «до миллиона».
 *
 * Разбор живёт в общем пакете (`packages/shared/src/search/parser/amounts.ts`)
 * вместе со словарём числительных и множителей: им пользуются и сверка чисел
 * модели с фразой, и локальный разбор фраз. Здесь — прежний путь импорта.
 */
export {
  extractAmounts,
  formatRubles,
  isGroundedNumber,
  multiplierOf,
  parseAmount,
} from '@dagestan/shared';
