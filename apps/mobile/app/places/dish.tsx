import type { MenuOptionGroupDto } from '@dagestan/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { usePlace, usePlaceMenu } from '../../src/api/queries';
import { FavoriteButton } from '../../src/components/FavoriteButton';
import { Icon } from '../../src/components/Icon';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { Screen } from '../../src/components/Screen';
import { useAddToCart } from '../../src/hooks/use-add-to-cart';
import { useFavoriteActions } from '../../src/hooks/use-favorite-actions';
import { radius, shadow, spacing, typography, useThemeColors } from '../../src/theme';
import { formatMoney } from '../../src/utils/money';

/**
 * Карточка блюда (Этап 6).
 *
 * Здесь выбирают соус, добавки и количество. Обязательный выбор нельзя
 * пропустить: кнопка добавления выключена, пока не отмечено требуемое —
 * привезти шашлык без соуса, о котором человека не спросили, значит
 * привезти не то.
 *
 * Сумма на кнопке считается прямо здесь и только для показа. Настоящий
 * счёт присылает сервер: он пересчитывает заказ с нуля по своим ценам.
 */
export default function DishScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { placeId, itemId } = useLocalSearchParams<{ placeId: string; itemId: string }>();

  const { data: place } = usePlace(String(placeId));
  const { data: menu, isLoading } = usePlaceMenu(String(placeId));

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);

  const addToCart = useAddToCart(place ? { id: place.id, name: place.name } : null);
  const { toggleDish } = useFavoriteActions();

  const item = useMemo(
    () =>
      menu?.categories.flatMap((group) => group.items).find((dish) => dish.id === String(itemId)),
    [menu, itemId],
  );

  if (isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  if (!item) {
    return (
      <Screen scroll>
        <Text style={styles.error}>Блюдо не найдено — возможно, его убрали из меню.</Text>
      </Screen>
    );
  }

  const toggle = (group: MenuOptionGroupDto, optionId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      const inGroup = group.options.filter((option) => next.has(option.id)).map((o) => o.id);

      if (next.has(optionId)) {
        next.delete(optionId);
        return next;
      }

      // Группа «выберите один» работает как переключатель: новый выбор
      // заменяет прежний, а не добавляется к нему
      if (group.maxChoices === 1) {
        inGroup.forEach((id) => next.delete(id));
      } else if (inGroup.length >= group.maxChoices) {
        // Набрали максимум — самый ранний выбор уступает место новому
        next.delete(inGroup[0] ?? '');
      }

      next.add(optionId);
      return next;
    });
  };

  const missing = item.groups.filter(
    (group) =>
      group.minChoices > 0 &&
      group.options.filter((option) => selected.has(option.id)).length < group.minChoices,
  );

  const surcharge = item.groups
    .flatMap((group) => group.options)
    .filter((option) => selected.has(option.id))
    .reduce((sum, option) => sum + option.priceDelta, 0);

  const total = (item.price + surcharge) * quantity;
  const orderable = Boolean(place?.ordersEnabled && place.openState.isOpenNow);
  const photo = item.image?.url ?? item.image?.thumbnailUrl ?? null;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {photo && !imageFailed ? (
            <Image
              source={{ uri: photo }}
              style={styles.heroImage}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Icon name="food" size={44} color="rgba(255,255,255,0.45)" />
            </View>
          )}

          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}
          >
            <Text style={styles.heroBackIcon}>←</Text>
          </Pressable>

          <View style={styles.heroHeart}>
            <FavoriteButton
              isFavorite={item.isFavorite}
              onToggle={() => toggleDish(item, String(placeId))}
              onDark
              size={20}
            />
          </View>
        </View>

        <View style={styles.page}>
          <Text style={styles.title}>{item.name}</Text>
          {item.description && <Text style={styles.description}>{item.description}</Text>}

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatMoney(item.price)}</Text>
            {item.portion && <Text style={styles.portion}>· {item.portion}</Text>}
          </View>

          {!item.isAvailable && (
            <Text style={styles.stopped}>Сегодня закончилось. Загляните завтра.</Text>
          )}

          {item.groups.map((group) => (
            <View key={group.id} style={styles.group}>
              <Text style={styles.groupTitle}>{group.name}</Text>
              <Text style={styles.groupHint}>{groupHint(group)}</Text>

              {group.maxChoices === 1 ? (
                <View style={styles.optionChips}>
                  {group.options.map((option) => (
                    <Pressable
                      key={option.id}
                      onPress={() => toggle(group, option.id)}
                      disabled={!option.isAvailable}
                      accessibilityRole="radio"
                      accessibilityState={{
                        selected: selected.has(option.id),
                        disabled: !option.isAvailable,
                      }}
                      style={({ pressed }) => [
                        styles.optionChip,
                        selected.has(option.id) && styles.optionChipActive,
                        !option.isAvailable && styles.optionOff,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionChipLabel,
                          selected.has(option.id) && styles.optionChipLabelActive,
                        ]}
                      >
                        {option.name}
                      </Text>
                      {option.priceDelta !== 0 && (
                        <Text style={styles.optionDelta}>
                          {option.priceDelta > 0 ? '+' : ''}
                          {formatMoney(option.priceDelta)}
                        </Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              ) : (
                group.options.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => toggle(group, option.id)}
                    disabled={!option.isAvailable}
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: selected.has(option.id),
                      disabled: !option.isAvailable,
                    }}
                    style={({ pressed }) => [
                      styles.optionRow,
                      !option.isAvailable && styles.optionOff,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.box, selected.has(option.id) && styles.boxChecked]}>
                      {selected.has(option.id) && (
                        <Icon name="check" size={13} color={colors.textOnPrimary} />
                      )}
                    </View>
                    <Text style={styles.optionRowLabel}>{option.name}</Text>
                    {option.priceDelta !== 0 && (
                      <Text style={styles.optionDelta}>
                        {option.priceDelta > 0 ? '+' : ''}
                        {formatMoney(option.priceDelta)}
                      </Text>
                    )}
                  </Pressable>
                ))
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <QuantityStepper value={quantity} onChange={setQuantity} min={1} max={99} />

        <Pressable
          onPress={() => addToCart(item, [...selected], quantity, () => router.back())}
          disabled={!orderable || !item.isAvailable || missing.length > 0}
          accessibilityRole="button"
          accessibilityLabel={`Добавить в корзину за ${formatMoney(total)}`}
          style={({ pressed }) => [
            styles.addButton,
            (!orderable || !item.isAvailable || missing.length > 0) && styles.addButtonOff,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.addLabel}>
            {missing.length > 0
              ? `Выберите: ${missing.map((group) => group.name.toLowerCase()).join(', ')}`
              : !item.isAvailable
                ? 'Нет в наличии'
                : !orderable
                  ? 'Заказ сейчас недоступен'
                  : `Добавить · ${formatMoney(total)}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function groupHint(group: MenuOptionGroupDto): string {
  if (group.minChoices > 0 && group.maxChoices === 1) return 'выберите один';
  if (group.minChoices > 0) return `выберите от ${group.minChoices} до ${group.maxChoices}`;
  if (group.maxChoices === 1) return 'не обязательно, один вариант';

  return `не обязательно, до ${group.maxChoices}`;
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: 120 },
    loader: { paddingVertical: spacing.xxxl },
    error: { ...typography.body, color: colors.textMuted },
    pressed: { opacity: 0.8 },

    hero: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.surfaceMuted },
    heroImage: { width: '100%', height: '100%' },
    heroPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#8a7a5f' },
    heroBackIcon: { fontSize: 22, lineHeight: 26, color: colors.text },
    heroButton: {
      position: 'absolute',
      top: spacing.xxl + spacing.md,
      left: spacing.lg,
      width: 38,
      height: 38,
      borderRadius: radius.full,
      backgroundColor: 'rgba(255,255,255,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    heroHeart: { position: 'absolute', top: spacing.xxl + spacing.md - 2, right: spacing.lg },

    page: { padding: spacing.lg, gap: spacing.sm },
    title: { ...typography.title, fontSize: 22, color: colors.text },
    description: { ...typography.body, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: spacing.xs },
    price: { ...typography.heading, fontSize: 20, color: colors.text },
    portion: { ...typography.caption, color: colors.textFaint },
    stopped: { ...typography.caption, color: colors.danger },

    group: { gap: spacing.xs, marginTop: spacing.lg },
    groupTitle: { ...typography.subheading, fontSize: 15, color: colors.text },
    groupHint: { ...typography.caption, fontSize: 12, color: colors.textFaint, marginBottom: 4 },

    optionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    optionChip: {
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    optionChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    optionChipLabel: { ...typography.caption, fontSize: 13, color: colors.text },
    optionChipLabelActive: { color: colors.primaryDark, fontWeight: '600' },
    optionDelta: { ...typography.caption, fontSize: 11, color: colors.textFaint },
    optionOff: { opacity: 0.4 },

    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
    },
    box: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    optionRowLabel: { ...typography.body, fontSize: 14, color: colors.text, flex: 1 },

    bottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl + spacing.sm,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.border,
      ...shadow.raised,
    },
    addButton: {
      flex: 1,
      height: 48,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    addButtonOff: { backgroundColor: colors.borderStrong },
    addLabel: { ...typography.subheading, fontSize: 15, color: colors.textOnPrimary },
  });
