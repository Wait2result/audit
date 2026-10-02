import { useMemo } from 'react';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';

import { Icon } from '../../src/components/Icon';
import { spacing, typography, useThemeColors } from '../../src/theme';

/**
 * Нижняя навигация (пункт 9 ТЗ).
 *
 * Ровно три раздела: Главная, Поиск, Профиль. Избранное сознательно НЕ вынесено
 * отдельной вкладкой — оно живёт в профиле и звёздочками прямо на карточках.
 * Пять-шесть вкладок внизу выглядят «богаче», но каждая лишняя уменьшает
 * остальные и делает промахи мимо нужной обычным делом.
 */
export default function TabsLayout() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Главная',
          tabBarIcon: ({ color, focused }) => (
            <Icon name="home" color={String(color)} filled={focused} size={26} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Поиск',
          tabBarIcon: ({ color, focused }) => (
            <Icon name="search" color={String(color)} filled={focused} size={26} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Профиль',
          tabBarIcon: ({ color, focused }) => (
            <Icon name="person" color={String(color)} filled={focused} size={26} />
          ),
        }}
      />
    </Tabs>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    tabBar: {
      // Отдельный от colors.surface: панель фиксирована над прокруткой,
      // и без блюра сквозная прозрачность мешала бы читать содержимое под ней
      backgroundColor: colors.navBar,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      // На Android панель ниже: там нет полосы жестов, съедающей место
      height: Platform.OS === 'ios' ? 88 : 64,
      paddingTop: spacing.sm,
    },
    tabItem: { paddingVertical: spacing.xs },
    tabLabel: { ...typography.label, fontSize: 11, fontWeight: '600' },
  });
