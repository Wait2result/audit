import {
  DAGESTAN_DEFAULT_CENTER,
  EXACT_ADDRESS_SECTIONS,
  LISTING_PRICE_UNIT_SUFFIX,
  classifyListingTitle,
  describeAttributes,
  describeCardFacts,
  partLabels,
  partsEquipmentBySlug,
  isAttributeVisible,
  ruMobileDigits,
  ruMobileError,
  type CreateListingDto,
  type ListingAddressVisibility,
  type ListingAttribute,
  type ListingCategoryDto,
  type ListingLocationInput,
  type ListingTitleGuess,
  withAttributeValue,
} from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useCities, useCreateListing, useListingCategories } from '../../src/api/queries';
import { Button } from '../../src/components/Button';
import { CategoryPickerModal } from '../../src/components/CategoryPickerModal';
import { Icon } from '../../src/components/Icon';
import {
  AttributeField,
  DealPicker,
  Field,
  createStyles as createFieldStyles,
  dealComplete,
  defaultDeal,
  formFields,
  resolveUnit,
  hasValue,
  minLengthError,
  needsDealChoice,
  type DealValue,
} from '../../src/components/ListingFormFields';
import { ListingLocationPicker } from '../../src/components/ListingLocationPicker';
import { DEFAULT_COUNTRY, PhoneInput } from '../../src/components/PhoneInput';
import { PhotoGridEditor } from '../../src/components/PhotoGridEditor';
import {
  PartLayerEditor,
  emptyPartLayer,
  hasCompatibilityRow,
  isPartsLeaf,
  partLayerError,
  partLayerToInput,
  type CompatibilitySuggestion,
  type PartLayerValue,
} from '../../src/components/PartLayerEditor';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { useDebouncedValue } from '../../src/hooks/use-debounced-value';
import { usePhotoEditor } from '../../src/hooks/use-photo-editor';
import { useAuthStore } from '../../src/store/auth-store';
import { useCityStore } from '../../src/store/city-store';
import { useToastStore } from '../../src/store/toast-store';
import { radius, spacing, typography, useThemeColors } from '../../src/theme';
import {
  categoryPath,
  categoryPathLabel,
  leafCategories,
} from '../../src/utils/listing-category-lookup';
import { locationLabel } from '../../src/utils/geo';
import { subcategoryIcon } from '../../src/utils/listing-icons';
import { formatMoney } from '../../src/utils/money';

/**
 * Подача объявления — одна форма, а не девять шагов (ТЗ «Объявления», п. 8).
 *
 * Порядок — как человек думает о вещи: что это (заголовок — и категория
 * подсказывается по нему сама), как выглядит (фото), главное о ней
 * (обязательные характеристики; остальные — под «Ещё характеристики»),
 * сколько стоит, где, и описание. Кнопка публикации закреплена внизу и
 * доступна всегда: если чего-то не хватает, она скажет, чего именно. Перед
 * публикацией — предпросмотр карточки.
 *
 * Подсказка категории — предложение, а не решение: её подтверждают одним
 * нажатием, меняют или пропускают. Из заголовка форма сразу берёт то, что в
 * нём уже сказано: марку, модель, год, комнаты, «сдам посуточно».
 */
