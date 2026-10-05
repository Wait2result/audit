/**
 * Состояние и тип детали одной подписью для карточки: «Б/У оригинал»,
 * «Новый аналог», «Восстановленный оригинал». Это два разных поля
 * (`partCondition` и `partOriginality`), а в строке карточки — одна мысль.
 * Одно поле — его обычная подпись: «Новая», «Аналог».
 */

const CONDITION_ALONE: Readonly<Record<string, string>> = {
  new: 'Новая',
  used: 'Б/У',
  restored: 'Восстановленная',
};

/** Состояние перед словом «оригинал» / «аналог» (мужской род). */
const CONDITION_BEFORE_TYPE: Readonly<Record<string, string>> = {
  new: 'Новый',
  used: 'Б/У',
  restored: 'Восстановленный',
};

const TYPE: Readonly<Record<string, string>> = { original: 'оригинал', analog: 'аналог' };

export function partStateLabel(condition: unknown, originality: unknown): string | null {
  const state = typeof condition === 'string' ? condition : null;
  const type = typeof originality === 'string' ? TYPE[originality] : undefined;
  if (state && type && CONDITION_BEFORE_TYPE[state])
    return `${CONDITION_BEFORE_TYPE[state]} ${type}`;
  if (state && CONDITION_ALONE[state]) return CONDITION_ALONE[state];
  if (type) return type.charAt(0).toUpperCase() + type.slice(1);
  return null;
}
