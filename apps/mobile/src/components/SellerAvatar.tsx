import type { MediaDto } from '@dagestan/shared';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '../theme';
import { RemoteImage } from './RemoteImage';

/** Аватар продавца: фото, а без него — первая буква имени на мягком фоне. */
export function SellerAvatar({
  name,
  avatar,
  size = 44,
}: {
  name: string;
  avatar: MediaDto | null;
  size?: number;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors, size), [colors, size]);
  const letter = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <View style={styles.box}>
      {avatar ? (
        <RemoteImage
          uri={avatar.thumbnailUrl ?? avatar.url}
          style={styles.image}
          fallback={<Text style={styles.letter}>{letter}</Text>}
        />
      ) : (
        <Text style={styles.letter}>{letter}</Text>
      )}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>, size: number) =>
  StyleSheet.create({
    box: {
      width: size,
      height: size,
      borderRadius: size / 2,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    image: { width: '100%', height: '100%' },
    letter: { fontSize: size * 0.42, fontWeight: '700', color: colors.primary },
  });
