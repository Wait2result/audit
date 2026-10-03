/**
 * Бренды электроники. Как и марки автомобилей — выбор из списка, а не
 * свободный текст: «Эппл», «apple» и «Apple iPhone» в одном поле делают
 * фильтр по бренду бесполезным. Пункт «Другой бренд» — на случай, если
 * нужного нет.
 */

import { OTHER_BRAND } from './car-brands.js';

export interface DictionaryBrand {
  value: string;
  label: string;
}

export const PHONE_BRANDS: readonly DictionaryBrand[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'samsung', label: 'Samsung' },
  { value: 'xiaomi', label: 'Xiaomi' },
  { value: 'redmi', label: 'Redmi' },
  { value: 'poco', label: 'POCO' },
  { value: 'huawei', label: 'Huawei' },
  { value: 'honor', label: 'Honor' },
  { value: 'realme', label: 'Realme' },
  { value: 'oppo', label: 'OPPO' },
  { value: 'vivo', label: 'Vivo' },
  { value: 'oneplus', label: 'OnePlus' },
  { value: 'google', label: 'Google' },
  { value: 'tecno', label: 'Tecno' },
  { value: 'infinix', label: 'Infinix' },
  { value: 'nokia', label: 'Nokia' },
  { value: 'sony', label: 'Sony' },
  { value: 'motorola', label: 'Motorola' },
  { value: 'zte', label: 'ZTE' },
  { value: 'nothing', label: 'Nothing' },
  { value: 'lenovo', label: 'Lenovo' },
  { value: 'asus', label: 'ASUS' },
  { value: 'lg', label: 'LG' },
  { value: 'htc', label: 'HTC' },
  { value: 'meizu', label: 'Meizu' },
  { value: 'tcl', label: 'TCL' },
  { value: 'alcatel', label: 'Alcatel' },
  { value: 'itel', label: 'Itel' },
  { value: 'bq', label: 'BQ' },
  { value: 'inoi', label: 'Inoi' },
  { value: 'sharp', label: 'Sharp' },
  { value: 'blackview', label: 'Blackview' },
  { value: 'doogee', label: 'Doogee' },
  { value: 'ulefone', label: 'Ulefone' },
  { value: 'cubot', label: 'Cubot' },
  { value: 'umidigi', label: 'UMIDIGI' },
  { value: 'oukitel', label: 'Oukitel' },
  { value: OTHER_BRAND, label: 'Другой бренд' },
];

export const COMPUTER_BRANDS: readonly DictionaryBrand[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'asus', label: 'ASUS' },
  { value: 'acer', label: 'Acer' },
  { value: 'lenovo', label: 'Lenovo' },
  { value: 'hp', label: 'HP' },
  { value: 'dell', label: 'Dell' },
  { value: 'msi', label: 'MSI' },
  { value: 'huawei', label: 'Huawei' },
  { value: 'honor', label: 'Honor' },
  { value: 'samsung', label: 'Samsung' },
  { value: 'xiaomi', label: 'Xiaomi' },
  { value: 'microsoft', label: 'Microsoft' },
  { value: 'gigabyte', label: 'Gigabyte' },
  { value: 'razer', label: 'Razer' },
  { value: 'lg', label: 'LG' },
  { value: 'toshiba', label: 'Toshiba' },
  { value: 'sony', label: 'Sony' },
  { value: 'fujitsu', label: 'Fujitsu' },
  { value: 'dexp', label: 'DEXP' },
  { value: 'digma', label: 'Digma' },
  { value: 'irbis', label: 'Irbis' },
  { value: 'chuwi', label: 'Chuwi' },
  { value: 'machenike', label: 'Machenike' },
  { value: 'infinix', label: 'Infinix' },
  { value: 'tecno', label: 'Tecno' },
  { value: 'realme', label: 'Realme' },
  { value: 'panasonic', label: 'Panasonic' },
  { value: 'prestigio', label: 'Prestigio' },
  { value: 'thunderobot', label: 'Thunderobot' },
  { value: 'intel', label: 'Intel' },
  { value: 'zotac', label: 'Zotac' },
  { value: 'custom', label: 'Сборка' },
  { value: OTHER_BRAND, label: 'Другой бренд' },
];

/**
 * Прежний общий список крупных производителей (ТВ, аудио, фото, часы, техника).
 * У категорий теперь свои списки (`category-brands.ts`); этот остаётся
 * справочником `electronics_brand`, чтобы значения уже поданных объявлений
 * не терялись.
 */
export const ELECTRONICS_BRANDS: readonly DictionaryBrand[] = [
  { value: 'samsung', label: 'Samsung' },
  { value: 'lg', label: 'LG' },
  { value: 'sony', label: 'Sony' },
  { value: 'apple', label: 'Apple' },
  { value: 'xiaomi', label: 'Xiaomi' },
  { value: 'philips', label: 'Philips' },
  { value: 'panasonic', label: 'Panasonic' },
  { value: 'bosch', label: 'Bosch' },
  { value: 'haier', label: 'Haier' },
  { value: 'hisense', label: 'Hisense' },
  { value: 'tcl', label: 'TCL' },
  { value: 'canon', label: 'Canon' },
  { value: 'nikon', label: 'Nikon' },
  { value: 'fujifilm', label: 'Fujifilm' },
  { value: 'gopro', label: 'GoPro' },
  { value: 'dji', label: 'DJI' },
  { value: 'jbl', label: 'JBL' },
  { value: 'yamaha', label: 'Yamaha' },
  { value: 'huawei', label: 'Huawei' },
  { value: 'honor', label: 'Honor' },
  { value: 'garmin', label: 'Garmin' },
  { value: 'amazfit', label: 'Amazfit' },
  { value: 'nintendo', label: 'Nintendo' },
  { value: 'microsoft', label: 'Microsoft' },
  { value: 'dyson', label: 'Dyson' },
  { value: 'electrolux', label: 'Electrolux' },
  { value: 'indesit', label: 'Indesit' },
  { value: 'beko', label: 'Beko' },
  { value: 'gorenje', label: 'Gorenje' },
  { value: 'midea', label: 'Midea' },
  { value: 'candy', label: 'Candy' },
  { value: 'whirlpool', label: 'Whirlpool' },
  { value: 'atlant', label: 'Атлант' },
  { value: 'biryusa', label: 'Бирюса' },
  { value: OTHER_BRAND, label: 'Другой бренд' },
];
