import { Pressable, StyleSheet } from 'react-native';

import { colors as staticColors, MIN_TOUCH_SIZE, useThemeColors } from '../theme';
import { Icon } from './Icon';

/**
 * Сердечко «в избранное» (Этап 6).
 *
 * Нажатие обрабатывается сразу, не дожидаясь ответа сервера: сердечко —
 * мелкое действие, и ждать полсекунды ради него человек не должен.
 * Если сервер откажет, вызывающий экран вернёт состояние обратно.
 *
 * `onDark` — вариант поверх фотографии: светлая подложка нужна, иначе контур
 * теряется на снимке. Подложка и контур здесь нарочно не зависят от темы
 * приложения (берутся из статической светлой палитры, не из `useThemeColors`) —
 * это плашка поверх чужой фотографии, а не поверх фона приложения, и в тёмной
 * теме сам текстовый цвет `colors.text` становится светлым, отчего контур
 * сливался бы с такой же светлой подложкой.
 */
export function FavoriteButton({
  isFavorite,
  onToggle,
  onDark = false,
  compact = false,
  size = 22,
}: {
  isFavorite: boolean;
  onToggle: () => void;
  onDark?: boolean;
  /** Меньший кружок поверх фотографии карточки; зона нажатия остаётся не меньше 44 pt */
  compact?: boolean;
  size?: number;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
      accessibilityState={{ selected: isFavorite }}
      hitSlop={compact ? 8 : 10}
      style={({ pressed }) => [
        styles.button,
        onDark && styles.onDark,
        onDark && compact && styles.onDarkCompact,
        pressed && styles.pressed,
      ]}
    >
      <Icon
        name="heart"
        size={size}
        color={isFavorite ? colors.danger : onDark ? staticColors.text : colors.textFaint}
        filled={isFavorite}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: MIN_TOUCH_SIZE - 12,
    minHeight: MIN_TOUCH_SIZE - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onDark: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    width: 38,
    height: 38,
  },
  onDarkCompact: { width: 32, height: 32, minWidth: 32, minHeight: 32 },
  pressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
});
