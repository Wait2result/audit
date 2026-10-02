/**
 * Категории на витрине доставки (Этап 6).
 *
 * Сам список живёт в базе и меняется из панели: плитки — это про то, как
 * владелец хочет показать город сегодня, а не про устройство программы.
 * Здесь остались только начальные значения, которыми заполняется база при
 * первом запуске, и правила, общие для сервера и панели.
 *
 * Категория не хранит список своих заведений. Она подбирает их по словам
 * кухонь и виду заведения: иначе при добавлении каждой плитки пришлось бы
 * вручную переприсваивать сотни заведений, а заведение, сменившее кухню,
 * выпадало бы из категории молча.
 */
import type { PlaceType } from './places.js';

export interface SeedPlaceCategory {
  slug: string;
  name: string;
  cuisines: readonly string[];
  types: readonly PlaceType[];
}

/**
 * Начальные категории. Порядок здесь задаёт порядок плиток.
 *
 * Намеренно крупные: «Напитки» отдельной плиткой нет, а «Гриль» не разбит
 * на шашлык, люля и кебаб. Двадцать узких плиток человек не читает, он их
 * пролистывает мимо.
 */
export const SEED_PLACE_CATEGORIES: readonly SeedPlaceCategory[] = [
  {
    slug: 'traditional',
    name: 'Традиционная',
    // Чуду, хинкал и курзе — это она и есть, отдельных плиток им не нужно
    cuisines: [
      'дагестанск',
      'кавказск',
      'национальн',
      'хинкал',
      'чуду',
      'курзе',
      'ботишал',
      'урбеч',
    ],
    types: [],
  },
  {
    slug: 'grill',
    name: 'Гриль',
    cuisines: ['гриль', 'шашлык', 'мангал', 'кебаб', 'люля', 'барбекю', 'стейк'],
    types: [],
  },
  { slug: 'pizza', name: 'Пицца', cuisines: ['пицца', 'итальянск'], types: [] },
  { slug: 'sushi', name: 'Суши', cuisines: ['суши', 'ролл', 'японск', 'азиатск'], types: [] },
  {
    slug: 'shawarma',
    name: 'Шаурма',
    cuisines: ['шаурма', 'шаверма', 'донер', 'лаваш'],
    types: [],
  },
  {
    slug: 'burgers',
    name: 'Бургеры',
    cuisines: ['бургер', 'фастфуд', 'хот-дог', 'картофель фри'],
    types: ['fast_food'],
  },
  {
    slug: 'bakery',
    name: 'Выпечка и десерты',
    cuisines: ['выпечк', 'пекарн', 'десерт', 'кондитерск', 'сладост', 'торт', 'кофейн'],
    types: ['bakery'],
  },
  {
    slug: 'grocery',
    name: 'Продукты',
    cuisines: ['продукт', 'бакале', 'овощ', 'мясн', 'молочн'],
    types: ['shop', 'supermarket'],
  },
] as const;

/**
 * Подходит ли заведение под категорию.
 *
 * Сравнение по вхождению и в нижнем регистре: кухни заполняют руками, и
 * «Дагестанская кухня» должна попадать в категорию со словом «дагестанск».
 * Та же функция используется сервером в запросе и панелью в предпросмотре —
 * расходиться им нельзя.
 */
export function placeMatchesCategory(
  place: { cuisines: readonly string[]; type: PlaceType },
  category: { cuisines: readonly string[]; types: readonly PlaceType[] },
): boolean {
  if (category.types.includes(place.type)) return true;

  const haystack = place.cuisines.map((cuisine) => cuisine.toLowerCase());

  return category.cuisines.some((word) =>
    haystack.some((cuisine) => cuisine.includes(word.toLowerCase())),
  );
}

/** Допустимый код категории: латиница, цифры и дефис. */
export const CATEGORY_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
