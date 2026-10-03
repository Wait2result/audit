import {
  LISTING_SORT_LABELS,
  PRICE_UNIT_LABELS,
  RENT_PERIOD_LABELS,
  allowedPriceUnits,
  operationLabels,
  rentPeriodChoices,
  cardFactKeys,
  groupFilterFields,
  isAttributeVisible,
  plural,
  type ListingAttribute,
  type ListingCategoryDto,
  type ListingPriceUnit,
  type ListingRentPeriod,
  type ListingTransactionType,
  withAttributeValue,
} from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  useDictionary,
  useListingCategories,
  useListingCount,
  type ListingFilters,
} from '../../src/api/queries';
import { Button } from '../../src/components/Button';
import { FilterChip } from '../../src/components/FilterChip';
import { FormHeader } from '../../src/components/FormHeader';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { SearchableSelect } from '../../src/components/SearchableSelect';
import { TextField } from '../../src/components/TextField';
import { useDebouncedValue } from '../../src/hooks/use-debounced-value';
import { useListingArea } from '../../src/hooks/use-listing-area';
import { useCityStore } from '../../src/store/city-store';
import {
  useListingFilterStore,
  type ExtraListingFilters,
} from '../../src/store/listing-filter-store';
import { spacing, typography, useThemeColors } from '../../src/theme';

/**
 * Фильтры каталога объявлений (Этап 7).
 *
 * Поля строятся из описания категории, пришедшего с сервера: у квартиры
 * появляются комнаты и площадь, у машины — год и коробка. Отдельного экрана
 * фильтров под каждую категорию не существует и не должно: список полей —
 * данные, а не код.
 *
 * Выбранное возвращается через стор, а не через параметры адреса: expo-router
 * не умеет отдавать значение с закрытого экрана, а складывать вложенные
 * характеристики в строку и разбирать её руками — лишний источник ошибок.
 */
const EMPTY_FILTERS: ExtraListingFilters = {};

