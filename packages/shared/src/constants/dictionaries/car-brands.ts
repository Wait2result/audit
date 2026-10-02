/**
 * Марки и модели автомобилей (Этап 7).
 *
 * Список — не текст форм, а данные для выбора: свободный ввод марки даёт
 * «Тайота», «toyota», «Toyota Corolla» в одном и том же поле, и фильтр по
 * марке в объявлениях перестаёт работать. Выбор из списка держит написание
 * единым и делает саму марку пригодной для фильтра.
 *
 * Модель — по-прежнему свободный текст на сервере (см. `car` в
 * `listing-attributes.ts`): список моделей здесь только подсказывает форме,
 * что показать, когда марка выбрана из этого справочника. Марка, которой
 * здесь нет («Другая марка»), не должна блокировать публикацию — тогда и
 * модель вводится свободно.
 *
 * Список охватывает то, что действительно продаётся и ездит в России —
 * не претендует на исчерпывающий каталог всех марок и комплектаций мира.
 * Пополняется правкой одного файла, без миграции базы: марка — это
 * перечислимая характеристика (см. ADR-0008), а не отдельная таблица.
 */

export interface CarBrand {
  value: string;
  label: string;
  models: readonly string[];
}

/** Значение марки, означающее «нет в списке» — модель тогда вводится текстом. */
export const OTHER_BRAND = 'other';

