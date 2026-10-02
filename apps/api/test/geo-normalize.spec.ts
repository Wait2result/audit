import { describe, expect, it } from 'vitest';

import {
  dagestanFirst,
  dedupePlaces,
  isCityDistrictCounty,
  nominatimToPlace,
  normalizeRegion,
  photonToPlace,
} from '../src/modules/geo/geo-normalize.js';

/**
 * Ответы геокодеров → единый вид. Данные — настоящие ответы Photon и
 * Nominatim по Дагестану (сентябрь 2026), сокращённые до нужных полей.
 */

const photonVillage = {
  geometry: { coordinates: [47.6919, 42.74] as [number, number] },
  properties: {
    osm_key: 'place',
    osm_value: 'village',
    type: 'city',
    name: 'Манаскент',
    county: 'Карабудахкентский район',
    state: 'Дагестан',
    country: 'Россия',
  },
};

const photonStreet = {
  geometry: { coordinates: [47.5042, 42.9757] as [number, number] },
  properties: {
    osm_key: 'highway',
    osm_value: 'primary',
    type: 'street',
    name: 'улица Батырая',
    district: '1-й Юго-западный микрорайон',
    city: 'Махачкала',
    county: 'городской округ Махачкала',
    state: 'Дагестан',
    country: 'Россия',
  },
};

const photonHouse = {
  geometry: { coordinates: [47.6998265, 42.7440529] as [number, number] },
  properties: {
    osm_key: 'building',
    osm_value: 'house',
    type: 'house',
    housenumber: '40',
    street: 'Приморская улица',
    city: 'Манаскент',
    county: 'Карабудахкентский район',
    state: 'Дагестан',
    country: 'Россия',
  },
};

const photonWrapper = {
  geometry: { coordinates: [47.691, 42.7413] as [number, number] },
  properties: {
    osm_key: 'boundary',
    osm_value: 'administrative',
    name: 'сельское поселение Село Манаскент',
    county: 'Карабудахкентский район',
    state: 'Дагестан',
  },
};

describe('Photon', () => {
  it('село: без города, с районом и республикой', () => {
    const place = photonToPlace(photonVillage);
    expect(place?.kind).toBe('settlement');
    expect(place?.title).toBe('Манаскент');
    expect(place?.subtitle).toBe('Карабудахкентский район, Республика Дагестан');
    expect(place?.components).toMatchObject({
      city: null,
      settlement: 'Манаскент',
      district: 'Карабудахкентский район',
      region: 'Республика Дагестан',
    });
    expect(place?.accuracy).toBe('settlement');
    expect(place?.latitude).toBe(42.74);
  });

  it('улица в городе: город из городского округа, микрорайон — не район города', () => {
    const place = photonToPlace(photonStreet);
    expect(place?.kind).toBe('street');
    expect(place?.title).toBe('улица Батырая');
    expect(place?.components.city).toBe('Махачкала');
    expect(place?.components.settlement).toBeNull();
    // «1-й Юго-западный микрорайон» — не Советский район, путать нельзя
    expect(place?.components.cityDistrict).toBeNull();
    expect(place?.accuracy).toBe('street');
  });

  it('дом в селе: улица с номером', () => {
    const place = photonToPlace(photonHouse);
    expect(place?.kind).toBe('house');
    expect(place?.title).toBe('Приморская улица, 40');
    expect(place?.subtitle).toBe('Манаскент, Карабудахкентский район');
    expect(place?.formattedAddress).toBe(
      'Республика Дагестан, Карабудахкентский район, Манаскент, Приморская улица, 40',
    );
    expect(place?.accuracy).toBe('house');
  });

  it('административная «оболочка» — не место', () => {
    expect(photonToPlace(photonWrapper)).toBeNull();
  });

  it('без координат — не место', () => {
    expect(photonToPlace({ properties: { name: 'Где-то' } })).toBeNull();
  });
});

