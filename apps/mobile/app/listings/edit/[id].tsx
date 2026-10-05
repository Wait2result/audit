import {
  storedToInput,
  DAGESTAN_DEFAULT_CENTER,
  LISTING_PRICE_UNIT_SUFFIX,
  isAttributeVisible,
  ruMobileDigits,
  ruMobileError,
  type ListingAddressVisibility,
  type ListingLocationInput,
  type UpdateMyListingDto,
  withAttributeValue,
} from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  useCities,
  useListingCategories,
  useMyListing,
  useSetListingPhotos,
  useUpdateMyListing,
} from '../../../src/api/queries';
import { Button } from '../../../src/components/Button';
import { Icon } from '../../../src/components/Icon';
import {
  AttributeField,
  formFields,
  DealPicker,
  needsDealChoice,
  resolveUnit,
  Field,
  createStyles as createFieldStyles,
  dealComplete,
  hasValue,
  minLengthError,
  type DealValue,
} from '../../../src/components/ListingFormFields';
import { ListingLocationPicker } from '../../../src/components/ListingLocationPicker';
import { DEFAULT_COUNTRY, PhoneInput } from '../../../src/components/PhoneInput';
import { PhotoGridEditor } from '../../../src/components/PhotoGridEditor';
import {
  PartLayerEditor,
  emptyPartLayer,
  isPartsLeaf,
  partLayerError,
  partLayerFromDto,
  partLayerToInput,
  type PartLayerValue,
} from '../../../src/components/PartLayerEditor';
import { Screen } from '../../../src/components/Screen';
import { TextField } from '../../../src/components/TextField';
import { usePhotoEditor } from '../../../src/hooks/use-photo-editor';
import { useToastStore } from '../../../src/store/toast-store';
import { spacing, typography, useThemeColors } from '../../../src/theme';
import {
  attributesOfCategory,
  findCategoryBySlug,
} from '../../../src/utils/listing-category-lookup';

/**
 * Правка своего объявления (Этап 7, часть 2).
 *
 * В отличие от подачи — один экран, а не шаги: человек уже прошёл всю форму
 * один раз при публикации, второй раз вести его через восемь шагов ради
 * правки цены незачем. Город и категория не редактируются — сервер их и не
 * примет: смена категории означает другой набор полей и другое место в
 * выдаче, это по сути новое объявление.
 */
