import { describe, expect, it } from 'vitest';
import {
  completeRegistrationSchema,
  loginSchema,
  passwordSchema,
  phoneSchema,
  requestOtpSchema,
  otpCodeSchema,
} from '@dagestan/shared';

import { ZodValidationPipe } from '../src/common/zod/zod-validation.pipe.js';
import { parseDuration } from '../src/modules/auth/token.service.js';

/**
 * Проверка входящих данных.
 *
 * Это первый рубеж защиты: всё, что не проходит схему, отклоняется до того,
 * как попадёт в бизнес-логику и в базу.
 */
describe('Схема пароля', () => {
  it('принимает нормальный пароль', () => {
    expect(passwordSchema.safeParse('Gorets2024').success).toBe(true);
  });

  it('отклоняет короткий пароль', () => {
    const result = passwordSchema.safeParse('abc12');
    expect(result.success).toBe(false);
  });

  it('требует наличие цифры', () => {
    expect(passwordSchema.safeParse('простопароль').success).toBe(false);
  });

  it('требует наличие буквы', () => {
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
  });

  it('принимает пароль на кириллице', () => {
    expect(passwordSchema.safeParse('Пароль123').success).toBe(true);
  });
});

describe('Схема кода из SMS', () => {
  it('принимает шесть цифр', () => {
    expect(otpCodeSchema.safeParse('123456').success).toBe(true);
  });

  it('отклоняет неверную длину и нецифровые символы', () => {
    expect(otpCodeSchema.safeParse('12345').success).toBe(false);
    expect(otpCodeSchema.safeParse('1234567').success).toBe(false);
    expect(otpCodeSchema.safeParse('12345a').success).toBe(false);
  });
});

describe('Схема телефона', () => {
  it('нормализует номер прямо при проверке', () => {
    const result = phoneSchema.safeParse('8 928 000-00-00');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('+79280000000');
  });

  it('отклоняет мусор', () => {
    expect(phoneSchema.safeParse('не номер').success).toBe(false);
  });
});

describe('Схема запроса кода', () => {
  it('принимает корректный запрос', () => {
    const result = requestOtpSchema.safeParse({
      phone: '89280000000',
      purpose: 'registration',
    });
    expect(result.success).toBe(true);
  });

  it('отклоняет неизвестную цель запроса', () => {
    // Защита от подстановки: нельзя запросить код «на что-то другое»
    const result = requestOtpSchema.safeParse({ phone: '89280000000', purpose: 'взлом' });
    expect(result.success).toBe(false);
  });
});

describe('Схема завершения регистрации', () => {
  const valid = {
    verificationToken: 'token',
    password: 'Gorets2024',
    firstName: 'Ислам',
    acceptedTerms: true,
  };

  it('принимает корректные данные', () => {
    expect(completeRegistrationSchema.safeParse(valid).success).toBe(true);
  });

  it('требует согласия с условиями', () => {
    // Требование 152-ФЗ: без явного согласия обрабатывать данные нельзя.
    expect(completeRegistrationSchema.safeParse({ ...valid, acceptedTerms: false }).success).toBe(
      false,
    );
    const { acceptedTerms: _omitted, ...withoutConsent } = valid;
    expect(completeRegistrationSchema.safeParse(withoutConsent).success).toBe(false);
  });

  it('требует имя', () => {
    expect(completeRegistrationSchema.safeParse({ ...valid, firstName: '  ' }).success).toBe(false);
  });
});

describe('Пропускной фильтр данных (ZodValidationPipe)', () => {
  const pipe = new ZodValidationPipe(loginSchema);
  const meta = { type: 'body' as const };

  it('пропускает корректные данные и нормализует их', () => {
    const result = pipe.transform({ phone: '89280000000', password: 'Gorets2024' }, meta);
    expect(result.phone).toBe('+79280000000');
  });

  it('отклоняет некорректные данные с понятным сообщением', () => {
    expect(() => pipe.transform({ phone: 'мусор', password: '' }, meta)).toThrow(
      'Проверьте правильность заполнения полей',
    );
  });

  it('сообщает, какие именно поля неверны', () => {
    try {
      pipe.transform({ phone: 'мусор', password: '' }, meta);
      expect.unreachable('Ожидалась ошибка проверки');
    } catch (err) {
      const details = (err as { details: { field: string }[] }).details;
      const fields = details.map((d) => d.field);
      expect(fields).toContain('phone');
      expect(fields).toContain('password');
    }
  });

  it('отбрасывает лишние поля, которых нет в схеме', () => {
    // Защита от подмены: клиент не должен иметь возможности дописать
    // в запрос поля вроде isAdmin или roles.
    const result = pipe.transform(
      { phone: '89280000000', password: 'Gorets2024', isAdmin: true },
      meta,
    ) as Record<string, unknown>;

    expect(result).not.toHaveProperty('isAdmin');
  });
});

describe('Разбор длительности токенов', () => {
  it('понимает поддерживаемые единицы', () => {
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('15m')).toBe(900_000);
    expect(parseDuration('12h')).toBe(43_200_000);
    expect(parseDuration('30d')).toBe(2_592_000_000);
  });

  it('падает на некорректном формате, а не молча возвращает ноль', () => {
    // Молчаливый ноль означал бы токены с нулевым сроком жизни —
    // приложение перестало бы работать без единой понятной ошибки.
    expect(() => parseDuration('навсегда')).toThrow();
    expect(() => parseDuration('15')).toThrow();
    expect(() => parseDuration('')).toThrow();
  });
});
