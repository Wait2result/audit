import {
  CARD_FACTS_LIMIT,
  attributesSchemaFor,
  bindingsOf,
  cardFacts,
  describeCardFacts,
  donorFact,
  findSeedCategory,
  resolveAttributes,
} from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

import {
  compactApplicability,
  partCardFacts,
  type StoredCompatibility,
} from '../src/modules/listings/listing-parts.js';

/**
 * Карточка объявления: 2–5 характеристик, которые помогают решить, открывать
 * ли объявление (ТЗ «Умное отображение характеристик»). Путь тот же, что у
 * настоящей карточки: значения формы → проверка и хранение (масштаб чисел)
 * → строка сервера по приоритетам категории → отбор приложения (без повтора
 * заголовка и без «Продам»).
 */

function card(
  slug: string,
  title: string,
  input: Record<string, unknown>,
  labels: Record<string, string> = {},
  extra: readonly (string | null)[] = [],
): string[] {
  const category = findSeedCategory(slug);
  if (!category) throw new Error(`Нет категории ${slug}`);
  const fields = resolveAttributes(bindingsOf(category)).map((field) => ({
    ...field,
    required: false,
  }));
  const stored = attributesSchemaFor(fields).parse(input);
  const summary = [describeCardFacts(slug, fields, stored, labels, undefined, title), ...extra]
    .filter(Boolean)
    .join(' · ');
  return cardFacts(summary, title, CARD_FACTS_LIMIT.list).map((fact) =>
    fact.replace(/\u00a0/g, ' '),
  );
}

const NOISE = /wi-?fi|bluetooth|usb|hdmi|nfc|5g|цвет|белый|чёрный|черный|материал|vin/i;
const clean = (facts: readonly string[]) => {
  expect(facts.every((fact) => fact.trim() !== '')).toBe(true);
  expect(facts.some((fact) => /не указано|нет данных|^—$/i.test(fact))).toBe(false);
  expect(facts.some((fact) => NOISE.test(fact))).toBe(false);
  expect(new Set(facts).size).toBe(facts.length);
  expect(facts.length).toBeLessThanOrEqual(5);
};

const row = (
  model: string,
  chassis: string | null = null,
  yearFrom: number | null = null,
  yearTo: number | null = null,
): StoredCompatibility => ({
  brand: 'toyota',
  brandLabel: 'Toyota',
  model: model.toLowerCase(),
  modelLabel: model,
  chassis,
  yearFrom,
  yearTo,
  engine: null,
  modification: null,
});

