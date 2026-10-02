import { Inject, Injectable } from '@nestjs/common';
import crypto from 'node:crypto';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';

/**
 * Шифрование чувствительных данных перед записью в базу.
 *
 * Что шифруется: документы водителей, секреты двухфакторной авторизации,
 * платёжные реквизиты. Смысл: если база утечёт, эти поля останутся
 * нечитаемыми — ключ шифрования в базе не хранится, он в переменных окружения.
 *
 * Алгоритм AES-256-GCM. «GCM» означает, что шифр одновременно защищает от
 * подмены: если кто-то с доступом к базе изменит зашифрованное значение,
 * расшифровка честно упадёт с ошибкой, а не вернёт мусор.
 *
 * ⚠️ При потере ENCRYPTION_KEY зашифрованные данные восстановить невозможно.
 *    Ключ должен лежать в защищённом хранилище секретов и в резервной копии,
 *    отдельной от резервной копии базы.
 */
@Injectable()
export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // рекомендованная длина для GCM
  private static readonly AUTH_TAG_LENGTH = 16;
  /** Версия формата — чтобы в будущем можно было сменить алгоритм без потери старых данных */
  private static readonly VERSION = 'v1';

  private readonly key: Buffer;
  /** Отдельный ключ для HMAC, выведенный из основного. Смешивать назначения ключей нельзя. */
  private readonly hmacKey: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.key = config.encryptionKey;
    this.hmacKey = crypto.hkdfSync(
      'sha256',
      this.key,
      Buffer.alloc(0),
      Buffer.from('hmac'),
      32,
    ) as unknown as Buffer;
  }

  /**
   * Шифрует строку. Результат — «v1:<iv>:<тег>:<шифртекст>» в base64,
   * пригодный для хранения в обычном текстовом поле базы.
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(EncryptionService.IV_LENGTH);
    const cipher = crypto.createCipheriv(EncryptionService.ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      EncryptionService.VERSION,
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  /** Расшифровывает значение, полученное из encrypt(). */
  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== EncryptionService.VERSION) {
      throw new Error('Некорректный формат зашифрованного значения');
    }

    const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    if (iv.length !== EncryptionService.IV_LENGTH) {
      throw new Error('Некорректный вектор инициализации');
    }
    if (authTag.length !== EncryptionService.AUTH_TAG_LENGTH) {
      throw new Error('Некорректный тег аутентификации');
    }

    const decipher = crypto.createDecipheriv(EncryptionService.ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  /**
   * Необратимый отпечаток значения с секретным ключом (HMAC-SHA256).
   *
   * Применение — коды из SMS и refresh-токены. Хранить их в открытом виде
   * нельзя: сотрудник с доступом к базе не должен иметь возможности войти
   * в чужой аккаунт. Полноценное хеширование паролем (argon2) здесь избыточно:
   * коды живут пять минут, а токены — случайные 64 байта, перебрать которые
   * невозможно в принципе.
   */
  hmac(value: string): string {
    return crypto.createHmac('sha256', this.hmacKey).update(value).digest('base64url');
  }

  /**
   * Сравнение строк за постоянное время.
   *
   * Обычное сравнение (===) завершается на первом различающемся символе.
   * По времени ответа злоумышленник может посимвольно угадать секрет.
   * Эта функция всегда работает одинаково долго.
   */
  safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
