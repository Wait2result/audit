import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  smartSearchFeedbackSchema,
  smartSearchRequestSchema,
  type SmartSearchFeedbackRequest,
  type SmartSearchFeedbackResponse,
  type SmartSearchHealthDto,
  type SmartSearchRequest,
  type SmartSearchResponse,
} from '@dagestan/shared';

import { CurrentUser, Public, RateLimit } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ApiZodBody } from '../../common/zod/zod-openapi.js';
import { zodBody } from '../../common/zod/zod-validation.pipe.js';
import { SmartSearchFeedbackService } from './feedback/smart-search-feedback.service.js';
import { SmartSearchService } from './smart-search.service.js';

@ApiTags('Умный поиск')
@Controller('smart-search')
export class SmartSearchController {
  constructor(
    private readonly smartSearch: SmartSearchService,
    private readonly feedback: SmartSearchFeedbackService,
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  // Каждая фраза — обращение к модели: дороже обычного поиска, поэтому лимит строже
  @RateLimit({ limit: 30, windowSeconds: 60, scope: 'ip' })
  @ApiOperation({
    summary: 'Поиск фразой по всему приложению',
    description:
      'Фраза человека («Toyota Succeed до 1.2 млн, автомат», «что сегодня идёт в Каспийске») ' +
      'разбирается локальной моделью в намерение строгой схемы, проверяется по справочникам ' +
      'раздела и исполняется существующим поиском раздела (объявления, кино, новости, доставка). ' +
      'Ответ — results / clarification / no_results / unsupported / error. sessionId из ответа ' +
      'позволяет уточнять поиск следующей фразой. Без модели — status: error и fallback на обычный поиск.',
  })
  @ApiZodBody(smartSearchRequestSchema)
  search(
    @Body(zodBody(smartSearchRequestSchema)) dto: SmartSearchRequest,
    @CurrentUser() user?: RequestUser,
  ): Promise<SmartSearchResponse> {
    return this.smartSearch.search(dto, user?.id);
  }

  @Public()
  @Post('feedback')
  @HttpCode(201)
  @RateLimit({ limit: 10, windowSeconds: 60, scope: 'ip' })
  @ApiOperation({
    summary: '«Я имел в виду другое»: исправление к разбору фразы',
    description:
      'Человек пишет своими словами, что имел в виду. Исправление сохраняется вместе с тем, ' +
      'что поняла модель (по requestId ответа), для последующего разбора. Ничего не меняет ' +
      'автоматически: ни подсказку модели, ни справочники, ни выдачу.',
  })
  @ApiZodBody(smartSearchFeedbackSchema)
  sendFeedback(
    @Body(zodBody(smartSearchFeedbackSchema)) dto: SmartSearchFeedbackRequest,
  ): Promise<SmartSearchFeedbackResponse> {
    return this.feedback.submit(dto);
  }

  @Public()
  @Get('health')
  @ApiOperation({
    summary: 'Состояние умного поиска и модели',
    description: 'Включён ли поиск, отвечает ли модель и скачана ли она. Без секретов и адресов.',
  })
  health(): Promise<SmartSearchHealthDto> {
    return this.smartSearch.health();
  }
}
