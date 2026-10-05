/**
 * Таксономия запчастей: группа («Рулевое управление») → деталь («Рулевая
 * рейка»). Для каждого типа техники своя, но записывается одним компактным
 * форматом, чтобы списки читались и правились без боли.
 *
 *   # код_группы | Название группы | синоним; синоним
 *   код_детали | Название детали | синоним; синоним
 *
 * Название тоже считается синонимом — повторять его не нужно. Деталь
 * относится к группе, под которой записана. Код детали уникален внутри типа
 * техники; один и тот же синоним у двух деталей одного типа техники — ошибка
 * (проверяет тест), у разных типов техники — нормально: «насос» есть и у
 * стиральной машины, и у спецтехники, и тогда поиск спросит, о чём речь.
 */

export interface PartItemSeed {
  code: string;
  label: string;
  aliases: readonly string[];
  group: string;
}

export interface PartGroupSeed {
  code: string;
  label: string;
  aliases: readonly string[];
  items: readonly PartItemSeed[];
}

const split = (value: string | undefined): string[] =>
  (value ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);

/** Разбор записи таксономии (формат — в шапке файла). */
export function parseTaxonomy(text: string): PartGroupSeed[] {
  const groups: { code: string; label: string; aliases: string[]; items: PartItemSeed[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const isGroup = line.startsWith('#');
    const [code, label, aliases] = (isGroup ? line.slice(1) : line).split('|').map((s) => s.trim());
    if (!code || !label) throw new Error(`Строка таксономии без кода или названия: «${line}»`);
    if (isGroup) {
      groups.push({ code, label, aliases: split(aliases), items: [] });
      continue;
    }
    const group = groups[groups.length - 1];
    if (!group) throw new Error(`Деталь «${code}» записана раньше любой группы`);
    group.items.push({ code, label, aliases: split(aliases), group: group.code });
  }
  return groups;
}
