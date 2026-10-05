import { Module } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { CinemaModule } from '../cinema/cinema.module.js';
import { CitiesModule } from '../cities/cities.module.js';
import { ListingsModule } from '../listings/listings.module.js';
import { NewsModule } from '../news/news.module.js';
import { PlacesModule } from '../places/places.module.js';
import { WeatherModule } from '../weather/weather.module.js';
import { AI_PROVIDER, DisabledAiProvider, type AiProvider } from './ai/ai-provider.js';
import { OllamaProvider } from './ai/ollama.provider.js';
import { CONTEXT_STORE, RedisContextStore } from './context/context-store.js';
import { AttractionsSearchAdapter } from './domains/attractions.adapter.js';
import { CinemaSearchAdapter } from './domains/cinema.adapter.js';
import { DeliverySearchAdapter, PlacesSearchAdapter } from './domains/delivery.adapter.js';
import { DOMAIN_ADAPTERS_REGISTRY, DomainRegistry } from './domains/domain-adapter.js';
import { ListingsSearchAdapter } from './domains/listings.adapter.js';
import { NewsSearchAdapter } from './domains/news.adapter.js';
import { RidesSearchAdapter } from './domains/rides.adapter.js';
import { WeatherSearchAdapter } from './domains/weather.adapter.js';
import { RedisTraceStore, TRACE_STORE } from './feedback/search-trace-store.js';
import { SmartSearchFeedbackService } from './feedback/smart-search-feedback.service.js';
import { SmartSearchUnrecognizedService } from './feedback/smart-search-unrecognized.service.js';
import { LocalIntentParser } from './local/local-intent-parser.js';
import { SmartSearchController } from './smart-search.controller.js';
import { SmartSearchService } from './smart-search.service.js';

/**
 * Умный поиск (docs/ADR/0011-умный-поиск.md). Модуль не владеет данными:
 * разделы приходят со своими модулями, а он лишь переводит фразу в их
 * запросы. Фразу разбирает локальный словарь (SMART_SEARCH_PARSER=local);
 * языковая модель остаётся за прослойкой AiProvider и включается отдельно.
 * Выключенный флаг не мешает разделам работать.
 */
@Module({
  imports: [ListingsModule, CinemaModule, NewsModule, PlacesModule, CitiesModule, WeatherModule],
  controllers: [SmartSearchController],
  providers: [
    SmartSearchService,
    SmartSearchFeedbackService,
    SmartSearchUnrecognizedService,
    LocalIntentParser,
    ListingsSearchAdapter,
    CinemaSearchAdapter,
    NewsSearchAdapter,
    DeliverySearchAdapter,
    PlacesSearchAdapter,
    WeatherSearchAdapter,
    RidesSearchAdapter,
    AttractionsSearchAdapter,
    {
      provide: AI_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): AiProvider =>
        config.AI_ENABLED
          ? new OllamaProvider({
              baseUrl: config.OLLAMA_BASE_URL,
              model: config.OLLAMA_MODEL,
              timeoutMs: config.AI_TIMEOUT_MS,
              maxResponseChars: config.AI_MAX_RESPONSE_CHARS,
              contextTokens: config.AI_CONTEXT_TOKENS,
            })
          : new DisabledAiProvider(),
    },
    {
      provide: CONTEXT_STORE,
      inject: [RedisService],
      useFactory: (redis: RedisService) => new RedisContextStore(redis.client),
    },
    {
      provide: TRACE_STORE,
      inject: [RedisService],
      useFactory: (redis: RedisService) => new RedisTraceStore(redis.client),
    },
    {
      // Новый раздел — новый адаптер здесь; маршрутизатор и разбор фраз не меняются
      provide: DOMAIN_ADAPTERS_REGISTRY,
      inject: [
        ListingsSearchAdapter,
        CinemaSearchAdapter,
        NewsSearchAdapter,
        DeliverySearchAdapter,
        PlacesSearchAdapter,
        WeatherSearchAdapter,
        RidesSearchAdapter,
        AttractionsSearchAdapter,
      ],
      useFactory: (...adapters: ConstructorParameters<typeof DomainRegistry>[0]) =>
        new DomainRegistry(adapters),
    },
  ],
})
export class SmartSearchModule {}