export const CAR_BRANDS: readonly CarBrand[] = [
  {
    value: 'lada',
    label: 'LADA (ВАЗ)',
    models: [
      'Granta',
      'Vesta',
      'Largus',
      'Niva Legend',
      'Niva Travel',
      'XRAY',
      'Kalina',
      'Priora',
      '2107',
      '2109',
      '2110',
      '2114',
      '2115',
      '4x4 (Нива)',
    ],
  },
  { value: 'uaz', label: 'УАЗ', models: ['Patriot', 'Hunter', 'Pickup', '469', 'Buhanka (3909)'] },
  {
    value: 'gaz',
    label: 'ГАЗ',
    models: ['Volga Siber', '3110 Волга', '31105 Волга', 'Соболь', 'Газель'],
  },
  { value: 'moskvich', label: 'Москвич', models: ['3', '6', '8', '412'] },
  {
    value: 'toyota',
    label: 'Toyota',
    models: [
      'Camry',
      'Corolla',
      'RAV4',
      'Land Cruiser 200',
      'Land Cruiser 300',
      'Land Cruiser Prado',
      'Hilux',
      'Highlander',
      'Avensis',
      'Yaris',
      'Auris',
      'C-HR',
      'Fortuner',
      'Venza',
      'Alphard',
      'Sienna',
      'Prius',
    ],
  },
  {
    value: 'nissan',
    label: 'Nissan',
    models: [
      'Qashqai',
      'X-Trail',
      'Almera',
      'Teana',
      'Murano',
      'Juke',
      'Note',
      'Sentra',
      'Pathfinder',
      'Patrol',
      'Navara',
      'Terrano',
      'Primera',
    ],
  },
  { value: 'datsun', label: 'Datsun', models: ['on-DO', 'mi-DO'] },
  {
    value: 'honda',
    label: 'Honda',
    models: ['Civic', 'Accord', 'CR-V', 'Fit (Jazz)', 'Pilot', 'HR-V', 'Odyssey', 'Freed'],
  },
  {
    value: 'mazda',
    label: 'Mazda',
    models: ['3', '6', 'CX-5', 'CX-9', 'CX-3', 'CX-30', 'MX-5', 'Demio'],
  },
  {
    value: 'mitsubishi',
    label: 'Mitsubishi',
    models: [
      'Outlander',
      'ASX',
      'Lancer',
      'Pajero',
      'Pajero Sport',
      'L200',
      'Colt',
      'Eclipse Cross',
    ],
  },
  { value: 'suzuki', label: 'Suzuki', models: ['Vitara', 'SX4', 'Jimny', 'Swift', 'Grand Vitara'] },
  { value: 'subaru', label: 'Subaru', models: ['Forester', 'Outback', 'Impreza', 'Legacy', 'XV'] },
  { value: 'lexus', label: 'Lexus', models: ['RX', 'NX', 'ES', 'LX', 'GX', 'IS', 'LS', 'UX'] },
  { value: 'infiniti', label: 'Infiniti', models: ['QX50', 'QX60', 'QX70', 'Q50', 'FX', 'G37'] },
  {
    value: 'hyundai',
    label: 'Hyundai',
    models: [
      'Solaris',
      'Creta',
      'Tucson',
      'Santa Fe',
      'Elantra',
      'Sonata',
      'ix35',
      'Accent',
      'Getz',
      'Palisade',
      'Staria',
      'Porter',
    ],
  },
  {
    value: 'kia',
    label: 'KIA',
    models: [
      'Rio',
      'Sportage',
      'Sorento',
      'Ceed',
      'Optima',
      'Cerato',
      'Soul',
      'K5',
      'Seltos',
      'Picanto',
      'Mohave',
      'Carnival',
    ],
  },
  {
    value: 'ssangyong',
    label: 'SsangYong',
    models: ['Rexton', 'Kyron', 'Actyon', 'Tivoli', 'Musso'],
  },
  { value: 'daewoo', label: 'Daewoo', models: ['Nexia', 'Matiz', 'Gentra', 'Lanos'] },
  {
    value: 'volkswagen',
    label: 'Volkswagen',
    models: [
      'Polo',
      'Tiguan',
      'Passat',
      'Golf',
      'Jetta',
      'Touareg',
      'Multivan',
      'Caddy',
      'Transporter',
      'Amarok',
      'Teramont',
    ],
  },
  {
    value: 'skoda',
    label: 'Škoda',
    models: ['Octavia', 'Rapid', 'Kodiaq', 'Karoq', 'Superb', 'Fabia', 'Yeti'],
  },
  {
    value: 'audi',
    label: 'Audi',
    models: ['A3', 'A4', 'A6', 'A8', 'Q3', 'Q5', 'Q7', 'Q8', 'A5', 'TT'],
  },
  {
    value: 'bmw',
    label: 'BMW',
    models: [
      '1 серия',
      '3 серия',
      '5 серия',
      '7 серия',
      'X1',
      'X3',
      'X5',
      'X6',
      'X7',
      '4 серия',
      '6 серия',
      'Z4',
    ],
  },
  {
    value: 'mercedes',
    label: 'Mercedes-Benz',
    models: [
      'A-класс',
      'C-класс',
      'E-класс',
      'S-класс',
      'GLA',
      'GLC',
      'GLE',
      'GLS',
      'Vito',
      'Sprinter',
      'ML',
      'G-класс',
    ],
  },
  {
    value: 'opel',
    label: 'Opel',
    models: ['Astra', 'Corsa', 'Insignia', 'Zafira', 'Mokka', 'Vectra'],
  },
  {
    value: 'renault',
    label: 'Renault',
    models: ['Logan', 'Duster', 'Sandero', 'Arkana', 'Kaptur', 'Megane', 'Fluence', 'Symbol'],
  },
  {
    value: 'peugeot',
    label: 'Peugeot',
    models: ['308', '408', '3008', '5008', '206', '207', '4008'],
  },
  { value: 'citroen', label: 'Citroën', models: ['C4', 'C5', 'C3', 'Berlingo', 'Jumper'] },
  {
    value: 'ford',
    label: 'Ford',
    models: ['Focus', 'Mondeo', 'Kuga', 'Explorer', 'Fiesta', 'EcoSport', 'Transit'],
  },
  {
    value: 'chevrolet',
    label: 'Chevrolet',
    models: ['Niva', 'Cruze', 'Lacetti', 'Aveo', 'Captiva', 'Cobalt', 'Trailblazer'],
  },
  { value: 'volvo', label: 'Volvo', models: ['XC60', 'XC90', 'S60', 'S90', 'XC40', 'V60'] },
  { value: 'fiat', label: 'Fiat', models: ['Albea', 'Ducato', 'Doblo', '500'] },
  { value: 'mini', label: 'MINI', models: ['Cooper', 'Countryman', 'Clubman'] },
  { value: 'porsche', label: 'Porsche', models: ['Cayenne', 'Macan', 'Panamera', '911', 'Taycan'] },
  {
    value: 'land_rover',
    label: 'Land Rover',
    models: ['Range Rover', 'Range Rover Sport', 'Discovery', 'Defender', 'Evoque'],
  },
  { value: 'jaguar', label: 'Jaguar', models: ['XF', 'XE', 'F-Pace', 'E-Pace'] },
  {
    value: 'chery',
    label: 'Chery',
    models: ['Tiggo 4', 'Tiggo 7', 'Tiggo 8', 'Arrizo 5', 'Tiggo 2', 'Bonus'],
  },
  { value: 'geely', label: 'Geely', models: ['Coolray', 'Atlas', 'Emgrand', 'Tugella', 'Monjaro'] },
  {
    value: 'haval',
    label: 'Haval',
    models: ['Jolion', 'F7', 'Dargo', 'M6', 'H9', 'F7x'],
  },
  {
    value: 'changan',
    label: 'Changan',
    models: ['CS35 Plus', 'CS55 Plus', 'CS75', 'Uni-K', 'Alsvin'],
  },
  { value: 'great_wall', label: 'Great Wall', models: ['Poer', 'Hover'] },
  { value: 'jac', label: 'JAC', models: ['S3', 'S4', 'JS4'] },
  { value: 'exeed', label: 'Exeed', models: ['TXL', 'LX', 'VX'] },
  { value: 'omoda', label: 'Omoda', models: ['C5', 'S5'] },
  { value: 'tank', label: 'Tank', models: ['300', '500'] },
  { value: 'voyah', label: 'Voyah', models: ['Free', 'Dream'] },
  { value: 'zeekr', label: 'Zeekr', models: ['001', '009', 'X'] },
  { value: 'gac', label: 'GAC', models: ['GS4', 'GS8', 'Empow'] },
  { value: 'faw', label: 'FAW', models: ['Bestune T77', 'Besturn X40'] },
  { value: 'byd', label: 'BYD', models: ['Song Plus', 'Han', 'Tang', 'Yuan Plus', 'Seal'] },
  { value: 'seat', label: 'SEAT', models: ['Leon', 'Ibiza', 'Ateca'] },
  { value: 'acura', label: 'Acura', models: ['MDX', 'RDX', 'TLX'] },
  { value: 'cadillac', label: 'Cadillac', models: ['Escalade', 'CTS', 'SRX'] },
  { value: 'jeep', label: 'Jeep', models: ['Grand Cherokee', 'Wrangler', 'Compass', 'Cherokee'] },
  { value: 'dodge', label: 'Dodge', models: ['Charger', 'Journey', 'Caravan'] },
  { value: 'chrysler', label: 'Chrysler', models: ['300C', 'Pacifica', 'Voyager'] },
  { value: 'lincoln', label: 'Lincoln', models: ['Navigator', 'MKC', 'Aviator'] },
  { value: 'saab', label: 'Saab', models: ['9-3', '9-5'] },
  { value: 'genesis', label: 'Genesis', models: ['G70', 'G80', 'GV70', 'GV80'] },
  { value: 'zaz', label: 'ЗАЗ', models: ['Sens', 'Chance', 'Vida'] },
  { value: OTHER_BRAND, label: 'Другая марка', models: [] },
];

/** Модели выбранной марки. Пусто для марок вне справочника — тогда модель вводится текстом. */
export function modelsForBrand(brandValue: string | undefined): readonly string[] {
  return CAR_BRANDS.find((brand) => brand.value === brandValue)?.models ?? [];
}
