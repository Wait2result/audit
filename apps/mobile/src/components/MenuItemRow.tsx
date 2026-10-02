import { useMemo } from 'react';
import type { MenuItemDto } from '@dagestan/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';
import { formatMoney } from '../utils/money';
import { FavoriteButton } from './FavoriteButton';
import { Icon } from './Icon';
import { RemoteImage } from './RemoteImage';

/**
 * Строка меню (Этап 6).
 *
 * Кнопка «+» добавляет в корзину сразу, если у блюда нет обязательного
 * выбора. Когда выбор есть — открывается карточка блюда: молча положить
 * шашлык «без соуса», когда человека не спросили, значит привезти не то.
 *
 * Сердечко и «+» — соседи нажимаемой строки, а не её содержимое: кнопка
 * внутри кнопки даёт недопустимую разметку в вебе и путает голосовой доступ.
 *
 * Позиция из стоп-листа не исчезает из меню, а гаснет с подписью: человек
 * должен видеть, что блюдо вообще бывает, просто сегодня закончилось.
 */
export function MenuItemRow({
  item,
  onOpen,
  onQuickAdd,
  onToggleFavorite,
  onOpenPlace,
  inCart = 0,
  placeName,
  note,
}: {
  item: MenuItemDto;
  onOpen: () => void;
  onQuickAdd: () => void;
  /** Без него сердечка нет — например, в кабинете заведения */
  onToggleFavorite?: () => void;
  /**
   * Переход в карточку заведения — например, из избранных блюд, где иначе
   * до ресторана было не добраться, не разыскивая его в каталоге заново.
   * Без обработчика подпись остаётся обычным текстом.
   */
  onOpenPlace?: () => void;
  /** Сколько таких уже в корзине — показывается на кнопке вместо плюса */
  inCart?: number;
  /** В списке избранного блюда из разных заведений: подпись говорит, откуда */
  placeName?: string;
  /** Пояснение под ценой: «Откроется в 10:00» */
  note?: string;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const photo = item.image?.thumbnailUrl ?? item.image?.url ?? null;

  const needsChoice = item.groups.some((group) => group.minChoices > 0);
  const disabled = !item.isAvailable;

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${formatMoney(item.price)}`}
          style={({ pressed }) => [
            styles.imageBox,
            disabled && styles.dimmed,
            pressed && styles.pressed,
          ]}
        >
          <RemoteImage
            uri={photo}
            style={styles.image}
            containerStyle={styles.placeholder}
            fallback={<Icon name="food" size={22} color="rgba(255,255,255,0.5)" />}
          />
        </Pressable>

        <View style={[styles.body, disabled && styles.dimmed]}>
          {placeName &&
            (onOpenPlace ? (
              // Соседняя кнопка, а не содержимое строки ниже: два разных
              // перехода (в заведение и в блюдо) не должны жить в одной
              // области нажатия
              <Pressable
                onPress={onOpenPlace}
                accessibilityRole="button"
                accessibilityLabel={`Открыть заведение «${placeName}»`}
                hitSlop={6}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.placeName} numberOfLines={1}>
                  {placeName} →
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.placeName} numberOfLines={1}>
                {placeName}
              </Text>
            ))}

          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${formatMoney(item.price)}`}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>

            {item.description && !placeName && (
              <Text style={styles.description} numberOfLines={2}>
                {item.description}
              </Text>
            )}

            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatMoney(item.price)}</Text>
              {item.portion && <Text style={styles.portion}>· {item.portion}</Text>}
            </View>

            {disabled && <Text style={styles.stopped}>Сегодня закончилось</Text>}
            {!disabled && note && <Text style={styles.note}>{note}</Text>}
          </Pressable>
        </View>
      </View>

      {onToggleFavorite && (
        <View style={styles.heart}>
          <FavoriteButton isFavorite={item.isFavorite} onToggle={onToggleFavorite} size={19} />
        </View>
      )}

      {!disabled && (
        <Pressable
          onPress={needsChoice ? onOpen : onQuickAdd}
          accessibilityRole="button"
          accessibilityLabel={
            needsChoice ? `Выбрать ${item.name}` : `Добавить «${item.name}» в корзину`
          }
          hitSlop={8}
          style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
        >
          {inCart > 0 ? (
            <Text style={styles.addCount}>{inCart}</Text>
          ) : (
            <Icon name="plus" size={18} color={colors.textOnPrimary} />
          )}
        </Pressable>
      )}
    </View>
  );
}

const IMAGE_SIZE = 82;
const ADD_SIZE = 36;

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    wrapper: { justifyContent: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      // Место под кнопки справа, которые лежат поверх строки
      paddingRight: ADD_SIZE + spacing.md,
    },
    pressed: { opacity: 0.8 },
    dimmed: { opacity: 0.45 },

    imageBox: {
      width: IMAGE_SIZE,
      height: IMAGE_SIZE,
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    image: { width: '100%', height: '100%' },
    placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#8a7a5f' },

    body: { flex: 1, gap: 2 },
    placeName: {
      ...typography.caption,
      fontSize: 11,
      color: colors.primaryDark,
      fontWeight: '600',
    },
    name: { ...typography.subheading, fontSize: 15, color: colors.text },
    description: { ...typography.caption, fontSize: 12, color: colors.textMuted, lineHeight: 16 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 },
    price: { ...typography.subheading, fontSize: 15, color: colors.text },
    portion: { ...typography.caption, fontSize: 12, color: colors.textFaint },
    stopped: { ...typography.caption, fontSize: 11, color: colors.danger },
    note: { ...typography.caption, fontSize: 11, color: colors.textFaint },

    // Сердечко в верхнем правом углу, «+» — по центру: они не мешают друг другу
    heart: { position: 'absolute', right: -6, top: 0 },
    add: {
      position: 'absolute',
      right: 0,
      bottom: spacing.md,
      width: ADD_SIZE,
      height: ADD_SIZE,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addPressed: { opacity: 0.8, transform: [{ scale: 0.94 }] },
    addCount: { ...typography.subheading, fontSize: 14, color: colors.textOnPrimary },
  });