describe('Nominatim', () => {
  it('адрес в городе: район города определяется сам', () => {
    const place = nominatimToPlace({
      lat: '42.9757',
      lon: '47.5042',
      addresstype: 'building',
      address: {
        house_number: '51',
        road: 'улица Батырая',
        suburb: '1-й Юго-западный микрорайон',
        city_district: 'Советский район',
        city: 'Махачкала',
        county: 'городской округ Махачкала',
        state: 'Дагестан',
        country: 'Россия',
      },
    });
    expect(place?.kind).toBe('house');
    expect(place?.title).toBe('улица Батырая, 51');
    expect(place?.subtitle).toBe('Махачкала, Советский район');
    expect(place?.components).toMatchObject({
      city: 'Махачкала',
      cityDistrict: 'Советский район',
      settlement: null,
      houseNumber: '51',
    });
    expect(place?.formattedAddress).toBe(
      'Республика Дагестан, Махачкала, Советский район, улица Батырая, 51',
    );
  });

  it('село: village, а не город; района города нет', () => {
    const place = nominatimToPlace({
      lat: '42.7440',
      lon: '47.6998',
      address: {
        house_number: '40',
        road: 'Приморская улица',
        village: 'Манаскент',
        municipality: 'сельское поселение Село Манаскент',
        county: 'Карабудахкентский район',
        state: 'Дагестан',
        country: 'Россия',
      },
    });
    expect(place?.components).toMatchObject({
      city: null,
      settlement: 'Манаскент',
      district: 'Карабудахкентский район',
      cityDistrict: null,
    });
  });

  it('town в муниципальном районе — село (Касумкент), в городском округе — город', () => {
    const village = nominatimToPlace({
      lat: '41.68',
      lon: '48.15',
      address: { town: 'Касумкент', county: 'Сулейман-Стальский район', state: 'Дагестан' },
    });
    expect(village?.components.settlement).toBe('Касумкент');
    expect(village?.components.city).toBeNull();

    const city = nominatimToPlace({
      lat: '42.82',
      lon: '46.61',
      address: { town: 'Буйнакск', county: 'городской округ Буйнакск', state: 'Дагестан' },
    });
    expect(city?.components.city).toBe('Буйнакск');
  });

  it('точка без населённого пункта — только район', () => {
    const place = nominatimToPlace({
      lat: '42.5',
      lon: '46.9',
      address: { county: 'Гумбетовский район', state: 'Дагестан' },
    });
    expect(place?.kind).toBe('area');
    expect(place?.title).toBe('Гумбетовский район');
  });
});

describe('Общие правила', () => {
  it('республика называется полностью', () => {
    expect(normalizeRegion('Дагестан')).toBe('Республика Дагестан');
    expect(normalizeRegion('Чеченская Республика')).toBe('Чеченская Республика');
    expect(normalizeRegion(null)).toBeNull();
  });

  it('город — это городской округ', () => {
    expect(isCityDistrictCounty('городской округ Махачкала')).toBe(true);
    expect(isCityDistrictCounty('Карабудахкентский район')).toBe(false);
  });

  it('отрезки одной улицы — одна подсказка', () => {
    const a = photonToPlace(photonStreet);
    const b = photonToPlace({
      ...photonStreet,
      geometry: { coordinates: [47.4948, 42.9804] as [number, number] },
    });
    expect(a && b ? dedupePlaces([a, b]) : []).toHaveLength(1);
  });

  it('сначала Дагестан', () => {
    const inside = photonToPlace(photonVillage);
    const outside = photonToPlace({
      ...photonVillage,
      properties: { ...photonVillage.properties, name: 'Манкент', state: 'Түркістан облысы' },
    });
    if (!inside || !outside) throw new Error('fixtures');
    expect(dagestanFirst([outside, inside]).map((place) => place.title)).toEqual([
      'Манаскент',
      'Манкент',
    ]);
  });
});
