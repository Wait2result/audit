import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SMART_SEARCH_LIMITS,
  type SmartSearchFeedbackRequest,
  type SmartSearchFeedbackResponse,
} from '@dagestan/shared';

import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { sanitizeUserText } from '../normalize/text.js';
import { TRACE_STORE, type SearchTrace, type TraceStore } from './search-trace-store.js';

/**
 * «Я имел в виду другое»: исправление человека сохраняется рядом с тем,
 * что поняла модель, — для последующего разбора (см. feedback-analyzer.ts).
 *
 * Ничего не применяется автоматически: ни подсказка модели, ни справочники,
 * ни контекст поиска от этого не меняются.
 */
@Injectable()
export class SmartSearchFeedbackService {
  private readonly logger = new Logger(SmartSearchFeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRACE_STORE) private readonly traces: TraceStore,
  ) {}

  async submit(dto: SmartSearchFeedbackRequest): Promise<SmartSearchFeedbackResponse> {
    const originalQuery = sanitizeUserText(dto.originalQuery, SMART_SEARCH_LIMITS.maxTextLength);
    const userCorrection = sanitizeUserText(dto.userCorrection, 500);
    const trace = await this.matchingTrace(dto.requestId, originalQuery);

    const record = await this.prisma.smartSearchFeedback.create({
      data: {
        requestId: dto.requestId ?? null,
        originalQuery,
        modelIntent: trace?.intent ?? undefined,
        modelConfidence: trace?.confidence ?? null,
        responseStatus: trace?.status ?? null,
        domain: trace?.domain ?? null,
        screen: dto.screen ?? null,
        failureType: dto.failureType,
        userCorrection,
      },
      select: { id: true },
    });

    // В журнал — только вид ошибки и раздел, без текста человека
    this.logger.log({
      event: 'smart_search_feedback',
      failureType: dto.failureType,
      domain: trace?.domain ?? null,
      traced: trace !== null,
    });
    return { id: record.id, status: 'received' };
  }

  /**
   * След ответа принимается, только если фраза та же: чужой номер ответа не
   * подставит к исправлению чужой разбор.
   */
  private async matchingTrace(
    requestId: string | undefined,
    originalQuery: string,
  ): Promise<SearchTrace | null> {
    if (!requestId) return null;
    try {
      const trace = await this.traces.load(requestId);
      return trace && trace.text === originalQuery ? trace : null;
    } catch {
      return null;
    }
  }
}
