import { MAIN_TYPES, findSeedCategory, mainTypeBySlug } from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import { attributesOf, harness } from './helpers/smart-search-fixtures.js';

/**
 * Электроника (аудит, п. 32–33): новые модели всех брендов находятся по
 * официальным, русским и коротким названиям; планшеты — основной тип со
 * своими направлениями и запчастями, как телефоны.
 */

async function ask(text: string) {
  const h = harness({ parser: 'local' });
  const response = await h.service.search({ text, limit: 1, context: { screen: 'listings' } });
  const query = h.calls.listings[0];
  return { response, query, attrs: attributesOf(query) };
}

describe('новые модели: официальные, русские и короткие названия', () => {
  it.each([
    ['iPhone 18 Pro', 'electronics-phones', 'apple', 'iphone_18_pro'],
    ['айфон 18 про макс', 'electronics-phones', 'apple', 'iphone_18_pro_max'],
    ['айфон 17 про макс', 'electronics-phones', 'apple', 'iphone_17_pro_max'],
    ['iPhone 17e', 'electronics-phones', 'apple', 'iphone_17e'],
    ['Galaxy S26 Ultra', 'electronics-phones', 'samsung', 'galaxy_s26_ultra'],
    ['S26 Ultra', 'electronics-phones', 'samsung', 'galaxy_s26_ultra'],
    ['самсунг галакси с26 ультра', 'electronics-phones', 'samsung', 'galaxy_s26_ultra'],
    ['Z Fold 8', 'electronics-phones', 'samsung', 'galaxy_z_fold_8'],
    ['ксиоми 15', 'electronics-phones', 'xiaomi', 'xiaomi_15'],
    ['шаоми 17 про', 'electronics-phones', 'xiaomi', 'xiaomi_17_pro'],
    ['редми ноут 15 про', 'electronics-phones', 'redmi', 'redmi_note_15_pro'],
    ['хонор 400', 'electronics-phones', 'honor', '400'],
    ['Pixel 10a', 'electronics-phones', 'google', 'pixel_10a'],
    ['Galaxy Tab S11', 'electronics-tablets', 'samsung', 'galaxy_tab_s11'],
    ['Galaxy Tab S10', 'electronics-tablets', 'samsung', 'galaxy_tab_s10'],
  ])('«%s» → %s, %s %s', async (text, category, brand, model) => {
    const { query, attrs } = await ask(text);
    expect(query?.category).toBe(category);
    expect(attrs).toMatchObject({ brand, model });
  });

  it('«iPhone 18» — обычного iPhone 18 ещё нет: Apple и «18» словом, а не «все Apple»', async () => {
    const { query, attrs } = await ask('iPhone 18');
    expect(attrs.brand).toBe('apple');
    expect(attrs.model).toBeUndefined();
    expect(String(query?.search)).toContain('18');
  });

  it('«Galaxy Tab» не путается с Ford Galaxy', async () => {
    const { query } = await ask('Galaxy Tab S10');
    expect(query?.category).not.toBe('transport-cars');
  });
});

describe('планшеты — основной тип со своими направлениями', () => {
  const tablets = mainTypeBySlug('tablets')!;

  it('направления как у телефонов и по ТЗ', () => {
    expect(tablets.section).toBe('electronics');
    expect(tablets.directions).toEqual([
      'electronics-tablets',
      'electronics-tablet-parts',
      'electronics-tablet-accessories',
      'electronics-tablet-cases',
      'electronics-tablet-glass',
      'electronics-tablet-chargers',
      'electronics-tablet-cables',
      'electronics-tablet-input',
      'electronics-tablet-other',
    ]);
    for (const slug of tablets.directions) expect(findSeedCategory(slug), slug).toBeTruthy();
  });

  it('у каждого направления один основной тип — дублей нет', () => {
    const owners = new Map<string, string>();
    for (const type of MAIN_TYPES) {
      for (const slug of type.directions) {
        expect(owners.get(slug), `${slug}: ${owners.get(slug)} и ${type.slug}`).toBeUndefined();
        owners.set(slug, type.slug);
      }
    }
  });

  it.each([
    ['планшет', 'electronics-tablets'],
    ['дисплей для планшета', 'electronics-tablet-parts'],
    ['аккумулятор на ipad', 'electronics-tablet-parts'],
    ['стилус для планшета', 'electronics-tablet-input'],
    ['чехол на планшет', 'electronics-tablet-cases'],
  ])('«%s» → %s', async (text, category) => {
    const { query } = await ask(text);
    expect(query?.category).toBe(category);
  });
});
