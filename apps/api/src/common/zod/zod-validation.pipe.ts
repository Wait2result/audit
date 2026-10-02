import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@dagestan/shared';
import { ZodType } from 'zod';

import { AppException } from '../errors/app.exception.js';

/**
 * Проверка входящих данных по схеме Zod.
 *
 * Ставится на конкретный параметр метода контроллера:
 *
 *   @Post('login')
 *   login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) { ... }
 *
 * Всё, что не соответствует схеме, отклоняется ДО попадания в бизнес-логику.
 * Схема одновременно приводит данные к нужному виду — например, телефон
 * «8 928 000-00-00» превращается в «+79280000000».
 *
 * Своя реализация вместо готовой библиотеки: сторонние обёртки Zod для NestJS
 * отстают от новых версий NestJS, а кода здесь — тридцать строк.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      // Возвращаем клиенту список проблемных полей, но не раскрываем
      // внутреннюю структуру схемы.
      const fieldErrors = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(корень)',
        message: issue.message,
      }));

      throw AppException.badRequest(
        'Проверьте правильность заполнения полей',
        ErrorCode.VALIDATION_FAILED,
        fieldErrors,
      );
    }

    return result.data;
  }
}

/** Короткая запись: `@Body(zodBody(loginSchema))` вместо `new ZodValidationPipe(...)`. */
export function zodBody<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
