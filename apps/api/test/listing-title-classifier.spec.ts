import { classifyListingTitle, findSeedCategory, type ListingTitleGuess } from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

/**
 * Категория по заголовку (ТЗ «Объявления», п. 9): примеры из ТЗ и ловушки.
 */

function guess(title: string): ListingTitleGuess {
  const verdict = classifyListingTitle(title);
  if (verdict.kind !== 'guess') throw new Error(`«${title}»: нет догадки (${verdict.kind})`);
  return verdict.guess;
}

describe('Категория по заголовку', () => {
  it('«iPhone 15 Pro Max 256GB» → телефоны, Apple, модель, память', () => {
    const result = guess('iPhone 15 Pro Max 256GB');
    expect(result.slug).toBe('electronics-phones');
    expect(result.attributes).toMatchObject({
      brand: 'apple',
      model: 'iphone_15_pro_max',
      memory: '256',
    });
    expect(result.details).toEqual(['iPhone 15 Pro Max']);
  });

  it('«Toyota Succeed 2012» → автомобили, Toyota, год', () => {
    const result = guess('Toyota Succeed 2012');
    expect(result.slug).toBe('transport-cars');
    expect(result.attributes).toMatchObject({ brand: 'toyota', year: 2012 });
    expect(result.details[0]).toBe('Toyota');
  });

  it('марка по-русски и модель из справочника: «Тойота Камри 2019»', () => {
    const result = guess('Тойота Камри 2019');
    expect(result.slug).toBe('transport-cars');
    expect(result.attributes.brand).toBe('toyota');
    expect(result.attributes.year).toBe(2019);
  });

  it('«2-комнатная квартира в Махачкале» → квартиры, 2 комнаты', () => {
    const result = guess('2-комнатная квартира в Махачкале');
    expect(result.slug).toBe('realty-flats');
    expect(result.attributes.rooms).toBe(2);
  });

  it('студия и «сдам посуточно» — комнаты 0 и сделка аренды в сутки', () => {
    const result = guess('Сдам студию посуточно у моря');
    expect(result.slug).toBe('realty-flats');
    expect(result.attributes.rooms).toBe(0);
    expect(result).toMatchObject({ transactionType: 'rent', rentPeriod: 'daily' });
  });

  it('«куплю» и «сниму» — не объявление, а запрос', () => {
    expect(classifyListingTitle('Куплю квартиру в Каспийске').kind).toBe('request');
    expect(classifyListingTitle('Сниму дом на лето').kind).toBe('request');
    expect(classifyListingTitle('Ищу квартиру недорого').kind).toBe('request');
  });

  it('«Ищу парикмахера» — вакансия, «Ищу работу» — резюме', () => {
    expect(guess('Ищу парикмахера в салон').slug).toBe('job-vacancies');
    expect(guess('Требуется продавец-кассир').slug).toBe('job-vacancies');
    expect(guess('Ищу работу водителем').slug).toBe('job-resume');
  });

  it('услуга раньше вещи: «ремонт квартир» — отделка, «ремонт холодильников» — ремонт', () => {
    expect(guess('Ремонт квартир под ключ').slug).toBe('services-building');
    expect(guess('Ремонт холодильников на дому').slug).toBe('services-repair');
  });

  it('марка авто со словом «шины» — шины, а не машина', () => {
    expect(guess('Шины Toyota R17').slug).toBe('transport-tires');
  });

  it('короткие основы — только целым словом', () => {
    expect(guess('Продам котят британцев').slug).toBe('animals-cats');
    expect(classifyListingTitle('Домашняя выпечка').kind).toBe('none');
  });

  it('вещи по словам: диван, холодильник, коляска, велосипед', () => {
    expect(guess('Диван угловой').slug).toBe('home-furniture');
    expect(guess('Холодильник Atlant').slug).toBe('home-appliances');
    expect(guess('Коляска 2 в 1').slug).toBe('personal-kids-goods');
    expect(guess('Велосипед горный').slug).toBe('hobby-bikes');
  });

  it('пустой и бессмысленный заголовок — без догадки', () => {
    expect(classifyListingTitle('').kind).toBe('none');
    expect(classifyListingTitle('ок').kind).toBe('none');
    expect(classifyListingTitle('Отличное состояние').kind).toBe('none');
  });

  it('каждая предлагаемая категория существует в дереве категорий', () => {
    const titles = [
      'iPhone 13',
      'Toyota Camry',
      'Шины Toyota',
      'Бампер BMW',
      'Мотоцикл Honda',
      '1к квартира',
      'Комната в общежитии',
      'Дом 120 м2',
      'Участок 6 соток',
      'Гараж кирпичный',
      'Офис в центре',
      'Ищу работу',
      'Требуется повар',
      'Ремонт квартир',
      'Ремонт телефонов',
      'Маникюр',
      'Репетитор по математике',
      'Грузоперевозки',
      'Уборка квартир',
      'Ноутбук Lenovo',
      'Планшет',
      'Телевизор Samsung',
      'PlayStation 5',
      'Наушники',
      'Смарт часы',
      'Фотоаппарат',
      'Видеокарта',
      'Компьютер игровой',
      'Холодильник',
      'Диван',
      'Кирпич',
      'Перфоратор',
      'Смеситель',
      'Дверь входная',
      'Люстра',
      'Сервиз',
      'Цветы',
      'Коляска',
      'Кроссовки',
      'Сумка',
      'Кольцо золотое',
      'Часы',
      'Духи',
      'Куртка',
      'Велосипед',
      'Гитара',
      'Книга',
      'Удочка',
      'Гантели',
      'Настольная игра',
      'Корм для собак',
      'Щенки',
      'Котята',
      'Попугай',
      'Корова',
      'Готовый бизнес',
      'Оборудование',
      'Трактор',
      'Лодка',
      'Камаз',
    ];
    for (const title of titles) {
      const result = guess(title);
      expect(findSeedCategory(result.slug), `${title} → ${result.slug}`).not.toBeNull();
    }
  });
});

describe('запчасти по заголовку', () => {
  it.each([
    ['Рулевая рейка Toyota Succeed', 'transport-parts', 'steering_rack'],
    ['Гидронасос на экскаватор', 'transport-special-parts', 'hydraulic_pump'],
    ['Дисплей на айфон 13', 'electronics-phone-parts', 'phone_display'],
    ['Компрессор холодильника', 'home-appliance-parts', 'fridge_compressor'],
    ['Видеокарта GTX 1060', 'electronics-components', 'computer_gpu'],
    ['Плата телевизора Samsung', 'electronics-tv-parts', 'tv_mainboard'],
  ])('«%s» → %s', (title, slug, item) => {
    const result = guess(title);
    expect(result.slug).toBe(slug);
    expect(result.attributes.partItem).toBe(item);
    expect(findSeedCategory(result.slug)).not.toBeNull();
  });

  it.each([
    ['Toyota Camry 2019 в отличном состоянии', 'transport-cars'],
    ['iPhone 13 экран разбит', 'electronics-phones'],
    ['Стиральная машина Bosch', 'home-appliances'],
  ])('«%s» — не запчасть', (title, slug) => {
    expect(guess(title).slug).toBe(slug);
  });

  it.each(['Экран', 'Насос', 'Плата'])('«%s» — двусмысленно: запчасть не угадывается', (title) => {
    const verdict = classifyListingTitle(title);
    expect(
      verdict.kind === 'guess' ? verdict.guess.attributes.partItem : undefined,
    ).toBeUndefined();
  });
});
