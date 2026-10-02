import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@dagestan/shared';

/**
 * Единый тип ошибки приложения.
 *
 * Зачем свой класс вместо стандартных исключений NestJS: нам нужен
 * машиночитаемый код ошибки (ErrorCode), по которому мобильное приложение
 * решает, что показать пользователю. Текст сообщения при этом остаётся
 * технической информацией для логов и может меняться свободно.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
    /** Для ошибок с ограничением частоты: через сколько секунд можно повторить */
    readonly retryAfter?: number,
  ) {
    super({ code, message, details }, status);
  }

  // ── Готовые конструкторы для типовых ситуаций ────────────────────────────

  static notFound(message = 'Запись не найдена', code: ErrorCode = ErrorCode.NOT_FOUND) {
    return new AppException(code, message, HttpStatus.NOT_FOUND);
  }

  static forbidden(message = 'Недостаточно прав', code: ErrorCode = ErrorCode.FORBIDDEN) {
    return new AppException(code, message, HttpStatus.FORBIDDEN);
  }

  static unauthorized(message = 'Требуется авторизация', code: ErrorCode = ErrorCode.UNAUTHORIZED) {
    return new AppException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static conflict(message: string, code: ErrorCode = ErrorCode.CONFLICT) {
    return new AppException(code, message, HttpStatus.CONFLICT);
  }

  static badRequest(
    message: string,
    code: ErrorCode = ErrorCode.VALIDATION_FAILED,
    details?: unknown,
  ) {
    return new AppException(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static rateLimited(
    message: string,
    retryAfter: number,
    code: ErrorCode = ErrorCode.RATE_LIMITED,
  ) {
    return new AppException(code, message, HttpStatus.TOO_MANY_REQUESTS, undefined, retryAfter);
  }

  static featureDisabled(message: string) {
    return new AppException(ErrorCode.FEATURE_DISABLED, message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
