import { describe, expect, it } from 'vitest';
import { formatPhoneForDisplay, isE164, maskPhone, normalizePhone } from '@dagestan/shared';

/**
 * Нормализация номеров телефона.
 *
 * Почему это критично: телефон — единственный логин в системе. Если один и тот
 * же человек в разных местах введёт «8 928…» и «+7 928…», без приведения к
 * единому виду получатся ДВА разных аккаунта с разными заказами и историей.
 */
describe('Нормализация номера телефона', () => {
  it('приводит российский номер с восьмёркой к международному формату', () => {
    const result = normalizePhone('8 928 000-00-00');
    expect(result).toEqual({ ok: true, phone: '+79280000000' });
  });

  it('принимает номер, записанный через +7', () => {
    expect(normalizePhone('+7 (928) 000-00-00')).toEqual({ ok: true, phone: '+79280000000' });
  });

  it('принимает номер без кода страны', () => {
    expect(normalizePhone('9280000000')).toEqual({ ok: true, phone: '+79280000000' });
  });

  it('все варианты записи одного номера дают одинаковый результат', () => {
    const variants = [
      '89280000000',
      '8 928 000 00 00',
      '+79280000000',
      '+7 928 000-00-00',
      '7 (928) 000-00-00',
      '9280000000',
      '  8-928-000-00-00  ',
    ];

    const normalized = variants.map((v) => {
      const r = normalizePhone(v);
      return r.ok ? r.phone : `ОШИБКА: ${r.error}`;
    });

    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('+79280000000');
  });

  it('сохраняет код другой страны, если он указан явно', () => {
    // По ТЗ пользователь может выбрать другую страну — +7 лишь предлагается
    // по умолчанию, но не навязывается.
    expect(normalizePhone('+994 50 123 45 67')).toEqual({ ok: true, phone: '+994501234567' });
  });

  it('отклоняет пустое значение', () => {
    expect(normalizePhone('')).toEqual({ ok: false, error: 'EMPTY' });
    expect(normalizePhone('   ')).toEqual({ ok: false, error: 'EMPTY' });
  });

  it('отклоняет слишком короткий номер', () => {
    expect(normalizePhone('12345')).toEqual({ ok: false, error: 'TOO_SHORT' });
  });

  it('отклоняет слишком длинный номер', () => {
    expect(normalizePhone('+7928000000012345678')).toEqual({ ok: false, error: 'TOO_LONG' });
  });

  it('отклоняет строку без цифр', () => {
    expect(normalizePhone('не телефон')).toEqual({ ok: false, error: 'INVALID_CHARACTERS' });
  });
});

describe('Проверка формата E.164', () => {
  it('принимает корректные номера', () => {
    expect(isE164('+79280000000')).toBe(true);
    expect(isE164('+994501234567')).toBe(true);
  });

  it('отклоняет номера без плюса и с ведущим нулём', () => {
    expect(isE164('79280000000')).toBe(false);
    expect(isE164('+09280000000')).toBe(false);
    expect(isE164('+7928')).toBe(false);
  });
});

describe('Маскирование номера', () => {
  it('скрывает середину номера', () => {
    const masked = maskPhone('+79280000000');
    expect(masked).toBe('+7928***-**-00');
    // Главное требование: полный номер не должен восстанавливаться из маски
    expect(masked).not.toContain('9280000000');
  });

  it('не раскрывает некорректные значения', () => {
    expect(maskPhone('мусор')).toBe('***');
  });
});

describe('Отображение номера пользователю', () => {
  it('форматирует российский номер', () => {
    expect(formatPhoneForDisplay('+79280000000')).toBe('+7 (928) 000-00-00');
  });

  it('оставляет иностранный номер как есть', () => {
    expect(formatPhoneForDisplay('+994501234567')).toBe('+994501234567');
  });
});
