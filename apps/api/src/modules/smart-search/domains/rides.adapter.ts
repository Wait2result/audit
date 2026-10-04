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
 * Попутчики. Раздела в приложении пока нет (на главной — «скоро»), поэтому
 * адаптер нужен ради одного: чтобы «нужен попутчик в Дербент» получал
 * честный ответ, а не уводил в объявления об автомобилях, как раньше
 * (docs/smart-search-system-audit.md, SS-09).
 */
@Injectable()
export class RidesSearchAdapter implements DomainAdapter<never> {
  readonly domain = 'rides' as const;
  readonly label = 'Попутчики';

  promptSection(): Promise<string> {
    return Promise.resolve(
      [
        'rides — попутчики и поездки между городами: «нужен попутчик в Дербент», «кто едет в Махачкалу», «попутка».',
        '  Фильтров нет. Это НЕ объявления о машинах.',
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
      message: 'Попутчики — скоро в приложении',
      query: emptyQuery('rides', intent),
    });
  }

  execute(): Promise<ExecuteOutcome> {
    return Promise.reject(new Error('Раздела попутчиков пока нет'));
  }
}
