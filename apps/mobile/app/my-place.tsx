import { PLACE_MEMBER_ROLE_LABELS, PLACE_TYPE_LABELS } from '@dagestan/shared';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useMyPlaces } from '../src/api/queries';
import { Card } from '../src/components/Card';
import { FormHeader } from '../src/components/FormHeader';
import { Icon } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { useAuthStore } from '../src/store/auth-store';
import { spacing, typography, useThemeColors } from '../src/theme';

/**
 * Список заведений, которыми управляет этот аккаунт (Этап 6).
 *
 * У большинства оно одно — тогда экран не показывается вовсе, человек
 * сразу попадает в своё заведение.
 */
export default function MyPlacesScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { data: places, isLoading } = useMyPlaces(Boolean(user));

  const onlyPlace = places?.length === 1 ? places[0] : null;

  useEffect(() => {
    if (onlyPlace) {
      router.replace({ pathname: '/my-place/[id]', params: { id: onlyPlace.id } });
    }
  }, [onlyPlace, router]);

  return (
    <Screen scroll>
      <FormHeader title="Мои заведения" description="Управление меню и заказами" />

      {isLoading && <ActivityIndicator color={colors.primary} style={styles.loader} />}

      {places?.length === 0 && (
        <View style={styles.center}>
          <Icon name="food" size={40} color={colors.textFaint} />
          <Text style={styles.stateTitle}>Доступа к заведениям нет</Text>
          <Text style={styles.stateText}>
            Если вы работаете в заведении, попросите выдать доступ на этот номер телефона.
          </Text>
        </View>
      )}

      <View style={styles.list}>
        {places?.map((place) => (
          <Pressable
            key={place.id}
            onPress={() => router.push({ pathname: '/my-place/[id]', params: { id: place.id } })}
            accessibilityRole="button"
          >
            <Card padded>
              <Text style={styles.name}>{place.name}</Text>
              <Text style={styles.meta}>
                {PLACE_TYPE_LABELS[place.type]} · {place.cityName}
              </Text>
              <Text style={styles.role}>{PLACE_MEMBER_ROLE_LABELS[place.role]}</Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    loader: { paddingVertical: spacing.xxl },
    list: { gap: spacing.md },
    name: { ...typography.subheading, color: colors.text },
    meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    role: { ...typography.caption, color: colors.primaryDark, marginTop: spacing.xs },

    center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
    stateTitle: { ...typography.subheading, color: colors.text, textAlign: 'center' },
    stateText: {
      ...typography.caption,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
  });
