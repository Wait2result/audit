import type { ReactElement, ReactNode, Ref } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, useThemeColors } from '../theme';
import { AppBackground } from './AppBackground';

interface ScreenProps {
  children: ReactNode;
  /** Прокручивать содержимое (для форм и длинных экранов) */
  scroll?: boolean;
  /** Отступы по краям. Отключается для экранов с содержимым во всю ширину */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Тёмный фон: заставка, экраны онбординга */
  dark?: boolean;
  /**
   * Заменяет обычный фон (AppBackground / тёмный ink) на произвольный —
   * например, фотографию неба на экране погоды, которая меняется по времени
   * суток и условиям. Если задан, `dark` на выбор фона не влияет.
   */
  background?: ReactNode;
  /**
   * Переопределяет цвет корневой подложки под `background` — он виден, пока
   * картинка фона ещё не отрисована. Без него берётся обычный `fallbackColor`
   * (`colors.ink`/`colors.background`) — этого достаточно, пока кастомный
   * `background` близок по тону к фону приложения. Нужен, когда фон
   * выглядит совсем иначе (тёмная фотография неба на экране погоды поверх
   * светлой темы) — иначе на мгновение мелькнёт светлая подложка.
   */
  backgroundColor?: string;
  /**
   * Обновление содержимого свайпом сверху вниз. Работает только вместе
   * со `scroll` — тянуть можно лишь то, что прокручивается.
   */
  refreshControl?: ReactElement<RefreshControlProps>;
  /**
   * Закреплённая нижняя панель: остаётся на месте, пока содержимое
   * прокручивается, и поднимается вместе с клавиатурой. Для главной кнопки
   * длинной формы («Опубликовать»).
   */
  footer?: ReactNode;
  /** Ссылка на прокрутку — чтобы экран мог довести человека до нужного места */
  scrollRef?: Ref<ScrollView>;
}

/**
 * Основа экрана.
 *
 * Решает две задачи, которые иначе приходится помнить на каждом экране:
 *
 *   1. Безопасные отступы — вырез камеры сверху и полоса жестов снизу.
 *      Без них текст уезжает под «чёлку», а кнопки под системную полосу.
 *
 *   2. Клавиатура. На iOS она наезжает на поля ввода, и человек не видит,
 *      что печатает. Экран поднимается вместе с ней.
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  style,
  contentStyle,
  dark = false,
  background,
  backgroundColor,
  refreshControl,
  footer,
  scrollRef,
}: ScreenProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  // Тёмный экран (заставка и т. п.) остаётся полностью непрозрачным.
  // Светлый тоже непрозрачный — цвет ниже лишь подложка на время загрузки
  // картинки: сама AppBackground (или переданный background) рисуется поверх него.
  const fallbackColor = backgroundColor ?? (dark ? colors.ink : colors.background);

  const content = (
    <View
      style={[
        styles.content,
        padded && styles.padded,
        { paddingBottom: footer ? spacing.lg : Math.max(insets.bottom, spacing.lg) },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  const backgroundLayer = background ?? (!dark && <AppBackground />);

  // Фон — неподвижный слой размером с экран под всем остальным: содержимое
  // прокручивается поверх него, а сам он стоит на месте. Лежит снаружи
  // отступа под статус-бар, поэтому уходит и под «чёлку» — без светлой
  // полосы сверху, которая получалась, когда фон жил внутри прокрутки.
  return (
    <View style={[styles.root, { backgroundColor: fallbackColor }]}>
      <View style={[StyleSheet.absoluteFill, styles.noTouch]}>{backgroundLayer}</View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.root, { paddingTop: insets.top }, style]}
      >
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
          >
            {content}
          </ScrollView>
        ) : (
          content
        )}
        {footer ? (
          <View
            style={[
              styles.footer,
              {
                paddingBottom: Math.max(insets.bottom, spacing.md),
                borderTopColor: colors.border,
                backgroundColor: colors.navBar,
              },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  noTouch: { pointerEvents: 'none' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { flex: 1 },
  padded: { paddingHorizontal: spacing.lg },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
