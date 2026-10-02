import type { FastifyRequest } from 'fastify';

/** Собирает данные о запросе для журнала аудита. */
export function auditContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    requestId: (request as { id?: string }).id,
  };
}