describe('электроника', () => {
  it('1. ноутбук с полным набором: процессор, видеокарта, память, накопитель, экран, состояние', () => {
    const facts = card('electronics-laptops', 'ASUS TUF Gaming A15', {
      brand: 'asus',
      cpu: 'Ryzen 7',
      gpu: 'RTX 4060',
      ram: '16',
      storageSize: '1024',
      storage: 'ssd',
      screenSize: 15.6,
      os: 'windows',
      condition: 'used',
    });
    clean(facts);
    expect(facts).toEqual(['Ryzen 7', 'RTX 4060', '16 ГБ', '1 ТБ SSD', '15,6″']);
  });

  it('2. ноутбук без видеокарты: встроенная не занимает место', () => {
    const facts = card('electronics-laptops', 'Lenovo IdeaPad 3', {
      cpu: 'Core i5',
      gpu: 'Intel UHD Graphics',
      ram: '16',
      storageSize: '512',
      storage: 'ssd',
      screenSize: 15.6,
      condition: 'used',
    });
    clean(facts);
    expect(facts).toEqual(['Core i5', '16 ГБ', '512 ГБ SSD', '15,6″', 'Б/у']);
  });

  it('3. ноутбук с неполными данными: только заполненное, без добивки второстепенным', () => {
    const facts = card('electronics-laptops', 'Ноутбук', { ram: '16', storageSize: '512' });
    clean(facts);
    expect(facts).toEqual(['16 ГБ', '512 ГБ']);
  });

  it('4. iPhone с аккумулятором: аккумулятор — как указал продавец', () => {
    const facts = card(
      'electronics-phones',
      'iPhone 16 Pro',
      { brand: 'apple', model: 'iphone_16_pro', memory: '256', condition: 'used', battery: 92 },
      { apple: 'Apple', iphone_16_pro: 'iPhone 16 Pro' },
    );
    clean(facts);
    expect(facts).toEqual(['256 ГБ', 'Б/у', 'Аккумулятор 92%']);
  });

  it('5. Android без аккумулятора: «100%» не придумывается, марка не повторяется', () => {
    const facts = card(
      'electronics-phones',
      'Samsung Galaxy S25 Ultra',
      { brand: 'samsung', model: 'galaxy_s25_ultra', memory: '512', condition: 'used' },
      { samsung: 'Samsung', galaxy_s25_ultra: 'Galaxy S25 Ultra' },
    );
    clean(facts);
    expect(facts).toEqual(['512 ГБ', 'Б/у']);
    expect(facts.join(' ')).not.toMatch(/Samsung|Galaxy|Аккумулятор/);
  });

  it('6. iPad: память, диагональ, модификация с SIM — только если она есть', () => {
    expect(
      card('electronics-tablets', 'iPad Air', {
        memory: '256',
        screenSize: 11,
        cellular: true,
        condition: 'used',
      }),
    ).toEqual(['256 ГБ', '11″', 'С SIM (LTE)', 'Б/у']);
    expect(
      card('electronics-tablets', 'iPad Air', {
        memory: '256',
        cellular: false,
        condition: 'used',
      }),
    ).toEqual(['256 ГБ', 'Б/у']);
  });

  it('7. Android-планшет: без Wi-Fi и аккумулятора', () => {
    const facts = card('electronics-tablets', 'Samsung Galaxy Tab S10', {
      memory: '256',
      screenSize: 12.4,
      condition: 'used',
      color: 'gray',
    });
    clean(facts);
    expect(facts).toEqual(['256 ГБ', '12,4″', 'Б/у']);
  });

  it('8. телевизор: диагональ, разрешение, Smart TV, состояние', () => {
    const facts = card('electronics-tv', 'TCL 55P7K', {
      screenSize: 55,
      resolution: '4k',
      smartTv: true,
      condition: 'used',
    });
    clean(facts);
    expect(facts).toEqual(['55″', '4K', 'Smart TV', 'Б/у']);
  });
});

describe('дом', () => {
  it('9. диван: что это, размер, состояние — без цвета и материала', () => {
    const facts = card('home-furniture', 'Диван угловой', {
      furnitureType: 'sofa',
      dimensions: '250x160',
      condition: 'used',
      color: 'gray',
    });
    clean(facts);
    expect(facts).toContain('250 × 160 см');
    expect(facts.at(-1)).toBe('Б/у');
  });

  it('10. холодильник: тип, габариты, состояние; марка из заголовка не повторяется', () => {
    const facts = card(
      'home-appliances',
      'Холодильник Samsung',
      { applianceType: 'fridge', brand: 'samsung', dimensions: '185×60×65', condition: 'used' },
      { samsung: 'Samsung' },
    );
    clean(facts);
    expect(facts).toEqual(['185 × 60 × 65 см', 'Б/у']);
  });
});

describe('транспорт', () => {
  it('11. автомобиль: год из заголовка не повторяется; объём, топливо, КПП, привод, пробег', () => {
    const facts = card(
      'transport-cars',
      'Toyota Succeed 2015',
      {
        brand: 'toyota',
        model: 'succeed',
        year: 2015,
        engineVolume: 1.5,
        fuel: 'petrol',
        gearbox: 'variator',
        drive: 'full',
        mileage: 125_000,
        color: 'white',
        owners: '2',
      },
      { toyota: 'Toyota', succeed: 'Succeed' },
    );
    clean(facts);
    expect(facts).toEqual(['1,5 л', 'Бензин', 'Вариатор', 'Полный привод', '125 000 км']);
  });

  it('16. шины: размер как на боковине, сезон, количество, состояние', () => {
    const facts = card('transport-tires', 'Yokohama Geolandar', {
      tireType: 'tires',
      tireWidth: 215,
      tireProfile: 65,
      diameter: 16,
      season: 'summer',
      quantity: 4,
      condition: 'used',
      loadIndex: 98,
    });
    clean(facts);
    expect(facts).toEqual(['215/65 R16', 'Летние', '4 шт', 'Б/у']);
  });

  it('17. диски: диаметр, разболтовка, ширина, вылет, количество', () => {
    const facts = card('transport-tires', 'Toyota оригинал', {
      tireType: 'rims',
      diameter: 17,
      pcd: '5x114_3',
      rimWidth: 7,
      rimEt: 45,
      quantity: 4,
      condition: 'used',
    });
    clean(facts);
    expect(facts).toEqual(['R17', '5x114.3', '7J', 'ET45', '4 шт']);
  });
});

