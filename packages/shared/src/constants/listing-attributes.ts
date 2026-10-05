/**
 * Характеристики объявлений (Этап 7, версия 2).
 *
 * Одно определение поля — один источник для всего: формы подачи, экрана
 * фильтров, проверки на сервере, поискового текста и строки под заголовком
 * карточки. Три расходящихся списка полей — самый быстрый способ получить
 * объявление, которое нельзя найти фильтром, поэтому списка ровно один.
 *
 * Здесь — исходник для заполнения базы. Дальше определения живут в таблице
 * `listing_attribute_definitions`, привязки к категориям — в
 * `listing_category_attributes`, и правятся из панели. Сервер и приложение
 * читают их из базы; этот файл нужен, чтобы база заполнилась при первом
 * запуске и чтобы тесты работали без базы.
 *
 * Где хранится значение — решает поле `column`:
 *   • задано  → отдельная колонка таблицы (самые частые диапазоны: комнаты,
 *     площадь, этаж, год, пробег). Индексируются напрямую;
 *   • не задано → в `attributes` (JSON, для показа) И в таблице значений
 *     `listing_attribute_values` (для фильтра: число или строка с
 *     индексом). Так диапазон работает по ЛЮБОМУ числовому полю, а не
 *     только по тем, под которые заведена колонка.
 *
 * Подробнее — docs/ADR/0008-объявления.md.
 */

export type ListingAttributeType =
  'string' | 'number' | 'boolean' | 'enum' | 'multiEnum' | 'date' | 'brand' | 'model';

/**
 * Как поле выглядит в фильтрах. `none` — поле есть только в карточке.
 * Виды разведены по смыслу поля: `select`/`multiselect`/`toggle` — точное
 * значение из набора, `range` — числовой диапазон, `text` — слово или его
 * часть («камр», «ryzen») без точного совпадения.
 */
export type ListingAttributeFilter =
  'range' | 'select' | 'multiselect' | 'toggle' | 'text' | 'none';

/** Колонки таблицы, в которые раскладываются самые частые диапазоны. */
export type ListingAttributeColumn =
  'rooms' | 'areaTotal' | 'floor' | 'floorsTotal' | 'year' | 'mileage' | 'condition';

export interface ListingAttributeOption {
  value: string;
  label: string;
  /** Другие написания для поиска по списку: «бмв» → BMW */
  aliases?: readonly string[];
  /** Как значение звучит в строке карточки, если не так, как в форме: «от собственника» */
  cardLabel?: string;
  /** Подсказка в форме подачи, когда выбран этот вариант: «Укажите в описании, что заменено» */
  hint?: string;
}

/** Определение поля — то, что хранится в справочнике определений. */
export interface AttributeDefinition {
  key: string;
  label: string;
  type: ListingAttributeType;
  /** Короткая подпись для карточки, если полная слишком длинная */
  shortLabel?: string;
  /** Приписка к значению: «м²», «км», «л. с.» */
  unit?: string;
  min?: number;
  max?: number;
  /**
   * Во сколько раз значение увеличивается при хранении. Площадь хранится в
   * десятых квадратного метра (54,5 м² — это 545): целые числа сравниваются
   * в фильтрах точно, дробные — нет.
   */
  scale?: number;
  /** Варианты для enum и multiEnum */
  options?: readonly ListingAttributeOption[];
  /** Справочник для brand и model (`car_brand`, `car_model`) */
  dictionary?: string;
  /** Поле-родитель: у модели — марка, список моделей зависит от неё */
  parentKey?: string;
  /** Значение хранится в отдельной колонке, а не в `attributes` */
  column?: ListingAttributeColumn;
  /**
   * Поле показывается только при определённом значении другого поля:
   * «Face ID работает» — только у Apple. Скрытое поле не обязательно и не
   * сохраняется.
   */
  visibleWhen?: { key: string; values: readonly string[] };
  filter: ListingAttributeFilter;
  /** Значение (подпись) попадает в поисковый текст объявления */
  searchable: boolean;
  /** По полю можно фильтровать; false — только показ */
  filterable: boolean;
  sortable: boolean;
  /** Показывать строкой под заголовком карточки: «2 комн. · 54 м² · 3/9 эт.» */
  showInCard: boolean;
  showInDetails: boolean;
}

/** Поле в контексте категории: определение плюс обязательность и подпись. */
export interface ListingAttribute extends AttributeDefinition {
  required: boolean;
}

/**
 * Привязка поля к категории. Переопределяются только то, что честно
 * различается между категориями: обязательность, подпись («Год выпуска» у
 * машины и «Год постройки» у дома), справочник (марки авто и марки мото).
 */
export interface CategoryAttributeBinding {
  key: string;
  required?: boolean;
  label?: string;
  dictionary?: string;
  /** Переопределить границы: пробег у мотоцикла меньше, чем у грузовика */
  min?: number;
  max?: number;
}

type DefinitionInput = Omit<
  AttributeDefinition,
  'filter' | 'searchable' | 'filterable' | 'sortable' | 'showInCard' | 'showInDetails'
> &
  Partial<
    Pick<
      AttributeDefinition,
      'filter' | 'searchable' | 'filterable' | 'sortable' | 'showInCard' | 'showInDetails'
    >
  >;

/** Вид фильтра по типу поля, если явно не задан. */
function defaultFilter(type: ListingAttributeType): ListingAttributeFilter {
  switch (type) {
    case 'number':
    case 'date':
      return 'range';
    case 'boolean':
      return 'toggle';
    case 'multiEnum':
      return 'multiselect';
    case 'string':
      return 'text';
    default:
      return 'select';
  }
}