export default function EditListingScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const toast = useToastStore((s) => s.show);
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: listing, isLoading, isError } = useMyListing(id);
  const categories = useListingCategories();
  const cities = useCities();
  const update = useUpdateMyListing();
  const setPhotos = useSetListingPhotos();

  const {
    photos,
    uploading,
    addPhotos,
    removePhoto,
    movePhoto,
    makeCover,
    setPhotos: replacePhotos,
  } = usePhotoEditor();

  const [hydrated, setHydrated] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [isNegotiable, setNegotiable] = useState(false);
  const [location, setLocation] = useState<ListingLocationInput | null>(null);
  const [visibility, setVisibility] = useState<ListingAddressVisibility>('approximate');
  // Десять цифр после +7
  const [phone, setPhone] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [partLayer, setPartLayer] = useState<PartLayerValue>(emptyPartLayer);
  const [deal, setDeal] = useState<DealValue>({
    transactionType: null,
    rentPeriod: null,
    priceUnit: null,
  });
  // Ошибки показываются после попытки сохранить — правка открывается уже
  // заполненной, и подсвечивать поля до первого же нажатия незачем
  const [showErrors, setShowErrors] = useState(false);

  // Форма заполняется значениями с сервера один раз, когда они приходят —
  // дальше это уже черновик правки, и перезапись состояния поверх того, что
  // человек печатает, стёрла бы набранное на каждом фоновом обновлении кеша
  useEffect(() => {
    // Поля категории нужны до заполнения: числа с масштабом (площадь, сотки)
    // хранятся умноженными, а форма показывает и отправляет их как ввёл человек
    if (!listing || hydrated || !categories.data) return;

    setTitle(listing.title);
    setDescription(listing.description);
    setPrice(listing.price.value !== null ? String(Math.round(listing.price.value / 100)) : '');
    setNegotiable(listing.price.isNegotiable);
    // У старых объявлений точки может не быть — тогда поле пустое, и
    // объявление ищется по расстоянию от центра своего города
    setLocation(listing.location);
    setVisibility(listing.addressVisibility);
    setPhone(listing.contactPhone.startsWith('+79') ? ruMobileDigits(listing.contactPhone) : '');
    setValues(
      storedToInput(
        attributesOfCategory(categories.data, listing.categorySlug),
        listing.attributes,
      ),
    );
    setDeal({
      transactionType: listing.transactionType,
      rentPeriod: listing.rentPeriod,
      priceUnit: listing.price.unit,
    });
    setPartLayer(partLayerFromDto(listing.part));
    replacePhotos(listing.photos);
    setHydrated(true);
  }, [listing, hydrated, replacePhotos, categories.data]);

  const fields = useMemo(
    () => formFields(attributesOfCategory(categories.data ?? [], listing?.categorySlug)),
    [categories.data, listing?.categorySlug],
  );
  const category = findCategoryBySlug(categories.data ?? [], listing?.categorySlug);

  // Единица цены определяется сделкой, как и при подаче
  const priceUnit = category ? resolveUnit(category, deal) : (listing?.price.unit ?? 'total');
  const priceless = deal.transactionType === 'free' || deal.transactionType === 'mating';

  const canSave =
    title.trim().length >= 5 &&
    description.trim().length >= 10 &&
    ruMobileError(phone) === null &&
    (!isPartsLeaf(listing?.categorySlug) || partLayerError(partLayer) === null) &&
    (!category || dealComplete(category, deal)) &&
    fields.every((field) => !field.required || hasValue(values[field.key]));

  const save = () => {
    if (!listing) return;

    if (!canSave) {
      setShowErrors(true);
      return;
    }

    const dto: UpdateMyListingDto = {
      title: title.trim(),
      description: description.trim(),
      transactionType: deal.transactionType,
      rentPeriod: deal.rentPeriod,
      price: priceless || !price.trim() ? null : Math.round(Number(price.replace(/\s/g, '')) * 100),
      priceUnit,
      isNegotiable: priceless ? false : isNegotiable,
      attributes: values,
      ...(isPartsLeaf(listing.categorySlug) ? { part: partLayerToInput(partLayer) } : {}),
      // Место не стирается: без новой точки остаётся прежнее
      ...(location ? { location } : {}),
      addressVisibility: visibility,
      contactPhone: `+7${phone}`,
    };

    update.mutate(
      { id: listing.id, dto },
      {
        onSuccess: () => {
          const photoIds = photos.map((photo) => photo.id);
          setPhotos.mutate(
            { id: listing.id, photoIds },
            {
              onSuccess: () => {
                toast('Изменения сохранены');
                if (router.canGoBack()) router.back();
                else router.replace('/my-listings');
              },
              onError: (error: Error) => toast(error.message),
            },
          );
        },
        onError: (error: Error) => toast(error.message),
      },
    );
  };

  const saving = update.isPending || setPhotos.isPending;
  const city = cities.data?.find((item) => item.id === listing?.cityId);
  const cityCenter = city ? { latitude: city.latitude, longitude: city.longitude } : null;

  if (isLoading || !hydrated) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  if (isError || !listing) {
    return (
      <Screen scroll>
        <Text style={styles.error}>Не удалось загрузить объявление.</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/my-listings'))}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={12}
        >
          <Icon name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Правка объявления</Text>
      </View>

      <View style={styles.fields}>
        <PhotoGridEditor
          photos={photos}
          onAdd={() => void addPhotos()}
          onRemove={removePhoto}
          onMove={movePhoto}
          onMakeCover={makeCover}
          uploading={uploading}
        />

        <TextField
          label="Заголовок"
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          error={showErrors ? minLengthError(title, 5) : undefined}
        />

        <TextField
          label="Описание"
          value={description}
          onChangeText={setDescription}
          style={styles.textarea}
          multiline
          maxLength={3000}
          error={showErrors ? minLengthError(description, 10) : undefined}
        />

        {category && needsDealChoice(category) && (
          <DealPicker category={category} value={deal} onChange={setDeal} />
        )}

        {fields
          .filter((field) => isAttributeVisible(field, values))
          .map((field) => (
            <AttributeField
              key={field.key}
              field={field}
              value={values[field.key]}
              values={values}
              onChange={(value) =>
                setValues((current) => withAttributeValue(fields, current, field.key, value))
              }
            />
          ))}

        {listing && isPartsLeaf(listing.categorySlug) && (
          <PartLayerEditor
            slug={listing.categorySlug}
            value={partLayer}
            onChange={setPartLayer}
            error={showErrors ? partLayerError(partLayer) : null}
          />
        )}

        {!priceless && (
          <Field label={`Цена, ₽${LISTING_PRICE_UNIT_SUFFIX[priceUnit]}`}>
            <TextInput
              value={price}
              onChangeText={(text) => setPrice(text.replace(/[^\d]/g, ''))}
              placeholder="Например, 25000"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              keyboardType="number-pad"
            />
          </Field>
        )}

        {!priceless && (
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Торг уместен</Text>
            <Switch value={isNegotiable} onValueChange={setNegotiable} />
          </View>
        )}

        <Text style={styles.sectionTitle}>Где находится</Text>
        {!listing.location && (
          <Text style={styles.hint}>
            У объявления пока нет точки на карте — его находят только по городу. Укажите место,
            чтобы оно попадало в поиск по расстоянию.
          </Text>
        )}
        <ListingLocationPicker
          value={location}
          onChange={setLocation}
          visibility={visibility}
          onChangeVisibility={setVisibility}
          defaultCenter={cityCenter ?? DAGESTAN_DEFAULT_CENTER}
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
        </Field>
      </View>

      <View style={styles.footer}>
        <Button label="Сохранить" onPress={save} loading={saving} fullWidth />
      </View>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    ...createFieldStyles(colors),
    loader: { marginTop: spacing.xxxl },
    error: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.xxxl,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    title: { ...typography.heading, color: colors.text },

    fields: { gap: spacing.lg },
    sectionTitle: { ...typography.subheading, color: colors.text, marginTop: spacing.sm },

    footer: { marginTop: spacing.xl, marginBottom: spacing.xxl },
  });
