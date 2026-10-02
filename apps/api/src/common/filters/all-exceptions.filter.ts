import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiErrorBody, ErrorCode } from '@dagestan/shared';
import { ZodError } from 'zod';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { AppException } from '../errors/app.exception.js';

/**
 * Единая обработка ВСЕХ ошибок приложения.
 *
 * Гарантирует три вещи:
 *   1. Клиент всегда получает ответ одного формата (ApiErrorBody).
 *   2. В ответ никогда не утекают внутренние детали: текст SQL-запроса,
 *      пути на диске, содержимое стека. Наружу уходит только код и общее
 *      сообщение, подробности — в лог.
 *   3. У каждой ошибки есть requestId, по которому её находят в логах.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const requestId = (request as { id?: string }).id ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
    let message = 'Внутренняя ошибка сервера';
    let details: unknown;
    let retryAfter: number | undefined;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
      retryAfter = exception.retryAfter;
    } else if (exception instanceof ZodError) {
      // Схемы разбирают строку запроса прямо в контроллерах (погода, кино,
      // новости): неверный ввод клиента — это 400, а не сбой сервера
      status = HttpStatus.BAD_REQUEST;
      code = ErrorCode.VALIDATION_FAILED;
      message = 'Проверьте правильность переданных данных';
      details = exception.issues.map((issue) => ({
        field: issue.path.join('.') || '(корень)',
        message: issue.message,
      }));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else if (response && typeof response === 'object') {
        const r = response as Record<string, unknown>;
        message = typeof r.message === 'string' ? r.message : exception.message;
        code = typeof r.code === 'string' ? (r.code as ErrorCode) : mapStatusToCode(status);
        details = r.details;
      }
      if (code === ErrorCode.INTERNAL_ERROR) code = mapStatusToCode(status);
    }

    // Ошибки 5xx — это наши ошибки, их надо чинить: пишем полный стек.
    // Ошибки 4xx — обычно неверные данные от клиента: пишем кратко.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        {
          requestId,
          method: request.method,
          url: request.url,
          err: exception,
        },
        'Необработанная ошибка сервера',
      );
    } else {
      this.logger.warn({ requestId, code, url: request.url }, message);
    }

    const body: ApiErrorBody = {
      code,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      ...(details !== undefined ? { details } : {}),
      ...(retryAfter !== undefined ? { retryAfter } : {}),
    };

    // В production внутренние ошибки наружу не описываем — только код.
    // Подробности уже записаны в лог и доступны по requestId.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR && this.config.isProduction) {
      body.message = 'Внутренняя ошибка сервера. Обратитесь в поддержку и назовите номер запроса.';
      delete body.details;
    }

    if (retryAfter !== undefined) {
      void reply.header('Retry-After', String(retryAfter));
    }

    void reply.status(status).send(body);
  }
}

function mapStatusToCode(status: HttpStatus): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.VALIDATION_FAILED;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ErrorCode.CONFLICT;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCode.RATE_LIMITED;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
}
