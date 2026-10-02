import { Injectable, Logger } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export interface AuditEntry {
  /** Кто выполнил действие. Пусто — действие системы (по расписанию). */
  actorId?: string | null;
  /** Что сделал: user.block, city.create, settings.update … */
  action: string;
  targetType?: string;
  targetId?: string;
  /** Состояние объекта до изменения */
  before?: unknown;
  /** Состояние объекта после изменения */
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Журнал действий администраторов (пункт 4 ТЗ).
 *
 * Записи только добавляются. Ни один код в приложении не изменяет и не удаляет
 * их — именно это делает журнал доказательством. Через полгода он позволяет
 * ответить на вопрос «кто снял объявление с публикации и когда».
 *
 * Правило: журналируется каждое административное действие, меняющее данные.
 * Просмотр не журналируется, иначе журнал утонет в шуме.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          before: sanitize(entry.before),
          after: sanitize(entry.after),
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent?.slice(0, 500) ?? null,
          requestId: entry.requestId ?? null,
        },
      });
    } catch (err) {
      // Сбой записи в журнал не должен отменять само действие администратора,
      // но обязан быть громко зафиксирован: пропажа записей в журнале аудита —
      // это инцидент безопасности.
      this.logger.error(
        { err, action: entry.action },
        'Не удалось записать действие в журнал аудита',
      );
    }
  }
}

/**
 * Убирает из журнала то, чего в нём быть не должно: пароли, токены, коды.
 * Журнал читают сотрудники поддержки — секретов там быть не может.
 */
const SENSITIVE_FIELDS = [
  'password',
  'passwordHash',
  'token',
  'refreshToken',
  'accessToken',
  'codeHash',
  'totpSecret',
  'totpSecretEncrypted',
  'secret',
];

function sanitize(value: unknown): Prisma.InputJsonObject | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') return { value: value as Prisma.InputJsonValue };

  const clone: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f.toLowerCase()));
    clone[key] = isSensitive ? '[скрыто]' : (val as Prisma.InputJsonValue);
  }
  return clone;
}
