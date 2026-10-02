import { WEEKDAYS, type MediaDto, type PlaceScheduleDto } from '@dagestan/shared';
import { useLocalSearchParams } from 'expo-router';
import { useState, useMemo } from 'react';
import { ActivityIndicator, Image, StyleSheet, Switch, Text, View } from 'react-native';

import { useMyPlace, useUpdateMyPlace, useUpdateSchedule } from '../../../src/api/queries';
import { pickAndUploadPhoto } from '../../../src/api/upload';
import { Button } from '../../../src/components/Button';
import { FormHeader } from '../../../src/components/FormHeader';
import { Screen } from '../../../src/components/Screen';
import { TextField } from '../../../src/components/TextField';
import { radius, spacing, typography, useThemeColors } from '../../../src/theme';

/**
 * Настройки заведения: контакты, фото, доставка и часы работы (Этап 6).
 * Экран доступен только управляющему — сервер проверяет это отдельно.
 */
export default function PlaceSettingsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const placeId = String(id);

  const { data: place, isLoading } = useMyPlace(placeId);
  const updatePlace = useUpdateMyPlace(placeId);
  const updateSchedule = useUpdateSchedule(placeId);

  if (isLoading || !place) {
    return (
      <Screen scroll>
        <FormHeader title="Настройки" />
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <FormHeader title="Настройки" description={place.name} />
      <MainSettings place={place} onSave={updatePlace.mutate} saving={updatePlace.isPending} />
      <ScheduleEditor
        schedule={place.schedule}
        onSave={(days) => updateSchedule.mutate({ days })}
        saving={updateSchedule.isPending}
      />
    </Screen>
  );
}

