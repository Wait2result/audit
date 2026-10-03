import type {
  CityDto,
  SmartSearchClarification,
  SmartSearchIntentCore,
  SmartSearchNormalizedQuery,
} from '@dagestan/shared';

import type { DomainRequestContext } from '../domains/domain-adapter.js';
import { matchCity, nearestCity } from './text.js';

export type ResolvedPlace =
  | {
      kind: 'city';
      city: CityDto;
      mode: NonNullable<SmartSearchNormalizedQuery['location']>['mode'];
    }
  | { kind: 'region'; mode: 'exact' | 'preferred' }
  | { kind: 'clarify'; clarification: SmartSearchClarification }
  | { kind: 'none' };

/** Варианты городов для уточнения — из списка городов приложения. */
export function cityOptions(cities: readonly CityDto[]): SmartSearchClarification['options'] {
  return cities.slice(0, 6).map((city) => ({ label: city.name, value: city.name, kind: 'city' }));
}

/**
 * Где искать: город из фразы, «рядом со мной», город из приложения или
 * ближайший к точке человека. Город, которого в приложении нет, — уточнение,
 * если это условие, и «не учитывается», если это лишь пожелание.
 */
export function resolvePlace(
  intent: SmartSearchIntentCore,
  context: DomainRequestContext,
  options: { allowRegion: boolean },
): ResolvedPlace {
  const location = intent.location;

  if (location?.city) {
    const match = matchCity(location.city, context.cities);
    if (match.kind === 'city') {
      return { kind: 'city', city: match.city, mode: location.preferred ? 'preferred' : 'exact' };
    }
    if (match.kind === 'region' && options.allowRegion) {
      return { kind: 'region', mode: location.preferred ? 'preferred' : 'exact' };
    }
    if (!location.preferred) {
      return {
        kind: 'clarify',
        clarification: {
          reason: 'unknown_city',
          question: `Города «${location.city}» нет в приложении. Где искать?`,
          options: [
            ...(options.allowRegion
              ? [{ label: 'Весь Дагестан', value: 'Дагестан', kind: 'city' as const }]
              : []),
            ...cityOptions(context.cities),
          ],
        },
      };
    }
  }

  if (location?.nearMe && context.latitude !== undefined && context.longitude !== undefined) {
    const city = nearestCity(context.cities, context.latitude, context.longitude);
    if (city) return { kind: 'city', city, mode: 'near_me' };
  }

  if (context.cityId) {
    const city = context.cities.find((item) => item.id === context.cityId);
    if (city) return { kind: 'city', city, mode: 'context' };
  }
  if (context.latitude !== undefined && context.longitude !== undefined) {
    const city = nearestCity(context.cities, context.latitude, context.longitude);
    if (city) return { kind: 'city', city, mode: 'context' };
  }
  return { kind: 'none' };
}
