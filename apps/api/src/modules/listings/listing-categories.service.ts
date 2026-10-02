import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  ListingPriceUnit,
  mergeAttributeLists,
  resolveAttributes,
  type AttributeDefinition,
  type CategoryAttributeBinding,
  type CategoryShortcut,
  type DictionaryLookup,
  type ListingAttribute,
  type ListingCardLayout,
  type ListingCategoryAdminDto,
  type ListingCategoryDto,
  type ListingDictionaryEntryDto,
  type ListingRentPeriod,
  type ListingTransactionType,
  type MediaDto,
  type PriceRules,
} from '@dagestan/shared';

import { AppException } from '../../common/errors/app.exception.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';

/** Категория в том виде, в каком она нужна и дереву, и фильтрам, и подаче. */
export interface CategoryRecord {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  itemLabel: string | null;
  imageMediaId: string | null;
  iconKey: string | null;
  allowedTransactions: ListingTransactionType[];
  defaultTransaction: ListingTransactionType | null;
  defaultRentPeriod: ListingRentPeriod | null;
  allowedPriceUnits: ListingPriceUnit[];
  defaultPriceUnit: ListingPriceUnit;
  cardLayout: ListingCardLayout;
  shortcut: CategoryShortcut | null;
  deprecatedToId: string | null;
  isLeaf: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface DictionaryRecord {
  value: string;
  label: string;
  parentValue: string;
  /** Другие написания для поиска: «тойота», «тайота» */
  aliases: readonly string[];
}

/**
 * Справочник объявлений целиком: категории, поля, справочники значений.
 *
 * Один снимок на запрос: сервис отдаёт его, а дальше все вопросы — «какие
 * поля у категории», «есть ли такая марка», «какие единицы цены» —
 * отвечаются синхронно, без похода в базу на каждую карточку.
 */
export class ListingCatalogue {
  private readonly bySlug = new Map<string, CategoryRecord>();
  private readonly byId = new Map<string, CategoryRecord>();

  constructor(
    readonly categories: readonly CategoryRecord[],
    private readonly attributesByCategory: ReadonlyMap<string, readonly ListingAttribute[]>,
    private readonly dictionaries: ReadonlyMap<string, readonly DictionaryRecord[]>,
  ) {
    for (const row of categories) {
      this.bySlug.set(row.slug, row);
      this.byId.set(row.id, row);
    }
  }

  /**
   * Категория по коду. Выключенная или неизвестная — ошибка запроса, а не
   * «покажем всё»: молча снятый фильтр выдаёт человеку чужую категорию.
   */
  requireBySlug(slug: string): CategoryRecord {
    const row = this.bySlug.get(slug);
    if (!row || !row.isActive) {
      throw AppException.badRequest('Категория не найдена', ErrorCode.LISTING_CATEGORY_NOT_FOUND);
    }
    return row;
  }

  findBySlug(slug: string): CategoryRecord | null {
    return this.bySlug.get(slug) ?? null;
  }

  findById(id: string): CategoryRecord | null {
    return this.byId.get(id) ?? null;
  }

  requireById(id: string): CategoryRecord {
    const row = this.byId.get(id);
    if (!row) {
      throw AppException.notFound('Категория не найдена', ErrorCode.LISTING_CATEGORY_NOT_FOUND);
    }
    return row;
  }

  /**
   * Категория и все её подкатегории. Объявления лежат только в листьях,
   * поэтому фильтр по разделу — это фильтр по списку его подкатегорий.
   */
  subtreeIds(categoryId: string): string[] {
    const result = [categoryId];

    // Дерево двухуровневое, но обход написан общим: третий уровень однажды
    // появится, и тихо сломавшийся фильтр найти будет трудно
    let frontier = [categoryId];
    while (frontier.length > 0) {
      const children = this.categories
        .filter((row) => row.parentId !== null && frontier.includes(row.parentId))
        .map((row) => row.id);
      result.push(...children);
      frontier = children;
    }

    return result;
  }

  /** Поля категории: определение плюс обязательность и подписи. */
  attributesOf(categoryId: string): readonly ListingAttribute[] {
    return this.attributesByCategory.get(categoryId) ?? [];
  }