function MainSettings({
  place,
  onSave,
  saving,
}: {
  place: {
    phone: string | null;
    description: string | null;
    cover: MediaDto | null;
    delivery: {
      hasDelivery: boolean;
      hasPickup: boolean;
      deliveryFee: number;
      freeDeliveryFrom: number | null;
      minOrderAmount: number;
      deliveryMinutes: number | null;
    };
  };
  onSave: (dto: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [phone, setPhone] = useState(place.phone ?? '');
  const [description, setDescription] = useState(place.description ?? '');
  const [cover, setCover] = useState<MediaDto | null>(place.cover);
  const [hasDelivery, setHasDelivery] = useState(place.delivery.hasDelivery);
  const [hasPickup, setHasPickup] = useState(place.delivery.hasPickup);
  const [deliveryFee, setDeliveryFee] = useState(String(place.delivery.deliveryFee / 100));
  const [freeFrom, setFreeFrom] = useState(
    place.delivery.freeDeliveryFrom === null ? '' : String(place.delivery.freeDeliveryFrom / 100),
  );
  const [minOrder, setMinOrder] = useState(String(place.delivery.minOrderAmount / 100));
  const [minutes, setMinutes] = useState(
    place.delivery.deliveryMinutes === null ? '' : String(place.delivery.deliveryMinutes),
  );
  const [uploading, setUploading] = useState(false);

  /** Рубли из поля — копейки на сервер. */
  const kopecks = (value: string): number => Math.round(Number(value.replace(',', '.')) * 100) || 0;

  const addPhoto = async () => {
    setUploading(true);
    try {
      const uploaded = await pickAndUploadPhoto();
      if (uploaded) setCover(uploaded);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.section}>
      {cover && <Image source={{ uri: cover.thumbnailUrl ?? cover.url }} style={styles.cover} />}
      <Button
        label={cover ? 'Заменить фотографию' : 'Добавить фотографию заведения'}
        variant="secondary"
        onPress={() => void addPhoto()}
        loading={uploading}
      />

      <TextField label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <TextField
        label="Описание"
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="Чем вы отличаетесь от соседей"
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Доставка</Text>
        <Switch
          value={hasDelivery}
          onValueChange={setHasDelivery}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Самовывоз</Text>
        <Switch
          value={hasPickup}
          onValueChange={setHasPickup}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>

      {hasDelivery && (
        <>
          <TextField
            label="Стоимость доставки, ₽"
            value={deliveryFee}
            onChangeText={setDeliveryFee}
            keyboardType="decimal-pad"
          />
          <TextField
            label="Бесплатно от суммы, ₽"
            value={freeFrom}
            onChangeText={setFreeFrom}
            keyboardType="decimal-pad"
            hint="Пусто — доставка платная всегда"
          />
          <TextField
            label="Минимальная сумма заказа, ₽"
            value={minOrder}
            onChangeText={setMinOrder}
            keyboardType="decimal-pad"
          />
          <TextField
            label="Срок доставки, минут"
            value={minutes}
            onChangeText={setMinutes}
            keyboardType="number-pad"
          />
        </>
      )}

      <Button
        label="Сохранить"
        loading={saving}
        onPress={() =>
          onSave({
            phone: phone.trim() || null,
            description: description.trim() || null,
            coverMediaId: cover?.id ?? null,
            hasDelivery,
            hasPickup,
            deliveryFee: kopecks(deliveryFee),
            freeDeliveryFrom: freeFrom.trim() ? kopecks(freeFrom) : null,
            minOrderAmount: kopecks(minOrder),
            deliveryMinutes: minutes.trim() ? Number(minutes) : null,
          })
        }
      />
    </View>
  );
}

function ScheduleEditor({
  schedule,
  onSave,
  saving,
}: {
  schedule: PlaceScheduleDto[];
  onSave: (days: PlaceScheduleDto[]) => void;
  saving: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [days, setDays] = useState<PlaceScheduleDto[]>(() =>
    WEEKDAYS.map(
      (weekday) =>
        schedule.find((day) => day.weekday === weekday.value) ?? {
          weekday: weekday.value,
          isClosed: false,
          opensAt: '09:00',
          closesAt: '22:00',
        },
    ),
  );

  const patch = (weekday: number, changes: Partial<PlaceScheduleDto>) =>
    setDays((current) =>
      current.map((day) => (day.weekday === weekday ? { ...day, ...changes } : day)),
    );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Часы работы</Text>

      {days.map((day) => (
        <View key={day.weekday} style={styles.dayRow}>
          <Text style={styles.dayName}>
            {WEEKDAYS.find((weekday) => weekday.value === day.weekday)?.short}
          </Text>

          <View style={styles.dayTimes}>
            <TextField
              value={day.opensAt}
              onChangeText={(value) => patch(day.weekday, { opensAt: value })}
              placeholder="09:00"
              keyboardType="numbers-and-punctuation"
              style={styles.timeField}
              editable={!day.isClosed}
            />
            <Text style={styles.dash}>—</Text>
            <TextField
              value={day.closesAt}
              onChangeText={(value) => patch(day.weekday, { closesAt: value })}
              placeholder="22:00"
              keyboardType="numbers-and-punctuation"
              style={styles.timeField}
              editable={!day.isClosed}
            />
          </View>

          <Switch
            value={!day.isClosed}
            onValueChange={(open) => patch(day.weekday, { isClosed: !open })}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      ))}

      <Text style={styles.hint}>
        Работаете за полночь — поставьте закрытие раньше открытия: 10:00 — 02:00.
      </Text>

      <Button label="Сохранить часы" loading={saving} onPress={() => onSave(days)} />
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    loader: { paddingVertical: spacing.xxl },
    section: { gap: spacing.md, marginBottom: spacing.xxl },
    sectionTitle: { ...typography.heading, fontSize: 18, color: colors.text },
    cover: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceMuted,
    },

    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    switchLabel: { ...typography.body, color: colors.text },

    dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dayName: { ...typography.subheading, fontSize: 14, color: colors.textMuted, width: 30 },
    dayTimes: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    timeField: { flex: 1 },
    dash: { color: colors.textFaint },
    hint: { ...typography.caption, color: colors.textFaint, lineHeight: 18 },
  });
