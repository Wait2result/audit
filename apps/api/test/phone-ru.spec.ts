import {
  formatPhoneE164,
  formatRuNational,
  normalizePhone,
  phoneErrorMessage,
  phoneParts,
  ruMobileDigits,
  ruMobileError,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { phoneColumns } from '../src/modules/listings/listing-location.js';

/**
 * Телефон в объявлении: поле «🇷🇺 +7 950 123-45-67» (ADR-0010).
 * Любой привычный способ ввести или вставить номер даёт одно и то же.
 */
describe('Российский мобильный номер', () => {
  it('три привычных записи приводятся к одним цифрам', () => {
    for (const raw of ['9501234567', '89501234567', '+79501234567']) {
      expect(ruMobileDigits(raw), raw).toBe('9501234567');
    }
  });

  it('вставка из буфера с пробелами, скобками и дефисами', () => {
    for (const raw of [
      '+7 (950) 123-45-67',
      '8 950 123 45 67',
      '+7 950 123-45-67',
      ' 7-950-123-45-67 ',
      'тел.: +7 950 1234567',
    ]) {
      expect(ruMobileDigits(raw), raw).toBe('9501234567');
    }
  });

  it('повторный +7 или 8 не попадает в номер', () => {
    // Человек уже видит «+7» и по привычке набирает ещё раз
    expect(ruMobileDigits('7')).toBe('');
    expect(ruMobileDigits('8')).toBe('');
    expect(ruMobileDigits('89')).toBe('9');
    expect(ruMobileDigits('+7+79501234567')).toBe('9501234567');
  });

  it('лишнее сверх десяти цифр отрезается', () => {
    expect(ruMobileDigits('950123456789')).toBe('9501234567');
  });

  it('форматирование по мере набора', () => {
    expect(formatRuNational('')).toBe('');
    expect(formatRuNational('950')).toBe('950');
    expect(formatRuNational('95012')).toBe('950 12');
    expect(formatRuNational('9501234')).toBe('950 123-4');
    expect(formatRuNational('950123456')).toBe('950 123-45-6');
    expect(formatRuNational('9501234567')).toBe('950 123-45-67');
  });

  it('показ сохранённого номера: +7 950 123-45-67', () => {
    expect(formatPhoneE164('+79501234567')).toBe('+7 950 123-45-67');
    expect(formatPhoneE164('+994501234567')).toBe('+994501234567');
  });

  it('понятные ошибки неполного номера', () => {
    expect(ruMobileError('')).toBe('Укажите номер телефона');
    expect(ruMobileError('950')).toBe('Номер неполный: нужно ещё 7 цифр');
    expect(ruMobileError('950123456')).toBe('Номер неполный: нужно ещё 1 цифра');
    expect(ruMobileError('4951234567')).toBe('Мобильный номер после +7 начинается с 9');
    expect(ruMobileError('9501234567')).toBeNull();
  });
});

describe('Нормализация на сервере', () => {
  it('+7 — ровно 11 цифр: недописанный номер не проходит как «международный»', () => {
    expect(normalizePhone('+7950123')).toEqual({ ok: false, error: 'TOO_SHORT' });
    expect(normalizePhone('+795012345678')).toEqual({ ok: false, error: 'TOO_LONG' });
    expect(normalizePhone('950')).toEqual({ ok: false, error: 'TOO_SHORT' });
    expect(normalizePhone('8950')).toEqual({ ok: false, error: 'TOO_SHORT' });
  });

  it('три формата из ТЗ — один E.164', () => {
    for (const raw of ['9501234567', '89501234567', '+79501234567']) {
      expect(normalizePhone(raw), raw).toEqual({ ok: true, phone: '+79501234567' });
    }
  });

  it('сообщение для человека, а не код', () => {
    expect(phoneErrorMessage('TOO_SHORT')).toBe('Номер неполный: после +7 нужно 10 цифр');
  });

  it('номер по частям — под будущие международные номера', () => {
    expect(phoneParts('+79501234567')).toEqual({
      countryCode: '7',
      nationalNumber: '9501234567',
      e164: '+79501234567',
    });
    expect(phoneParts('950')).toBeNull();
    expect(phoneColumns('+79501234567')).toEqual({
      contactPhone: '+79501234567',
      contactPhoneCountryCode: '7',
      contactPhoneNational: '9501234567',
    });
  });
});
