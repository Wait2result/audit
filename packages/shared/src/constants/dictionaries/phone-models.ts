/**
 * Модели телефонов. Как и модели автомобилей — подсказка форме и общий ключ
 * для фильтра: «iPhone 13», «айфон 13» и «13 Pro» в свободном поле — три
 * разных значения, а в справочнике одно.
 *
 * Модель — название линейки («Galaxy A54», «Redmi Note 12 Pro»), а не объём
 * памяти, цвет или состояние: память, цвет и состояние остаются отдельными
 * характеристиками. Выпускаемые и снятые модели вперемешку: на вторичном
 * рынке продают и те и другие. Бренды без списка (Lenovo, ZTE, Blackview …) —
 * модель вводится текстом.
 *
 * `faceId` у моделей Apple: у каких есть распознавание лица. Форма
 * показывает поле «Face ID работает» только у Apple, а флаг остаётся в
 * записи для панели и будущих подсказок.
 */

import { names } from './names.js';

export interface PhoneModelSeed {
  brand: string;
  label: string;
  faceId?: boolean;
}

const apple = (label: string, faceId = true): PhoneModelSeed => ({ brand: 'apple', label, faceId });
const of = (brand: string, labels: readonly string[]): PhoneModelSeed[] =>
  labels.map((label) => ({ brand, label }));

/** Samsung: подписи собираются по сериям, чтобы не повторять «Galaxy » сотню раз. */
/** Samsung: «Galaxy » перед каждым названием, чтобы не повторять его сотню раз. */
const galaxyNames = (text: string): string[] => names(text).map((model) => `Galaxy ${model}`);