  /**
   * Поля, по которым можно фильтровать внутри поддерева. Когда выбран
   * раздел, а не подкатегория, своего набора у него нет — берётся
   * объединение наборов подкатегорий.
   */
  attributesForSubtree(categoryIds: readonly string[]): readonly ListingAttribute[] {
    return mergeAttributeLists(categoryIds.map((id) => this.attributesOf(id)));
  }

  priceRules(category: CategoryRecord): PriceRules {
    return {
      allowedPriceUnits: category.allowedPriceUnits,
      defaultPriceUnit: category.defaultPriceUnit,
    };
  }

  dictionaryEntries(kind: string, parent?: string): readonly DictionaryRecord[] {
    const entries = this.dictionaries.get(kind) ?? [];
    if (parent === undefined) return entries;
    return entries.filter((entry) => entry.parentValue === parent);
  }

  /** Есть ли у справочника записи под этим родителем. */
  hasDictionaryEntries(kind: string, parent: string): boolean {
    return this.dictionaryEntries(kind, parent).length > 0;
  }

  /** Проверка значения по справочнику — для схемы характеристик. */
  readonly lookup: DictionaryLookup = (kind, value, parent) => {
    const entries = this.dictionaries.get(kind);
    if (!entries) return true;
    return entries.some((entry) => entry.value === value && entry.parentValue === (parent ?? ''));
  };

  dictionaryLabel(kind: string, value: string, parent?: string): string | null {
    const entries = this.dictionaries.get(kind) ?? [];
    const found = entries.find(
      (entry) => entry.value === value && (parent === undefined || entry.parentValue === parent),
    );
    return found?.label ?? null;
  }

  /**
   * Подписи значений из справочников для конкретного объявления:
   * { brand: 'Toyota', model: 'Camry' }. Значения без справочника
   * пропускаются — их подпись знает само определение (options).
   */
  labelsFor(
    attributes: readonly ListingAttribute[],
    values: Record<string, unknown>,
  ): Record<string, string> {
    const labels: Record<string, string> = {};

    for (const attribute of attributes) {
      if (!attribute.dictionary) continue;
      const value = values[attribute.key];
      if (typeof value !== 'string') continue;

      const parent =
        attribute.parentKey && typeof values[attribute.parentKey] === 'string'
          ? (values[attribute.parentKey] as string)
          : undefined;

      const label = this.dictionaryLabel(attribute.dictionary, value, parent);
      if (label) labels[value] = label;
    }

    return labels;
  }

  /**
   * Другие написания выбранных значений — в поисковый текст объявления:
   * «тойота» и «камри» должны находить Toyota Camry.
   */
  aliasesFor(attributes: readonly ListingAttribute[], values: Record<string, unknown>): string[] {
    const words: string[] = [];

    for (const attribute of attributes) {
      if (!attribute.dictionary) continue;
      const value = values[attribute.key];
      if (typeof value !== 'string') continue;

      const parent =
        attribute.parentKey && typeof values[attribute.parentKey] === 'string'
          ? (values[attribute.parentKey] as string)
          : undefined;

      const entry = (this.dictionaries.get(attribute.dictionary) ?? []).find(
        (item) => item.value === value && (parent === undefined || item.parentValue === parent),
      );
      if (entry) words.push(...entry.aliases);
    }

    return words;
  }
}

/**
 * Справочник объявлений держится в памяти минуту.
 *
 * Он нужен в каждом запросе ленты — чтобы по коду категории получить её
 * саму, все подкатегории и поля, — а меняется раз в месяц, когда владелец
 * правит справочник из панели. Ходить за ним в базу на каждый показ списка
 * незачем.
 */
const CACHE_TTL_MS = 60_000;

@Injectable()
export class ListingCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  private cache: { catalogue: ListingCatalogue; loadedAt: number } | null = null;

  /** Сбрасывает кеш: вызывается после любой правки справочника из панели. */
  invalidate(): void {
    this.cache = null;
  }

  async catalogue(): Promise<ListingCatalogue> {
    const fresh = this.cache && Date.now() - this.cache.loadedAt < CACHE_TTL_MS;
    if (this.cache && fresh) return this.cache.catalogue;

    const catalogue = await loadCatalogue(this.prisma);
    this.cache = { catalogue, loadedAt: Date.now() };
    return catalogue;
  }

  /** Категория по коду или ошибка запроса. */
  async findBySlug(slug: string): Promise<CategoryRecord> {
    return (await this.catalogue()).requireBySlug(slug);
  }

