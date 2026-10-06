import {
  FILTER_ONLY_ATTRIBUTES,
  bindingsOf,
  carryAttributes,
  findSeedCategory,
  isAttributeVisible,
  isCategoryStep,
  openStepIndex,
  planListingSteps,
  resolveAttributes,
  stepComplete,
  type ListingAttribute,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

/**
 * Пошаговая подача объявления (ТЗ «Форма размещения»): какие шаги бывают у
 * категории и в каком порядке, когда открывается следующий, что меняет
 * сделка и смена категории. Форма в приложении рисует ровно этот план.
 */

/** Поля формы категории — как в приложении: без слоя запчасти. */
function formFieldsOf(slug: string): ListingAttribute[] {
  const category = findSeedCategory(slug);
  if (!category) throw new Error(`Нет категории ${slug}`);
  return resolveAttributes(bindingsOf(category)).filter(
    (field) => !FILTER_ONLY_ATTRIBUTES.has(field.key),
  );
}

function plan(
  slug: string,
  options: {
    transactionType?: string | null;
    dealStep?: boolean;
    partLayer?: boolean;
    values?: Record<string, unknown>;
  } = {},
) {
  const fields = formFieldsOf(slug);
  const deal = { transactionType: options.transactionType ?? null };
  const visibleFields = fields.filter((field) =>
    isAttributeVisible(field, options.values ?? {}, deal),
  );
  return planListingSteps({
    hasCategory: true,
    dealStep: options.dealStep ?? false,
    visibleFields,
    partLayer: options.partLayer ?? false,
    priceless: false,
  });
}

const fieldSteps = (steps: readonly string[]) =>
  steps.filter((id) => id.startsWith('field:')).map((id) => id.slice('field:'.length));

describe('начало: только заголовок и категория', () => {
  it('без категории шагов характеристик, фото и цены нет', () => {
    const result = planListingSteps({
      hasCategory: false,
      dealStep: false,
      visibleFields: [],
      partLayer: false,
      priceless: false,
    });
    expect(result.steps).toEqual(['title', 'category']);
  });
});

describe('недвижимость: сначала «Продам / Сдам», потом поля по одной', () => {
  it('квартира: порядок шагов', () => {
    const { steps } = plan('realty-flats', { transactionType: 'sale', dealStep: true });
    expect(steps.slice(0, 3)).toEqual(['title', 'category', 'deal']);
    // Фото, цена, место и описание — после характеристик
    expect(steps.indexOf('photos')).toBeGreaterThan(steps.indexOf('details'));
    expect(steps.slice(-4)).toEqual(['photos', 'price', 'location', 'description']);
    expect(fieldSteps(steps)).toEqual(expect.arrayContaining(['sellerType', 'rooms', 'areaTotal']));
  });

  it('продажа: условий аренды нет ни шагом, ни в «Дополнительно»', () => {
    const { detailFields } = plan('realty-flats', { transactionType: 'sale', dealStep: true });
    const keys = detailFields.map((field) => field.key);
    expect(keys).not.toContain('petsAllowed');
    expect(keys).not.toContain('childrenAllowed');
    expect(keys).not.toContain('utilitiesIncluded');
  });

  it('аренда: условия аренды — в шаге «Дополнительно», а не сразу после «Сдам»', () => {
    const { steps, detailFields } = plan('realty-flats', {
      transactionType: 'rent',
      dealStep: true,
    });
    const keys = detailFields.map((field) => field.key);
    expect(keys).toEqual(expect.arrayContaining(['petsAllowed', 'childrenAllowed']));
    expect(steps.indexOf('details')).toBeGreaterThan(steps.indexOf('deal') + 1);
  });

  it('санузел дома — не шаг, а необязательное поле', () => {
    const { detailFields } = plan('realty-houses', { transactionType: 'sale', dealStep: true });
    expect(detailFields.map((field) => field.key)).toContain('bathroomLocation');
  });
});

describe('техника: тип раньше характеристик, чужих полей нет', () => {
  it('запчасти автомобиля: категория детали и деталь — шагами, затем номера и совместимость', () => {
    const { steps, detailFields } = plan('transport-parts', { partLayer: true });
    const fields = fieldSteps(steps);
    expect(fields.slice(0, 2)).toEqual(['partGroup', 'partItem']);
    // Производитель, оригинальность, состояние — после выбора детали, одним шагом
    expect(detailFields.map((field) => field.key)).toEqual(
      expect.arrayContaining(['partManufacturer', 'partOriginality', 'partCondition']),
    );
    expect(steps.indexOf('part')).toBeGreaterThan(steps.indexOf('details'));
  });

  it('автомобиль: нет полей квартиры и телефона', () => {
    const all = [
      ...fieldSteps(plan('transport-cars').steps),
      ...plan('transport-cars').detailFields.map((f) => f.key),
    ];
    expect(all).not.toContain('rooms');
    expect(all).not.toContain('memory');
    expect(all).not.toContain('compatChassis');
  });

  it('телефон: нет кузова, двигателя, пробега', () => {
    const result = plan('electronics-phones');
    const all = [...fieldSteps(result.steps), ...result.detailFields.map((f) => f.key)];
    for (const key of ['compatChassis', 'compatEngine', 'mileage', 'engineVolume', 'rooms'])
      expect(all, key).not.toContain(key);
  });

  it('планшет и его направления — свои шаги', () => {
    expect(plan('electronics-tablets').steps).toContain('photos');
    const cases = plan('electronics-tablet-cases');
    expect(fieldSteps(cases.steps)).toContain('goodsType');
  });

  it('дом и ремонт: бытовая техника — тип техники шагом', () => {
    const result = plan('home-appliances');
    expect(fieldSteps(result.steps).length).toBeGreaterThan(0);
    const all = [...fieldSteps(result.steps), ...result.detailFields.map((f) => f.key)];
    expect(all).not.toContain('mileage');
  });
});

describe('открытый шаг', () => {
  const steps = [
    { id: 'title', valid: true },
    { id: 'category', valid: true, auto: true },
    { id: 'deal', valid: false, auto: true },
    { id: 'field:rooms', valid: false },
  ];

  it('текст подтверждается «Далее», выбор закрывается сам', () => {
    expect(openStepIndex(steps, new Set())).toBe(0);
    expect(openStepIndex(steps, new Set(['title']))).toBe(2);
  });

  it('следующий шаг открывается только после предыдущего', () => {
    const done = new Set(['title']);
    const filled = steps.map((step) => (step.id === 'deal' ? { ...step, valid: true } : step));
    expect(openStepIndex(filled, done)).toBe(3);
  });

  it('необязательный шаг можно пропустить, обязательный — нет', () => {
    expect(
      stepComplete({ id: 'details', valid: false, optional: true }, new Set(['details'])),
    ).toBe(true);
    expect(stepComplete({ id: 'field:rooms', valid: false }, new Set(['field:rooms']))).toBe(false);
  });

  it('стёрли заполненное — шаг снова открыт', () => {
    const done = new Set(['title', 'field:rooms']);
    const emptied = steps.map((step) => ({ ...step, valid: step.id !== 'title' ? true : false }));
    expect(openStepIndex(emptied, done)).toBe(0);
  });
});

describe('смена категории', () => {
  it('шаги категории проходятся заново, общие остаются', () => {
    for (const id of ['deal', 'details', 'part', 'field:rooms'])
      expect(isCategoryStep(id), id).toBe(true);
    for (const id of ['title', 'category', 'photos', 'price', 'location', 'description'])
      expect(isCategoryStep(id), id).toBe(false);
  });

  it('запчасть → планшет: характеристики детали и машины сброшены и названы', () => {
    const { kept, dropped } = carryAttributes(
      formFieldsOf('transport-parts'),
      formFieldsOf('electronics-tablets'),
      { partGroup: 'steering', partItem: 'steering_rack', partManufacturer: 'kyb' },
    );
    expect(kept).toEqual({});
    expect(dropped.length).toBe(3);
  });
});
