import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';

import { useToggleDishFavorite, useToggleFavorite, useToggleListingFavorite } from '../api/queries';
import { useAuthStore } from '../store/auth-store';
import { useToastStore } from '../store/toast-store';

/**
 * Нажатие на сердечко (Этап 6).
 *
 * Собрано в одном месте, потому что правило одно на все экраны и оно не из
 * очевидных.
 *
 * Гость. Избранное принадлежит человеку, и без аккаунта ему негде жить.
 * Раньше запрос уходил без входа, сервер отвечал 401, приложение считало
 * сессию потерянной, а сердечко на глазах закрашивалось и гасло. Теперь
 * гостя останавливают ещё до запроса и предлагают войти.
 *
 * Отклик. Закрашенное сердечко не говорит, куда именно попало добавленное.
 * Подсказка отвечает и предлагает открыть избранное.
 */
export function useFavoriteActions() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const showToast = useToastStore((s) => s.show);

  const togglePlaceMutation = useToggleFavorite();
  const toggleDishMutation = useToggleDishFavorite();
  const toggleListingMutation = useToggleListingFavorite();

  // Аккаунт у человека может уже быть, поэтому оба пути: вход и регистрация.
  // После входа он вернётся на этот же экран и нажмёт сердечко ещё раз
  const askToSignIn = useCallback(() => {
    const login = () => router.push('/auth/login?back=1');
    const register = () => router.push('/auth/phone');

    // Alert на вебе не показывается вовсе (см. utils/confirm.ts): там сразу
    // открываем вход, а с него есть переход на «Создать аккаунт»
    if (Platform.OS === 'web') {
      login();
      return;
    }

    Alert.alert(
      'Войдите в аккаунт',
      'Так избранное сохранится и будет под рукой на любом телефоне.',
      [
        { text: 'Войти', onPress: login },
        { text: 'Создать аккаунт', onPress: register },
        { text: 'Не сейчас', style: 'cancel' },
      ],
    );
  }, [router]);

  const failed = useCallback(
    () => showToast('Не получилось. Проверьте связь и попробуйте ещё раз'),
    [showToast],
  );

  const togglePlace = useCallback(
    (place: { id: string; isFavorite: boolean }) => {
      if (!user) {
        askToSignIn();
        return;
      }

      togglePlaceMutation.mutate(
        { placeId: place.id, isFavorite: place.isFavorite },
        {
          onSuccess: (result) =>
            showToast(
              result.isFavorite ? 'Ресторан в избранном' : 'Убрано из избранного',
              result.isFavorite
                ? {
                    label: 'Открыть',
                    onPress: () =>
                      router.push({ pathname: '/favorites', params: { tab: 'places' } }),
                  }
                : undefined,
            ),
          onError: failed,
        },
      );
    },
    [user, askToSignIn, togglePlaceMutation, showToast, router, failed],
  );

  const toggleDish = useCallback(
    (item: { id: string; isFavorite: boolean }, placeId: string) => {
      if (!user) {
        askToSignIn();
        return;
      }

      toggleDishMutation.mutate(
        { itemId: item.id, placeId, isFavorite: item.isFavorite },
        {
          onSuccess: (result) =>
            showToast(
              result.isFavorite ? 'Блюдо в избранном' : 'Убрано из избранного',
              result.isFavorite
                ? {
                    label: 'Открыть',
                    onPress: () =>
                      router.push({ pathname: '/favorites', params: { tab: 'dishes' } }),
                  }
                : undefined,
            ),
          onError: failed,
        },
      );
    },
    [user, askToSignIn, toggleDishMutation, showToast, router, failed],
  );

  const toggleListing = useCallback(
    (listing: { id: string; isFavorite: boolean }) => {
      if (!user) {
        askToSignIn();
        return;
      }

      toggleListingMutation.mutate(
        { listingId: listing.id, isFavorite: listing.isFavorite },
        {
          onSuccess: (result) =>
            showToast(result.isFavorite ? 'Объявление в избранном' : 'Убрано из избранного'),
          onError: failed,
        },
      );
    },
    [user, askToSignIn, toggleListingMutation, showToast, failed],
  );

  return { togglePlace, toggleDish, toggleListing, isSignedIn: Boolean(user) };
}
