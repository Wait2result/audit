import {
  PRICE_UNIT_LABELS,
  RENT_PERIOD_LABELS,
  TRANSACTION_SEARCH_LABELS,
  allowedPriceUnits,
  isAttributeVisible,
  type ListingAttribute,
  type ListingCategoryDto,
  type ListingPriceUnit,
  type ListingRentPeriod,
  type ListingTransactionType,
} from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useDictionary, useListingCategories } from '../../src/api/queries';
import { Button } from '../../src/components/Button';
import { FilterChip } from '../../src/components/FilterChip';
import { FormHeader } from '../../src/components/FormHeader';
import { Screen } from '../../src/components/Screen';
import { SearchableSelect } from '../../src/components/SearchableSelect';
import { TextField } from '../../src/components/TextField';
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
  const params = useLocalSearchParams<{ category?: string }>();

  const categories = useListingCategories();
  // Фильтры хранятся по категории: у автомобилей свои, у телефонов свои
  const scope = params.category ?? '';
  const saved = useListingFilterStore((s) => s.byScope[scope] ?? EMPTY_FILTERS);
  const apply = useListingFilterStore((s) => s.set);
  const resetStore = useListingFilterStore((s) => s.reset);

  const [priceFrom, setPriceFrom] = useState(saved.priceFrom ? String(saved.priceFrom) : '');
  const [priceTo, setPriceTo] = useState(saved.priceTo ? String(saved.priceTo) : '');
  const [priceUnit, setPriceUnit] = useState<ListingPriceUnit | undefined>(saved.priceUnit);
  const [transactionType, setTransactionType] = useState(saved.transactionType);
  const [rentPeriod, setRentPeriod] = useState(saved.rentPeriod);
  const [onlyWithPhoto, setOnlyWithPhoto] = useState(Boolean(saved.onlyWithPhoto));
  const [attributes, setAttributes] = useState<Record<string, unknown>>(saved.attributes ?? {});

  const fields = useMemo(
    () => filterFields(categories.data ?? [], params.category),
    [categories.data, params.category],
  );
  // Сделки, которые бывают в выбранной категории (или во всех её подкатегориях)
  const transactions = useMemo(
    () => transactionsOf(categories.data ?? [], params.category),
    [categories.data, params.category],
  );
  const rentPeriods = transactions.includes('rent');
  // Единицы цены, между которыми есть выбор при этой сделке. У аренды
  // машины — только «в сутки», выбирать нечего; у услуг бывает «за всё» и
  // «за час», и цена «до 2 000» без единицы ничего не значит
  const priceUnits = useMemo(
    () => priceUnitsOf(categories.data ?? [], params.category, transactionType, rentPeriod),
    [categories.data, params.category, transactionType, rentPeriod],
  );
  const activeUnit = priceUnit && priceUnits.includes(priceUnit) ? priceUnit : priceUnits[0];

  const setAttribute = (key: string, value: unknown) => {
    setAttributes((current) => {
      const next = { ...current };
      if (value === undefined || value === null || value === '') delete next[key];
      else next[key] = value;
      // Сменилась марка — модель прежней марки больше не подходит
      for (const child of fields.filter((field) => field.parentKey === key)) {
        if (current[key] !== value) delete next[child.key];
      }
      return next;
    });
  };

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
    const next: ExtraListingFilters = {
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
    };

    apply(scope, next);
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
    resetStore(scope);
  };

  return (
    <Screen scroll>
      <FormHeader title="Фильтры" description="Уточните, что именно ищете" onBack={leave} />

      {transactions.length > 1 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Что вы ищете</Text>
          <View style={styles.chips}>
            {transactions.map((value) => (
              <FilterChip
                key={value}
                label={TRANSACTION_SEARCH_LABELS[value]}
                active={transactionType === value}
                onPress={() =>
                  setTransactionType((current) => (current === value ? undefined : value))
                }
              />
            ))}
          </View>
          {transactionType === 'rent' && rentPeriods && (
            <View style={styles.chips}>
              {(['monthly', 'daily'] as ListingRentPeriod[]).map((value) => (
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
        </View>
      )}

      <View style={styles.block}>
        <Text style={styles.blockTitle}>
          Цена, {activeUnit ? PRICE_UNIT_LABELS[activeUnit] : '₽'}
        </Text>
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
              value={priceFrom}
              onChangeText={setPriceFrom}
              placeholder="от"
              keyboardType="number-pad"
              accessibilityLabel="Цена от"
            />
          </View>
          <View style={styles.half}>
            <TextField
              value={priceTo}
              onChangeText={setPriceTo}
              placeholder="до"
              keyboardType="number-pad"
              accessibilityLabel="Цена до"
            />
          </View>
        </View>
      </View>

      {fields
        .filter((field) => isAttributeVisible(field, attributes))
        .map((field) => (
          <AttributeFilter
            key={field.key}
            attribute={field}
            value={attributes[field.key]}
            parent={field.parentKey ? attributes[field.parentKey] : undefined}
            onChange={(value) => setAttribute(field.key, value)}
          />
        ))}

      <View style={[styles.block, styles.switchRow]}>
        <Text style={styles.blockTitle}>Только с фотографией</Text>
        <Switch
          value={onlyWithPhoto}
          onValueChange={setOnlyWithPhoto}
          trackColor={{ true: colors.primary, false: colors.border }}
          accessibilityLabel="Только с фотографией"
        />
      </View>

      <Button label="Показать объявления" onPress={save} style={styles.apply} />
      <Pressable onPress={reset} accessibilityRole="button" style={styles.resetRow}>
        <Text style={styles.resetLabel}>Сбросить фильтры</Text>
      </Pressable>
    </Screen>
  );
}

/** Одно поле фильтра: список вариантов, диапазон или переключатель. */
function AttributeFilter({
  attribute,
  value,
  parent,
  onChange,
}: {
  attribute: ListingAttribute;
  value: unknown;
  /** Значение поля-родителя: марка для модели */
  parent?: unknown;
  onChange: (value: unknown) => void;
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
              value={bounds.from === undefined ? '' : String(bounds.from)}
              onChangeText={(text) =>
                onChange(cleanBounds({ ...bounds, from: text ? Number(toDot(text)) : undefined }))
              }
              placeholder="от"
              keyboardType="number-pad"
              accessibilityLabel={`${attribute.label} от`}
            />
          </View>
          <View style={styles.half}>
            <TextField
              value={bounds.to === undefined ? '' : String(bounds.to)}
              onChangeText={(text) =>
                onChange(cleanBounds({ ...bounds, to: text ? Number(toDot(text)) : undefined }))
              }
              placeholder="до"
              keyboardType="number-pad"
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
      <Text style={styles.blockTitle}>{attribute.label}</Text>
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
    block: { marginTop: spacing.xl, gap: spacing.sm },
    blockTitle: { ...typography.subheading, color: colors.text, fontSize: 15 },
    hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
    row: { flexDirection: 'row', gap: spacing.md },
    half: { flex: 1 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    apply: { marginTop: spacing.xxl },
    resetRow: { alignSelf: 'center', paddingVertical: spacing.lg },
    resetLabel: { ...typography.body, color: colors.textMuted },
  });