describe('запчасти', () => {
  const partFacts = { partManufacturer: 'kyb', partCondition: 'used', partOriginality: 'analog' };
  const labels = { kyb: 'KYB' };

  it('12. одна применяемость — с годами', () => {
    const layer = partCardFacts(
      [row('Succeed', 'NCP165', 2015, 2020)],
      [{ kind: 'manufacturer', number: '45510-52230' }],
    );
    const facts = card('transport-parts', 'Рулевая рейка', partFacts, labels, [
      layer.number,
      layer.compatibility,
    ]);
    clean(facts);
    expect(facts).toEqual(['KYB', 'Б/У аналог', '45510-52230', 'Succeed NCP165 2015–2020']);
  });

  it('13. несколько применяемостей: модели вместе, остальное — реальным числом', () => {
    const rows = [
      row('Succeed', 'NCP160'),
      row('Succeed', 'NCP165'),
      row('Probox', 'NCP160'),
      row('Probox', 'NCP165'),
      row('Corolla Fielder', 'NZE161'),
      row('Corolla Axio', 'NZE161'),
      row('Ist', 'NCP110'),
    ];
    // В карточку прочитано 7 строк из 7: Succeed (2) и Probox (2) показаны, 3 — числом
    expect(compactApplicability(rows, 7)).toBe('Succeed NCP160/NCP165, Probox +3');
    // Прочитаны первые 2 из 9: скрытые считаются по общему числу
    expect(compactApplicability(rows.slice(0, 2), 9)).toBe('Succeed NCP160/NCP165 +7');
  });

  it('14. применяемость неизвестна — не придумывается', () => {
    const layer = partCardFacts([], [{ kind: 'manufacturer', number: '45510-52230' }]);
    expect(layer.compatibility).toBeNull();
    const facts = card('transport-parts', 'Рулевая рейка', partFacts, labels, [layer.number]);
    expect(facts).toEqual(['KYB', 'Б/У аналог', '45510-52230']);
  });

  it('15. автомобиль-донор — отдельно и не как применяемость', () => {
    const values = { ...partFacts, donorVehicle: 'Toyota Succeed NCP165' };
    const layer = partCardFacts([], [{ kind: 'manufacturer', number: '45510-52230' }]);
    const facts = card('transport-parts', 'Рулевая рейка', values, labels, [
      layer.number,
      layer.compatibility,
      donorFact(values),
    ]);
    expect(facts).toEqual(['KYB', 'Б/У аналог', '45510-52230', 'Снята с: Toyota Succeed NCP165']);
    expect(facts.join(' ')).not.toContain('Подходит');
  });
});

