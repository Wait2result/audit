/**
 * Деньги в проекте хранятся целыми копейками: дробные числа с плавающей
 * точкой дают 0.1 + 0.2 = 0.30000000000000004, и на суммах заказов это
 * превращается в расхождения. Показываем рублями.
 */
export function formatMoney(kopecks: number): string {
  const rubles = kopecks / 100;
  const hasKopecks = kopecks % 100 !== 0;

  return `${rubles.toLocaleString('ru-RU', {
    minimumFractionDigits: hasKopecks ? 2 : 0,
    maximumFractionDigits: 2,
  })} ₽`;
}
