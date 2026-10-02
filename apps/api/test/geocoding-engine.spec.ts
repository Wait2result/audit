import type { GeoCoordinates, GeoPlaceDto } from '@dagestan/shared';
import { describe, expect, it, vi } from 'vitest';

import { GeocodingEngine, MemoryGeoCache } from '../src/modules/geo/geocoding.engine.js';
import {
  GeocoderUnavailableError,
  type GeocodingProvider,
  type SuggestRequest,
} from '../src/modules/geo/geocoding.provider.js';

/**
 * Ядро геокодирования: кеш, склейка одновременных запросов, запасной
 * поставщик и честное «не нашлось» (ADR-0010).
 */

const PLACE: GeoPlaceDto = {
  kind: 'settlement',
  title: 'Манаскент',
  subtitle: 'Карабудахкентский район',
  latitude: 42.74,
  longitude: 47.69,
  formattedAddress: 'Республика Дагестан, Карабудахкентский район, Манаскент',
  accuracy: 'settlement',
  components: {
    country: 'Россия',
    region: 'Республика Дагестан',
    district: 'Карабудахкентский район',
    cityDistrict: null,
    city: null,
    settlement: 'Манаскент',
    street: null,
    houseNumber: null,
  },
};

/** Поставщик-заглушка и его шпионы отдельно — чтобы проверять вызовы. */
function provider(
  name: string,
  behaviour: {
    suggest?: (request: SuggestRequest) => Promise<GeoPlaceDto[]>;
    reverse?: (point: GeoCoordinates) => Promise<GeoPlaceDto | null>;
  },
) {
  const suggest = vi.fn(behaviour.suggest ?? (() => Promise.resolve([PLACE])));
  const reverse = vi.fn(behaviour.reverse ?? (() => Promise.resolve<GeoPlaceDto | null>(PLACE)));
  const instance: GeocodingProvider = { name, suggest, reverse };
  return { instance, suggest, reverse };
}

const down = (): Promise<never> =>
  Promise.reject(new GeocoderUnavailableError('test', 'ответил 503', 503));

function engine(suggestChain: GeocodingProvider[], reverseChain: GeocodingProvider[]) {
  const warnings: string[] = [];
  const instance = new GeocodingEngine(suggestChain, reverseChain, new MemoryGeoCache(), 60, {
    warn: (message) => warnings.push(message),
  });
  return { instance, warnings };
}

const REQUEST: SuggestRequest = { q: 'Манаск', kind: 'any', limit: 5 };

describe('Геокодирование', () => {
  it('повторный запрос берётся из кеша', async () => {
    const photon = provider('photon', {});
    const { instance } = engine([photon.instance], [photon.instance]);

    await instance.suggest(REQUEST);
    await instance.suggest({ ...REQUEST, q: '  манаск  ' });
    expect(photon.suggest).toHaveBeenCalledTimes(1);
  });

  it('одновременные одинаковые запросы ждут один ответ', async () => {
    const photon = provider('photon', {
      suggest: () => new Promise((resolve) => setTimeout(() => resolve([PLACE]), 20)),
    });
    const { instance } = engine([photon.instance], [photon.instance]);

    const [a, b] = await Promise.all([instance.suggest(REQUEST), instance.suggest(REQUEST)]);
    expect(a).toEqual(b);
    expect(photon.suggest).toHaveBeenCalledTimes(1);
  });

  it('недоступен основной — отвечает запасной, сбой записан в журнал', async () => {
    const nominatim = provider('nominatim', { reverse: down });
    const photon = provider('photon', {});
    const { instance, warnings } = engine([photon.instance], [nominatim.instance, photon.instance]);

    const place = await instance.reverse({ latitude: 42.74, longitude: 47.69 });
    expect(place?.title).toBe('Манаскент');
    expect(photon.reverse).toHaveBeenCalledTimes(1);
    expect(warnings[0]).toContain('nominatim недоступен');
  });

  it('«ничего не нашлось» — ответ, запасного не спрашиваем', async () => {
    const nominatim = provider('nominatim', { reverse: () => Promise.resolve(null) });
    const photon = provider('photon', {});
    const { instance } = engine([photon.instance], [nominatim.instance, photon.instance]);

    expect(await instance.reverse({ latitude: 43.5, longitude: 49.5 })).toBeNull();
    expect(photon.reverse).not.toHaveBeenCalled();
  });

  it('все недоступны — понятная ошибка, а не пустой список', async () => {
    const photon = provider('photon', { suggest: down });
    const { instance } = engine([photon.instance], [photon.instance]);

    await expect(instance.suggest(REQUEST)).rejects.toBeInstanceOf(GeocoderUnavailableError);
  });

  it('тихий адрес по точке при сбое — null, без ошибки', async () => {
    const photon = provider('photon', { reverse: down });
    const { instance } = engine([photon.instance], [photon.instance]);

    expect(await instance.reverseQuietly({ latitude: 42.74, longitude: 47.69 })).toBeNull();
  });

  it('сбой не кешируется: следующий запрос снова идёт к поставщику', async () => {
    let calls = 0;
    const photon = provider('photon', {
      suggest: () => {
        calls += 1;
        if (calls === 1) {
          return Promise.reject(new GeocoderUnavailableError('photon', 'таймаут'));
        }
        return Promise.resolve([PLACE]);
      },
    });
    const { instance } = engine([photon.instance], [photon.instance]);

    await expect(instance.suggest(REQUEST)).rejects.toThrow();
    expect(await instance.suggest(REQUEST)).toEqual([PLACE]);
  });
});
