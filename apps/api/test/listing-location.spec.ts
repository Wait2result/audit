import type { GeoPlaceDto } from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import {
  listingPlaceLabel,
  locationColumns,
  myLocation,
  publicLocation,
  type LocationRow,
} from '../src/modules/listings/listing-location.js';

/**
 * Место объявления: что хранится и что видят другие (ADR-0010).
 */

const MAKHACHKALA_HOUSE = {
  latitude: 42.97412,
  longitude: 47.50691,
  accuracy: 'house' as const,
  address: 'улица Батырая, 51',
  formattedAddress: 'Республика Дагестан, Махачкала, Советский район, улица Батырая, 51',
  country: 'Россия',
  region: 'Республика Дагестан',
  district: 'городской округ Махачкала',
  cityDistrict: 'Советский район',
  city: 'Махачкала',
  street: 'улица Батырая',
  houseNumber: '51',
};

function row(
  overrides: Partial<LocationRow> = {},
  input: Parameters<typeof locationColumns>[0] = MAKHACHKALA_HOUSE,
): LocationRow {
  return {
    ...locationColumns(input),
    addressVisibility: 'approximate',
    city: { name: 'Махачкала' },
    district: null,
    ...overrides,
  };
}

const MANASKENT_REVERSE: GeoPlaceDto = {
  kind: 'house',
  title: 'Приморская улица, 40',
  subtitle: 'Манаскент, Карабудахкентский район',
  latitude: 42.744,
  longitude: 47.6998,
  formattedAddress: 'Республика Дагестан, Карабудахкентский район, Манаскент, Приморская улица, 40',
  accuracy: 'house',
  components: {
    country: 'Россия',
    region: 'Республика Дагестан',
    district: 'Карабудахкентский район',
    cityDistrict: null,
    city: null,
    settlement: 'Манаскент',
    street: 'Приморская улица',
    houseNumber: '40',
  },
};

describe('Хранение места', () => {
  it('город с районом: все части в своих колонках', () => {
    expect(locationColumns(MAKHACHKALA_HOUSE)).toMatchObject({
      latitude: 42.97412,
      longitude: 47.50691,
      cityName: 'Махачкала',
      cityDistrict: 'Советский район',
      settlement: null,
      districtName: 'городской округ Махачкала',
      houseNumber: '51',
      locationAccuracy: 'house',
    });
  });

  it('село: без города, район — административный', () => {
    const columns = locationColumns({
      latitude: 42.744,
      longitude: 47.6998,
      accuracy: 'settlement',
      ...MANASKENT_REVERSE.components,
    });
    expect(columns.cityName).toBeNull();
    expect(columns.settlement).toBe('Манаскент');
    expect(columns.districtName).toBe('Карабудахкентский район');
  });

  it('точка без адреса: части берутся из адреса по точке, координаты — свои', () => {
    const columns = locationColumns(
      { latitude: 42.74401, longitude: 47.69981, accuracy: 'point' },
      MANASKENT_REVERSE,
    );
    expect(columns.latitude).toBe(42.74401);
    expect(columns.settlement).toBe('Манаскент');
    expect(columns.address).toBe('Приморская улица, 40');
    expect(columns.locationAccuracy).toBe('point');
  });

  it('адрес по точке не нашёлся — сохраняется одна точка', () => {
    const columns = locationColumns({ latitude: 42.5, longitude: 46.9, accuracy: 'point' }, null);
    expect(columns).toMatchObject({
      latitude: 42.5,
      longitude: 46.9,
      address: null,
      cityName: null,
      settlement: null,
      formattedAddress: null,
    });
  });

  it('ориентир, написанный человеком, не перетирается подсказкой', () => {
    const columns = locationColumns({ ...MAKHACHKALA_HOUSE, address: 'у рынка, синие ворота' });
    expect(columns.address).toBe('у рынка, синие ворота');
    expect(columns.houseNumber).toBe('51');
  });
});

describe('Что видят другие', () => {
  it('скрытый адрес: улица без дома, точка округлена, точные координаты не уходят', () => {
    const location = publicLocation(row());
    expect(location.address).toBe('улица Батырая');
    expect(location.point).toEqual({ latitude: 42.97, longitude: 47.51 });
    expect(location.isApproximate).toBe(true);
    expect(JSON.stringify(location)).not.toContain('42.97412');
  });

  it('открытый адрес (СТО, магазин): дом и точная точка', () => {
    const location = publicLocation(row({ addressVisibility: 'exact' }));
    expect(location.address).toBe('улица Батырая, 51');
    expect(location.point).toEqual({ latitude: 42.97412, longitude: 47.50691 });
    expect(location.isApproximate).toBe(false);
  });

  it('подпись: город с районом, село — одно название', () => {
    expect(listingPlaceLabel(row())).toBe('Махачкала, Советский район');
    const village = row(
      {},
      {
        latitude: 42.744,
        longitude: 47.6998,
        accuracy: 'settlement',
        ...MANASKENT_REVERSE.components,
      },
    );
    expect(listingPlaceLabel(village)).toBe('Манаскент');
  });

  it('старое объявление без точки: город справочника и выбранный тогда район', () => {
    const legacy = row(
      { district: { name: 'Кировский район' }, cityName: null, cityDistrict: null },
      { latitude: 0, longitude: 0, accuracy: 'point' },
    );
    expect(listingPlaceLabel({ ...legacy, latitude: null, longitude: null })).toBe(
      'Махачкала, Кировский район',
    );
    expect(publicLocation({ ...legacy, latitude: null, longitude: null }).point).toBeNull();
    expect(myLocation({ ...legacy, latitude: null, longitude: null })).toBeNull();
  });
});
