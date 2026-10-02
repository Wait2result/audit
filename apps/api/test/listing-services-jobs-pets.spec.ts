import {
  bindingsOf,
  findSeedCategory,
  resolveAttributes,
  type ListingAttribute,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

/**
 * Услуги, работа, животные (фазы 7–9): у услуги — список работ, у вакансии —
 * сфера, у животного — порода и возраст; «подработка» и «вязка» — ярлыки.
 */

function attributesOf(slug: string): readonly ListingAttribute[] {
  const category = findSeedCategory(slug);
  if (!category) throw new Error(`Нет категории ${slug}`);
  return resolveAttributes(bindingsOf(category));
}

function keysOf(slug: string): string[] {
  return attributesOf(slug).map((attribute) => attribute.key);
}

function requiredOf(slug: string): string[] {
  return attributesOf(slug)
    .filter((attribute) => attribute.required)
    .map((attribute) => attribute.key);
}

describe('Услуги', () => {
  it('у услуги первым обязательным идёт список работ, дальше — общие поля', () => {
    for (const [slug, key] of [
      ['services-repair', 'repairType'],
      ['services-building', 'buildingWork'],
      ['services-auto', 'autoService'],
      ['services-beauty', 'beautyService'],
      ['services-tutors', 'subject'],
      ['services-legal', 'legalService'],
    ] as const) {
      expect(requiredOf(slug), slug).toEqual([key]);
      expect(keysOf(slug), slug).toEqual(
        expect.arrayContaining(['serviceFormat', 'performer', 'experienceYears', 'urgent']),
      );
    }
  });

  it('список работ — множественный выбор: мастер делает и электрику, и сантехнику', () => {
    const repair = attributesOf('services-repair').find((a) => a.key === 'repairType');
    expect(repair?.filter).toBe('multiselect');
  });

  it('репетитор: цена по умолчанию за час, есть «для кого»', () => {
    expect(findSeedCategory('services-tutors')?.defaultPriceUnit).toBe('per_hour');
    expect(keysOf('services-tutors')).toContain('grade');
  });
});

describe('Работа', () => {
  it('вакансия и резюме: сфера и занятость обязательны', () => {
    expect(requiredOf('job-vacancies')).toEqual(['sphere', 'employment']);
    expect(requiredOf('job-resume')).toEqual(['sphere', 'employment']);
    expect(keysOf('job-resume')).toEqual(expect.arrayContaining(['experienceYears', 'education']));
  });

  it('подработка, «без опыта», удалёнка, стажировки — ярлыки в вакансии', () => {
    expect(findSeedCategory('job-parttime')?.shortcut).toEqual({
      category: 'job-vacancies',
      attributes: { employment: 'temporary' },
    });
    expect(findSeedCategory('job-no-experience')?.shortcut?.attributes).toEqual({
      experience: 'none',
    });
    expect(findSeedCategory('job-remote')?.shortcut?.attributes).toEqual({ remote: true });
    expect(findSeedCategory('job-internship')?.shortcut?.attributes).toEqual({
      employment: 'internship',
    });
    expect(keysOf('job-parttime')).toEqual([]);
  });
});

describe('Животные', () => {
  it('у питомца порода, возраст, пол, прививки, стерилизация, документы', () => {
    expect(keysOf('animals-dogs')).toEqual([
      'breed',
      'animalAge',
      'sex',
      'vaccinated',
      'sterilized',
      'documents',
    ]);
    expect(findSeedCategory('animals-cats')?.transactions).toEqual(['sale', 'free', 'mating']);
  });

  it('сельхозживотные: кто это обязательно, продаются и поголовно', () => {
    expect(requiredOf('animals-livestock')).toEqual(['livestockKind']);
    expect(keysOf('animals-livestock')).toContain('quantity');
    expect(findSeedCategory('animals-livestock')?.priceUnits).toEqual(['total', 'per_unit']);
  });

  it('«Вязка» и «Отдам» — ярлыки на раздел со сделкой', () => {
    expect(findSeedCategory('animals-mating')?.shortcut).toEqual({
      category: 'animals',
      transactionType: 'mating',
    });
    expect(findSeedCategory('animals-free')?.shortcut).toEqual({
      category: 'animals',
      transactionType: 'free',
    });
  });
});
