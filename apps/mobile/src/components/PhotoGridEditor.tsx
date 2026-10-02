import { LISTING_MAX_PHOTOS, type MediaDto } from '@dagestan/shared';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useThemeColors } from '../theme';
import { Icon } from './Icon';
import { RemoteImage } from './RemoteImage';

/**
 * Фотографии объявления: добавление, порядок, обложка, удаление.
 *
 * Общий компонент для подачи и правки. Правила простые и видимые:
 *   - первая фотография — обложка (её видно в ленте), у неё рамка и метка;
 *   - «★» на любой другой делает её обложкой — переносит в начало;
 *   - стрелки двигают фото на место левее или правее, «×» убирает его.
 * Пока фото нет — одна спокойная область «Добавить фото» и строка подсказки;
 * в сетке её продолжает такая же плитка «Добавить». Без крупных заливок и
 * длинных пояснений: фото — обычное поле формы, а не рекламный блок.
 */
export function PhotoGridEditor({
  photos,
  onAdd,
  onRemove,
  onMove,
  onMakeCover,
  uploading,
}: {
  photos: MediaDto[];
  onAdd: () => void;
  onRemove: (photoId: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  /** Сделать фото обложкой. Без обработчика кнопка «★» не показывается */
  onMakeCover?: (index: number) => void;
  uploading: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const canAdd = photos.length < LISTING_MAX_PHOTOS;

  if (photos.length === 0) {
    return (
      <Pressable
        onPress={onAdd}
        disabled={uploading}
        accessibilityRole="button"
        accessibilityLabel="Добавить фотографии"
        style={({ pressed }) => [styles.empty, pressed && styles.pressed]}
      >
        {uploading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Icon name="plus" size={22} color={colors.primary} />
        )}
        <Text style={styles.emptyTitle}>{uploading ? 'Загружаем фото…' : 'Добавить фото'}</Text>
        <Text style={styles.emptyText}>До {LISTING_MAX_PHOTOS} · первое станет обложкой</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.hint}>
        {photos.length} из {LISTING_MAX_PHOTOS} · первое — обложка
      </Text>

      <View style={styles.grid}>
        {photos.map((photo, index) => {
          const isCover = index === 0;
          return (
            <View key={photo.id} style={[styles.tile, isCover && styles.tileCover]}>
              <RemoteImage
                uri={photo.thumbnailUrl ?? photo.url}
                style={styles.photo}
                containerStyle={styles.photoPlaceholder}
                fallback={<Icon name="image" size={20} color={colors.primary} />}
              />

              {isCover && (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverBadgeText}>Обложка</Text>
                </View>
              )}

              <Pressable
                onPress={() => onRemove(photo.id)}
                accessibilityRole="button"
                accessibilityLabel={`Удалить фото ${index + 1}`}
                hitSlop={8}
                style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
              >
                <Icon name="close" size={14} color="#ffffff" />
              </Pressable>

              <View style={styles.toolbar}>
                <ToolButton
                  icon="chevron-left"
                  label={`Фото ${index + 1}: левее`}
                  disabled={index === 0}
                  onPress={() => onMove(index, -1)}
                />
                {onMakeCover && !isCover ? (
                  <ToolButton
                    icon="star"
                    label={`Сделать фото ${index + 1} обложкой`}
                    onPress={() => onMakeCover(index)}
                  />
                ) : (
                  <View style={styles.toolSpacer} />
                )}
                <ToolButton
                  icon="chevron-right"
                  label={`Фото ${index + 1}: правее`}
                  disabled={index === photos.length - 1}
                  onPress={() => onMove(index, 1)}
                />
              </View>
            </View>
          );
        })}

        {canAdd && (
          <Pressable
            onPress={onAdd}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel="Добавить ещё фотографии"
            style={({ pressed }) => [styles.tile, styles.add, pressed && styles.pressed]}
          >
            <View style={styles.addInner}>
              {uploading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Icon name="plus" size={20} color={colors.primary} />
                  <Text style={styles.addLabel}>Добавить</Text>
                </>
              )}
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function ToolButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: 'chevron-left' | 'chevron-right' | 'star';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
    >
      <Icon name={icon} size={14} color={disabled ? 'rgba(255,255,255,0.35)' : '#ffffff'} />
    </Pressable>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    pressed: { opacity: 0.85 },
    wrapper: { gap: spacing.sm },
    hint: { ...typography.caption, color: colors.textMuted },

    // Область добавления: тонкая пунктирная рамка без заливки — как поле
    // формы, а не рекламная плашка
    empty: {
      minHeight: 112,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.borderStrong,
    },
    emptyTitle: { ...typography.body, color: colors.primary, fontWeight: '600' },
    emptyText: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    tile: {
      width: '31.5%',
      aspectRatio: 1,
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tileCover: { borderWidth: 2, borderColor: colors.primary },
    photo: { width: '100%', height: '100%' },
    photoPlaceholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    coverBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.sm,
      backgroundColor: colors.primary,
    },
    coverBadgeText: { ...typography.label, color: colors.textOnPrimary, fontSize: 10 },
    remove: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(13,24,26,0.7)',
    },
    toolbar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 4,
      paddingVertical: 4,
      backgroundColor: 'rgba(13,24,26,0.55)',
    },
    tool: { padding: 4 },
    toolSpacer: { width: 22 },

    add: {
      backgroundColor: 'transparent',
      borderStyle: 'dashed',
      borderColor: colors.borderStrong,
    },
    // Слой на всю плитку: на вебе Pressable не всегда растягивается по
    // высоте, и центрирование внутри него съезжало
    addInner: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    addLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  });
