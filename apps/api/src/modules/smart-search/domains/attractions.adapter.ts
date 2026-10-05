import { Injectable } from '@nestjs/common';
import type { SmartSearchIntentCore } from '@dagestan/shared';

import type {
  DomainAdapter,
  DomainRequestContext,
  ExecuteOutcome,
  NormalizeOutcome,
} from './domain-adapter.js';
import { emptyQuery } from './domain-adapter.js';

/**
 * Достопримечательности и «куда сходить». Раздела в приложении пока нет,
 * поэтому адаптер нужен ради одного: «что посмотреть в Дербенте» получает
 * честный ответ «скоро», а не сеансы кино и не объявления.
 */
@Injectable()
export class AttractionsSearchAdapter implements DomainAdapter<never> {
  readonly domain = 'attractions' as const;
  readonly label = 'Достопримечательности';

  promptSection(): Promise<string> {
    return Promise.resolve(
      [
        'attractions — достопримечательности и места для прогулок: «куда сходить в Дербенте», «что посмотреть в Дагестане».',
        '  Фильтров нет. Это НЕ кино и НЕ объявления.',
      ].join('\n'),
    );
  }

  allowedFilterKeys(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set<string>());
  }

  normalize(
    intent: SmartSearchIntentCore,
    _context: DomainRequestContext,
  ): Promise<NormalizeOutcome<never>> {
    return Promise.resolve({
      kind: 'unsupported',
      message: 'Достопримечательности — скоро в приложении',
      query: emptyQuery('attractions', intent),
    });
  }

  execute(): Promise<ExecuteOutcome> {
    return Promise.reject(new Error('Раздела достопримечательностей пока нет'));
  }
}