/** Определение с умолчаниями — чтобы каталог ниже читался, а не тонул в флагах. */
function def(input: DefinitionInput): AttributeDefinition {
  const searchableByType =
    input.type === 'enum' ||
    input.type === 'multiEnum' ||
    input.type === 'brand' ||
    input.type === 'model' ||
    input.type === 'string';

  const filter = input.filter ?? defaultFilter(input.type);

  return {
    ...input,
    filter,
    searchable: input.searchable ?? searchableByType,
    filterable: input.filterable ?? filter !== 'none',
    sortable: input.sortable ?? false,
    showInCard: input.showInCard ?? false,
    showInDetails: input.showInDetails ?? true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Каталог определений
// ─────────────────────────────────────────────────────────────────────────────

const DEFINITIONS: readonly AttributeDefinition[] = [
  // ── Общее ──────────────────────────────────────────────────────────────────
  def({
    key: 'condition',
    label: 'Состояние',
    type: 'enum',
    column: 'condition',
    options: [
      { value: 'new', label: 'Новое' },
      { value: 'used', label: 'Б/у' },
    ],
    showInCard: true,
  }),
  def({ key: 'brand', label: 'Марка', type: 'brand', showInCard: true }),
  def({ key: 'model', label: 'Модель', type: 'model', parentKey: 'brand', showInCard: true }),
  /** Бренд свободным текстом — там, где справочника пока нет */
  def({ key: 'brandName', label: 'Бренд', type: 'string', showInCard: true }),
  def({ key: 'modelName', label: 'Модель', type: 'string', showInCard: true }),
  def({
    key: 'color',
    label: 'Цвет',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'white', label: 'Белый' },
      { value: 'black', label: 'Чёрный' },
      { value: 'silver', label: 'Серебристый' },
      { value: 'gray', label: 'Серый' },
      { value: 'blue', label: 'Синий' },
      { value: 'red', label: 'Красный' },
      { value: 'green', label: 'Зелёный' },
      { value: 'brown', label: 'Коричневый' },
      { value: 'beige', label: 'Бежевый' },
      { value: 'yellow', label: 'Жёлтый' },
      { value: 'orange', label: 'Оранжевый' },
      { value: 'purple', label: 'Фиолетовый' },
      { value: 'gold', label: 'Золотистый' },
      { value: 'other', label: 'Другой' },
    ],
  }),
  def({ key: 'warranty', label: 'На гарантии', type: 'boolean' }),

  // ── Недвижимость ───────────────────────────────────────────────────────────
  def({
    key: 'rooms',
    label: 'Комнат',
    type: 'number',
    column: 'rooms',
    min: 0,
    max: 20,
    filter: 'multiselect',
    // 0 — студия: отдельного признака не нужно, и в фильтре это отдельная кнопка.
    // «4+» в фильтре означает «от четырёх», а не «ровно четыре»
    options: [
      { value: '0', label: 'Студия' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4+' },
    ],
    showInCard: true,
    shortLabel: 'комн.',
  }),
  def({
    key: 'areaTotal',
    label: 'Площадь',
    type: 'number',
    column: 'areaTotal',
    unit: 'м²',
    min: 1,
    max: 10_000,
    scale: 10,
    sortable: true,
    showInCard: true,
  }),
  def({
    key: 'floor',
    label: 'Этаж',
    type: 'number',
    column: 'floor',
    min: -1,
    max: 100,
    showInCard: true,
  }),
  def({
    key: 'floorsTotal',
    label: 'Этажей в доме',
    type: 'number',
    column: 'floorsTotal',
    min: 1,
    max: 100,
  }),
  def({
    key: 'year',
    label: 'Год',
    type: 'number',
    column: 'year',
    min: 1800,
    max: 2100,
    sortable: true,
    showInCard: true,
  }),
  def({
    key: 'renovation',
    label: 'Ремонт',
    type: 'enum',
    options: [
      { value: 'none', label: 'Без отделки' },
      { value: 'cosmetic', label: 'Косметический' },
      { value: 'euro', label: 'Евроремонт' },
      { value: 'designer', label: 'Дизайнерский' },
    ],
  }),
  def({
    key: 'buildingType',
    label: 'Тип дома',
    type: 'enum',
    options: [
      { value: 'panel', label: 'Панельный' },
      { value: 'brick', label: 'Кирпичный' },
      { value: 'monolith', label: 'Монолитный' },
      { value: 'block', label: 'Блочный' },
    ],
  }),
  def({ key: 'balcony', label: 'Балкон или лоджия', type: 'boolean' }),
  def({ key: 'lift', label: 'Лифт', type: 'boolean' }),
  def({ key: 'furniture', label: 'С мебелью', type: 'boolean' }),
  def({ key: 'parking', label: 'Парковка', type: 'boolean' }),
  def({
    key: 'bathroom',
    label: 'Санузел',
    type: 'enum',
    options: [
      { value: 'combined', label: 'Совмещённый' },
      { value: 'separate', label: 'Раздельный' },
      { value: 'several', label: 'Два и более' },
    ],
  }),
  def({
    key: 'heating',
    label: 'Отопление',
    type: 'enum',
    options: [
      { value: 'central', label: 'Центральное' },
      { value: 'gas', label: 'Газовое' },
      { value: 'electric', label: 'Электрическое' },
      { value: 'stove', label: 'Печное' },
      { value: 'none', label: 'Нет' },
    ],
  }),
  def({ key: 'newBuilding', label: 'Новостройка', type: 'boolean' }),
  /** Комнат в квартире — для объявления о комнате: «комната в трёшке» */
  def({
    key: 'roomsInFlat',
    label: 'Комнат в квартире',
    type: 'number',
    min: 1,
    max: 20,
    filter: 'select',
    options: [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5+' },
    ],
    showInCard: true,
    shortLabel: 'комн. в кв.',
  }),
  // Условия аренды. Поля есть у всей категории, а осмысленны только при
  // сдаче: форма не обязывает их заполнять, и при продаже их просто не трогают
  def({ key: 'utilitiesIncluded', label: 'Коммунальные включены', type: 'boolean' }),
  def({ key: 'petsAllowed', label: 'Можно с животными', type: 'boolean' }),
  def({ key: 'childrenAllowed', label: 'Можно с детьми', type: 'boolean' }),
  def({
    key: 'bathroomLocation',
    label: 'Санузел',
    type: 'enum',
    options: [
      { value: 'inside', label: 'В доме' },
      { value: 'outside', label: 'На улице' },
    ],
  }),
  def({ key: 'electricity', label: 'Электричество', type: 'boolean' }),
  def({
    key: 'road',
    label: 'Подъезд',
    type: 'enum',
    options: [
      { value: 'asphalt', label: 'Асфальт' },
      { value: 'gravel', label: 'Грунт, щебень' },
      { value: 'none', label: 'Нет дороги' },
    ],
  }),
  def({ key: 'separateEntrance', label: 'Отдельный вход', type: 'boolean' }),
  def({
    // Как вещь попадает к покупателю. Не логистика, а договорённость:
    // заказов и курьеров на этом этапе нет — это честная подпись продавца
    key: 'delivery',
    label: 'Получение',
    type: 'multiEnum',
    options: [
      { value: 'pickup', label: 'Самовывоз' },
      { value: 'delivery', label: 'Доставка', aliases: ['привезу', 'доставлю'] },
      { value: 'negotiable', label: 'Договоримся' },
    ],
  }),
  def({
    // Обязательное у всей недвижимости: покупатель часто ищет «без
    // посредников», и честнее спросить продавца, чем угадывать по тексту.
    // Позже у агентств появится свой профиль — это поле останется фильтром
    key: 'sellerType',
    label: 'Кто разместил',
    type: 'enum',
    options: [
      {
        value: 'owner',
        label: 'Собственник',
        cardLabel: 'от собственника',
        aliases: ['частное лицо', 'хозяин', 'без посредников'],
      },
      {
        value: 'agency',
        label: 'Агентство',
        cardLabel: 'от агентства',
        aliases: ['агент', 'риелтор', 'риэлтор'],
      },
    ],
    // В ленте сразу видно, сдаёт или продаёт хозяин или агентство:
    // «от собственника · 2 комн. · 54 м²» — ради этого карточку и открывают
    showInCard: true,
  }),
  def({
    key: 'garageType',
    label: 'Тип',
    type: 'enum',
    options: [
      { value: 'garage', label: 'Гараж' },
      { value: 'box', label: 'Бокс' },
      { value: 'parking_place', label: 'Машиноместо' },
      { value: 'shell', label: 'Ракушка' },
    ],
    showInCard: true,
  }),
  def({ key: 'security', label: 'Охрана', type: 'boolean' }),
  def({ key: 'pit', label: 'Смотровая яма', type: 'boolean' }),
  def({
    key: 'landArea',
    label: 'Участок',
    type: 'number',
    unit: 'сот.',
    min: 1,
    max: 10_000,
    scale: 10,
    showInCard: true,
  }),
  def({
    key: 'wallMaterial',
    label: 'Материал стен',
    type: 'enum',
    options: [
      { value: 'brick', label: 'Кирпич' },
      { value: 'block', label: 'Блок' },
      { value: 'wood', label: 'Дерево' },
      { value: 'monolith', label: 'Монолит' },
    ],
  }),
  def({ key: 'gas', label: 'Газ', type: 'boolean' }),
  def({ key: 'water', label: 'Вода', type: 'boolean' }),
  def({ key: 'sewerage', label: 'Канализация', type: 'boolean' }),
  def({
    key: 'landPurpose',
    label: 'Назначение участка',
    type: 'enum',
    options: [
      { value: 'igs', label: 'ИЖС' },
      { value: 'garden', label: 'Садоводство' },
      { value: 'farm', label: 'Сельхоз' },
      { value: 'commercial', label: 'Коммерческое' },
    ],
    showInCard: true,
  }),
  def({ key: 'communications', label: 'Коммуникации подведены', type: 'boolean' }),
  def({
    key: 'commercialType',
    label: 'Назначение помещения',
    type: 'enum',
    options: [
      { value: 'office', label: 'Офис' },
      { value: 'retail', label: 'Торговое' },
      { value: 'warehouse', label: 'Склад' },
      { value: 'production', label: 'Производство' },
      { value: 'free', label: 'Свободное назначение' },
    ],
    showInCard: true,
  }),

  // ── Транспорт ──────────────────────────────────────────────────────────────
  def({
    key: 'mileage',
    label: 'Пробег',
    type: 'number',
    column: 'mileage',
    unit: 'км',
    min: 0,
    max: 2_000_000,
    sortable: true,
    showInCard: true,
  }),
  def({
    key: 'gearbox',
    label: 'Коробка передач',
    type: 'enum',
    options: [
      { value: 'manual', label: 'Механика' },
      { value: 'auto', label: 'Автомат' },
      { value: 'robot', label: 'Робот' },
      { value: 'variator', label: 'Вариатор' },
    ],
    showInCard: true,
  }),
  def({
    key: 'fuel',
    label: 'Двигатель',
    type: 'enum',
    options: [
      { value: 'petrol', label: 'Бензин' },
      { value: 'diesel', label: 'Дизель' },
      { value: 'gas', label: 'Газ' },
      { value: 'hybrid', label: 'Гибрид' },
      { value: 'electric', label: 'Электро' },
    ],
  }),
  def({
    key: 'drive',
    label: 'Привод',
    type: 'enum',
    options: [
      { value: 'front', label: 'Передний' },
      { value: 'rear', label: 'Задний' },
      { value: 'full', label: 'Полный' },
    ],
  }),
  def({
    key: 'bodyType',
    label: 'Кузов',
    type: 'enum',
    options: [
      { value: 'sedan', label: 'Седан' },
      { value: 'hatchback', label: 'Хэтчбек' },
      { value: 'suv', label: 'Внедорожник' },
      { value: 'wagon', label: 'Универсал' },
      { value: 'minivan', label: 'Минивэн' },
      { value: 'pickup', label: 'Пикап' },
      { value: 'coupe', label: 'Купе' },
      { value: 'liftback', label: 'Лифтбек' },
    ],
  }),
  def({
    key: 'engineVolume',
    label: 'Объём двигателя',
    type: 'number',
    unit: 'л',
    min: 0.1,
    max: 20,
    scale: 10,
    showInCard: true,
  }),
  def({
    key: 'power',
    label: 'Мощность',
    type: 'number',
    unit: 'л. с.',
    min: 1,
    max: 2000,
  }),
  def({
    key: 'owners',
    label: 'Владельцев по ПТС',
    type: 'enum',
    options: [
      { value: '1', label: 'Один' },
      { value: '2', label: 'Два' },
      { value: '3', label: 'Три и больше' },
    ],
  }),
  def({
    key: 'steering',
    label: 'Руль',
    type: 'enum',
    options: [
      { value: 'left', label: 'Левый' },
      { value: 'right', label: 'Правый' },
    ],
  }),
  def({ key: 'customs', label: 'Растаможен', type: 'boolean' }),
  def({ key: 'damaged', label: 'Битый или не на ходу', type: 'boolean' }),
  /** VIN — только для показа в карточке, в поиск и фильтры не идёт */
  def({
    key: 'vin',
    label: 'VIN',
    type: 'string',
    searchable: false,
    filter: 'none',
    showInDetails: true,
  }),
  def({
    key: 'motoType',
    label: 'Тип',
    type: 'enum',
    options: [
      { value: 'sport', label: 'Спортивный' },
      { value: 'classic', label: 'Классический' },
      { value: 'enduro', label: 'Эндуро, кросс' },
      { value: 'touring', label: 'Туристический' },
      { value: 'cruiser', label: 'Круизёр, чоппер' },
      { value: 'scooter', label: 'Скутер, мопед' },
      { value: 'atv', label: 'Квадроцикл' },
      { value: 'snowmobile', label: 'Снегоход' },
    ],
    showInCard: true,
  }),
  def({
    key: 'engineCc',
    label: 'Объём двигателя',
    type: 'number',
    unit: 'см³',
    min: 10,
    max: 10_000,
    showInCard: true,
  }),
  def({
    key: 'truckType',
    label: 'Тип',
    type: 'enum',
    options: [
      { value: 'tractor', label: 'Тягач' },
      { value: 'flatbed', label: 'Бортовой' },
      { value: 'van', label: 'Фургон' },
      { value: 'refrigerator', label: 'Рефрижератор' },
      { value: 'dump', label: 'Самосвал' },
      { value: 'tank', label: 'Цистерна' },
      { value: 'crane', label: 'Автокран, манипулятор' },
      { value: 'bus', label: 'Автобус' },
      { value: 'light', label: 'Лёгкий коммерческий' },
      { value: 'trailer', label: 'Прицеп, полуприцеп' },
    ],
    showInCard: true,
  }),
  def({
    key: 'loadCapacity',
    label: 'Грузоподъёмность',
    type: 'number',
    unit: 'т',
    min: 0.1,
    max: 200,
    scale: 10,
    showInCard: true,
  }),
  def({
    key: 'specialType',
    label: 'Тип техники',
    type: 'enum',
    options: [
      { value: 'excavator', label: 'Экскаватор' },
      { value: 'loader', label: 'Погрузчик' },
      { value: 'bulldozer', label: 'Бульдозер' },
      { value: 'tractor', label: 'Трактор' },
      { value: 'crane', label: 'Кран' },
      { value: 'roller', label: 'Каток' },
      { value: 'grader', label: 'Грейдер' },
      { value: 'concrete', label: 'Бетононасос, миксер' },
      { value: 'agricultural', label: 'Сельхозтехника' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'hours',
    label: 'Наработка',
    type: 'number',
    unit: 'моточасов',
    min: 0,
    max: 200_000,
    showInCard: true,
  }),
  def({
    key: 'waterType',
    label: 'Тип',
    type: 'enum',
    options: [
      { value: 'motorboat', label: 'Моторная лодка' },
      { value: 'inflatable', label: 'Надувная лодка' },
      { value: 'jet_ski', label: 'Гидроцикл' },
      { value: 'yacht', label: 'Катер, яхта' },
      { value: 'sail', label: 'Парусное' },
      { value: 'engine', label: 'Лодочный мотор' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'length',
    label: 'Длина',
    type: 'number',
    unit: 'м',
    min: 0.5,
    max: 200,
    scale: 10,
    showInCard: true,
  }),
  def({
    key: 'hullMaterial',
    label: 'Материал корпуса',
    type: 'enum',
    options: [
      { value: 'aluminium', label: 'Алюминий' },
      { value: 'plastic', label: 'Пластик' },
      { value: 'pvc', label: 'ПВХ' },
      { value: 'wood', label: 'Дерево' },
      { value: 'steel', label: 'Сталь' },
    ],
  }),
  def({
    key: 'partType',
    label: 'Вид запчасти',
    type: 'enum',
    options: [
      { value: 'body', label: 'Кузов' },
      { value: 'engine', label: 'Двигатель' },
      { value: 'gearbox', label: 'Трансмиссия' },
      { value: 'suspension', label: 'Подвеска, рулевое' },
      { value: 'brakes', label: 'Тормоза' },
      { value: 'electric', label: 'Электрика' },
      { value: 'glass', label: 'Стёкла, оптика' },
      { value: 'interior', label: 'Салон' },
      { value: 'exhaust', label: 'Выхлоп' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'partOrigin',
    label: 'Происхождение',
    type: 'enum',
    options: [
      { value: 'original', label: 'Оригинал' },
      { value: 'aftermarket', label: 'Неоригинал' },
      { value: 'used', label: 'Б/у, разбор' },
    ],
  }),
  def({ key: 'producer', label: 'Производитель', type: 'string' }),
  // ── Запчасти и комплектующие (docs/ADR/0012-запчасти.md) ──────────────────
  // Группа и деталь — из справочников таксономии (part_group_*, part_item_*),
  // какой именно — задаёт привязка категории. Деталь — «модель» группы.
  def({
    key: 'partGroup',
    label: 'Категория детали',
    type: 'brand',
    showInCard: true,
  }),
  def({
    key: 'partItem',
    label: 'Деталь',
    type: 'model',
    parentKey: 'partGroup',
    showInCard: true,
  }),
  // Производитель, тип и состояние — три разных понятия: «б/у» деталь может
  // быть оригиналом Toyota, а новая — аналогом Denso. «Контрактная» — это
  // «Оригинал» + «Б/У», отдельного значения нет; «Восстановленная» — состояние,
  // а не тип (docs/ADR/0012-запчасти.md)
  def({
    key: 'partCondition',
    label: 'Состояние',
    type: 'enum',
    options: [
      { value: 'new', label: 'Новая', aliases: ['новый', 'новое', 'новые'] },
      {
        value: 'used',
        label: 'Б/У',
        aliases: ['бу', 'б у', 'б/у', 'контрактная', 'контрактный'],
      },
      {
        value: 'restored',
        label: 'Восстановленная',
        aliases: ['восстановленный', 'после ремонта', 'перебранная'],
        hint: 'Укажите в описании, что было восстановлено или заменено.',
      },
    ],
    showInCard: true,
  }),
  def({
    key: 'partOriginality',
    label: 'Тип детали',
    type: 'enum',
    options: [
      {
        value: 'original',
        label: 'Оригинал',
        aliases: ['оригинальная', 'оригинальный', 'родная'],
      },
      {
        value: 'analog',
        label: 'Аналог',
        aliases: ['неоригинал', 'не оригинал', 'неоригинальная'],
      },
    ],
    showInCard: true,
  }),
  def({ key: 'partManufacturer', label: 'Производитель детали', type: 'brand' }),
  def({
    key: 'partAvailability',
    label: 'Наличие',
    type: 'enum',
    options: [
      { value: 'in_stock', label: 'В наличии' },
      { value: 'on_order', label: 'Под заказ' },
    ],
  }),
  def({
    key: 'partSaleUnit',
    label: 'Продаётся',
    type: 'enum',
    options: [
      { value: 'piece', label: 'Поштучно' },
      { value: 'pair', label: 'Парой' },
      { value: 'set', label: 'Комплектом' },
      { value: 'assembly', label: 'В сборе' },
    ],
  }),
  // Поля совместимости и номера для ФИЛЬТРА (FILTER_ONLY_ATTRIBUTES): значения
  // хранятся не в атрибутах, а в отдельном слое (таблицы listing_compatibility
  // и listing_part_numbers), форма подачи их не показывает
  def({
    key: 'compatBrand',
    label: 'Марка техники',
    type: 'brand',
    searchable: false,
    showInDetails: false,
  }),
  def({
    key: 'compatModel',
    label: 'Модель техники',
    type: 'model',
    parentKey: 'compatBrand',
    searchable: false,
    showInDetails: false,
  }),
  def({
    key: 'compatBrandText',
    label: 'Производитель техники',
    type: 'string',
    searchable: false,
    showInDetails: false,
  }),
  def({
    key: 'compatModelText',
    label: 'Модель техники',
    type: 'string',
    searchable: false,
    showInDetails: false,
  }),
  def({
    key: 'compatYear',
    label: 'Год выпуска техники',
    type: 'number',
    min: 1950,
    max: 2035,
    searchable: false,
    showInDetails: false,
  }),
  def({
    key: 'compatChassis',
    label: 'Кузов',
    type: 'string',
    searchable: false,
    showInDetails: false,
  }),
  def({
    key: 'compatEngine',
    label: 'Двигатель',
    type: 'string',
    searchable: false,
    showInDetails: false,
  }),
  def({
    key: 'compatModification',
    label: 'Модификация',
    type: 'string',
    searchable: false,
    showInDetails: false,
  }),
  def({
    key: 'partNumber',
    label: 'OEM / артикул',
    type: 'string',
    searchable: false,
    showInDetails: false,
  }),
  // ── Направления основных типов техники (docs/ADR/0013-основные-типы.md) ──
  // Тип товара внутри направления: «Коврики», «Магнитолы», «Шлемы». Список —
  // справочник направления (goods_type_<ключ>), какой именно — задаёт привязка
  def({ key: 'goodsType', label: 'Тип товара', type: 'brand', showInCard: true }),
  // Детские автокресла
  def({
    key: 'childAge',
    label: 'Возраст ребёнка',
    type: 'enum',
    options: [
      { value: '0_1', label: 'До 1 года' },
      { value: '0_4', label: '0–4 года' },
      { value: '1_4', label: '1–4 года' },
      { value: '1_7', label: '1–7 лет' },
      { value: '3_7', label: '3–7 лет' },
      { value: '4_12', label: '4–12 лет' },
      { value: '0_12', label: '0–12 лет' },
    ],
    showInCard: true,
  }),
  def({
    key: 'childWeight',
    label: 'Вес ребёнка',
    type: 'enum',
    options: [
      { value: '0_13', label: 'До 13 кг' },
      { value: '0_18', label: 'До 18 кг' },
      { value: '9_18', label: '9–18 кг' },
      { value: '9_36', label: '9–36 кг' },
      { value: '15_36', label: '15–36 кг' },
      { value: '0_36', label: '0–36 кг' },
    ],
  }),
  def({
    key: 'seatGroup',
    label: 'Группа',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: '0', label: '0' },
      { value: '0plus', label: '0+' },
      { value: '0plus_1', label: '0+/1' },
      { value: '1', label: '1' },
      { value: '1_2_3', label: '1/2/3' },
      { value: '2', label: '2' },
      { value: '2_3', label: '2/3' },
      { value: '3', label: '3' },
      { value: '0_1_2_3', label: '0/1/2/3' },
    ],
    showInCard: true,
  }),
  def({
    key: 'childHeight',
    label: 'Рост ребёнка до',
    type: 'number',
    unit: 'см',
    min: 40,
    max: 160,
  }),
  def({ key: 'isofix', label: 'ISOFIX', type: 'boolean', showInCard: true }),
  def({
    key: 'seatInstallation',
    label: 'Установка',
    type: 'enum',
    options: [
      { value: 'forward', label: 'По ходу движения' },
      { value: 'rearward', label: 'Против хода' },
      { value: 'both', label: 'В обе стороны' },
    ],
  }),
  // Аккумуляторы
  def({
    key: 'batteryVoltage',
    label: 'Напряжение',
    type: 'enum',
    options: [
      { value: '6', label: '6 В' },
      { value: '12', label: '12 В' },
      { value: '24', label: '24 В' },
    ],
  }),
  def({
    key: 'batteryCapacity',
    label: 'Ёмкость',
    type: 'number',
    unit: 'А·ч',
    min: 1,
    max: 400,
    showInCard: true,
  }),
  def({
    key: 'batteryCurrent',
    label: 'Пусковой ток',
    type: 'number',
    unit: 'А',
    min: 20,
    max: 2000,
    showInCard: true,
  }),
  def({
    key: 'batteryPolarity',
    label: 'Полярность',
    type: 'enum',
    options: [
      { value: 'reverse', label: 'Обратная (−/+)', aliases: ['обратная', 'обратка'] },
      { value: 'direct', label: 'Прямая (+/−)', aliases: ['прямая', 'прямка'] },
    ],
    showInCard: true,
  }),
  def({
    key: 'batteryChemistry',
    label: 'Тип аккумулятора',
    type: 'enum',
    options: [
      { value: 'lead_acid', label: 'Свинцово-кислотный' },
      { value: 'calcium', label: 'Кальциевый' },
      { value: 'efb', label: 'EFB' },
      { value: 'agm', label: 'AGM' },
      { value: 'gel', label: 'Гелевый' },
      { value: 'lithium', label: 'Литиевый' },
    ],
  }),
  def({ key: 'batterySize', label: 'Размеры, мм', type: 'string', searchable: false }),
  // Автохимия
  def({
    key: 'volumeLiters',
    label: 'Объём',
    type: 'number',
    unit: 'л',
    min: 0.1,
    max: 1000,
    scale: 10,
  }),
  // Прицепы
  def({ key: 'axles', label: 'Осей', type: 'number', min: 1, max: 6 }),
  // Климатическая техника
  def({
    key: 'serviceArea',
    label: 'Площадь помещения',
    type: 'number',
    unit: 'м²',
    min: 5,
    max: 500,
  }),
  def({ key: 'inverter', label: 'Инвертор', type: 'boolean' }),
  def({
    key: 'tireType',
    label: 'Что продаётся',
    type: 'enum',
    options: [
      { value: 'tires', label: 'Шины' },
      { value: 'rims', label: 'Диски' },
      { value: 'wheels', label: 'Колёса в сборе' },
      { value: 'hubcaps', label: 'Колпаки' },
      { value: 'wheel_accessories', label: 'Аксессуары для колёс' },
    ],
    showInCard: true,
  }),
  def({
    key: 'season',
    label: 'Сезон',
    type: 'enum',
    options: [
      { value: 'summer', label: 'Летние' },
      { value: 'winter', label: 'Зимние' },
      { value: 'winter_studded', label: 'Зимние шипованные' },
      { value: 'all_season', label: 'Всесезонные' },
    ],
    visibleWhen: { key: 'tireType', values: ['tires', 'wheels'] },
    showInCard: true,
  }),
  def({
    key: 'diameter',
    label: 'Диаметр',
    type: 'number',
    unit: 'R',
    min: 10,
    max: 30,
    filter: 'multiselect',
    options: [
      { value: '13', label: 'R13' },
      { value: '14', label: 'R14' },
      { value: '15', label: 'R15' },
      { value: '16', label: 'R16' },
      { value: '17', label: 'R17' },
      { value: '18', label: 'R18' },
      { value: '19', label: 'R19' },
      { value: '20', label: 'R20' },
      { value: '21', label: 'R21' },
      { value: '22', label: 'R22' },
    ],
    showInCard: true,
  }),
  def({
    key: 'tireWidth',
    label: 'Ширина',
    type: 'number',
    unit: 'мм',
    min: 100,
    max: 500,
    visibleWhen: { key: 'tireType', values: ['tires', 'wheels'] },
  }),
  def({
    key: 'tireProfile',
    label: 'Профиль',
    type: 'number',
    unit: '%',
    min: 20,
    max: 100,
    visibleWhen: { key: 'tireType', values: ['tires', 'wheels'] },
  }),
  // Шины: индексы нагрузки и скорости (шипы — сезон «Зимние шипованные»)
  def({
    key: 'loadIndex',
    label: 'Индекс нагрузки',
    type: 'number',
    min: 50,
    max: 170,
    visibleWhen: { key: 'tireType', values: ['tires', 'wheels'] },
  }),
  def({
    key: 'speedIndex',
    label: 'Индекс скорости',
    type: 'enum',
    options: ['J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'H', 'V', 'W', 'Y'].map(
      (value) => ({
        value: value.toLowerCase(),
        label: value,
      }),
    ),
    visibleWhen: { key: 'tireType', values: ['tires', 'wheels'] },
  }),
  // Диски: ширина обода, сверловка, вылет, центральное отверстие, материал
  def({
    key: 'rimWidth',
    label: 'Ширина диска',
    type: 'number',
    unit: 'J',
    min: 3,
    max: 15,
    scale: 10,
    visibleWhen: { key: 'tireType', values: ['rims', 'wheels'] },
  }),
  def({
    key: 'pcd',
    label: 'Сверловка (PCD)',
    type: 'enum',
    filter: 'multiselect',
    options: [
      '4x98',
      '4x100',
      '4x108',
      '4x114.3',
      '5x100',
      '5x108',
      '5x110',
      '5x112',
      '5x114.3',
      '5x120',
      '5x127',
      '5x130',
      '5x139.7',
      '5x150',
      '6x114.3',
      '6x139.7',
    ].map((value) => ({ value: value.replace('.', '_'), label: value })),
    visibleWhen: { key: 'tireType', values: ['rims', 'wheels'] },
  }),
  def({
    key: 'rimEt',
    label: 'Вылет (ET)',
    type: 'number',
    min: -60,
    max: 80,
    visibleWhen: { key: 'tireType', values: ['rims', 'wheels'] },
  }),
  def({
    key: 'rimDia',
    label: 'Центральное отверстие (DIA)',
    type: 'number',
    unit: 'мм',
    min: 50,
    max: 170,
    scale: 10,
    visibleWhen: { key: 'tireType', values: ['rims', 'wheels'] },
  }),
  def({
    key: 'rimMaterial',
    label: 'Тип диска',
    type: 'enum',
    options: [
      { value: 'cast', label: 'Литой', aliases: ['литые', 'литьё', 'литье'] },
      { value: 'stamped', label: 'Штампованный', aliases: ['штамповка', 'штампы'] },
      { value: 'forged', label: 'Кованый', aliases: ['кованые', 'ковка'] },
    ],
    visibleWhen: { key: 'tireType', values: ['rims', 'wheels'] },
  }),
  def({
    key: 'quantity',
    label: 'Количество',
    type: 'number',
    unit: 'шт',
    min: 1,
    max: 1000,
    showInCard: true,
  }),

  // ── Работа и услуги ────────────────────────────────────────────────────────
  def({
    key: 'employment',
    label: 'Занятость',
    type: 'enum',
    options: [
      { value: 'full', label: 'Полная', cardLabel: 'Полная занятость' },
      { value: 'part', label: 'Частичная', cardLabel: 'Частичная занятость' },
      { value: 'shift', label: 'Вахта' },
      { value: 'temporary', label: 'Подработка' },
      { value: 'internship', label: 'Стажировка' },
    ],
    showInCard: true,
  }),
  def({
    key: 'schedule',
    label: 'График',
    type: 'enum',
    options: [
      { value: 'five_two', label: '5/2' },
      { value: 'two_two', label: '2/2' },
      { value: 'free', label: 'Свободный', cardLabel: 'Свободный график' },
      { value: 'remote', label: 'Удалённо' },
    ],
    showInCard: true,
  }),
  def({
    key: 'experience',
    label: 'Опыт работы',
    type: 'enum',
    options: [
      { value: 'none', label: 'Не требуется', cardLabel: 'Без опыта' },
      { value: 'year', label: 'От года', cardLabel: 'Опыт от года' },
      { value: 'three', label: 'От трёх лет', cardLabel: 'Опыт от 3 лет' },
    ],
    showInCard: true,
  }),
  def({ key: 'remote', label: 'Удалённая работа', type: 'boolean', showInCard: true }),
  def({
    key: 'registration',
    label: 'Оформление',
    type: 'enum',
    options: [
      { value: 'labor_code', label: 'По трудовой книжке' },
      { value: 'contract', label: 'По договору' },
      { value: 'self_employed', label: 'Самозанятость' },
      { value: 'none', label: 'Без оформления' },
    ],
  }),
  def({
    key: 'experienceYears',
    label: 'Опыт',
    type: 'number',
    unit: 'лет',
    min: 0,
    max: 60,
    showInCard: true,
  }),
  def({
    key: 'serviceFormat',
    label: 'Как оказывается',
    type: 'enum',
    options: [
      { value: 'visit', label: 'Выезд к заказчику' },
      { value: 'office', label: 'У себя' },
      { value: 'remote', label: 'Удалённо' },
    ],
    showInCard: true,
  }),
  def({
    key: 'performer',
    label: 'Кто оказывает',
    type: 'enum',
    options: [
      { value: 'private', label: 'Частное лицо' },
      { value: 'specialist', label: 'Специалист' },
      { value: 'company', label: 'Компания' },
    ],
    showInCard: true,
  }),
  def({ key: 'urgent', label: 'Срочный выезд', type: 'boolean' }),
  def({
    key: 'repairType',
    label: 'Что ремонтируете',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'apartment', label: 'Квартиры под ключ' },
      { value: 'finishing', label: 'Отделка, штукатурка, плитка' },
      { value: 'electrics', label: 'Электрика' },
      { value: 'plumbing', label: 'Сантехника' },
      { value: 'appliances', label: 'Бытовая техника' },
      { value: 'furniture', label: 'Мебель' },
      { value: 'windows_doors', label: 'Окна, двери' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'buildingWork',
    label: 'Вид работ',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'house', label: 'Дома под ключ' },
      { value: 'foundation', label: 'Фундамент, кладка' },
      { value: 'roofing', label: 'Кровля' },
      { value: 'facade', label: 'Фасад, утепление' },
      { value: 'welding', label: 'Сварка, металл' },
      { value: 'landscaping', label: 'Благоустройство' },
      { value: 'demolition', label: 'Демонтаж' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'autoService',
    label: 'Услуга',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'repair', label: 'Ремонт, ТО' },
      { value: 'diagnostics', label: 'Диагностика' },
      { value: 'tire', label: 'Шиномонтаж' },
      { value: 'body', label: 'Кузовной ремонт' },
      { value: 'detailing', label: 'Мойка, детейлинг' },
      { value: 'tow', label: 'Эвакуатор' },
      { value: 'selection', label: 'Подбор авто' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'beautyService',
    label: 'Услуга',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'hair', label: 'Парикмахер' },
      { value: 'nails', label: 'Маникюр, педикюр' },
      { value: 'brows', label: 'Брови, ресницы' },
      { value: 'makeup', label: 'Макияж' },
      { value: 'massage', label: 'Массаж' },
      { value: 'cosmetology', label: 'Косметология' },
      { value: 'barber', label: 'Барбер' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'photoService',
    label: 'Съёмка',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'wedding', label: 'Свадьбы' },
      { value: 'portrait', label: 'Портрет, семейная' },
      { value: 'event', label: 'Мероприятия' },
      { value: 'video', label: 'Видео' },
      { value: 'drone', label: 'С дрона' },
      { value: 'product', label: 'Предметная' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'deliveryType',
    label: 'Что доставляете',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'courier', label: 'Курьер по городу' },
      { value: 'food', label: 'Еда' },
      { value: 'cargo', label: 'Грузы' },
      { value: 'intercity', label: 'Межгород' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'movingType',
    label: 'Услуга',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'moving', label: 'Переезд' },
      { value: 'cargo_taxi', label: 'Грузовое такси' },
      { value: 'loaders', label: 'Грузчики' },
      { value: 'intercity', label: 'Межгород' },
      { value: 'passenger', label: 'Пассажирские' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'cleaningType',
    label: 'Уборка',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'apartment', label: 'Квартиры, дома' },
      { value: 'after_repair', label: 'После ремонта' },
      { value: 'windows', label: 'Окна' },
      { value: 'office', label: 'Офисы' },
      { value: 'carpet', label: 'Химчистка мебели, ковров' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'subject',
    label: 'Предмет',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'math', label: 'Математика' },
      { value: 'russian', label: 'Русский язык' },
      { value: 'english', label: 'Английский' },
      { value: 'languages', label: 'Другие языки' },
      { value: 'physics', label: 'Физика' },
      { value: 'chemistry', label: 'Химия' },
      { value: 'biology', label: 'Биология' },
      { value: 'history', label: 'История, обществознание' },
      { value: 'informatics', label: 'Информатика' },
      { value: 'primary', label: 'Начальная школа' },
      { value: 'music', label: 'Музыка' },
      { value: 'quran', label: 'Коран, арабский' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'grade',
    label: 'Для кого',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'preschool', label: 'Дошкольники' },
      { value: 'primary', label: '1–4 класс' },
      { value: 'middle', label: '5–9 класс' },
      { value: 'high', label: '10–11 класс, ЕГЭ' },
      { value: 'students', label: 'Студенты' },
      { value: 'adults', label: 'Взрослые' },
    ],
  }),
  def({
    key: 'itService',
    label: 'Услуга',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'pc_repair', label: 'Ремонт компьютеров' },
      { value: 'phone_repair', label: 'Ремонт телефонов' },
      { value: 'website', label: 'Сайты' },
      { value: 'software', label: 'Программирование' },
      { value: 'networks', label: 'Сети, видеонаблюдение' },
      { value: 'marketing', label: 'Реклама, соцсети' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'designType',
    label: 'Дизайн',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'interior', label: 'Интерьер' },
      { value: 'graphic', label: 'Графика, логотипы' },
      { value: 'web', label: 'Сайты, приложения' },
      { value: 'landscape', label: 'Ландшафт' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'legalService',
    label: 'Услуга',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'consultation', label: 'Консультации' },
      { value: 'documents', label: 'Документы, договоры' },
      { value: 'court', label: 'Суды' },
      { value: 'registration', label: 'Регистрация бизнеса' },
      { value: 'realty', label: 'Сделки с недвижимостью' },
      { value: 'accounting', label: 'Бухгалтерия' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'eventType',
    label: 'Мероприятие',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'wedding', label: 'Свадьбы' },
      { value: 'kids', label: 'Детские праздники' },
      { value: 'corporate', label: 'Корпоративы' },
      { value: 'music', label: 'Музыканты, ведущие' },
      { value: 'decor', label: 'Оформление, декор' },
      { value: 'catering', label: 'Кейтеринг' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'sphere',
    label: 'Сфера',
    type: 'enum',
    options: [
      { value: 'sales', label: 'Продажи, торговля' },
      { value: 'driver', label: 'Водители, логистика' },
      { value: 'food', label: 'Общепит' },
      { value: 'building', label: 'Строительство' },
      { value: 'production', label: 'Производство, рабочие' },
      { value: 'admin', label: 'Офис, администрирование' },
      { value: 'medicine', label: 'Медицина' },
      { value: 'education', label: 'Образование' },
      { value: 'it', label: 'IT, интернет' },
      { value: 'beauty', label: 'Красота, фитнес' },
      { value: 'security', label: 'Охрана' },
      { value: 'cleaning', label: 'Уборка, домашний персонал' },
      { value: 'delivery', label: 'Курьеры' },
      { value: 'agro', label: 'Сельское хозяйство' },
      { value: 'tourism', label: 'Туризм, гостиницы' },
      { value: 'finance', label: 'Финансы, юристы' },
      { value: 'other', label: 'Другое' },
    ],
  }),
  def({
    key: 'education',
    label: 'Образование',
    type: 'enum',
    options: [
      { value: 'secondary', label: 'Среднее' },
      { value: 'vocational', label: 'Среднее специальное' },
      { value: 'higher', label: 'Высшее' },
      { value: 'student', label: 'Студент' },
    ],
  }),

  // ── Электроника ────────────────────────────────────────────────────────────
  def({
    key: 'memory',
    label: 'Память',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: '64', label: '64 ГБ' },
      { value: '128', label: '128 ГБ' },
      { value: '256', label: '256 ГБ' },
      { value: '512', label: '512 ГБ' },
      { value: '1024', label: '1 ТБ' },
    ],
    showInCard: true,
  }),
  def({
    key: 'battery',
    label: 'Ёмкость аккумулятора',
    type: 'number',
    unit: '%',
    min: 1,
    max: 100,
    showInCard: true,
  }),
  def({
    key: 'faceId',
    label: 'Face ID работает',
    type: 'boolean',
    visibleWhen: { key: 'brand', values: ['apple'] },
  }),
  def({
    key: 'screenSize',
    label: 'Диагональ',
    type: 'number',
    unit: '″',
    min: 1,
    max: 200,
    scale: 10,
    showInCard: true,
  }),
  def({ key: 'cellular', label: 'С поддержкой SIM', type: 'boolean' }),
  def({ key: 'cpu', label: 'Процессор', type: 'string' }),
  def({ key: 'gpu', label: 'Видеокарта', type: 'string' }),
  def({
    key: 'storageSize',
    label: 'Объём накопителя',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: '128', label: '128 ГБ' },
      { value: '256', label: '256 ГБ' },
      { value: '512', label: '512 ГБ' },
      { value: '1024', label: '1 ТБ' },
      { value: '2048', label: '2 ТБ и больше' },
    ],
    showInCard: true,
  }),
  def({
    key: 'os',
    label: 'Система',
    type: 'enum',
    options: [
      { value: 'windows', label: 'Windows' },
      { value: 'macos', label: 'macOS' },
      { value: 'linux', label: 'Linux' },
      { value: 'chromeos', label: 'ChromeOS' },
      { value: 'none', label: 'Без системы' },
    ],
  }),
  def({
    key: 'componentType',
    label: 'Тип',
    type: 'enum',
    options: [
      { value: 'cpu', label: 'Процессор' },
      { value: 'gpu', label: 'Видеокарта' },
      { value: 'ram', label: 'Оперативная память' },
      { value: 'motherboard', label: 'Материнская плата' },
      { value: 'storage', label: 'Накопитель' },
      { value: 'psu', label: 'Блок питания' },
      { value: 'case', label: 'Корпус' },
      { value: 'cooling', label: 'Охлаждение' },
      { value: 'monitor', label: 'Монитор' },
      { value: 'peripherals', label: 'Клавиатуры, мыши' },
      { value: 'network', label: 'Сетевое оборудование' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'resolution',
    label: 'Разрешение',
    type: 'enum',
    options: [
      { value: 'hd', label: 'HD' },
      { value: 'fullhd', label: 'Full HD' },
      { value: '4k', label: '4K' },
      { value: '8k', label: '8K' },
    ],
    showInCard: true,
  }),
  def({ key: 'smartTv', label: 'Smart TV', type: 'boolean' }),
  def({
    key: 'photoType',
    label: 'Тип',
    type: 'enum',
    options: [
      { value: 'camera', label: 'Фотоаппарат' },
      { value: 'lens', label: 'Объектив' },
      { value: 'action', label: 'Экшн-камера' },
      { value: 'drone', label: 'Дрон' },
      { value: 'video', label: 'Видеокамера' },
      { value: 'lighting', label: 'Свет, штативы' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'consoleType',
    label: 'Приставка',
    type: 'enum',
    options: [
      { value: 'ps5', label: 'PlayStation 5' },
      { value: 'ps4', label: 'PlayStation 4' },
      { value: 'xbox_series', label: 'Xbox Series' },
      { value: 'xbox_one', label: 'Xbox One' },
      { value: 'switch', label: 'Nintendo Switch' },
      { value: 'steam_deck', label: 'Steam Deck' },
      { value: 'retro', label: 'Ретро' },
      { value: 'games', label: 'Игры и аксессуары' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'audioType',
    label: 'Тип',
    type: 'enum',
    options: [
      { value: 'headphones', label: 'Наушники' },
      { value: 'speakers', label: 'Колонки' },
      { value: 'home_theater', label: 'Домашний кинотеатр' },
      { value: 'hifi', label: 'Hi-Fi, усилители' },
      { value: 'car_audio', label: 'Автозвук' },
      { value: 'microphones', label: 'Микрофоны' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({ key: 'wireless', label: 'Беспроводные', type: 'boolean' }),
  def({
    key: 'applianceType',
    label: 'Тип техники',
    type: 'enum',
    options: [
      { value: 'fridge', label: 'Холодильник' },
      { value: 'washer', label: 'Стиральная машина' },
      { value: 'dishwasher', label: 'Посудомоечная машина' },
      { value: 'stove', label: 'Плита, духовка' },
      { value: 'microwave', label: 'Микроволновка' },
      { value: 'vacuum', label: 'Пылесос' },
      { value: 'climate', label: 'Кондиционер, обогреватель' },
      { value: 'water_heater', label: 'Водонагреватель' },
      { value: 'kitchen_small', label: 'Мелкая кухонная' },
      { value: 'sewing', label: 'Швейная машина' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'accessoryType',
    label: 'Тип',
    type: 'enum',
    // Чехлы, защитные стёкла и зарядки — свои направления у телефонов
    // (переезд объявлений — CATEGORY_RELOCATIONS)
    options: [
      { value: 'holder', label: 'Держатель, подставка' },
      { value: 'memory_card', label: 'Карта памяти, флешка' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'ram',
    label: 'Оперативная память',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: '4', label: '4 ГБ' },
      { value: '8', label: '8 ГБ' },
      { value: '16', label: '16 ГБ' },
      { value: '32', label: '32 ГБ' },
      { value: '64', label: '64 ГБ и больше' },
    ],
    showInCard: true,
  }),
  def({
    key: 'storage',
    label: 'Накопитель',
    type: 'enum',
    options: [
      { value: 'hdd', label: 'HDD' },
      { value: 'ssd', label: 'SSD' },
      { value: 'both', label: 'SSD + HDD' },
    ],
  }),

  // ── Вещи ───────────────────────────────────────────────────────────────────
  def({
    key: 'size',
    label: 'Размер',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'xs', label: 'XS' },
      { value: 's', label: 'S' },
      { value: 'm', label: 'M' },
      { value: 'l', label: 'L' },
      { value: 'xl', label: 'XL' },
      { value: 'xxl', label: 'XXL' },
      { value: 'xxxl', label: '3XL и больше' },
    ],
    showInCard: true,
  }),
  def({
    key: 'shoeSize',
    label: 'Размер',
    type: 'number',
    min: 16,
    max: 50,
    scale: 10,
    filter: 'multiselect',
    // Половинные размеры — обычное дело в обуви, поэтому хранится в десятых
    options: Array.from({ length: 13 }, (_, index) => {
      const size = 35 + index;
      return { value: String(size), label: String(size) };
    }),
    showInCard: true,
  }),
  def({
    key: 'gender',
    label: 'Кому',
    type: 'enum',
    options: [
      { value: 'male', label: 'Мужское' },
      { value: 'female', label: 'Женское' },
      { value: 'kids', label: 'Детское' },
      { value: 'unisex', label: 'Унисекс' },
    ],
    showInCard: true,
  }),
  def({
    key: 'clothesType',
    label: 'Что это',
    type: 'enum',
    options: [
      { value: 'outerwear', label: 'Верхняя одежда' },
      { value: 'dresses', label: 'Платья, юбки' },
      { value: 'suits', label: 'Костюмы, пиджаки' },
      { value: 'tops', label: 'Футболки, рубашки, свитера' },
      { value: 'pants', label: 'Брюки, джинсы' },
      { value: 'sportswear', label: 'Спортивная одежда' },
      { value: 'underwear', label: 'Бельё, домашняя' },
      { value: 'headwear', label: 'Головные уборы' },
      { value: 'national', label: 'Национальная одежда' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'kidsAge',
    label: 'Возраст',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: '0_1', label: 'До года' },
      { value: '1_3', label: '1–3 года' },
      { value: '3_7', label: '3–7 лет' },
      { value: '7_12', label: '7–12 лет' },
      { value: '12_plus', label: 'Старше 12' },
    ],
    showInCard: true,
  }),
  def({
    key: 'kidsGoodsType',
    label: 'Что это',
    type: 'enum',
    options: [
      { value: 'stroller', label: 'Коляска' },
      { value: 'car_seat', label: 'Автокресло' },
      { value: 'crib', label: 'Кроватка, манеж' },
      { value: 'toys', label: 'Игрушки' },
      { value: 'feeding', label: 'Кормление' },
      { value: 'bath', label: 'Купание, уход' },
      { value: 'school', label: 'Школьное' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'jewelryType',
    label: 'Что это',
    type: 'enum',
    options: [
      { value: 'ring', label: 'Кольцо' },
      { value: 'earrings', label: 'Серьги' },
      { value: 'necklace', label: 'Цепочка, кулон' },
      { value: 'bracelet', label: 'Браслет' },
      { value: 'set', label: 'Комплект' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'jewelryMaterial',
    label: 'Материал',
    type: 'enum',
    options: [
      { value: 'gold', label: 'Золото' },
      { value: 'silver', label: 'Серебро' },
      { value: 'platinum', label: 'Платина' },
      { value: 'bijouterie', label: 'Бижутерия' },
    ],
    showInCard: true,
  }),
  def({
    key: 'furnitureType',
    label: 'Что это',
    type: 'enum',
    options: [
      { value: 'sofa', label: 'Диван, кресло' },
      { value: 'bed', label: 'Кровать, матрас' },
      { value: 'wardrobe', label: 'Шкаф, комод' },
      { value: 'table', label: 'Стол' },
      { value: 'chairs', label: 'Стулья' },
      { value: 'kitchen', label: 'Кухонный гарнитур' },
      { value: 'shelves', label: 'Полки, стеллажи' },
      { value: 'office', label: 'Офисная' },
      { value: 'kids', label: 'Детская' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'lightType',
    label: 'Что это',
    type: 'enum',
    options: [
      { value: 'chandelier', label: 'Люстра' },
      { value: 'lamp', label: 'Настольная лампа' },
      { value: 'floor_lamp', label: 'Торшер' },
      { value: 'wall', label: 'Бра, споты' },
      { value: 'led', label: 'Лента, LED' },
      { value: 'outdoor', label: 'Уличное' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'materialType',
    label: 'Что это',
    type: 'enum',
    options: [
      { value: 'lumber', label: 'Пиломатериалы' },
      { value: 'brick_block', label: 'Кирпич, блоки' },
      { value: 'cement', label: 'Цемент, смеси' },
      { value: 'metal', label: 'Металлопрокат' },
      { value: 'roofing', label: 'Кровля' },
      { value: 'insulation', label: 'Утеплитель' },
      { value: 'tiles', label: 'Плитка, керамогранит' },
      { value: 'paint', label: 'Краски, лаки' },
      { value: 'drywall', label: 'Гипсокартон, панели' },
      { value: 'flooring', label: 'Напольные покрытия' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'toolType',
    label: 'Что это',
    type: 'enum',
    options: [
      { value: 'power', label: 'Электроинструмент' },
      { value: 'hand', label: 'Ручной' },
      { value: 'measuring', label: 'Измерительный' },
      { value: 'welding', label: 'Сварочный' },
      { value: 'garden', label: 'Садовый' },
      { value: 'pneumatic', label: 'Пневматический' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'plumbingType',
    label: 'Что это',
    type: 'enum',
    options: [
      { value: 'bath', label: 'Ванна' },
      { value: 'shower', label: 'Душевая' },
      { value: 'sink', label: 'Раковина, мойка' },
      { value: 'toilet', label: 'Унитаз' },
      { value: 'faucet', label: 'Смеситель' },
      { value: 'heater', label: 'Водонагреватель, котёл' },
      { value: 'pipes', label: 'Трубы, фитинги' },
      { value: 'radiator', label: 'Радиаторы' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'doorsType',
    label: 'Что это',
    type: 'enum',
    options: [
      { value: 'entrance_door', label: 'Входная дверь' },
      { value: 'interior_door', label: 'Межкомнатная дверь' },
      { value: 'window', label: 'Окно' },
      { value: 'balcony', label: 'Балконный блок' },
      { value: 'gate', label: 'Ворота, калитка' },
      { value: 'fittings', label: 'Фурнитура' },
    ],
    showInCard: true,
  }),
  def({
    key: 'material',
    label: 'Материал',
    type: 'enum',
    options: [
      { value: 'wood', label: 'Дерево' },
      { value: 'metal', label: 'Металл' },
      { value: 'pvc', label: 'ПВХ' },
      { value: 'aluminium', label: 'Алюминий' },
      { value: 'glass', label: 'Стекло' },
      { value: 'mdf', label: 'МДФ' },
      { value: 'other', label: 'Другой' },
    ],
  }),
  def({
    key: 'sportType',
    label: 'Вид спорта',
    type: 'enum',
    options: [
      { value: 'fitness', label: 'Фитнес, тренажёры' },
      { value: 'martial', label: 'Единоборства' },
      { value: 'football', label: 'Футбол, игровые' },
      { value: 'swimming', label: 'Плавание' },
      { value: 'winter', label: 'Зимние' },
      { value: 'cycling', label: 'Велоспорт' },
      { value: 'tourism', label: 'Туризм' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'bikeType',
    label: 'Тип',
    type: 'enum',
    options: [
      { value: 'mountain', label: 'Горный' },
      { value: 'road', label: 'Шоссейный' },
      { value: 'city', label: 'Городской' },
      { value: 'kids', label: 'Детский' },
      { value: 'electric', label: 'Электровелосипед' },
      { value: 'scooter', label: 'Самокат, электросамокат' },
      { value: 'bmx', label: 'BMX, трюковой' },
      { value: 'folding', label: 'Складной' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'wheelDiameter',
    label: 'Диаметр колёс',
    type: 'enum',
    filter: 'multiselect',
    options: ['12', '14', '16', '18', '20', '24', '26', '27.5', '28', '29'].map((value) => ({
      value: value.replace('.', '_'),
      label: `${value}″`,
    })),
  }),
  def({
    key: 'instrumentType',
    label: 'Инструмент',
    type: 'enum',
    options: [
      { value: 'guitar', label: 'Гитара' },
      { value: 'piano', label: 'Пианино, синтезатор' },
      { value: 'drums', label: 'Ударные' },
      { value: 'wind', label: 'Духовые' },
      { value: 'strings', label: 'Струнные' },
      { value: 'folk', label: 'Народные' },
      { value: 'dj', label: 'DJ, студийное' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'gamesType',
    label: 'Что это',
    type: 'enum',
    options: [
      { value: 'board', label: 'Настольные игры' },
      { value: 'puzzles', label: 'Пазлы, головоломки' },
      { value: 'video_games', label: 'Видеоигры' },
      { value: 'collectible', label: 'Коллекционные' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({ key: 'author', label: 'Автор', type: 'string', showInCard: true }),
  def({
    key: 'businessSphere',
    label: 'Сфера',
    type: 'enum',
    options: [
      { value: 'retail', label: 'Торговля' },
      { value: 'food', label: 'Общепит' },
      { value: 'services', label: 'Услуги' },
      { value: 'beauty', label: 'Красота, здоровье' },
      { value: 'production', label: 'Производство' },
      { value: 'auto', label: 'Авто' },
      { value: 'online', label: 'Интернет' },
      { value: 'realty', label: 'Недвижимость, аренда' },
      { value: 'agro', label: 'Сельское хозяйство' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
  def({
    key: 'monthlyRevenue',
    label: 'Оборот в месяц',
    type: 'number',
    unit: '₽',
    min: 0,
    max: 1_000_000_000,
  }),
  def({
    key: 'staffCount',
    label: 'Сотрудников',
    type: 'number',
    min: 0,
    max: 10_000,
    showInCard: true,
    shortLabel: 'сотр.',
  }),
  def({
    key: 'premises',
    label: 'Помещение',
    type: 'enum',
    options: [
      { value: 'own', label: 'В собственности' },
      { value: 'rent', label: 'В аренде' },
      { value: 'none', label: 'Без помещения' },
    ],
  }),
  def({
    key: 'equipmentType',
    label: 'Что это',
    type: 'enum',
    options: [
      { value: 'trade', label: 'Торговое' },
      { value: 'food', label: 'Для общепита' },
      { value: 'production', label: 'Производственное' },
      { value: 'packaging', label: 'Упаковочное' },
      { value: 'medical', label: 'Медицинское' },
      { value: 'beauty', label: 'Для салонов' },
      { value: 'office', label: 'Офисное' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),

  // ── Животные ───────────────────────────────────────────────────────────────
  def({ key: 'breed', label: 'Порода', type: 'string', showInCard: true }),
  def({
    key: 'animalAge',
    label: 'Возраст',
    type: 'enum',
    filter: 'multiselect',
    options: [
      { value: 'under_3m', label: 'До 3 месяцев' },
      { value: '3_12m', label: '3–12 месяцев' },
      { value: '1_7y', label: '1–7 лет' },
      { value: '7y_plus', label: 'Старше 7 лет' },
    ],
    showInCard: true,
  }),
  def({
    key: 'sex',
    label: 'Пол',
    type: 'enum',
    options: [
      { value: 'male', label: 'Мальчик' },
      { value: 'female', label: 'Девочка' },
    ],
    showInCard: true,
  }),
  def({ key: 'vaccinated', label: 'Привит', type: 'boolean' }),
  def({ key: 'sterilized', label: 'Стерилизован', type: 'boolean' }),
  def({ key: 'documents', label: 'С документами', type: 'boolean' }),
  def({
    key: 'livestockKind',
    label: 'Кто это',
    type: 'enum',
    options: [
      { value: 'cattle', label: 'Коровы, быки' },
      { value: 'sheep', label: 'Овцы, бараны' },
      { value: 'goats', label: 'Козы' },
      { value: 'horses', label: 'Лошади' },
      { value: 'poultry', label: 'Птица' },
      { value: 'bees', label: 'Пчёлы' },
      { value: 'rabbits', label: 'Кролики' },
      { value: 'other', label: 'Другое' },
    ],
    showInCard: true,
  }),
];

/** Все определения по ключу. */
export const ATTRIBUTE_DEFINITIONS: Readonly<Record<string, AttributeDefinition>> =
  Object.fromEntries(DEFINITIONS.map((item) => [item.key, item]));

export const ATTRIBUTE_DEFINITION_LIST: readonly AttributeDefinition[] = DEFINITIONS;

/**
 * Поля, которые есть только в фильтре запчастей: совместимость и номер
 * хранятся отдельным слоем, а не в атрибутах объявления. Форма подачи их не
 * показывает (у неё свой редактор совместимости и номеров), сервер при записи
 * атрибутов их пропускает, а фильтр читает через слой.
 */
export const FILTER_ONLY_ATTRIBUTES: ReadonlySet<string> = new Set([
  'compatBrand',
  'compatModel',
  'compatBrandText',
  'compatModelText',
  'compatYear',
  'compatChassis',
  'compatEngine',
  'compatModification',
  'partNumber',
]);

// ─────────────────────────────────────────────────────────────────────────────
//  Сборка полей категории
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Поля категории из привязок и определений. Привязка на несуществующий ключ
 * пропускается, а не роняет: справочник правится из панели, и одно неверное
 * нажатие не должно ломать форму подачи у всех.
 */
export function resolveAttributes(
  bindings: readonly CategoryAttributeBinding[],
  definitions: Readonly<Record<string, AttributeDefinition>> = ATTRIBUTE_DEFINITIONS,
): ListingAttribute[] {
  const result: ListingAttribute[] = [];

  for (const binding of bindings) {
    const definition = definitions[binding.key];
    if (!definition) continue;

    result.push({
      ...definition,
      required: binding.required ?? false,
      ...(binding.label ? { label: binding.label } : {}),
      ...(binding.dictionary ? { dictionary: binding.dictionary } : {}),
      ...(binding.min !== undefined ? { min: binding.min } : {}),
      ...(binding.max !== undefined ? { max: binding.max } : {}),
    });
  }

  return result;
}

/**
 * Объединение полей нескольких категорий: нужно, когда выбран раздел, а не
 * подкатегория. В «Недвижимости» лежат квартиры, дома и участки со своими
 * наборами; фильтр «2 комнаты» обязан работать и на уровне раздела.
 *
 * Поле с одним ключом в разных наборах описано одинаково (площадь — везде
 * площадь), поэтому первое вхождение и побеждает; обязательность на уровне
 * раздела не имеет смысла и сбрасывается.
 */
export function mergeAttributeLists(
  lists: readonly (readonly ListingAttribute[])[],
): ListingAttribute[] {
  const byKey = new Map<string, ListingAttribute>();

  for (const list of lists) {
    for (const attribute of list) {
      if (!byKey.has(attribute.key)) byKey.set(attribute.key, { ...attribute, required: false });
    }
  }

  return [...byKey.values()];
}

/**
 * Показывать ли поле при текущих значениях остальных: у поля без условия —
 * всегда, с условием — когда родитель принял одно из перечисленных значений.
 */
export function isAttributeVisible(
  attribute: AttributeDefinition,
  values: Readonly<Record<string, unknown>>,
): boolean {
  if (!attribute.visibleWhen) return true;
  const allowed = attribute.visibleWhen.values;
  const parent = values[attribute.visibleWhen.key];
  const matches = (item: unknown): boolean =>
    (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') &&
    allowed.includes(String(item));
  return Array.isArray(parent) ? parent.some(matches) : matches(parent);
}

/** Поля, которые хранятся в колонках таблицы. */
export function columnAttributes(attributes: readonly ListingAttribute[]): ListingAttribute[] {
  return attributes.filter((attribute) => Boolean(attribute.column));
}

/** Поля, которые хранятся в `attributes` и таблице значений. */
export function jsonAttributes(attributes: readonly ListingAttribute[]): ListingAttribute[] {
  return attributes.filter((attribute) => !attribute.column);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Подписи
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Человеческое название значения: «auto» → «Автомат», 68000 → «68 000 км».
 * Для полей со справочником (марка, модель) подпись знает только сервер —
 * он подставляет её через `dictionaryLabels`; без него показывается само
 * значение.
 */
export function attributeValueLabel(
  attribute: AttributeDefinition,
  value: unknown,
  dictionaryLabels?: Readonly<Record<string, string>>,
): string {
  if (attribute.type === 'boolean') return value ? 'Да' : 'Нет';

  if (Array.isArray(value)) {
    return value.map((item) => attributeValueLabel(attribute, item, dictionaryLabels)).join(', ');
  }

  const text = plainText(value);

  if (attribute.options) {
    const option = attribute.options.find((item) => item.value === text);
    if (option) return option.label;
  }

  if ((attribute.type === 'brand' || attribute.type === 'model') && dictionaryLabels) {
    const label = dictionaryLabels[text];
    if (label) return label;
  }

  if (attribute.type === 'number' && typeof value === 'number') {
    const real = attribute.scale ? value / attribute.scale : value;
    if (!Number.isInteger(real)) {
      const formatted = real.toFixed(1).replace('.', ',');
      return attribute.unit ? `${formatted} ${attribute.unit}` : formatted;
    }
    // Разделитель тысяч — только у величин с единицей измерения: «68 000 км»
    // читается, а год «2 021» выглядит опечаткой
    const formatted = attribute.unit ? real.toLocaleString('ru-RU') : String(real);
    return attribute.unit ? `${formatted} ${attribute.unit}` : formatted;
  }

  return text;
}

/** Значение характеристики строкой. Объекты сюда попасть не должны —
 *  схема их отбрасывает, — но печатать «[object Object]» всё равно нельзя. */
function plainText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/**
 * У значения есть собственное название вместо числа: 0 комнат — это
 * «Студия», и приписывать к ней «комн.» незачем. А вот «2» — это просто
 * число, и без «комн.» оно ничего не значит.
 */
function hasOwnName(attribute: AttributeDefinition, value: unknown): boolean {
  const text = plainText(value);
  const option = attribute.options?.find((item) => item.value === text);
  return Boolean(option && option.label !== text);
}

/**
 * Строка характеристик под заголовком карточки: «2 комн. · 54,5 м² · 3/9 эт.».
 * Чистая функция — одинаково работает в списке, в карточке и в тесте.
 */
/**
 * Значение одного поля коротким текстом для карточки: «54 м²», «Автомат»,
 * «3/9 эт.». Пусто, если показывать нечего.
 */
export function describeAttribute(
  attribute: ListingAttribute,
  values: Record<string, unknown>,
  dictionaryLabels?: Readonly<Record<string, string>>,
): string | null {
  const value = values[attribute.key];
  if (value === null || value === undefined || value === '') return null;

  // Этаж читается только вместе с этажностью: «3/9 эт.», а не «3» и «9»
  // в разных концах строки
  if (attribute.key === 'floor') {
    const floor = plainText(value);
    const floors = plainText(values.floorsTotal);
    return floors ? `${floor}/${floors} эт.` : `${floor} эт.`;
  }
  // Выключенный флажок в строке характеристик не нужен: «Балкон: нет» —
  // это не то, ради чего человек читает карточку
  if (attribute.type === 'boolean') return value ? attribute.label : null;

  const cardLabel = attribute.options?.find((option) => option.value === value)?.cardLabel;
  if (cardLabel) return cardLabel;

  const text = attributeValueLabel(attribute, value, dictionaryLabels);
  if (!text) return null;
  const withUnit = attribute.shortLabel && !hasOwnName(attribute, value);
  return withUnit ? `${text} ${attribute.shortLabel}` : text;
}

export function describeAttributes(
  attributes: readonly ListingAttribute[],
  values: Record<string, unknown>,
  dictionaryLabels?: Readonly<Record<string, string>>,
): string {
  const parts: string[] = [];

  for (const attribute of attributes) {
    if (!attribute.showInCard) continue;
    const text = describeAttribute(attribute, values, dictionaryLabels);
    if (text) parts.push(text);
  }

  return parts.join(' · ');
}