export default function NewListingScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const toast = useToastStore((s) => s.show);

  const cityId = useCityStore((s) => s.cityId);
  const cityName = useCityStore((s) => s.cityName);
  const user = useAuthStore((s) => s.user);

  const categories = useListingCategories();
  const cities = useCities();
  const create = useCreateListing();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ListingCategoryDto | null>(null);
  const [dismissedSlug, setDismissedSlug] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [deal, setDeal] = useState<DealValue>({
    transactionType: null,
    rentPeriod: null,
    priceUnit: null,
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const { photos, uploading, addPhotos, removePhoto, movePhoto, makeCover } = usePhotoEditor();
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [isNegotiable, setNegotiable] = useState(false);
  // Место — только то, что человек выбрал сам: ни GPS, ни центр города
  // молча не подставляются
  const [location, setLocation] = useState<ListingLocationInput | null>(null);
  const [visibility, setVisibility] = useState<ListingAddressVisibility>('approximate');
  // Номер входа — подсказка по умолчанию, если он российский мобильный
  const [phone, setPhone] = useState(() =>
    user?.phone?.startsWith('+79') ? ruMobileDigits(user.phone) : '',
  );
  // Ошибки полей — после первой попытки опубликовать, а не с порога
  const [showErrors, setShowErrors] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const roots = useMemo(() => categories.data ?? [], [categories.data]);
  // Подкатегории любой глубины: «Квартиры» и «Автомобили → Автоаксессуары»
  const leaves = useMemo(() => leafCategories(roots).map((item) => item.leaf), [roots]);
  const rootOf = (child: ListingCategoryDto | null) =>
    child ? (categoryPath(roots, child.slug)[0] ?? null) : null;

  // Догадка по заголовку — после паузы в наборе, а не на каждую букву
  const typedTitle = useDebouncedValue(title, 400);
  const verdict = useMemo(() => classifyListingTitle(typedTitle), [typedTitle]);
  const guess = verdict.kind === 'guess' ? verdict.guess : null;
  const guessCategory = guess ? (leaves.find((leaf) => leaf.slug === guess.slug) ?? null) : null;
  const showGuess =
    guess !== null &&
    guessCategory !== null &&
    guessCategory.id !== category?.id &&
    guess.slug !== dismissedSlug;

  const fields = useMemo<readonly ListingAttribute[]>(
    () => formFields(category?.attributes),
    [category],
  );
  const [partLayer, setPartLayer] = useState<PartLayerValue>(emptyPartLayer);
  const isParts = isPartsLeaf(category?.slug);
  const partError = isParts ? partLayerError(partLayer) : null;
  // Техника из заголовка — предложение для «Подходит к», пока продавец его не принял
  // или не отказался (отказ запоминается по тексту предложения)
  const [dismissedCompat, setDismissedCompat] = useState<string | null>(null);
  const compatSuggestion = useMemo<CompatibilitySuggestion | null>(() => {
    if (!isParts || !guess?.compatibility || guess.slug !== category?.slug) return null;
    const found = guess.compatibility;
    const years =
      found.yearFrom === undefined
        ? null
        : found.yearFrom === found.yearTo
          ? String(found.yearFrom)
          : `${found.yearFrom}–${found.yearTo}`;
    const label = [
      [found.brandLabel, found.modelLabel].filter(Boolean).join(' '),
      found.chassis,
      years,
      found.engine,
    ]
      .filter(Boolean)
      .join(' · ');
    const row = {
      brand: found.brand,
      model: found.model ?? '',
      chassis: found.chassis ?? '',
      yearFrom: found.yearFrom !== undefined ? String(found.yearFrom) : '',
      yearTo: found.yearTo !== undefined ? String(found.yearTo) : '',
      engine: found.engine ?? '',
      modification: '',
    };
    if (label === dismissedCompat || hasCompatibilityRow(partLayer, row)) return null;
    return { label, row };
  }, [isParts, guess, category?.slug, dismissedCompat, partLayer]);
  const visibleFields = fields.filter((field) => isAttributeVisible(field, values));
  const requiredFields = visibleFields.filter((field) => field.required);
  const optionalFields = visibleFields.filter((field) => !field.required);

  const priceUnit = category ? resolveUnit(category, deal) : 'total';
  const priceSuffix = LISTING_PRICE_UNIT_SUFFIX[priceUnit];
  const priceless = deal.transactionType === 'free' || deal.transactionType === 'mating';
  const currentCity = cities.data?.find((city) => city.id === cityId);

  /** Выбрать категорию: сделка по умолчанию, значения — только подходящие ей. */
  const applyCategory = (next: ListingCategoryDto, fromGuess: ListingTitleGuess | null) => {
    const keys = new Set(formFields(next.attributes).map((field) => field.key));
    setCategory(next);
    // Номера и совместимость относятся к одному типу техники: у другого раздела начинаем заново
    if (next.slug !== category?.slug) setPartLayer(emptyPartLayer());
    setValues((current) => {
      const kept = Object.fromEntries(Object.entries(current).filter(([key]) => keys.has(key)));
      const prefill = Object.fromEntries(
        Object.entries(fromGuess?.attributes ?? {}).filter(([key]) => keys.has(key)),
      );
      return { ...kept, ...prefill };
    });
    // Из заголовка заполнено необязательное поле (модель) — показываем его,
    // а не прячем подставленное под «Ещё характеристики»
    const optionalPrefill = formFields(next.attributes).some(
      (field) => !field.required && fromGuess?.attributes[field.key] !== undefined,
    );
    if (optionalPrefill) setMoreOpen(true);

    const base = defaultDeal(next);
    setDeal(
      fromGuess?.transactionType && next.transactions.includes(fromGuess.transactionType)
        ? {
            transactionType: fromGuess.transactionType,
            rentPeriod: fromGuess.rentPeriod ?? base.rentPeriod,
            priceUnit: null,
          }
        : base,
    );
    // Адрес мастерской или магазина — часть предложения, его показывают;
    // адрес частного продавца по умолчанию скрыт
    const section = rootOf(next);
    setVisibility(
      section && EXACT_ADDRESS_SECTIONS.includes(section.slug) ? 'exact' : 'approximate',
    );
  };

  /** Чего не хватает для публикации — по порядку формы. */
  const missingFields = requiredFields.filter((field) => !hasValue(values[field.key]));
  const missing: string[] = [];
  if (title.trim().length < 5) missing.push('заголовок');
  if (verdict.kind === 'request') missing.push('заголовок без «куплю» и «сниму»');
  if (!category) missing.push('категорию');
  if (category && !dealComplete(category, deal)) missing.push('сделку');
  if (missingFields.length > 0) {
    missing.push(missingFields.map((field) => field.label.toLowerCase()).join(', '));
  }
  if (partError) missing.push('номера и совместимость');
  if (!location) missing.push('место');
  if (ruMobileError(phone)) missing.push('телефон');
  if (description.trim().length < 10) missing.push('описание');
  const ready = missing.length === 0;

  const openPreview = () => {
    if (!ready) {
      setShowErrors(true);
      toast(`Осталось указать: ${missing.join('; ')}`);
      return;
    }
    setPreviewOpen(true);
  };

  const publish = () => {
    if (!cityId || !category || !location) return;

    const dto: CreateListingDto = {
      cityId,
      categoryId: category.id,
      title: title.trim(),
      description: description.trim(),
      transactionType: deal.transactionType,
      rentPeriod: deal.rentPeriod,
      price: priceless || !price.trim() ? null : Math.round(Number(price.replace(/\s/g, '')) * 100),
      priceUnit,
      isNegotiable: priceless ? false : isNegotiable,
      attributes: values,
      ...(isParts ? { part: partLayerToInput(partLayer) } : {}),
      location,
      addressVisibility: visibility,
      contactPhone: `+7${phone}`,
      allowChat: true,
      allowCalls: true,
      photoIds: photos.map((photo) => photo.id),
    };

    create.mutate(
      { dto },
      {
        onSuccess: (listing) => {
          setPreviewOpen(false);
          toast('Объявление опубликовано');
          router.replace({ pathname: '/listings/[id]', params: { id: listing.id } });
        },
        onError: (error: Error) => toast(error.message),
      },
    );
  };

  if (categories.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  // Предпросмотр — как строка карточки: у запчасти деталь, производитель и «Б/У оригинал»
  const stored = storedForm(fields, values);
  const partNames = (() => {
    const equipment = category ? partsEquipmentBySlug(category.slug) : undefined;
    if (!equipment) return undefined;
    const group = typeof values.partGroup === 'string' ? values.partGroup : null;
    const item = typeof values.partItem === 'string' ? values.partItem : null;
    const names = partLabels(equipment, group, item);
    return {
      ...(group && names.group ? { [group]: names.group } : {}),
      ...(item && names.item ? { [item]: names.item } : {}),
    };
  })();
  const summary = category
    ? (describeCardFacts(category.slug, fields, stored, partNames) ??
      describeAttributes(fields, stored, partNames))
    : '';
  const priceText = priceless
    ? 'Бесплатно'
    : price
      ? `${formatMoney(Number(price) * 100)}${priceSuffix}`
      : 'Цена договорная';
  // Сменилась марка — модель прежней марки не остаётся
  const setValue = (key: string, value: unknown) =>
    setValues((current) => withAttributeValue(fields, current, key, value));

  return (
    <Screen
      scroll
      footer={
        <Button
          label={ready ? 'Проверить и опубликовать' : `Осталось заполнить: ${missing.length}`}
          onPress={openPreview}
          variant={ready ? 'primary' : 'secondary'}
          fullWidth
        />
      }
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/listings'))}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={12}
        >
          <Icon name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Новое объявление</Text>
      </View>

      {/* ── Что это ─────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <TextField
          label="Заголовок"
          value={title}
          onChangeText={setTitle}
          placeholder="Например, iPhone 15 Pro 256 ГБ или 2-комнатная квартира"
          maxLength={120}
          error={
            verdict.kind === 'request'
              ? verdict.message
              : showErrors
                ? minLengthError(title, 5)
                : undefined
          }
        />

        {showGuess && guessCategory && guess && (
          <View style={styles.guess}>
            <Text style={styles.guessLabel}>Похоже, это:</Text>
            <Text style={styles.guessPath}>
              {[categoryPathLabel(roots, guessCategory.slug), ...guess.details]
                .filter(Boolean)
                .join(' → ')}
            </Text>
            <View style={styles.guessActions}>
              <Pressable
                onPress={() => applyCategory(guessCategory, guess)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.guessPrimary, pressed && styles.pressed]}
              >
                <Icon name="check" size={16} color={colors.textOnPrimary} />
                <Text style={styles.guessPrimaryLabel}>Да, это</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setDismissedSlug(guess.slug);
                  setPickerOpen(true);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.guessSecondary, pressed && styles.pressed]}
              >
                <Text style={styles.guessSecondaryLabel}>Другая категория</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Field label="Категория">
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={
              category ? `Категория: ${category.name}. Изменить` : 'Выбрать категорию'
            }
            style={({ pressed }) => [
              styles.categoryRow,
              showErrors && !category && styles.categoryRowError,
              pressed && styles.pressed,
            ]}
          >
            {category ? (
              <>
                <Icon name={subcategoryIcon(category.slug)} size={18} color={colors.primary} />
                <Text style={styles.categoryText} numberOfLines={2}>
                  {categoryPathLabel(roots, category.slug)}
                </Text>
                <Text style={styles.categoryChange}>Изменить</Text>
              </>
            ) : (
              <>
                <Icon name="grid" size={18} color={colors.textMuted} />
                <Text style={[styles.categoryText, styles.categoryPlaceholder]}>
                  Выбрать вручную
                </Text>
                <Icon name="chevron-right" size={16} color={colors.textFaint} />
              </>
            )}
          </Pressable>
        </Field>
      </View>

      {/* ── Фото ────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Фотографии</Text>
        <PhotoGridEditor
          photos={photos}
          onAdd={() => void addPhotos()}
          onRemove={removePhoto}
          onMove={movePhoto}
          onMakeCover={makeCover}
          uploading={uploading}
        />
      </View>

      {/* ── Главное о вещи ──────────────────────────────────────────── */}
      {category && (needsDealChoice(category) || visibleFields.length > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Главное</Text>
          {needsDealChoice(category) && (
            <DealPicker category={category} value={deal} onChange={setDeal} />
          )}
          {requiredFields.map((field) => (
            <AttributeField
              key={field.key}
              field={field}
              value={values[field.key]}
              values={values}
              onChange={(value) => setValue(field.key, value)}
            />
          ))}
          {optionalFields.length > 0 && (
            <Pressable
              onPress={() => setMoreOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: moreOpen }}
              style={({ pressed }) => [styles.more, pressed && styles.pressed]}
            >
              <Text style={styles.moreLabel}>
                {moreOpen ? 'Скрыть' : `Ещё характеристики (${optionalFields.length})`}
              </Text>
              <Icon
                name={moreOpen ? 'arrow-up' : 'chevron-down'}
                size={16}
                color={colors.primary}
              />
            </Pressable>
          )}
          {moreOpen &&
            optionalFields.map((field) => (
              <AttributeField
                key={field.key}
                field={field}
                value={values[field.key]}
                values={values}
                onChange={(value) => setValue(field.key, value)}
              />
            ))}
          {showErrors && missingFields.length > 0 && (
            <Text style={styles.error}>
              Заполните: {missingFields.map((field) => field.label.toLowerCase()).join(', ')}
            </Text>
          )}
        </View>
      )}

      {/* ── Номера и совместимость запчасти ─────────────────────────── */}
      {category && isParts && (
        <View style={styles.section}>
          <PartLayerEditor
            slug={category.slug}
            value={partLayer}
            onChange={setPartLayer}
            error={showErrors ? partError : null}
            suggestion={compatSuggestion}
            onDismissSuggestion={() => setDismissedCompat(compatSuggestion?.label ?? null)}
          />
        </View>
      )}

      {/* ── Цена ────────────────────────────────────────────────────── */}
      {!priceless && (
        <View style={styles.section}>
          <Field label={`Цена, ₽${priceSuffix}`}>
            <TextInput
              value={price}
              onChangeText={(text) => setPrice(text.replace(/[^\d]/g, ''))}
              placeholder="Например, 25000"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              keyboardType="number-pad"
              accessibilityLabel="Цена"
            />
          </Field>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Торг уместен</Text>
            <Switch value={isNegotiable} onValueChange={setNegotiable} />
          </View>
          <Text style={styles.hint}>Без цены в карточке будет «Цена договорная».</Text>
        </View>
      )}

      {/* ── Где и как связаться ─────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Где находится</Text>
        <ListingLocationPicker
          value={location}
          onChange={setLocation}
          visibility={visibility}
          onChangeVisibility={setVisibility}
          defaultCenter={
            currentCity
              ? { latitude: currentCity.latitude, longitude: currentCity.longitude }
              : DAGESTAN_DEFAULT_CENTER
          }
          error={showErrors && !location ? 'Укажите, где находится объявление' : undefined}
        />

        <Field label="Телефон для связи">
          <PhoneInput
            mobileOnly
            value={phone}
            onChangeValue={setPhone}
            country={DEFAULT_COUNTRY}
            onChangeCountry={() => undefined}
            error={showErrors ? (ruMobileError(phone) ?? undefined) : undefined}
          />
          <Text style={styles.hint}>
            Номер увидят те, кто нажмёт «Показать номер». Можно указать рабочий, а не личный.
          </Text>
        </Field>
      </View>

      {/* ── Описание ────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <TextField
          label="Описание"
          value={description}
          onChangeText={setDescription}
          placeholder="Опишите подробнее товар, услугу или предложение"
          style={styles.textarea}
          multiline
          maxLength={3000}
          error={showErrors ? minLengthError(description, 10) : undefined}
          hint="Номер телефона и ссылки в описании не нужны — связаться можно по кнопке в объявлении."
        />
      </View>

      <CategoryPickerModal
        visible={pickerOpen}
        roots={roots}
        onClose={() => setPickerOpen(false)}
        onSelect={(next) => {
          setPickerOpen(false);
          // Выбрали вручную то, что и угадали, — берём и значения из заголовка
          applyCategory(next, guess?.slug === next.slug ? guess : null);
        }}
      />

      <Modal
        visible={previewOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <View style={styles.previewModal}>
          <Text style={styles.previewHeading}>Так объявление увидят покупатели</Text>
          <ScrollView contentContainerStyle={styles.previewScroll}>
            <View style={styles.previewCard}>
              {photos[0] ? (
                <RemoteImage
                  uri={photos[0].thumbnailUrl ?? photos[0].url}
                  style={styles.previewPhoto}
                  containerStyle={styles.photoPlaceholder}
                  fallback={<Icon name="image" size={24} color="rgba(255,255,255,0.5)" />}
                />
              ) : (
                <View style={[styles.previewPhoto, styles.photoPlaceholder]}>
                  <Icon name="image" size={28} color="rgba(255,255,255,0.5)" />
                </View>
              )}
              <View style={styles.previewBody}>
                <Text style={styles.previewPrice}>{priceText}</Text>
                <Text style={styles.previewTitle}>{title.trim()}</Text>
                {summary ? <Text style={styles.previewMeta}>{summary}</Text> : null}
                <Text style={styles.previewMeta}>
                  {[category?.name, locationLabel(location, cityName ?? 'Дагестан')]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <Text style={styles.previewDescription} numberOfLines={4}>
                  {description.trim()}
                </Text>
              </View>
            </View>
            <Text style={styles.hint}>
              Объявление появится сразу и будет видно 30 дней. Изменить его можно в любой момент в
              «Моих объявлениях».
            </Text>
          </ScrollView>
          <View style={styles.previewActions}>
            <Button label="Опубликовать" onPress={publish} loading={create.isPending} fullWidth />
            <Button
              label="Вернуться к правке"
              variant="secondary"
              onPress={() => setPreviewOpen(false)}
              fullWidth
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

/**
 * Значения формы в том виде, в каком их хранит сервер: числа — числами и в
 * своём масштабе (площадь в десятых м²). Нужно предпросмотру, чтобы строка
 * характеристик совпала с будущей карточкой: «2 комн. · 54 м²».
 */
function storedForm(
  fields: readonly ListingAttribute[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...values };
  for (const field of fields) {
    const raw = values[field.key];
    if (field.type !== 'number' || raw === undefined || raw === '') continue;
    const number =
      typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(',', '.')) : NaN;
    if (Number.isFinite(number)) result[field.key] = Math.round(number * (field.scale ?? 1));
  }
  return result;
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    ...createFieldStyles(colors),
    loader: { marginTop: spacing.xxxl },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    title: { ...typography.heading, color: colors.text },

    section: { gap: spacing.lg, marginBottom: spacing.xl },
    sectionTitle: { ...typography.subheading, color: colors.text },
    error: { ...typography.caption, color: colors.danger },

    guess: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    guessLabel: { ...typography.caption, color: colors.textMuted },
    guessPath: { ...typography.body, color: colors.text, fontWeight: '600' },
    guessActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    guessPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
    },
    guessPrimaryLabel: { ...typography.caption, color: colors.textOnPrimary, fontWeight: '600' },
    guessSecondary: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    guessSecondaryLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },

    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 48,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryRowError: { borderColor: colors.danger },
    categoryText: { ...typography.body, color: colors.text, flex: 1 },
    categoryPlaceholder: { color: colors.textFaint },
    categoryChange: { ...typography.caption, color: colors.primary, fontWeight: '600' },

    more: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: spacing.xs,
    },
    moreLabel: { ...typography.body, color: colors.primary, fontWeight: '600' },

    photoPlaceholder: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inkSoft,
    },

    previewModal: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.lg },
    previewHeading: {
      ...typography.heading,
      color: colors.text,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    previewScroll: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
    previewCard: {
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    previewPhoto: { width: '100%', aspectRatio: 4 / 3 },
    previewBody: { padding: spacing.md, gap: 4 },
    previewPrice: { ...typography.subheading, color: colors.text },
    previewTitle: { ...typography.body, color: colors.text },
    previewMeta: { ...typography.caption, color: colors.textMuted },
    previewDescription: { ...typography.caption, color: colors.text, marginTop: spacing.xs },
    previewActions: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
  });
