import { Injectable, Logger } from '@nestjs/common';
import { normalizeSearchText } from '@dagestan/shared';

import { PrismaService } from '../../../infra/prisma/prisma.service.js';

/** Что записать о нераспознанной фразе — без человека, устройства и адреса. */
export interface UnrecognizedQuery {
  text: string;
  domain: string | null;
  screen: string | null;
  /** Слова, которых словарь не знает: «суксидик» */
  leftover: readonly string[];
}

/** Самое длинное, что хранится: фраза приложения не длиннее 300 знаков. */
const MAX_PHRASE = 300;

/**
 * Журнал нераспознанных фраз: по нему пополняется словарь. Хранится
 * обезличенно — только нормализованная фраза, раздел и экран, без
 * идентификаторов человека. Телефоны, карты и почта во фразе маскируются,
 * чтобы персональные данные в журнал не попадали. Одинаковые фразы
 * считаются, а не дублируются.
 */
@Injectable()
export class SmartSearchUnrecognizedService {
  private readonly logger = new Logger(SmartSearchUnrecognizedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: UnrecognizedQuery): Promise<void> {
    const phrase = maskPersonal(normalizeSearchText(input.text)).slice(0, MAX_PHRASE);
    if (!phrase) return;
    const unknownWords = input.leftover
      .map((word) => maskPersonal(word))
      .filter((word) => word.length > 0)
      .slice(0, 10);
    try {
      await this.prisma.smartSearchUnrecognized.upsert({
        where: { phrase },
        create: {
          phrase,
          domain: input.domain,
          screen: input.screen,
          unknownWords,
          count: 1,
        },
        update: {
          count: { increment: 1 },
          lastSeenAt: new Date(),
          unknownWords,
          ...(input.domain ? { domain: input.domain } : {}),
        },
      });
    } catch (error) {
      // Журнал — не часть ответа: его отказ поиск не останавливает
      this.logger.warn(`Не удалось записать нераспознанную фразу: ${String(error)}`);
    }
  }
}

/** Номера телефонов, карт и почта во фразе — не для журнала. */
export function maskPersonal(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/gu, ' # ')
    .replace(/(?:\+?\d[\s-]?){7,}/gu, ' # ')
    .replace(/\s+/g, ' ')
    .trim();
}
