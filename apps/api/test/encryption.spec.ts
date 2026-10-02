import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { EncryptionService } from '../src/common/crypto/encryption.service.js';
import type { AppConfig } from '../src/config/env.js';

/**
 * Шифрование чувствительных данных.
 *
 * Это код, от которого зависит сохранность документов водителей и секретов
 * двухфакторной авторизации. Ошибка здесь означает либо утечку, либо
 * безвозвратную потерю данных, поэтому проверяется подробно.
 */
function makeService(): EncryptionService {
  const config = {
    encryptionKey: crypto.randomBytes(32),
  } as AppConfig;

  return new EncryptionService(config);
}

describe('Шифрование (AES-256-GCM)', () => {
  it('расшифровывает то, что зашифровало', () => {
    const service = makeService();
    const original = 'Серия и номер паспорта: 8203 456789';

    const encrypted = service.encrypt(original);
    expect(service.decrypt(encrypted)).toBe(original);
  });

  it('корректно работает с кириллицей и эмодзи', () => {
    const service = makeService();
    const original = 'Дербент, ул. Гагарина, 15 🏠';

    expect(service.decrypt(service.encrypt(original))).toBe(original);
  });

  it('шифртекст не содержит исходных данных в открытом виде', () => {
    const service = makeService();
    const encrypted = service.encrypt('СЕКРЕТНОЕ ЗНАЧЕНИЕ');

    expect(encrypted).not.toContain('СЕКРЕТНОЕ');
  });

  it('одно и то же значение шифруется каждый раз по-разному', () => {
    // Иначе по совпадению шифртекстов было бы видно, что у двух пользователей
    // одинаковые данные, — а это уже утечка информации.
    const service = makeService();

    const a = service.encrypt('одинаковый текст');
    const b = service.encrypt('одинаковый текст');

    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe(service.decrypt(b));
  });

  it('обнаруживает подмену шифртекста', () => {
    // Это и есть смысл режима GCM: изменённые данные не расшифровываются
    // в мусор, а честно вызывают ошибку.
    const service = makeService();
    const encrypted = service.encrypt('исходное значение');

    const parts = encrypted.split(':');
    const data = Buffer.from(parts[3] as string, 'base64');
    data[0] = (data[0] as number) ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], data.toString('base64')].join(':');

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('не расшифровывает данные чужим ключом', () => {
    const encrypted = makeService().encrypt('чужой секрет');
    expect(() => makeService().decrypt(encrypted)).toThrow();
  });

  it('отклоняет значение неизвестного формата', () => {
    const service = makeService();
    expect(() => service.decrypt('просто строка')).toThrow('Некорректный формат');
    expect(() => service.decrypt('v2:a:b:c')).toThrow('Некорректный формат');
  });
});

describe('Отпечаток (HMAC)', () => {
  it('одинаковое значение даёт одинаковый отпечаток', () => {
    const service = makeService();
    expect(service.hmac('123456')).toBe(service.hmac('123456'));
  });

  it('разные значения дают разные отпечатки', () => {
    const service = makeService();
    expect(service.hmac('123456')).not.toBe(service.hmac('123457'));
  });

  it('отпечаток не содержит исходное значение', () => {
    const service = makeService();
    expect(service.hmac('123456')).not.toContain('123456');
  });

  it('отпечатки различаются при разных ключах', () => {
    // Значит, украв базу без ключа, подобрать соответствие невозможно.
    expect(makeService().hmac('123456')).not.toBe(makeService().hmac('123456'));
  });
});

describe('Сравнение за постоянное время', () => {
  const service = makeService();

  it('верно определяет совпадение', () => {
    expect(service.safeCompare('одинаково', 'одинаково')).toBe(true);
  });

  it('верно определяет различие', () => {
    expect(service.safeCompare('строка-а', 'строка-б')).toBe(false);
  });

  it('не падает на строках разной длины', () => {
    expect(service.safeCompare('коротко', 'значительно длиннее')).toBe(false);
  });
});