  async findById(id: string): Promise<CategoryRecord> {
    return (await this.catalogue()).requireById(id);
  }

  /** Записи справочника для приложения: модели выбранной марки и т. п. */
  async dictionary(kind: string, parent?: string): Promise<ListingDictionaryEntryDto[]> {
    const catalogue = await this.catalogue();
    return catalogue.dictionaryEntries(kind, parent).map((entry) => ({
      value: entry.value,
      label: entry.label,
      parent: entry.parentValue || null,
      aliases: [...entry.aliases],
    }));
  }

  /** Дерево для приложения: только включённые категории. */
  async tree(withAttributes: boolean): Promise<ListingCategoryDto[]> {
    const catalogue = await this.catalogue();
    const rows = catalogue.categories.filter((row) => row.isActive);
    const images = await this.imageMap(rows.map((row) => row.imageMediaId));

    const toDto = (row: CategoryRecord): ListingCategoryDto => ({
      ...this.baseDto(row, images, catalogue),
      // Поля категории приходят только по запросу: на главной они не нужны,
      // а весят больше, чем само дерево. Марки подставляются из справочника
      ...(withAttributes ? { attributes: this.withDictionaryOptions(row, catalogue) } : {}),
      children: rows.filter((child) => child.parentId === row.id).map(toDto),
    });

    return rows.filter((row) => row.parentId === null).map(toDto);
  }

