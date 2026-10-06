import {
  DAGESTAN_DEFAULT_CENTER,
  EXACT_ADDRESS_SECTIONS,
  LISTING_PRICE_UNIT_SUFFIX,
  RENT_PERIOD_LABELS,
  classifyListingTitle,
  describeAttributes,
  describeCardFacts,
  operationLabels,
  partLabels,
  partsEquipmentBySlug,
  carryAttributes,
  fieldsForValues,
  isAttributeVisible,
  isCategoryStep,
  openStepIndex,
  planListingSteps,
  partMakerReset,
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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

import {
  newRepeatKey,
  useCities,
  useCreateListing,
  useListingCategories,
} from '../../src/api/queries';
import { publishErrorText } from '../../src/utils/publish-error';
import { Button } from '../../src/components/Button';
import { CategoryPickerModal } from '../../src/components/CategoryPickerModal';
import { FormStep } from '../../src/components/FormStep';
import { Icon } from '../../src/components/Icon';
import {
  AttributeField,
  AttributeValueText,
  DealPicker,
  Field,
  createStyles as createFieldStyles,
  dealComplete,
  defaultDeal,
  formFields,
  resolveUnit,
  hasValue,
  minLengthError,
  needsDealStep,
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
 * Подача объявления — пошагово, на одном экране (ТЗ «Форма размещения»).
 *
 * Человек видит один следующий шаг, а не анкету из двадцати полей:
 * заполнил текущий — появился следующий, заполненные свёрнуты в строку
 * «Что вы делаете · Продам ✓» и открываются снова по нажатию. Какие шаги
 * вообще будут, решает категория — тем же описанием полей, по которому
 * строятся фильтры и проверка на сервере: заголовок → категория → сделка и
 * срок аренды → обязательные характеристики и тип (деталь, тип товара) по
 * одной → необязательные одним шагом → номера и совместимость запчасти →
 * фото → цена (единица — по сделке) → место и телефон → описание →
 * предпросмотр и публикация.
 *
 * Выбор из вариантов закрывает шаг сам; текст, число и несколько вариантов —
 * кнопкой «Далее». Поменяли раннее (категорию, сделку) — сбрасывается только
 * то, что перестало подходить, и форма называет, что именно.
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
  // Один ключ на заполнение формы: повторное нажатие или повтор после «сервер
  // долго не отвечает» вернёт уже созданное объявление, а не второе
  const repeatKey = useRef(newRepeatKey());
  // Ошибка публикации — внутри окна предпросмотра: всплывающее сообщение под
  // окном не видно, и казалось, что кнопка «ничего не делает»
  const [publishError, setPublishError] = useState<string | null>(null);

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
  // Пошаговая подача: подтверждённые кнопкой «Далее» шаги и шаг, открытый для правки
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const stepsTop = useRef(0);
  const stepY = useRef<Record<string, number>>({});
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
  // Условия аренды («можно с животными») видны только у «Сдам»
  const visibleFields = fieldsForValues(
    fields.filter((field) => isAttributeVisible(field, values, deal)),
    values,
  );
  const requiredFields = visibleFields.filter((field) => field.required);

  const priceUnit = category ? resolveUnit(category, deal) : 'total';
  const priceSuffix = LISTING_PRICE_UNIT_SUFFIX[priceUnit];
  const priceless = deal.transactionType === 'free' || deal.transactionType === 'mating';
  const currentCity = cities.data?.find((city) => city.id === cityId);

  /** Выбрать категорию: сделка по умолчанию, значения — только подходящие ей. */
  const applyCategory = (next: ListingCategoryDto, fromGuess: ListingTitleGuess | null) => {
    const keys = new Set(formFields(next.attributes).map((field) => field.key));
    // Введённое не стирается целиком: остаётся всё, что подходит новой категории,
    // а что не подходит — сбрасывается, и форма говорит, что именно (аудит, п. 39)
    const carried = carryAttributes(
      formFields(category?.attributes),
      formFields(next.attributes),
      values,
    );
    const lost = [...carried.dropped];
    // Номера и совместимость относятся к одному типу техники: у другого раздела начинаем заново
    if (next.slug !== category?.slug) {
      const layer = partLayerToInput(partLayer);
      if (layer.numbers.length > 0 || layer.compatibility.length > 0)
        lost.push('номера и совместимость запчасти');
      setPartLayer(emptyPartLayer());
    }
    setCategory(next);
    const prefill = Object.fromEntries(
      Object.entries(fromGuess?.attributes ?? {}).filter(([key]) => keys.has(key)),
    );
    setValues({ ...carried.kept, ...prefill });
    if (category && lost.length > 0) {
      toast(`Не подходят новой категории и сброшены: ${lost.join(', ').toLowerCase()}`);
    }
    // Шаги новой категории проходятся заново; общее (фото, цена, место,
    // описание) остаётся подтверждённым
    setConfirmed((current) => new Set([...current].filter((id) => !isCategoryStep(id))));
    setEditing(null);

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
  // Без города публикация молча не происходила: кнопка не делала ничего
  if (!cityId) missing.push('город в настройках приложения');
  // Фото ещё загружается — без него объявление ушло бы без этой фотографии
  if (uploading) missing.push('дождитесь загрузки фотографий');
  const ready = missing.length === 0;

  const openPreview = () => {
    if (!ready) {
      toast(`Осталось указать: ${missing.join('; ')}`);
      return;
    }
    setPublishError(null);
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
      ...(isParts ? { part: partLayerToInput(partLayer, values.partOriginality) } : {}),
      location,
      addressVisibility: visibility,
      contactPhone: `+7${phone}`,
      allowChat: true,
      allowCalls: true,
      photoIds: photos.map((photo) => photo.id),
    };

    setPublishError(null);
    create.mutate(
      { dto, repeatKey: repeatKey.current },
      {
        onSuccess: (listing) => {
          repeatKey.current = newRepeatKey();
          setPreviewOpen(false);
          toast('Объявление опубликовано');
          router.replace({ pathname: '/listings/[id]', params: { id: listing.id } });
        },
        onError: (error: Error) => setPublishError(publishErrorText(error, category.attributes)),
      },
    );
  };

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
  // Сменилась марка — модель прежней марки не остаётся; сменилась оригинальность —
  // производитель другого списка сбрасывается, и форма говорит почему
  const setValue = (key: string, value: unknown) => {
    const next = withAttributeValue(fields, values, key, value);
    const reset = partMakerReset(values, next);
    if (reset) toast(reset);
    setValues(next);
  };

  /**
   * Сменилась сделка («Продам» → «Сдам» и обратно): поля, которые при новой
   * сделке не показываются (условия аренды у продажи), сбрасываются — и форма
   * говорит какие. Остальное остаётся.
   */
  const changeDeal = (next: DealValue) => {
    const gone = fields.filter(
      (field) =>
        hasValue(values[field.key]) &&
        isAttributeVisible(field, values, deal) &&
        !isAttributeVisible(field, values, next),
    );
    if (gone.length > 0) {
      const rest = { ...values };
      for (const field of gone) delete rest[field.key];
      setValues(rest);
      toast(
        `Не подходят выбранной сделке и сброшены: ${gone.map((field) => field.label.toLowerCase()).join(', ')}`,
      );
    }
    // Единица цены сменилась (₽/сут → ₽): прежнюю цену нужно подтвердить заново
    if (category && resolveUnit(category, next) !== resolveUnit(category, deal)) {
      setConfirmed((done) => new Set([...done].filter((id) => id !== 'price')));
    }
    setDeal(next);
  };

  // Характеристики-шаги: обязательные и «что именно» (деталь, тип товара) — по
  // одной; остальные необязательные — одним шагом «Дополнительно»
  const plan = planListingSteps({
    hasCategory: category !== null,
    dealStep: category !== null && needsDealStep(category),
    visibleFields,
    partLayer: isParts,
    priceless,
  });
  const { stepFields, detailFields } = plan;
  const dealSummary = deal.transactionType
    ? [
        category ? operationLabels(category.slug, deal.transactionType).create : null,
        deal.rentPeriod ? RENT_PERIOD_LABELS[deal.rentPeriod] : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const filledDetails = detailFields.filter((field) => hasValue(values[field.key])).length;
  const partInput = partLayerToInput(partLayer);

  const built: StepSpec[] = [
    {
      id: 'title',
      title: 'Заголовок',
      valid: title.trim().length >= 5 && verdict.kind !== 'request',
      summary: title.trim(),
      body: (
        <TextField
          label="Что продаёте или сдаёте"
          value={title}
          onChangeText={setTitle}
          placeholder="Например, iPhone 15 Pro 256 ГБ или 2-комнатная квартира"
          maxLength={120}
          error={verdict.kind === 'request' ? verdict.message : minLengthError(title, 5)}
        />
      ),
    },
    {
      id: 'category',
      title: 'Категория',
      auto: true,
      valid: category !== null,
      summary: category ? categoryPathLabel(roots, category.slug) : '',
      body: (
        <>
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
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={
              category ? `Категория: ${category.name}. Изменить` : 'Выбрать категорию'
            }
            style={({ pressed }) => [styles.categoryRow, pressed && styles.pressed]}
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
        </>
      ),
    },
  ];

  if (category && needsDealStep(category)) {
    built.push({
      id: 'deal',
      title: 'Что вы делаете',
      auto: true,
      valid: dealComplete(category, deal),
      summary: dealSummary,
      body: <DealPicker category={category} value={deal} onChange={changeDeal} part="deal" />,
    });
  }

  if (category) {
    for (const field of stepFields) {
      const single = field.type === 'enum' || field.type === 'brand' || field.type === 'model';
      built.push({
        id: `field:${field.key}`,
        title: field.label,
        auto: single,
        optional: !field.required,
        valid: hasValue(values[field.key]),
        summary: <AttributeValueText field={field} value={values[field.key]} values={values} />,
        body: (
          <AttributeField
            field={field}
            value={values[field.key]}
            values={values}
            onChange={(value) => setValue(field.key, value)}
            bare
          />
        ),
      });
    }

    if (detailFields.length > 0) {
      built.push({
        id: 'details',
        title: 'Дополнительно',
        optional: true,
        valid: true,
        summary: filledDetails > 0 ? `Указано: ${filledDetails}` : 'Пропущено',
        body: (
          <>
            <Text style={styles.hint}>
              Необязательно, но с подробностями объявление находят чаще.
            </Text>
            {detailFields.map((field) => (
              <AttributeField
                key={field.key}
                field={field}
                value={values[field.key]}
                values={values}
                onChange={(value) => setValue(field.key, value)}
              />
            ))}
          </>
        ),
      });
    }

    if (isParts) {
      built.push({
        id: 'part',
        title: 'Номер и совместимость',
        valid: partError === null,
        summary:
          [
            partInput.numbers.length > 0 ? `Номеров: ${partInput.numbers.length}` : null,
            partInput.compatibility.length > 0
              ? `Подходит к: ${partInput.compatibility.length}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Не указано',
        body: (
          <PartLayerEditor
            slug={category.slug}
            value={partLayer}
            onChange={setPartLayer}
            error={partError}
            suggestion={compatSuggestion}
            onDismissSuggestion={() => setDismissedCompat(compatSuggestion?.label ?? null)}
          />
        ),
      });
    }

    built.push({
      id: 'photos',
      title: 'Фотографии',
      valid: !uploading,
      summary: photos.length > 0 ? `Фото: ${photos.length}` : 'Без фото',
      body: (
        <>
          <Text style={styles.hint}>До 10 фото, первое станет обложкой.</Text>
          <PhotoGridEditor
            photos={photos}
            onAdd={() => void addPhotos()}
            onRemove={removePhoto}
            onMove={movePhoto}
            onMakeCover={makeCover}
            uploading={uploading}
          />
        </>
      ),
    });

    if (!priceless) {
      built.push({
        id: 'price',
        title: `Цена, ₽${priceSuffix}`,
        valid: true,
        summary: priceText + (isNegotiable && price ? ' · торг' : ''),
        body: (
          <>
            <DealPicker category={category} value={deal} onChange={changeDeal} part="units" />
            <TextInput
              value={price}
              onChangeText={(text) => setPrice(text.replace(/[^\d]/g, ''))}
              placeholder="Например, 25000"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              keyboardType="number-pad"
              accessibilityLabel="Цена"
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Торг уместен</Text>
              <Switch value={isNegotiable} onValueChange={setNegotiable} />
            </View>
            <Text style={styles.hint}>Без цены в карточке будет «Цена договорная».</Text>
          </>
        ),
      });
    }

    built.push({
      id: 'location',
      title: 'Где находится и телефон',
      valid: location !== null && !ruMobileError(phone),
      summary: location ? locationLabel(location, cityName ?? 'Дагестан') : '',
      body: (
        <>
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
          />
          <Field label="Телефон для связи">
            <PhoneInput
              mobileOnly
              value={phone}
              onChangeValue={setPhone}
              country={DEFAULT_COUNTRY}
              onChangeCountry={() => undefined}
              error={phone ? (ruMobileError(phone) ?? undefined) : undefined}
            />
            <Text style={styles.hint}>
              Номер увидят те, кто нажмёт «Показать номер». Можно указать рабочий, а не личный.
            </Text>
          </Field>
        </>
      ),
    });

    built.push({
      id: 'description',
      title: 'Описание',
      valid: description.trim().length >= 10,
      summary: description.trim(),
      body: (
        <TextField
          label="Опишите подробнее"
          value={description}
          onChangeText={setDescription}
          placeholder="Состояние, комплектация, что важно знать покупателю"
          style={styles.textarea}
          multiline
          maxLength={3000}
          error={minLengthError(description, 10)}
          hint="Номер телефона и ссылки в описании не нужны — связаться можно по кнопке в объявлении."
        />
      ),
    });
  }

  // Порядок и состав шагов — из общего плана (shared), разметка — здесь
  const specs = plan.steps.flatMap((id) => built.filter((spec) => spec.id === id));
  const current = openStepIndex(specs, confirmed);
  const currentId = specs[current]?.id ?? null;
  // Все шаги пройдены (и категория выбрана) — можно смотреть и публиковать
  const allDone = category !== null && current === specs.length;

  /** Закрыть шаг: «Далее», «Пропустить» или «Готово» после правки. */
  const confirmStep = (id: string) => {
    setConfirmed((done) => new Set(done).add(id));
    setEditing(null);
  };

  // Открылся новый шаг — довести до него человека
  useEffect(() => {
    if (!currentId) return;
    const timer = setTimeout(() => {
      const y = stepY.current[currentId];
      if (y !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, stepsTop.current + y - spacing.lg) });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [currentId]);

  if (categories.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      scrollRef={scrollRef}
      footer={
        allDone ? (
          <Button
            label={ready ? 'Проверить и опубликовать' : `Осталось заполнить: ${missing.length}`}
            onPress={openPreview}
            variant={ready ? 'primary' : 'secondary'}
            fullWidth
          />
        ) : undefined
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

      <View
        onLayout={(event) => {
          stepsTop.current = event.nativeEvent.layout.y;
        }}
      >
        {specs.slice(0, current + 1).map((spec, index) => {
          const open = index === current || spec.id === editing;
          const stepNext = !open
            ? null
            : spec.id === editing && index !== current
              ? { label: 'Готово', enabled: spec.valid || spec.optional === true }
              : spec.auto
                ? spec.optional && !spec.valid
                  ? { label: 'Пропустить', enabled: true }
                  : null
                : {
                    label:
                      spec.optional && spec.id !== 'details' && !spec.valid
                        ? 'Пропустить'
                        : 'Далее',
                    enabled: spec.valid || spec.optional === true,
                  };
          return (
            <FormStep
              key={spec.id}
              title={spec.title}
              summary={spec.summary || 'Не указано'}
              state={open ? 'open' : 'done'}
              onEdit={() => setEditing(spec.id)}
              next={stepNext ? { ...stepNext, onPress: () => confirmStep(spec.id) } : null}
              onLayout={(event) => {
                stepY.current[spec.id] = event.nativeEvent.layout.y;
              }}
            >
              {spec.body}
            </FormStep>
          );
        })}
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
            {publishError && (
              <View style={styles.publishError} accessibilityRole="alert">
                <Icon name="flag" size={18} color={colors.danger} />
                <Text style={styles.publishErrorText}>{publishError}</Text>
              </View>
            )}
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

/** Шаг пошаговой подачи: что спросить, когда он заполнен и что о нём сказать свёрнутым. */
interface StepSpec {
  id: string;
  title: string;
  /** Заполнен по правилам поля (без учёта «Далее») */
  valid: boolean;
  /** Выбор из вариантов закрывает шаг сам; иначе — кнопкой «Далее» */
  auto?: boolean;
  /** Можно пропустить */
  optional?: boolean;
  summary: ReactNode;
  body: ReactNode;
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
    publishError: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.dangerSoft,
    },
    publishErrorText: { ...typography.body, color: colors.text, flex: 1 },
    previewActions: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
  });
