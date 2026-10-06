import { isPartsCategory } from '@dagestan/shared';

import type { IconName } from '../components/Icon';

/**
 * Иконки разделов и подкатегорий объявлений (Этап 7).
 *
 * Живут в приложении, а не в базе, по двум причинам. Иконка — это рисунок в
 * коде, а не файл: картинку для каждой из сотни подкатегорий владельцу
 * пришлось бы рисовать и загружать вручную. И новая подкатегория без иконки
 * должна открываться, а не падать — поэтому есть запасная по разделу.
 *
 * Если владелец загрузит категории свою картинку в панели, показывается она:
 * иконка здесь — это разумное умолчание, а не запрет.
 */

/** Иконка раздела верхнего уровня. */
const SECTION_ICONS: Record<string, IconName> = {
  transport: 'car',
  realty: 'realty',
  electronics: 'smartphone',
  home: 'sofa',
  personal: 'shirt',
  services: 'tools',
  job: 'briefcase',
  animals: 'paw',
  hobby: 'leaf',
  business: 'grid',
};

/** Иконки подкатегорий, которым «своя» лучше общей по разделу. */
const SUBCATEGORY_ICONS: Record<string, IconName> = {
  // Основные типы техники (узлы с направлениями внутри)
  cars: 'car',
  motorcycles: 'car',
  trucks: 'car',
  'special-equipment': 'tools',
  'water-transport': 'route',
  phones: 'smartphone',
  tablets: 'smartphone',
  laptops: 'smartphone',
  computers: 'smartphone',
  tv: 'image',
  appliances: 'sofa',
  climate: 'wind',
  // Направления
  'transport-car-seats': 'person',
  'transport-car-electronics': 'smartphone',
  'transport-car-chemicals': 'tag',
  'transport-batteries': 'tools',
  'transport-racks': 'car',
  'transport-car-tools': 'tools',
  'transport-tuning': 'star',
  'transport-moto-gear': 'shirt',
  'transport-trailers': 'car',
  'transport-water-outboards': 'route',
  'electronics-phone-cases': 'smartphone',
  'electronics-phone-glass': 'smartphone',
  'electronics-phone-chargers': 'smartphone',
  'electronics-tablet-parts': 'tools',
  'electronics-tablet-cases': 'smartphone',
  'electronics-tablet-glass': 'smartphone',
  'electronics-tablet-chargers': 'smartphone',
  'electronics-tablet-cables': 'smartphone',
  'electronics-tablet-input': 'edit',
  'electronics-tablet-accessories': 'smartphone',
  'electronics-monitors': 'image',
  'electronics-tv-remotes': 'image',
  'home-climate-ac': 'wind',
  'home-climate-heaters': 'sun',
  'home-climate-fans': 'wind',
  'home-climate-humidifiers': 'humidity',
  'home-climate-purifiers': 'wind',
  'transport-cars': 'car',
  'transport-moto': 'car',
  'transport-trucks': 'car',
  'transport-parts': 'tools',
  'transport-tires': 'tools',
  'realty-flats': 'realty',
  'realty-houses': 'realty',
  'realty-land': 'map',
  'realty-commercial': 'briefcase',
  'realty-daily': 'clock',
  'realty-long': 'clock',
  'electronics-phones': 'smartphone',
  'electronics-tablets': 'smartphone',
  'electronics-watches': 'clock',
  'home-furniture': 'sofa',
  'home-tools': 'tools',
  'home-plants': 'leaf',
  'personal-clothes': 'shirt',
  'personal-shoes': 'shirt',
  'job-vacancies': 'briefcase',
  'job-resume': 'person',
  'animals-goods': 'tag',
  'hobby-books': 'news',
  'hobby-music': 'tag',
};

/** Иконка раздела по коду. Неизвестный раздел получает нейтральный ярлык. */
export function sectionIcon(slug: string): IconName {
  return SECTION_ICONS[slug] ?? 'tag';
}

/**
 * Иконка подкатегории. Своей нет — берётся иконка раздела: код подкатегории
 * всегда начинается с кода раздела («transport-cars»).
 */
export function subcategoryIcon(slug: string): IconName {
  const own = SUBCATEGORY_ICONS[slug];
  if (own) return own;
  // Запчасти любого типа техники — один и тот же ярлык, как у раздела «Автозапчасти»
  if (isPartsCategory(slug)) return 'tools';

  const section = slug.split('-')[0] ?? '';
  return SECTION_ICONS[section] ?? 'tag';
}
