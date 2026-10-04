import { Injectable } from '@nestjs/common';
import type {
  SmartSearchIntentCore,
  SmartSearchNavigation,
  SmartSearchNormalizedQuery,
} from '@dagestan/shared';

import { WeatherService } from '../../weather/weather.service.js';
import { cityOptions, resolvePlace } from '../normalize/location.js';
import { daysBetween, resolveDay, todayIn } from '../normalize/time.js';
import type {
  DomainAdapter,
  DomainRequestContext,
  ExecuteOutcome,
  NormalizeOutcome,
} from './domain-adapter.js';
import { dayLabel, emptyQuery, namedCityId } from './domain-adapter.js';

/**
 * Погода — существующий прогноз `WeatherService` (тот же, что на экране
 * погоды): город и день. Своих условий у раздела нет: «будет ли дождь» —
 * это просто прогноз на день.
 */

/** Прогноз приходит на неделю вперёд, включая сегодня. */
const FORECAST_DAYS = 7;

export interface WeatherPlan {
  cityId: string;
  cityName: string;
  date: string;
  today: string;
}

export function normalizeWeather(
  intent: SmartSearchIntentCore,
  context: DomainRequestContext,
): NormalizeOutcome<WeatherPlan> {
  const query = emptyQuery('weather', intent);
  const place = resolvePlace(intent, context, { allowRegion: false });
  if (place.kind === 'clarify')
    return { kind: 'clarify', query, clarification: place.clarification };
  if (place.kind !== 'city') {
    return {
      kind: 'clarify',
      query,
      clarification: {
        reason: 'city_required',
        question: 'Для какого города прогноз?',
        options: cityOptions(context.cities),
      },
    };
  }
  const city = place.city;
  query.location = { cityId: city.id, cityName: city.name, mode: place.mode };

  const today = todayIn(city.timezone, context.now);
  let date = resolveDay(intent.time?.date ?? null, city.timezone, context.now) ?? today;
  const ahead = daysBetween(today, date);
  if (ahead < 0 || ahead >= FORECAST_DAYS) {
    query.ignored.push({ field: 'date', reason: 'Прогноз есть только на неделю вперёд' });
    date = today;
  }
  query.time = { date, from: null, to: null };
  query.conditions.push({
    field: 'date',
    label: 'День',
    value: date,
    display: dayLabel(date, today),
  });
  query.params = { cityId: city.id };
  return { kind: 'ready', plan: { cityId: city.id, cityName: city.name, date, today }, query };
}

@Injectable()
export class WeatherSearchAdapter implements DomainAdapter<WeatherPlan> {
  readonly domain = 'weather' as const;
  readonly label = 'Погода';

  constructor(private readonly weather: WeatherService) {}

  promptSection(): Promise<string> {
    return Promise.resolve(
      [
        'weather — прогноз погоды на день в городе: «какая погода», «будет ли дождь завтра», «погода в Дербенте».',
        '  Фильтров нет: город — в location, день — в time.date.',
      ].join('\n'),
    );
  }

  allowedFilterKeys(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set<string>());
  }

  normalize(
    intent: SmartSearchIntentCore,
    context: DomainRequestContext,
  ): Promise<NormalizeOutcome<WeatherPlan>> {
    return Promise.resolve(normalizeWeather(intent, context));
  }

  async execute(plan: WeatherPlan): Promise<ExecuteOutcome> {
    const forecast = await this.weather.getForecast(plan.cityId);
    const day = forecast.daily.find((item) => item.date === plan.date) ?? null;
    const current = plan.date === plan.today ? forecast.current : null;
    return {
      kind: 'results',
      results: {
        domain: 'weather',
        cityId: plan.cityId,
        cityName: plan.cityName,
        date: plan.date,
        day,
        current,
      },
      count: day || current ? 1 : 0,
    };
  }

  navigation(
    query: SmartSearchNormalizedQuery,
    context: DomainRequestContext,
  ): SmartSearchNavigation {
    const filters: SmartSearchNavigation['filters'] = {};
    const cityId = namedCityId(query);
    if (cityId) filters.cityId = cityId;
    const date = query.time?.date;
    if (date) filters.date = date;
    const city = context.cities.find((item) => item.id === query.location?.cityId);
    const today = todayIn(city?.timezone ?? 'Europe/Moscow', context.now);
    return {
      section: 'weather',
      path: [query.location?.cityName ?? 'Погода', ...(date ? [dayLabel(date, today)] : [])],
      filters,
    };
  }
}