describe('недвижимость, вещи, остальное', () => {
  it('18. квартира: комнаты, площадь, этаж; новостройка — только если да', () => {
    expect(
      card('realty-flats', 'Квартира в центре', {
        rooms: 2,
        areaTotal: 46,
        floor: 5,
        floorsTotal: 9,
        heating: 'central',
        wallMaterial: 'brick',
      }),
    ).toEqual(['2 комн.', '46 м²', '5/9 эт.']);
    expect(
      card('realty-flats', 'Квартира', { rooms: 1, areaTotal: 38, newBuilding: true }),
    ).toEqual(['1 комн.', '38 м²', 'Новостройка']);
  });

  it('дом: площадь, участок, этажность словами', () => {
    expect(card('realty-houses', 'Дом', { areaTotal: 120, landArea: 6, floorsTotal: 2 })).toEqual([
      '120 м²',
      '6 сот.',
      '2 этажа',
    ]);
  });

  it('19. одежда: размер и состояние — без цвета и состава', () => {
    const facts = card('personal-clothes', 'Куртка мужская', {
      clothesType: 'outerwear',
      gender: 'male',
      size: 'l',
      condition: 'used',
      color: 'black',
    });
    clean(facts);
    expect(facts.slice(0, 2)).toEqual(['Размер L', 'Б/у']);
  });

  it('обувь: размер числом', () => {
    expect(
      card('personal-shoes', 'Nike Air Max', { gender: 'male', shoeSize: 43, condition: 'used' }),
    ).toEqual(['Размер 43', 'Б/у']);
  });

  it('20. велосипед: тип, колёса, состояние', () => {
    const facts = card('hobby-bikes', 'Stels Navigator', {
      bikeType: 'mountain',
      wheelDiameter: '27_5',
      condition: 'used',
    });
    clean(facts);
    expect(facts).toContain('27.5″');
    expect(facts.at(-1)).toBe('Б/у');
  });

  it('21. стройматериалы: что это, количество, состояние', () => {
    const facts = card('home-materials', 'Ламинат 33 класс', {
      materialType: 'flooring',
      quantity: 20,
      condition: 'new',
    });
    clean(facts);
    expect(facts.length).toBeGreaterThanOrEqual(2);
  });

  it('22. инструмент: тип и состояние, марка из заголовка не повторяется', () => {
    const facts = card(
      'home-tools',
      'Makita',
      { toolType: 'power', brand: 'makita', condition: 'used' },
      { makita: 'Makita' },
    );
    clean(facts);
    expect(facts.join(' ')).not.toContain('Makita');
    expect(facts.at(-1)).toBe('Б/у');
  });

  it('23. животные: порода, возраст, пол, «привит»', () => {
    const facts = card('animals-dogs', 'Щенки немецкой овчарки', {
      animalAge: '3_12m',
      sex: 'male',
      vaccinated: true,
      documents: true,
    });
    clean(facts);
    expect(facts).toEqual(['3–12 месяцев', 'Мальчик', 'Привит']);
  });

  it('24. услуги: вид услуги и формат — без товарных характеристик', () => {
    const facts = card('services-repair', 'Ремонт стиральных машин', {
      repairType: 'electrics',
      serviceFormat: 'visit',
    });
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.join(' ')).not.toMatch(/Б\/у|Новое/);
  });

  it('25. вакансия: занятость, график, опыт — зарплата в цене', () => {
    const facts = card('job-vacancies', 'Менеджер по продажам', {
      sphere: 'sales',
      employment: 'full',
      experience: 'year',
    });
    expect(facts).toEqual(['Полная занятость', 'Опыт от года']);
  });
});

describe('старые объявления', () => {
  it('без новых полей (размеры, донор) карточка строится из остальных', () => {
    expect(card('home-furniture', 'Диван', { furnitureType: 'sofa', condition: 'used' })).toEqual(
      expect.arrayContaining(['Б/у']),
    );
  });
});

describe('марка и модель против заголовка (п. 29, 40)', () => {
  const labels = { toyota: 'Toyota', camry: 'Camry' };
  const values = { brand: 'toyota', model: 'camry', year: 2019, mileage: 80_000 };

  it('модель в заголовке — ни марки, ни модели в характеристиках', () => {
    expect(card('transport-cars', 'Toyota Camry 2019', values, labels).join(' ')).not.toMatch(
      /Toyota|Camry/,
    );
    expect(card('transport-cars', 'Camry 2019', values, labels).join(' ')).not.toMatch(
      /Toyota|Camry/,
    );
  });

  it('в заголовке только «Тойота» — марка и модель словами справочника', () => {
    expect(card('transport-cars', 'Тойота', values, labels)[0]).toBe('Toyota Camry');
  });
});