export default function ListingFiltersScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  // q — текст поиска, с которым открыли экран: число на кнопке должно
  // считаться с ним, иначе оно разойдётся с тем, что человек увидит
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const cityId = useCityStore((s) => s.cityId);
  const area = useListingArea();

  const categories = useListingCategories();
  const roots = useMemo(() => categories.data ?? [], [categories.data]);
  // Фильтры хранятся по категории: у автомобилей свои, у телефонов свои
  const scope = params.category ?? '';
  const saved = useListingFilterStore((s) => s.byScope[scope] ?? EMPTY_FILTERS);
  const apply = useListingFilterStore((s) => s.set);
  const resetStore = useListingFilterStore((s) => s.reset);

  // Категория выбирается здесь же: раздел, затем подкатегория. Открыли с
  // подкатегорией — выбраны обе; с разделом — только он; без категории —
  // общие фильтры, и ничего лишнего на экране нет
  const [categorySlug, setCategorySlug] = useState<string | undefined>(params.category);
  const currentRoot = useMemo(
    () =>
      roots.find(
        (root) =>
          root.slug === categorySlug || root.children.some((child) => child.slug === categorySlug),
      ) ?? null,
    [roots, categorySlug],
  );
  // Ярлыки («Посуточная аренда») — готовые фильтры, а не категории: в выборе их нет
  const subOptions = useMemo(
    () =>
      (currentRoot?.children ?? [])
        .filter((child) => !child.shortcut)
        .map((child) => ({ value: child.slug, label: child.name })),
    [currentRoot],
  );
  const rootOptions = useMemo(
    () => roots.map((root) => ({ value: root.slug, label: root.name })),
    [roots],
  );
  const currentSub = subOptions.find((option) => option.value === categorySlug)?.value;

  const [priceFrom, setPriceFrom] = useState(saved.priceFrom ? String(saved.priceFrom) : '');
  const [priceTo, setPriceTo] = useState(saved.priceTo ? String(saved.priceTo) : '');
  const [priceUnit, setPriceUnit] = useState<ListingPriceUnit | undefined>(saved.priceUnit);
  const [transactionType, setTransactionType] = useState(saved.transactionType);
  const [rentPeriod, setRentPeriod] = useState(saved.rentPeriod);
  const [onlyWithPhoto, setOnlyWithPhoto] = useState(Boolean(saved.onlyWithPhoto));
  const [attributes, setAttributes] = useState<Record<string, unknown>>(saved.attributes ?? {});
  const [sort, setSort] = useState<ListingFilters['sort']>(saved.sort);
  const [showExtra, setShowExtra] = useState(false);

  const fields = useMemo(() => filterFields(roots, categorySlug), [roots, categorySlug]);
  // Видимые поля раскладываем по блокам: главное сразу, остальное по кнопке
  const groups = useMemo(
    () =>
      groupFilterFields(
        fields.filter((field) => isAttributeVisible(field, attributes)),
        new Set(categorySlug ? cardFactKeys(categorySlug) : []),
      ),
    [fields, attributes, categorySlug],
  );
  // Сделки, которые бывают в выбранной категории (или во всех её подкатегориях)
  const transactions = useMemo(() => transactionsOf(roots, categorySlug), [roots, categorySlug]);
  // Срок аренды выбирается отдельно только там, где аренда — «посуточно или
  // надолго» (жильё). У техники и инструмента срок — единица цены (ниже)
  const periodChoices = useMemo(() => periodChoicesOf(roots, categorySlug), [roots, categorySlug]);
  // Единицы цены, между которыми есть выбор при этой сделке. У аренды
  // машины — только «в сутки», выбирать нечего; у услуг бывает «за всё» и
  // «за час», и цена «до 2 000» без единицы ничего не значит
  const priceUnits = useMemo(
    () => priceUnitsOf(roots, categorySlug, transactionType, rentPeriod),
    [roots, categorySlug, transactionType, rentPeriod],
  );
  // Без выбора: сутки — самая обычная единица аренды, а не первая в списке
  const activeUnit =
    priceUnit && priceUnits.includes(priceUnit)
      ? priceUnit
      : transactionType === 'rent' && priceUnits.includes('per_day')
        ? 'per_day'
        : priceUnits[0];

  /**
   * Сменить категорию. Цена, фото и порядок остаются — они общие. Из
   * характеристик, операции и срока остаётся то, что есть и у новой
   * категории («год» у автомобилей и у мотоциклов), остальное снимается:
   * «комнат: 2» не должно молча уйти с человеком в автомобили.
   */
  const changeCategory = (next: string | undefined) => {
    if (next === categorySlug) return;
    const nextFields = filterFields(roots, next);
    const previous = new Map(fields.map((field) => [field.key, field]));
    const upcoming = new Map(nextFields.map((field) => [field.key, field]));
    const nextTransactions = transactionsOf(roots, next);
    const nextPeriods = periodChoicesOf(roots, next);

    setCategorySlug(next);
    // Остаётся то, что есть и у новой категории и означает то же самое: марка
    // автомобиля и марка телефона — один ключ, но разные справочники, и
    // «Toyota» у мотоциклов давала бы пустую выдачу
    setAttributes((current) => {
      const kept = Object.entries(current).filter(([key]) => {
        const was = previous.get(key);
        const now = upcoming.get(key);
        return Boolean(now) && (!was || sameMeaning(was, now as ListingAttribute));
      });
      const keptKeys = new Set(kept.map(([key]) => key));
      // Модель без своей марки не живёт
      return Object.fromEntries(
        kept.filter(([key]) => {
          const parent = upcoming.get(key)?.parentKey;
          return !parent || keptKeys.has(parent);
        }),
      );
    });
    setTransactionType((current) =>
      current && nextTransactions.includes(current) ? current : undefined,
    );
    setRentPeriod((current) => (current && nextPeriods.includes(current) ? current : undefined));
    setPriceUnit(undefined);
    setShowExtra(false);
  };

  // Сменилась марка — модель прежней марки больше не подходит
  const setAttribute = (key: string, value: unknown) => {
    setAttributes((current) => withAttributeValue(fields, current, key, value));
  };

  // То, что человек выбрал на экране сейчас, ещё не сохранённое: по нему же
  // считается число на кнопке и оно же сохраняется по нажатию
  const filterDraft = useMemo<ExtraListingFilters>(
    () => ({
      ...(priceFrom ? { priceFrom: Number(priceFrom) } : {}),
      ...(priceTo ? { priceTo: Number(priceTo) } : {}),
      ...(transactionType ? { transactionType } : {}),
      ...(transactionType === 'rent' && rentPeriod ? { rentPeriod } : {}),
      // Единица нужна серверу только вместе с ценой; без неё он сравнил бы
      // «в сутки» с «в месяц»
      ...((priceFrom || priceTo) && activeUnit && priceUnits.length > 1
        ? { priceUnit: activeUnit }
        : {}),
      ...(onlyWithPhoto ? { onlyWithPhoto: true } : {}),
      ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    }),
    [
      priceFrom,
      priceTo,
      transactionType,
      rentPeriod,
      activeUnit,
      priceUnits,
      onlyWithPhoto,
      attributes,
    ],
  );

  // К условиям добавляется порядок выдачи — он только сохраняется, на счёт не влияет
  const draft = useMemo<ExtraListingFilters>(
    () => ({ ...filterDraft, ...(sort && sort !== 'recommended' ? { sort } : {}) }),
    [filterDraft, sort],
  );

  // Счёт: те же условия, что у выдачи (категория, текст, место) плюс черновик.
  // Задержка — чтобы не считать на каждую набранную цифру цены
  const countFilters = useMemo<ListingFilters>(
    () => ({
      ...(categorySlug ? { category: categorySlug } : {}),
      ...(params.q && params.q.length >= 2 ? { search: params.q } : {}),
      ...area.filters,
      ...filterDraft,
      // Сортировка по цене сравнивает цену в одной единице и сужает выдачу —
      // число на кнопке должно совпасть с тем, что человек увидит. Остальные
      // порядки состав выдачи не меняют
      ...(sort === 'price_asc' || sort === 'price_desc' ? { sort } : {}),
    }),
    [categorySlug, params.q, area.filters, filterDraft, sort],
  );
  const debouncedFilters = useDebouncedValue(countFilters, 400);
  const count = useListingCount(cityId, debouncedFilters, area.ready);
  const found = count.data;
  const settling = debouncedFilters !== countFilters || count.isFetching;

  // Экран открывается из выдачи; если открыт по ссылке — «назад» ведёт в
  // выдачу этой категории, а не в корень приложения
  const leave = () => {
    if (router.canGoBack()) router.back();
    else
      router.replace({
        pathname: '/listings/list',
        params: params.category ? { slug: params.category } : {},
      });
  };

  const save = () => {
    apply(categorySlug ?? '', draft);
    // Категорию сменили здесь — человек ждёт её выдачу, а не ту, откуда пришёл
    if (categorySlug !== params.category) {
      router.replace({
        pathname: '/listings/list',
        params: {
          ...(categorySlug ? { slug: categorySlug } : {}),
          ...(params.q ? { q: params.q } : {}),
        },
      });
      return;
    }
    leave();
  };

  const reset = () => {
    setPriceFrom('');
    setPriceTo('');
    setPriceUnit(undefined);
    setTransactionType(undefined);
    setRentPeriod(undefined);
    setOnlyWithPhoto(false);
    setAttributes({});
    setSort(undefined);
    resetStore(categorySlug ?? '');
  };

  const hasAny = Object.keys(draft).length > 0;
  const applyLabel =
    found === undefined
      ? 'Показать объявления'
      : found === 0
        ? 'Ничего не найдено'
        : `Показать ${found.toLocaleString('ru-RU')} ${plural(found, 'объявление', 'объявления', 'объявлений')}`;

  const footer = (
    <View style={styles.footerRow}>
      {hasAny && (
        <Button
          label="Сбросить"
          variant="secondary"
          fullWidth={false}
          singleLine
          onPress={reset}
          style={styles.footerReset}
        />
      )}
      <Button
        label={applyLabel}
        onPress={save}
        // Пока число пересчитывается, кнопка остаётся рабочей: прежнее число
        // чуть устарело, но «Показать» работает всегда, кроме явного нуля
        disabled={found === 0 && !settling}
        singleLine
        style={styles.footerApply}
        accessibilityLabel={applyLabel}
      />
    </View>
  );

  return (
    <Screen scroll footer={footer}>
      <FormHeader title="Фильтры" onBack={leave} />

      {/* Категория выбирается здесь же: от неё зависит весь набор ниже.
          Без выбора — общие фильтры; категория — общие для её подкатегорий;
          подкатегория добавляет свои. Просто два поля формы, без карточки */}
      <View style={styles.categoryBlock}>
        <SearchableSelect
          compact
          label="Категория"
          value={currentRoot?.slug}
          options={rootOptions}
          onChange={(next) => changeCategory(next)}
          placeholder="Все категории"
          clearLabel="Все категории"
          search={false}
        />
        {currentRoot && subOptions.length > 0 && (
          <SearchableSelect
            compact
            label="Подкатегория"
            value={currentSub}
            options={subOptions}
            onChange={(next) => changeCategory(next ?? currentRoot.slug)}
            placeholder={`Все категории в «${currentRoot.name}»`}
            clearLabel={`Все категории в «${currentRoot.name}»`}
            search={subOptions.length > 12}
          />
        )}
      </View>

      {transactions.length > 1 && (
        <FilterSection title="Операция">
          <View style={styles.chips}>
            {transactions.map((value) => (
              <FilterChip
                key={value}
                // «Снять» у жилья, «Арендовать» у техники и транспорта
                label={operationLabels(categorySlug, value).search}
                active={transactionType === value}
                onPress={() =>
                  setTransactionType((current) => (current === value ? undefined : value))
                }
              />
            ))}
          </View>
          {transactionType === 'rent' && periodChoices.length > 0 && (
            <View style={styles.chips}>
              {periodChoices.map((value) => (
                <FilterChip
                  key={value}
                  label={RENT_PERIOD_LABELS[value]}
                  active={rentPeriod === value}
                  onPress={() =>
                    setRentPeriod((current) => (current === value ? undefined : value))
                  }
                />
              ))}
            </View>
          )}
        </FilterSection>
      )}

      <FilterSection title={`Цена, ${activeUnit ? PRICE_UNIT_LABELS[activeUnit] : '₽'}`}>
        {priceUnits.length > 1 && (
          <View style={styles.chips}>
            {priceUnits.map((unit) => (
              <FilterChip
                key={unit}
                label={PRICE_UNIT_LABELS[unit]}
                active={activeUnit === unit}
                onPress={() => setPriceUnit(unit)}
              />
            ))}
          </View>
        )}
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField
              compact
              value={groupDigits(priceFrom)}
              onChangeText={(text) => setPriceFrom(onlyDigits(text))}
              placeholder="от"
              keyboardType="number-pad"
              accessibilityLabel={`Цена от, ${activeUnit ? PRICE_UNIT_LABELS[activeUnit] : '₽'}`}
            />
          </View>
          <View style={styles.half}>
            <TextField
              compact
              value={groupDigits(priceTo)}
              onChangeText={(text) => setPriceTo(onlyDigits(text))}
              placeholder="до"
              keyboardType="number-pad"
              accessibilityLabel={`Цена до, ${activeUnit ? PRICE_UNIT_LABELS[activeUnit] : '₽'}`}
            />
          </View>
        </View>
      </FilterSection>

      {groups.main.length > 0 && (
        <FilterSection title="Основные параметры">
          {groups.main.map((field) => (
            <AttributeFilter
              key={field.key}
              attribute={field}
              value={attributes[field.key]}
              parent={field.parentKey ? attributes[field.parentKey] : undefined}
              onChange={(value) => setAttribute(field.key, value)}
            />
          ))}
        </FilterSection>
      )}

      {groups.condition.length > 0 && (
        <FilterSection title="Состояние">
          {groups.condition.map((field) => (
            <AttributeFilter
              key={field.key}
              attribute={field}
              value={attributes[field.key]}
              onChange={(value) => setAttribute(field.key, value)}
              hideTitle
            />
          ))}
        </FilterSection>
      )}

      {groups.seller.length > 0 && (
        <FilterSection title="Продавец">
          {groups.seller.map((field) => (
            <AttributeFilter
              key={field.key}
              attribute={field}
              value={attributes[field.key]}
              onChange={(value) => setAttribute(field.key, value)}
              hideTitle
            />
          ))}
        </FilterSection>
      )}

      <FilterSection title="Местоположение">
        <Pressable
          onPress={() => router.push('/listings/location')}
          accessibilityRole="button"
          accessibilityLabel={`Где искать: ${area.summary}`}
          style={({ pressed }) => [styles.areaRow, pressed && styles.pressed]}
        >
          <Icon name="location" size={18} color={colors.primary} />
          <Text style={styles.areaText} numberOfLines={1}>
            {area.radiusKm === null ? 'Весь Дагестан' : `${area.label} · ${area.radiusKm} км`}
          </Text>
          <Icon name="chevron-right" size={16} color={colors.textFaint} />
        </Pressable>
      </FilterSection>

      <FilterSection title="Дополнительно">
        <SearchableSelect
          label="Сортировка"
          value={sort ?? 'recommended'}
          options={Object.entries(LISTING_SORT_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(next) => setSort(next as ListingFilters['sort'])}
          search={false}
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Только с фотографией</Text>
          <Switch
            value={onlyWithPhoto}
            onValueChange={setOnlyWithPhoto}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="Только с фотографией"
          />
        </View>

        {groups.extra.length > 0 && (
          <Pressable
            onPress={() => setShowExtra((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showExtra }}
            style={({ pressed }) => [styles.moreRow, pressed && styles.pressed]}
          >
            <Text style={styles.moreLabel}>
              {showExtra ? 'Скрыть параметры' : `Ещё параметры (${groups.extra.length})`}
            </Text>
            <View style={showExtra ? styles.flipped : undefined}>
              <Icon name="chevron-down" size={16} color={colors.primary} />
            </View>
          </Pressable>
        )}

        {showExtra &&
          groups.extra.map((field) => (
            <AttributeFilter
              key={field.key}
              attribute={field}
              value={attributes[field.key]}
              parent={field.parentKey ? attributes[field.parentKey] : undefined}
              onChange={(value) => setAttribute(field.key, value)}
            />
          ))}
      </FilterSection>
    </Screen>
  );
}

/**
 * Блок экрана фильтров: заголовок и поля под ним, отделённые от соседнего
 * тонкой линией. Без отдельной карточки на каждый блок: десяток карточек
 * друг под другом — это шум, а не форма.
 */
function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/** Одно поле фильтра: список вариантов, диапазон или переключатель. */
function AttributeFilter({
  attribute,
  value,
  parent,
  onChange,
  hideTitle = false,
}: {
  attribute: ListingAttribute;
  value: unknown;
  /** Значение поля-родителя: марка для модели */
  parent?: unknown;
  onChange: (value: unknown) => void;
  /** Название блока уже написано в заголовке секции («Состояние») */
  hideTitle?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Модель — по справочнику выбранной марки; без марки выбирать не из чего
  if (attribute.type === 'model' && attribute.dictionary) {
    return (
      <ModelFilter
        attribute={attribute}
        value={value}
        brand={typeof parent === 'string' ? parent : null}
        onChange={onChange}
      />
    );
  }

  // Длинный список одиночного выбора (марка — полсотни значений) — поиском,
  // как в форме подачи, а не стеной чипсов
  if (attribute.filter === 'select' && (attribute.options?.length ?? 0) > 8) {
    return (
      <View style={styles.block}>
        <SearchableSelect
          label={attribute.label}
          value={typeof value === 'string' ? value : undefined}
          options={attribute.options ?? []}
          onChange={(next) => onChange(next)}
          placeholder="Любая"
        />
      </View>
    );
  }

  // Текст («производитель», «порода», «процессор»): часть слова, а не точное
  // совпадение — «cam» найдёт «Camry». Перечисления сюда не попадают
  if (attribute.filter === 'text') {
    return (
      <View style={styles.block}>
        <Text style={styles.blockTitle}>{attribute.label}</Text>
        <TextField
          compact
          value={typeof value === 'string' ? value : ''}
          onChangeText={(text) => onChange(text.trim().length > 0 ? text : undefined)}
          placeholder="Часть названия"
          autoCapitalize="none"
          accessibilityLabel={attribute.label}
        />
      </View>
    );
  }

  if (attribute.filter === 'toggle') {
    return (
      <View style={[styles.block, styles.switchRow]}>
        <Text style={styles.blockTitle}>{attribute.label}</Text>
        <Switch
          value={Boolean(value)}
          onValueChange={(next) => onChange(next ? true : undefined)}
          trackColor={{ true: colors.primary, false: colors.border }}
          accessibilityLabel={attribute.label}
        />
      </View>
    );
  }

  if (attribute.filter === 'range') {
    const bounds = (value ?? {}) as { from?: number; to?: number };

    return (
      <View style={styles.block}>
        <Text style={styles.blockTitle}>
          {attribute.label}
          {attribute.unit ? `, ${attribute.unit}` : ''}
        </Text>
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField
              compact
              value={bounds.from === undefined ? '' : String(bounds.from)}
              onChangeText={(text) =>
                onChange(cleanBounds({ ...bounds, from: text ? Number(toDot(text)) : undefined }))
              }
              placeholder="от"
              keyboardType={attribute.scale ? 'decimal-pad' : 'number-pad'}
              accessibilityLabel={`${attribute.label} от`}
            />
          </View>
          <View style={styles.half}>
            <TextField
              compact
              value={bounds.to === undefined ? '' : String(bounds.to)}
              onChangeText={(text) =>
                onChange(cleanBounds({ ...bounds, to: text ? Number(toDot(text)) : undefined }))
              }
              placeholder="до"
              keyboardType={attribute.scale ? 'decimal-pad' : 'number-pad'}
              accessibilityLabel={`${attribute.label} до`}
            />
          </View>
        </View>
      </View>
    );
  }

  const options = attribute.options ?? [];
  if (options.length === 0) return null;

  const selected = Array.isArray(value) ? (value as unknown[]).map(String) : [];

  return (
    <View style={styles.block}>
      {!hideTitle && <Text style={styles.blockTitle}>{attribute.label}</Text>}
      <View style={styles.chips}>
        {options.map((option) => {
          const active =
            attribute.filter === 'multiselect'
              ? selected.includes(option.value)
              : optionKey(value) === option.value;

          return (
            <FilterChip
              key={option.value}
              label={option.label}
              active={active}
              onPress={() => {
                if (attribute.filter !== 'multiselect') {
                  onChange(active ? undefined : parseOption(attribute, option.value));
                  return;
                }

                const next = active
                  ? selected.filter((item) => item !== option.value)
                  : [...selected, option.value];
                onChange(
                  next.length > 0 ? next.map((item) => parseOption(attribute, item)) : undefined,
                );
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

/** Модель по выбранной марке: список из справочника марки. */
function ModelFilter({
  attribute,
  value,
  brand,
  onChange,
}: {
  attribute: ListingAttribute;
  value: unknown;
  brand: string | null;
  onChange: (value: unknown) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const models = useDictionary(brand ? attribute.dictionary : undefined, brand);

  if (!brand) {
    return (
      <View style={styles.block}>
        <Text style={styles.blockTitle}>{attribute.label}</Text>
        <Text style={styles.hint}>Сначала выберите марку</Text>
      </View>
    );
  }
  // У марки нет моделей в справочнике («Другая марка») — фильтр не нужен
  if (!models.data?.length) return null;

  return (
    <View style={styles.block}>
      <SearchableSelect
        label={attribute.label}
        value={typeof value === 'string' ? value : undefined}
        options={models.data}
        onChange={(next) => onChange(next)}
        placeholder="Любая"
      />
    </View>
  );
}

/**
 * Ключ выбранного значения строкой. Объектов здесь быть не должно — их
 * кладут только диапазоны, а у них другой вид фильтра.
 */
function optionKey(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Числовое поле («комнат: 2») уходит на сервер числом, а не строкой. */
function parseOption(attribute: ListingAttribute, value: string): string | number {
  return attribute.type === 'number' ? Number(value) : value;
}

/**
 * Запятая — привычный десятичный разделитель («54,5» м²), но `Number()` её
 * не понимает и вернёт NaN. Площадь — единственное дробное поле среди
 * диапазонных фильтров, и здесь та же ловушка, что и в форме подачи.
 */
function toDot(text: string): string {
  return text.replace(',', '.');
}

/** Пустой диапазон — это отсутствие фильтра, а не объект без границ. */
function cleanBounds(bounds: {
  from?: number;
  to?: number;
}): { from?: number; to?: number } | undefined {
  const from = Number.isFinite(bounds.from) ? bounds.from : undefined;
  const to = Number.isFinite(bounds.to) ? bounds.to : undefined;
  if (from === undefined && to === undefined) return undefined;
  return { ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) };
}

/**
 * Поля фильтра для выбранной категории. Категория не выбрана — общих полей
 * нет: показывать «коробку передач» рядом с квартирами незачем.
 *
 * Выбран раздел — поля собираются из всех его подкатегорий: в «Недвижимости»
 * лежат квартиры, дома и участки, и фильтр «комнат» должен работать на уровне
 * раздела тоже.
 */
function filterFields(
  roots: ListingCategoryDto[],
  slug: string | undefined,
): readonly ListingAttribute[] {
  if (!slug) return [];

  for (const root of roots) {
    if (root.slug === slug) {
      // На уровне раздела показываем только поля, общие хотя бы для двух его
      // подкатегорий. Иначе рядом оказываются «Назначение» участка и
      // «Назначение» коммерции — два разных фильтра с одинаковым названием.
      // Узкие поля появляются, когда выбрана подкатегория.
      const counts = new Map<string, number>();
      for (const child of root.children) {
        for (const field of child.attributes ?? []) {
          counts.set(field.key, (counts.get(field.key) ?? 0) + 1);
        }
      }

      const own = root.attributes ?? [];
      const shared = root.children
        .flatMap((child) => child.attributes ?? [])
        .filter((field) => (counts.get(field.key) ?? 0) > 1);

      return dedupe([...own, ...shared]).filter((field) => field.filter !== 'none');
    }

    const child = root.children.find((item) => item.slug === slug);
    if (child) return (child.attributes ?? []).filter((field) => field.filter !== 'none');
  }

  return [];
}

/**
 * Единицы цены категории при выбранной сделке: у раздела — объединение по
 * подкатегориям. Без категории единица одна — «за всё».
 */
function priceUnitsOf(
  roots: ListingCategoryDto[],
  slug: string | undefined,
  transactionType: ListingTransactionType | undefined,
  rentPeriod: ListingRentPeriod | undefined,
): ListingPriceUnit[] {
  if (!slug) return ['total'];

  const units = new Set<ListingPriceUnit>();
  const collect = (category: ListingCategoryDto) => {
    const rules = {
      allowedPriceUnits: category.priceUnits,
      defaultPriceUnit: category.defaultPriceUnit,
    };
    for (const unit of allowedPriceUnits(rules, transactionType ?? null, rentPeriod ?? null)) {
      units.add(unit);
    }
  };

  for (const root of roots) {
    if (root.slug === slug) root.children.forEach(collect);
    const child = root.children.find((item) => item.slug === slug);
    if (child) collect(child);
  }

  return units.size > 0 ? [...units] : ['total'];
}

/**
 * Сроки аренды, которые выбираются отдельно: у раздела — объединение по
 * подкатегориям. Пусто, если аренда в категории идёт в единицах «час / сутки /
 * неделя / месяц» — тогда срок и единица цены одно и то же.
 */
function periodChoicesOf(
  roots: ListingCategoryDto[],
  slug: string | undefined,
): ListingRentPeriod[] {
  if (!slug) return [];
  const targets: ListingCategoryDto[] = [];
  for (const root of roots) {
    if (root.slug === slug) targets.push(...root.children);
    const child = root.children.find((item) => item.slug === slug);
    if (child) targets.push(child);
  }

  const periods = new Set<ListingRentPeriod>();
  for (const category of targets) {
    if (!category.transactions.includes('rent')) continue;
    for (const period of rentPeriodChoices({
      allowedPriceUnits: category.priceUnits,
      defaultPriceUnit: category.defaultPriceUnit,
    })) {
      periods.add(period);
    }
  }
  return (['monthly', 'daily'] as ListingRentPeriod[]).filter((period) => periods.has(period));
}

/**
 * Поле значит то же самое в обеих категориях: тот же справочник и тот же
 * набор вариантов. Иначе значение из прежней категории не имеет смысла.
 */
function sameMeaning(a: ListingAttribute, b: ListingAttribute): boolean {
  if ((a.dictionary ?? null) !== (b.dictionary ?? null)) return false;
  const values = (field: ListingAttribute) =>
    (field.options ?? []).map((option) => option.value).join('|');
  return values(a) === values(b);
}

/** Только цифры: из «1 500 000 ₽» остаётся 1500000. */
function onlyDigits(text: string): string {
  return text.replace(/\D/g, '');
}

/** Разряды пробелами для чтения: 1500000 → «1 500 000». */
function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Сделки категории: у раздела — объединение по подкатегориям. */
function transactionsOf(
  roots: ListingCategoryDto[],
  slug: string | undefined,
): ListingTransactionType[] {
  if (!slug) return [];
  for (const root of roots) {
    if (root.slug === slug) {
      return [...new Set(root.children.flatMap((child) => child.transactions))];
    }
    const child = root.children.find((item) => item.slug === slug);
    if (child) return child.transactions;
  }
  return [];
}

function dedupe(fields: ListingAttribute[]): ListingAttribute[] {
  const byKey = new Map<string, ListingAttribute>();
  for (const field of fields) if (!byKey.has(field.key)) byKey.set(field.key, field);
  return [...byKey.values()];
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    pressed: { opacity: 0.85 },
    categoryBlock: { gap: spacing.md, marginTop: spacing.sm },
    // Блоки — единая форма: тонкая линия сверху и небольшой воздух, а не
    // «заголовок → карточка → заголовок → карточка»
    section: {
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: spacing.sm,
    },
    sectionTitle: { ...typography.subheading, color: colors.text, fontSize: 15 },
    sectionBody: { gap: spacing.md },
    block: { gap: spacing.xs },
    // Подпись поля — как подпись у «Категории»: мелкая и спокойная
    blockTitle: { ...typography.caption, color: colors.textMuted },
    hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
    row: { flexDirection: 'row', gap: spacing.md },
    half: { flex: 1 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
    },
    switchLabel: { ...typography.body, color: colors.text, flexShrink: 1 },
    areaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
    },
    areaText: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
    moreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
    },
    flipped: { transform: [{ rotate: '180deg' }] },
    moreLabel: { ...typography.body, color: colors.primary, fontWeight: '600' },
    footerRow: { flexDirection: 'row', gap: spacing.xs, paddingTop: spacing.sm },
    // «Сбросить» — компактное действие по ширине текста; «Показать N» забирает
    // всё остальное и всегда в одну строку
    footerReset: { flexShrink: 0, paddingHorizontal: 6 },
    footerApply: { flex: 1, minWidth: 0, paddingHorizontal: spacing.xs },
  });