  /** Дерево для панели: со скрытыми категориями и числом объявлений. */
  async adminTree(): Promise<ListingCategoryAdminDto[]> {
    const catalogue = await this.catalogue();
    const rows = catalogue.categories;
    const images = await this.imageMap(rows.map((row) => row.imageMediaId));

    const counts = await this.prisma.listing.groupBy({
      by: ['categoryId'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const countByCategory = new Map(counts.map((row) => [row.categoryId, row._count._all]));

    const toDto = (row: CategoryRecord): ListingCategoryAdminDto => ({
      ...this.baseDto(row, images, catalogue),
      attributeKeys: catalogue.attributesOf(row.id).map((attribute) => attribute.key),
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      listingsCount: countByCategory.get(row.id) ?? 0,
      children: rows.filter((child) => child.parentId === row.id).map(toDto),
    });

    return rows.filter((row) => row.parentId === null).map(toDto);
  }

  private baseDto(
    row: CategoryRecord,
    images: Map<string, MediaDto>,
    catalogue: ListingCatalogue,
  ): Omit<ListingCategoryDto, 'children' | 'attributes'> {
    const deprecatedTo = row.deprecatedToId ? catalogue.findById(row.deprecatedToId) : null;

    return {
      id: row.id,
      parentId: row.parentId,
      slug: row.slug,
      name: row.name,
      itemLabel: row.itemLabel,
      image: images.get(row.imageMediaId ?? '') ?? null,
      iconKey: row.iconKey,
      defaultPriceUnit: row.defaultPriceUnit,
      priceUnits: row.allowedPriceUnits,
      transactions: row.allowedTransactions,
      defaultTransaction: row.defaultTransaction,
      defaultRentPeriod: row.defaultRentPeriod,
      cardLayout: row.cardLayout,
      shortcut: row.shortcut,
      deprecatedToSlug: deprecatedTo?.slug ?? null,
      isLeaf: row.isLeaf,
    };
  }

  /**
   * Поля категории с вариантами марок из справочника: приложению незачем
   * ходить за марками отдельно, их полсотни. Модели — отдельным запросом по
   * выбранной марке, их сотни.
   */
  private withDictionaryOptions(
    row: CategoryRecord,
    catalogue: ListingCatalogue,
  ): readonly ListingAttribute[] {
    return catalogue.attributesOf(row.id).map((attribute) => {
      if (attribute.type !== 'brand' || !attribute.dictionary) return attribute;
      return {
        ...attribute,
        options: catalogue
          .dictionaryEntries(attribute.dictionary, '')
          .map((entry) => ({ value: entry.value, label: entry.label, aliases: entry.aliases })),
      };
    });
  }

  /** Картинки плиток одним запросом: иначе дерево из полусотни узлов даст полсотни. */
  private async imageMap(ids: (string | null)[]): Promise<Map<string, MediaDto>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const media = await this.media.findByIds(unique);
    return new Map(media.map((item) => [item.id, item]));
  }
}

/** Клиент базы, достаточный для чтения справочника: полный или из скрипта. */
export type CatalogueReader = Pick<
  PrismaClient,
  | 'listingCategory'
  | 'listingAttributeDefinition'
  | 'listingCategoryAttribute'
  | 'listingDictionaryEntry'
>;

/**
 * Загрузка справочника из базы. Отдельной функцией, а не методом сервиса:
 * скрипты миграции и демо-данных работают без Nest, а справочник им нужен
 * тот же самый.
 */
export async function loadCatalogue(prisma: CatalogueReader): Promise<ListingCatalogue> {
  {
    const [categoryRows, definitionRows, bindingRows, dictionaryRows] = await Promise.all([
      prisma.listingCategory.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.listingAttributeDefinition.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.listingCategoryAttribute.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.listingDictionaryEntry.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      }),
    ]);

    const definitions: Record<string, AttributeDefinition> = {};
    for (const row of definitionRows) {
      definitions[row.key] = {
        key: row.key,
        label: row.label,
        type: row.type as AttributeDefinition['type'],
        ...(row.shortLabel ? { shortLabel: row.shortLabel } : {}),
        ...(row.unit ? { unit: row.unit } : {}),
        ...(row.min !== null ? { min: row.min } : {}),
        ...(row.max !== null ? { max: row.max } : {}),
        ...(row.scale !== null ? { scale: row.scale } : {}),
        ...(row.options
          ? { options: row.options as unknown as AttributeDefinition['options'] }
          : {}),
        ...(row.dictionaryKind ? { dictionary: row.dictionaryKind } : {}),
        ...(row.parentKey ? { parentKey: row.parentKey } : {}),
        ...(row.column ? { column: row.column as AttributeDefinition['column'] } : {}),
        ...(row.visibleWhen
          ? { visibleWhen: row.visibleWhen as unknown as AttributeDefinition['visibleWhen'] }
          : {}),
        filter: row.filter as AttributeDefinition['filter'],
        searchable: row.searchable,
        filterable: row.filterable,
        sortable: row.sortable,
        showInCard: row.showInCard,
        showInDetails: row.showInDetails,
      };
    }

    const bindingsByCategory = new Map<string, CategoryAttributeBinding[]>();
    for (const row of bindingRows) {
      const list = bindingsByCategory.get(row.categoryId) ?? [];
      list.push({
        key: row.attributeKey,
        required: row.required,
        ...(row.label ? { label: row.label } : {}),
        ...(row.dictionaryKind ? { dictionary: row.dictionaryKind } : {}),
        ...(row.min !== null ? { min: row.min } : {}),
        ...(row.max !== null ? { max: row.max } : {}),
      });
      bindingsByCategory.set(row.categoryId, list);
    }

    const attributesByCategory = new Map<string, readonly ListingAttribute[]>();
    for (const [categoryId, bindings] of bindingsByCategory) {
      attributesByCategory.set(categoryId, resolveAttributes(bindings, definitions));
    }

    const dictionaries = new Map<string, DictionaryRecord[]>();
    for (const row of dictionaryRows) {
      const list = dictionaries.get(row.kind) ?? [];
      list.push({
        value: row.value,
        label: row.label,
        parentValue: row.parentValue,
        aliases: row.aliases,
      });
      dictionaries.set(row.kind, list);
    }

    const categories: CategoryRecord[] = categoryRows.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      slug: row.slug,
      name: row.name,
      itemLabel: row.itemLabel,
      imageMediaId: row.imageMediaId,
      iconKey: row.iconKey,
      allowedTransactions: row.allowedTransactions as ListingTransactionType[],
      defaultTransaction: row.defaultTransaction,
      defaultRentPeriod: row.defaultRentPeriod,
      allowedPriceUnits:
        row.allowedPriceUnits.length > 0
          ? (row.allowedPriceUnits as ListingPriceUnit[])
          : [ListingPriceUnit.TOTAL],
      defaultPriceUnit: row.defaultPriceUnit,
      cardLayout: row.cardLayout,
      shortcut: (row.shortcutFilter as CategoryShortcut | null) ?? null,
      deprecatedToId: row.deprecatedToId,
      isLeaf: row.isLeaf,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    }));

    return new ListingCatalogue(categories, attributesByCategory, dictionaries);
  }
}