export const PHONE_MODELS: readonly PhoneModelSeed[] = [
  // Сентябрь 2026: iPhone 18 Pro и Pro Max. Обычный iPhone 18 ещё не вышел
  // (ожидается весной 2027) — добавится строкой, когда появится в продаже
  apple('iPhone 18 Pro Max'),
  apple('iPhone 18 Pro'),
  apple('iPhone 17e'),
  apple('iPhone 17 Pro Max'),
  apple('iPhone 17 Pro'),
  apple('iPhone Air'),
  apple('iPhone 17'),
  apple('iPhone 16e'),
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
  apple('iPhone SE (2016)', false),
  apple('iPhone 6s Plus', false),
  apple('iPhone 6s', false),
  apple('iPhone 6 Plus', false),
  apple('iPhone 6', false),
  apple('iPhone 5s', false),
  apple('iPhone 5c', false),
  apple('iPhone 5', false),
  apple('iPhone 4s', false),
  apple('iPhone 4', false),
  apple('iPhone 3GS', false),
  apple('iPhone 3G', false),
  ...of('samsung', [
    'Galaxy S26 Ultra',
    'Galaxy S26',
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
    ...galaxyNames(`
      S26 Plus | S26 FE | Z Fold 8 Ultra | Z Fold 8 | Z Flip 8 | S25 Edge | S25 FE | S25 Plus | S24 FE | S24 Plus | S23 FE | S23 Plus | S22 Plus | S21 Ultra | S21 Plus | S21 FE | S20 Ultra | S20 Plus | S20 FE | S20 | S10 Plus | S10e | S10 Lite | S10 | S9 Plus | S9 | S8 Plus | S8 Active | S8 | S7 edge | S7 | S6 edge Plus | S6 edge | S6 | S5 Mini | S5 | S4 Mini | S4 | S3 |
      Note 20 Ultra | Note 10 Plus | Note 10 Lite | Note 10 | Note 9 | Note 8 | Note 5 | Note 4 | Note 3 | Note 2 | Note FE |
      Z Fold 7 | Z Flip 7 FE | Z Flip 7 | Z Fold 4 | Z Flip 4 | Z Fold 3 | Z Flip 3 | Z Fold 2 | Z Fold | Z Flip |
      A56 | A53 | A52s | A52 | A51 | A50 | A36 | A33 | A32 | A31 | A30s | A30 | A26 | A24 | A23 | A22 | A21s | A20 | A16 | A13 | A12 | A11 | A10 | A06 | A05s | A05 | A04s | A04 | A03 | A02s | A02 | A01 | A73 | A72 | A71 | A70 | A80 | A90 |
      M55 | M54 | M53 | M52 | M51 | M33 | M32 | M31 | M30s | M23 | M22 | M21 | M14 | M13 | M12 | M11 | M01 |
      J7 | J5 | J3 | J2 | J1 | Xcover 5 | Xcover 6 Pro | Xcover 7 | A17 | A03s | A04e | A10s | A10e | A20e | A20s | A21 | A42 | A50s | A60 | A70s | A3 | A5 | A7 | A8 | A9 | A2 Core | A01 Core | A03 Core | M01s | M02 | M02s | M04 | M05 | M06 | M07 | M10 | M10s | M15 | M16 | M17 | M20 | M21s | M31s | M35 | M36 | M40 | M42 | M47 | M55s | M56
    `),
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
    ...names(
      `Xiaomi 17 Pro Max | Xiaomi 17 Pro | Xiaomi 17 | Xiaomi 15 Ultra | Xiaomi 15 | Xiaomi 14T Pro | Xiaomi 14T | Xiaomi 13T Pro | Xiaomi 13 Ultra | Xiaomi 13 Pro | Xiaomi 13 Lite | Xiaomi 12T Pro | Xiaomi 12T | Xiaomi 12 Pro | Xiaomi 12 Lite | Xiaomi 12X | Xiaomi 11T Pro | Xiaomi 11 Lite 5G NE | Xiaomi Civi | Xiaomi Mix Fold | Xiaomi Mix Flip |
       Mi 11 Ultra | Mi 11 Lite | Mi 10T Pro | Mi 10T | Mi 10T Lite | Mi 10 Pro | Mi 10 Lite | Mi 9T Pro | Mi 9T | Mi 9 SE | Mi 9 Lite | Mi 9 | Mi 8 Lite | Mi 8 | Mi A1 | Mi A2 | Mi A3 | Mi Mix 2 | Mi Mix 3 | Mi Note 10 | Mi Max 3 | Mi 6 | Mi 5`,
    ),
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
    ...names(
      `Redmi Note 15 Pro Plus | Redmi Note 15 Pro | Redmi Note 15 | Redmi Note 14 Pro Plus | Redmi Note 9 Pro Max | Redmi Note 7S | Redmi Note 7 Pro | Redmi Note 5A Prime | Redmi Note 5A | Redmi Note 5 Pro | Redmi Note 3 Pro | Redmi Note 3 | Redmi Note 2 | Redmi Note 4X | Redmi Note Prime | Redmi Note | Redmi Note 14 Pro | Redmi Note 14 | Redmi Note 13 Pro Plus | Redmi Note 12 Pro Plus | Redmi Note 12S | Redmi Note 11 Pro | Redmi Note 11S | Redmi Note 10 Pro | Redmi Note 10S | Redmi Note 9 Pro | Redmi Note 9S | Redmi Note 9 | Redmi Note 8 Pro | Redmi Note 8T | Redmi Note 8 | Redmi Note 7 | Redmi Note 6 Pro | Redmi Note 5 | Redmi Note 4 |
       Redmi 14C | Redmi 13 | Redmi 12C | Redmi 10C | Redmi 10A | Redmi 9T | Redmi 9C | Redmi 9A | Redmi 9 | Redmi 8A | Redmi 8 | Redmi 7A | Redmi 7 | Redmi 6A | Redmi 6 | Redmi 5 Plus | Redmi 5A | Redmi 4X | Redmi A1 | Redmi A2 | Redmi A3 | Redmi Go | Redmi K70 | Redmi K60 | Redmi K50 | Redmi K40`,
    ),
  ]),
  ...of('poco', [
    'POCO X6 Pro',
    'POCO X6',
    'POCO X5 Pro',
    'POCO F6',
    'POCO F5',
    'POCO M6 Pro',
    ...names(
      `POCO X7 Pro | POCO X7 | POCO X5 | POCO X4 Pro | POCO X3 Pro | POCO X3 NFC | POCO X3 | POCO F7 | POCO F6 Pro | POCO F5 Pro | POCO F4 GT | POCO F4 | POCO F3 GT | POCO F3 | POCO F2 Pro | POCO M7 Pro | POCO M6 | POCO M5s | POCO M5 | POCO M4 Pro | POCO M4 | POCO M3 Pro | POCO M3 | POCO C75 | POCO C65 | POCO C61 | POCO C55 | POCO C40 | POCO C3`,
    ),
  ]),
  ...of('huawei', [
    'P60 Pro',
    'P50',
    'Mate 50',
    'Nova 12',
    'Nova 11',
    'Nova 10',
    ...names(
      `P60 | P50 Pro | P40 Pro | P40 Lite | P40 | P30 Pro | P30 Lite | P30 | P20 Pro | P20 Lite | P20 | P10 | P9 | P Smart | P Smart Z | P Smart 2021 | Pura 70 Pro | Pura 70 | Mate 70 Pro | Mate 60 Pro | Mate 60 | Mate 50 Pro | Mate 40 Pro | Mate 30 Pro | Mate 30 | Mate 20 Pro | Mate 20 Lite | Mate 20 | Mate 10 Pro | Mate 10 | Mate 9 | Mate X | Mate Xs | Mate X2 | Mate X3 | Mate XT | Pura 80 Ultra | Pura 80 Pro | Pura 80 | Pura 70 Ultra | Pura X | P9 lite | P9 Plus | P10 lite | P10 Plus | P40 lite E | P50 Pocket | P60 Art | P8 lite | P8 |
       Nova 13 | Nova 9 SE | Nova 9 | Nova 8i | Nova 8 | Nova 7 | Nova 5T | Nova 3 | Y90 | Y70 | Y61 | Y9 | Y7 | Y6 | Y5`,
    ),
  ]),
  ...of('honor', [
    'Magic 6 Pro',
    'Magic 5',
    '200',
    '90',
    'X9b',
    'X8b',
    'X7b',
    ...names(
      `Magic 8 Pro | 400 Pro | 400 | Magic 7 Pro | Magic 6 Lite | Magic 5 Pro | Magic 4 Pro | Magic V2 | Magic V3 | 200 Pro | 100 | 70 | 50 | 30 | 20 | 10 | 10 Lite | 20 Lite | 50 Lite | 70 Lite | 90 Lite | X9a | X8a | X7a | X6 | X5 | 9X | 8X | 8A | 9A | 10X Lite`,
    ),
  ]),
  ...of('realme', [
    '12 Pro',
    '11 Pro',
    'GT 6',
    'C67',
    'C55',
    'Note 50',
    ...names(
      `13 Pro Plus | 13 Pro | 13 Plus | 12 Plus | 12 | 11 | 10 Pro | 10 | 9 Pro Plus | 9 Pro | 9 | 8 Pro | 8 | 7 Pro | 7 | 6 Pro | 6 | 5 Pro | 5 | GT 7 Pro | GT 5 Pro | GT 5 | GT 3 | GT Neo 6 | GT Neo 5 | GT Neo 3 | GT 2 Pro | GT 2 | GT | X7 Pro | X7 | X50 Pro | X3 | X2 Pro | X2 | XT | C75 | C65 | C63 | C61 | C53 | C51 | C35 | C33 | C31 | C30 | C25 | C21Y | C15 | C12 | C11 | Narzo 70 Pro | Narzo 60 | Narzo 50 | Narzo 30 | Note 60`,
    ),
  ]),
  ...of('oppo', [
    'Reno 11',
    'Reno 10',
    'A78',
    'A58',
    ...names(
      `Find X8 Pro | Find X8 | Find X7 Ultra | Find X7 | Find X6 Pro | Find X6 | Find X5 Pro | Find X5 | Find X3 Pro | Find X3 | Find X2 Pro | Find X2 | Find N | Find N2 Flip | Find N3 | Reno 13 | Reno 12 | Reno 11 F | Reno 10 Pro | Reno 8 | Reno 8 T | Reno 7 | Reno 6 | Reno 5 | Reno 4 | Reno 3 | Reno 2 | Reno | A98 | A97 | A96 | A95 | A94 | A93 | A92 | A91 | A83 | A79 | A77 | A76 | A74 | A73 | A72 | A57 | A55 | A54 | A53 | A38 | A18 | A17 | A16 | A15 | A12 | A9 | A5 | A3s | F21 Pro | F19 | F17 | K10`,
    ),
  ]),
  ...of('vivo', [
    'V30',
    'V29',
    'Y36',
    'Y27',
    ...names(
      `V40 | V27 | V25 | V23 | V21 | V20 | V19 | V17 | V15 | Y100 | Y78 | Y22 | Y21 | Y20 | Y17 | Y15 | Y12 | Y11 | X100 Pro | X100 | X90 Pro | X90 | X80 Pro | X80 | X70 Pro | X60 Pro | X50 Pro | X Fold | X Fold 3 | iQOO 12 | iQOO 11 | iQOO Neo 9 | iQOO Z9 | S12 | S15 | T3 | T2`,
    ),
  ]),
  ...of('oneplus', [
    '12',
    '12R',
    '11',
    'Nord 4',
    'Nord 3',
    'Nord CE 4',
    ...names(
      `15 | 13 | 13R | 10 Pro | 10T | 10R | 9 Pro | 9 | 9R | 8 Pro | 8T | 8 | 7 Pro | 7T Pro | 7T | 7 | 6T | 6 | 5T | 5 | 3T | 3 | X | 2 | Nord | Nord 2 | Nord 2T | Nord CE | Nord CE 2 | Nord CE 3 | Nord CE 3 Lite | Nord N10 | Nord N20 | Nord N30 | Open`,
    ),
  ]),
  ...of('google', [
    'Pixel 9 Pro',
    'Pixel 9',
    'Pixel 8 Pro',
    'Pixel 8',
    'Pixel 7',
    'Pixel 6a',
    ...names(
      `Pixel 10a | Pixel 10 Pro XL | Pixel 10 Pro | Pixel 10 | Pixel 9 Pro XL | Pixel 9 Pro Fold | Pixel 9a | Pixel 8a | Pixel 7 Pro | Pixel 7a | Pixel 6 Pro | Pixel 6 | Pixel 5a | Pixel 5 | Pixel 4a | Pixel 4 XL | Pixel 4 | Pixel 3a XL | Pixel 3a | Pixel 3 XL | Pixel 3 | Pixel 2 XL | Pixel 2 | Pixel XL | Pixel | Pixel Fold`,
    ),
  ]),
  ...of('tecno', [
    'Camon 30',
    'Camon 20',
    'Spark 20',
    'Pova 6',
    ...names(
      `Camon 30 Pro | Camon 20 Pro | Camon 19 | Camon 18 | Camon 17 | Camon 16 | Camon 15 | Spark 20 Pro | Spark 20C | Spark 10 Pro | Spark 10 | Spark 9 | Spark 8 | Spark 7 | Spark Go | Pova 6 Pro | Pova 5 | Pova 4 | Pova 3 | Pova 2 | Phantom X2 | Phantom V Fold | Phantom V Flip | Pop 8 | Pop 7 | Pop 6`,
    ),
  ]),
  ...of('infinix', [
    'Note 40',
    'Note 30',
    'Hot 40',
    'Smart 8',
    ...names(
      `Note 12 | Note 11 | Note 10 | Note 8 | Hot 50 | Hot 30 | Hot 20 | Hot 12 | Hot 11 | Hot 10 | Hot 9 | Zero 40 | Zero 30 | Zero 20 | Zero X | Smart 7 | Smart 6 | Smart 5 | Smart 4 | GT 20 Pro | GT 10 Pro`,
    ),
  ]),
  ...of('nothing', [
    'Phone (2)',
    'Phone (2a)',
    'Phone (1)',
    ...names(`Phone (2a) Plus | Phone (3) | Phone (3a) | CMF Phone 1`),
  ]),
  ...of('sony', [
    'Xperia 1 V',
    'Xperia 5 V',
    'Xperia 10 V',
    ...names(
      `Xperia 1 VI | Xperia 1 IV | Xperia 1 III | Xperia 1 II | Xperia 1 | Xperia 5 IV | Xperia 5 III | Xperia 5 II | Xperia 5 | Xperia 10 VI | Xperia 10 IV | Xperia 10 III | Xperia 10 II | Xperia 10 | Xperia Pro-I | Xperia XZ3 | Xperia XZ2 Premium | Xperia XZ2 | Xperia XZ1 | Xperia XZ Premium | Xperia XZ | Xperia XA2 | Xperia XA1 | Xperia X Compact | Xperia L3`,
    ),
  ]),
  ...of('motorola', [
    'Edge 50',
    'Edge 40',
    'Moto G84',
    'Moto G54',
    ...names(
      `Edge 50 Pro | Edge 50 Fusion | Edge 50 Ultra | Edge 40 Neo | Edge 30 Ultra | Edge 30 Fusion | Edge 30 | Edge 20 | Moto G85 | Moto G75 | Moto G73 | Moto G72 | Moto G64 | Moto G60 | Moto G53 | Moto G52 | Moto G51 | Moto G50 | Moto G42 | Moto G32 | Moto G31 | Moto G30 | Moto G22 | Moto G200 | Moto G100 | Moto G9 Plus | Moto G9 Power | Moto G8 | Moto G7 | Moto G6 | Moto G5 | Moto E40 | Moto E32 | Moto E22 | Moto E20 | Moto E13 | Moto E7 | Razr 50 Ultra | Razr 50 | Razr 40 Ultra | Razr 40 | Razr 2022 | Razr 2019 | One Fusion | One Vision | One Macro`,
    ),
  ]),
  ...of('nokia', [
    'G42',
    'G22',
    'C32',
    '3310',
    ...names(
      `G60 | G50 | G21 | G20 | G11 | C30 | C22 | C21 | C12 | C2 | 8.3 | 7.2 | 6.2 | 5.4 | 3.4 | 2.4 | X30 | X20 | X10 | XR20 | 105 | 110 | 150 | 215 | 225 | 230 | 8210 4G | 6310 | 2660 Flip | 2780 Flip | 5310 | 6300 4G`,
    ),
  ]),
  ...of('zte', ['Blade V40', 'Blade A72', 'Blade A52', 'Axon 40 Ultra', 'Axon 30']),
  ...of('asus', [
    'ROG Phone 8',
    'ROG Phone 7',
    'ROG Phone 6',
    'ROG Phone 5',
    'ROG Phone 3',
    'ROG Phone 2',
    'Zenfone 11 Ultra',
    'Zenfone 10',
    'Zenfone 9',
    'Zenfone 8',
    'Zenfone 7',
    'Zenfone 6',
    'Zenfone 5',
  ]),
  ...of('lg', [
    'Velvet',
    'Wing',
    'G8X',
    'G8',
    'G7',
    'G6',
    'G5',
    'V60',
    'V50',
    'V40',
    'V30',
    'V20',
    'K61',
    'K51S',
    'K41S',
    'K22',
    'Q60',
    'Q70',
  ]),
  ...of('htc', [
    'U12 Plus',
    'U11',
    'U Ultra',
    '10',
    'One M9',
    'One M8',
    'Desire 20 Pro',
    'Wildfire',
  ]),
  ...of('meizu', ['21 Pro', '21', '20 Pro', '20', '18X', '18', '17 Pro', '17', '16s Pro', '16']),
];
