/**
 * Переезд объявлений при перестройке направлений (docs/ADR/0013-основные-типы.md).
 *
 * Деталь или товар, у которых появилось своё направление, больше не живут в
 * «Запчастях» или общих «Аксессуарах»: аккумулятор — в «Аккумуляторах»,
 * моторное масло — в «Автохимии», чехол для телефона — в «Чехлах». Правило
 * срабатывает только по точному значению поля; тип товара в новом месте
 * ставится, только если он однозначен («Гребной винт» → «Гребные винты»),
 * иначе остаётся пустым и продавец выберет его при правке.
 *
 * Применяет правила только `db:migrate:listings-v2` — со статистикой и
 * пробным прогоном (`--dry-run`). Старые значения (партномер, «Категория
 * детали») не стираются: в новой подкатегории у них нет поля, и они
 * сохраняются как есть.
 */
export interface CategoryRelocation {
  from: string;
  to: string;
  /** Поле и значения, по которым объявление переезжает */
  when: { key: string; values: readonly string[] };
  /** Что поставить в новом месте (тип товара), если однозначно */
  set?: Readonly<Record<string, string>>;
  reason: string;
}

const PARTS_TO = 'стала отдельным направлением';

export const CATEGORY_RELOCATIONS: readonly CategoryRelocation[] = [
  // Автомобили
  {
    from: 'transport-parts',
    to: 'transport-batteries',
    when: { key: 'partItem', values: ['battery'] },
    set: { goodsType: 'car' },
    reason: `«Аккумулятор» ${PARTS_TO} «Аккумуляторы»`,
  },
  {
    from: 'transport-parts',
    to: 'transport-car-chemicals',
    when: { key: 'partItem', values: ['engine_oil'] },
    set: { goodsType: 'oils' },
    reason: `масла — направление «Автохимия и уход»`,
  },
  {
    from: 'transport-parts',
    to: 'transport-car-chemicals',
    when: { key: 'partItem', values: ['coolant'] },
    set: { goodsType: 'antifreeze' },
    reason: `антифриз — направление «Автохимия и уход»`,
  },
  {
    from: 'transport-parts',
    to: 'transport-car-chemicals',
    when: { key: 'partItem', values: ['brake_fluid'] },
    set: { goodsType: 'brake_fluid' },
    reason: `тормозная жидкость — направление «Автохимия и уход»`,
  },
  {
    from: 'transport-parts',
    to: 'transport-car-chemicals',
    when: { key: 'partItem', values: ['fluids'] },
    reason: `технические жидкости — направление «Автохимия и уход»`,
  },
  // Мотоциклы
  {
    from: 'transport-moto-parts',
    to: 'transport-batteries',
    when: { key: 'partItem', values: ['moto_battery'] },
    set: { goodsType: 'moto' },
    reason: `мотоаккумулятор — направление «Аккумуляторы»`,
  },
  {
    from: 'transport-moto-parts',
    to: 'transport-moto-accessories',
    when: { key: 'partItem', values: ['moto_attachments'] },
    reason: 'кофры и багажники — направление «Аксессуары»',
  },
  // Грузовики
  {
    from: 'transport-truck-parts',
    to: 'transport-truck-attachments',
    when: { key: 'partGroup', values: ['attachments'] },
    reason: `навесное оборудование ${PARTS_TO}`,
  },
  // Спецтехника
  {
    from: 'transport-special-parts',
    to: 'transport-special-tracks',
    when: { key: 'partItem', values: ['special_tracks'] },
    reason: `гусеницы целиком — направление «Шины и гусеницы»`,
  },
  {
    from: 'transport-special-parts',
    to: 'transport-special-attachments',
    when: { key: 'partItem', values: ['bucket'] },
    set: { goodsType: 'bucket' },
    reason: `ковш — направление «Навесное оборудование»`,
  },
  {
    from: 'transport-special-parts',
    to: 'transport-special-attachments',
    when: { key: 'partItem', values: ['dozer_blade'] },
    set: { goodsType: 'blade' },
    reason: `отвал — направление «Навесное оборудование»`,
  },
  {
    from: 'transport-special-parts',
    to: 'transport-special-attachments',
    when: { key: 'partItem', values: ['ripper'] },
    set: { goodsType: 'ripper' },
    reason: `рыхлитель — направление «Навесное оборудование»`,
  },
  {
    from: 'transport-special-parts',
    to: 'transport-special-attachments',
    when: { key: 'partItem', values: ['forks'] },
    set: { goodsType: 'forks' },
    reason: `вилы — направление «Навесное оборудование»`,
  },
  {
    from: 'transport-special-parts',
    to: 'transport-special-attachments',
    when: { key: 'partItem', values: ['grapples', 'grab'] },
    set: { goodsType: 'grapple' },
    reason: `захват и грейфер — направление «Навесное оборудование»`,
  },
  {
    from: 'transport-special-parts',
    to: 'transport-special-attachments',
    when: { key: 'partItem', values: ['attachments'] },
    reason: `навесное оборудование ${PARTS_TO}`,
  },
  // Водный транспорт
  {
    from: 'transport-water-parts',
    to: 'transport-water-outboards',
    when: { key: 'partItem', values: ['water_engine'] },
    set: { goodsType: 'outboard' },
    reason: `лодочный мотор целиком — направление «Лодочные моторы»`,
  },
  {
    from: 'transport-water-parts',
    to: 'transport-water-propellers',
    when: { key: 'partItem', values: ['water_propeller'] },
    set: { goodsType: 'propeller' },
    reason: `гребной винт — направление «Винты»`,
  },
  {
    from: 'transport-water-parts',
    to: 'transport-water-electronics',
    when: { key: 'partItem', values: ['water_navigation'] },
    reason: `навигация — направление «Электроника»`,
  },
  // Пульты — свои направления у телевизоров и климатической техники
  {
    from: 'electronics-tv-parts',
    to: 'electronics-tv-remotes',
    when: { key: 'partItem', values: ['tv_remote'] },
    reason: `пульты ${PARTS_TO} «Пульты»`,
  },
  {
    from: 'home-climate-parts',
    to: 'home-climate-accessories',
    when: { key: 'partItem', values: ['ac_remote'] },
    set: { goodsType: 'ac_remote' },
    reason: `пульт кондиционера — направление «Аксессуары»`,
  },
  // Телефоны: общие «Аксессуары» → «Чехлы», «Защитные стёкла», «Зарядные устройства»
  {
    from: 'electronics-accessories',
    to: 'electronics-phone-cases',
    when: { key: 'accessoryType', values: ['case'] },
    reason: `чехлы ${PARTS_TO} «Чехлы»`,
  },
  {
    from: 'electronics-accessories',
    to: 'electronics-phone-glass',
    when: { key: 'accessoryType', values: ['screen_protector'] },
    reason: `защитные стёкла ${PARTS_TO} «Защитные стёкла»`,
  },
  {
    from: 'electronics-accessories',
    to: 'electronics-phone-chargers',
    when: { key: 'accessoryType', values: ['charger'] },
    reason: `зарядки и кабели ${PARTS_TO} «Зарядные устройства»`,
  },
  {
    from: 'electronics-accessories',
    to: 'electronics-phone-chargers',
    when: { key: 'accessoryType', values: ['powerbank'] },
    set: { goodsType: 'powerbank' },
    reason: `пауэрбанки — направление «Зарядные устройства»`,
  },
];

/** Правило переезда для объявления: подкатегория и значения его полей. */
export function relocationFor(
  categorySlug: string,
  attributes: Readonly<Record<string, unknown>>,
): CategoryRelocation | undefined {
  return CATEGORY_RELOCATIONS.find(
    (rule) =>
      rule.from === categorySlug &&
      typeof attributes[rule.when.key] === 'string' &&
      rule.when.values.includes(attributes[rule.when.key] as string),
  );
}
