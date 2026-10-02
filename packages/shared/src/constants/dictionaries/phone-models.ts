/**
 * Модели телефонов ходовых брендов. Как и модели автомобилей — подсказка
 * форме и общий ключ для фильтра: «iPhone 13», «айфон 13» и «13 Pro» в
 * свободном поле — три разных значения, а в справочнике одно.
 *
 * `faceId` у моделей Apple: у каких есть распознавание лица. Форма
 * показывает поле «Face ID работает» только у Apple, а флаг остаётся в
 * записи для панели и будущих подсказок.
 */

export interface PhoneModelSeed {
  brand: string;
  label: string;
  faceId?: boolean;
}

const apple = (label: string, faceId = true): PhoneModelSeed => ({ brand: 'apple', label, faceId });
const of = (brand: string, labels: readonly string[]): PhoneModelSeed[] =>
  labels.map((label) => ({ brand, label }));

export const PHONE_MODELS: readonly PhoneModelSeed[] = [
  apple('iPhone 16 Pro Max'),
  apple('iPhone 16 Pro'),
  apple('iPhone 16 Plus'),
  apple('iPhone 16'),
  apple('iPhone 15 Pro Max'),
  apple('iPhone 15 Pro'),
  apple('iPhone 15 Plus'),
  apple('iPhone 15'),
  apple('iPhone 14 Pro Max'),
  apple('iPhone 14 Pro'),
  apple('iPhone 14 Plus'),
  apple('iPhone 14'),
  apple('iPhone 13 Pro Max'),
  apple('iPhone 13 Pro'),
  apple('iPhone 13'),
  apple('iPhone 13 mini'),
  apple('iPhone 12 Pro Max'),
  apple('iPhone 12 Pro'),
  apple('iPhone 12'),
  apple('iPhone 12 mini'),
  apple('iPhone 11 Pro Max'),
  apple('iPhone 11 Pro'),
  apple('iPhone 11'),
  apple('iPhone XS Max'),
  apple('iPhone XS'),
  apple('iPhone XR'),
  apple('iPhone X'),
  apple('iPhone SE (2022)', false),
  apple('iPhone SE (2020)', false),
  apple('iPhone 8 Plus', false),
  apple('iPhone 8', false),
  apple('iPhone 7 Plus', false),
  apple('iPhone 7', false),
  ...of('samsung', [
    'Galaxy S25 Ultra',
    'Galaxy S25',
    'Galaxy S24 Ultra',
    'Galaxy S24',
    'Galaxy S23 Ultra',
    'Galaxy S23',
    'Galaxy S22 Ultra',
    'Galaxy S22',
    'Galaxy S21',
    'Galaxy Z Fold 6',
    'Galaxy Z Flip 6',
    'Galaxy Z Fold 5',
    'Galaxy Z Flip 5',
    'Galaxy A55',
    'Galaxy A54',
    'Galaxy A35',
    'Galaxy A34',
    'Galaxy A25',
    'Galaxy A15',
    'Galaxy A14',
    'Galaxy M34',
    'Galaxy Note 20',
  ]),
  ...of('xiaomi', [
    'Xiaomi 14',
    'Xiaomi 14 Ultra',
    'Xiaomi 13',
    'Xiaomi 13T',
    'Xiaomi 12',
    'Xiaomi 11T',
    'Mi 11',
    'Mi 10',
  ]),
  ...of('redmi', [
    'Redmi Note 13 Pro',
    'Redmi Note 13',
    'Redmi Note 12 Pro',
    'Redmi Note 12',
    'Redmi Note 11',
    'Redmi Note 10',
    'Redmi 13C',
    'Redmi 12',
    'Redmi 10',
  ]),
  ...of('poco', ['POCO X6 Pro', 'POCO X6', 'POCO X5 Pro', 'POCO F6', 'POCO F5', 'POCO M6 Pro']),
  ...of('huawei', ['P60 Pro', 'P50', 'Mate 50', 'Nova 12', 'Nova 11', 'Nova 10']),
  ...of('honor', ['Magic 6 Pro', 'Magic 5', '200', '90', 'X9b', 'X8b', 'X7b']),
  ...of('realme', ['12 Pro', '11 Pro', 'GT 6', 'C67', 'C55', 'Note 50']),
  ...of('oppo', ['Reno 11', 'Reno 10', 'A78', 'A58']),
  ...of('vivo', ['V30', 'V29', 'Y36', 'Y27']),
  ...of('oneplus', ['12', '12R', '11', 'Nord 4', 'Nord 3', 'Nord CE 4']),
  ...of('google', ['Pixel 9 Pro', 'Pixel 9', 'Pixel 8 Pro', 'Pixel 8', 'Pixel 7', 'Pixel 6a']),
  ...of('tecno', ['Camon 30', 'Camon 20', 'Spark 20', 'Pova 6']),
  ...of('infinix', ['Note 40', 'Note 30', 'Hot 40', 'Smart 8']),
  ...of('nothing', ['Phone (2)', 'Phone (2a)', 'Phone (1)']),
  ...of('sony', ['Xperia 1 V', 'Xperia 5 V', 'Xperia 10 V']),
  ...of('motorola', ['Edge 50', 'Edge 40', 'Moto G84', 'Moto G54']),
  ...of('nokia', ['G42', 'G22', 'C32', '3310']),
];
